const express = require("express");
const bcrypt = require("bcryptjs");
const { Prisma } = require("@prisma/client");
const { prisma } = require("../utils/prisma");
const { parseDateInput, getWeekRange } = require("../utils/date");
const { readProgramLibrary, summarizeProgramLibrary } = require("../utils/programLibrary");
const { enrichLiftBlocks } = require("../utils/liftBlocks");
const { attachLastLoggedWeight } = require("../utils/liftHistory");
const { normalizeRehabProfile } = require("../utils/rehabProfile");
const {
  standardProgramVariant,
  eccentricProgramVariants,
  resolveProgramVariant
} = require("../utils/programVariant");
const {
  serializeAthleteProfile,
  serializeLift,
  serializeRehabNote
} = require("../utils/formatters");
const { recordAudit } = require("../utils/audit");
const { validatePassword } = require("../utils/password");
const { passwordChangeLimiter } = require("../utils/rateLimiters");

const router = express.Router();
const allowedPhases = new Set(["Rehab", "Prep", "Eccentrics", "Iso", "Power", "Speed"]);
const allowedModels = new Set(["10-Week", "20-Week"]);
const allowedFrequencies = new Set([3, 4, 5]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getPrepProgramNames(library) {
  return [...new Set((library?.programs || []).filter((program) => program.phase === "Prep").map((program) => program.name))]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function getProgramNamesForPhase(library, phase) {
  return [
    ...new Set(
      (library?.programs || [])
        .filter((program) => program.phase === phase)
        .map((program) => program.name)
    )
  ]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function resolveAthleteProgramSelection({
  phase,
  requestedProgramVariant,
  fallbackProgramVariant = "",
  library
}) {
  // Eccentrics keeps the legacy variant-keyed selection because the
  // Alactic/Lactic split is a meaningful coaching label, not a
  // program name. Every other phase is now name-keyed so multiple
  // programs at the same (phase, frequency) slot can coexist and be
  // picked individually.
  if (phase === "Eccentrics") {
    return resolveProgramVariant(phase, requestedProgramVariant || fallbackProgramVariant);
  }

  const programNames = getProgramNamesForPhase(library, phase);
  const requested = typeof requestedProgramVariant === "string" ? requestedProgramVariant.trim() : "";
  const fallback = typeof fallbackProgramVariant === "string" ? fallbackProgramVariant.trim() : "";

  if (requested && programNames.includes(requested)) return requested;
  if (fallback && programNames.includes(fallback)) return fallback;
  return programNames[0] || standardProgramVariant;
}

async function getAthleteProfileOr404(athleteId, res) {
  const athlete = await prisma.athleteProfile.findUnique({
    where: { id: athleteId },
    include: { user: true }
  });

  if (!athlete) {
    res.status(404).json({ error: "Athlete not found." });
    return null;
  }

  return athlete;
}

function validatePasswordInput(password) {
  if (typeof password !== "string" || password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  return { value: password };
}

function validateLiftInput(payload) {
  const { date, blockLabel = "", exerciseName, sets, reps, weight, notes = "" } = payload || {};
  const parsedDate = parseDateInput(date);

  if (!parsedDate) {
    return { error: "A valid lift date is required." };
  }

  if (typeof exerciseName !== "string" || exerciseName.trim().length < 2) {
    return { error: "Exercise name is required." };
  }

  if (!Number.isFinite(Number(sets)) || Number(sets) < 1) {
    return { error: "Sets must be a positive number." };
  }

  if (!Number.isFinite(Number(reps)) || Number(reps) < 1) {
    return { error: "Reps must be a positive number." };
  }

  if (typeof weight !== "string" || weight.trim().length < 1) {
    return { error: "Weight is required." };
  }

  return {
    value: {
      date: parsedDate,
      blockLabel: typeof blockLabel === "string" ? blockLabel.trim() : "",
      exerciseName: exerciseName.trim(),
      sets: Number(sets),
      reps: Number(reps),
      weight: weight.trim(),
      notes: typeof notes === "string" ? notes.trim() : ""
    }
  };
}

function normalizeAthleteCreatePayload(body) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const phase =
    typeof body?.phase === "string" && body.phase.trim().length > 0 ? body.phase.trim() : "Prep";
  const trainingModel =
    typeof body?.trainingModel === "string" && body.trainingModel.trim().length > 0
      ? body.trainingModel.trim()
      : "10-Week";
  const requestedProgramVariant =
    typeof body?.programVariant === "string" ? body.programVariant.trim() : standardProgramVariant;
  const programmingDays =
    Number.isFinite(Number(body?.programmingDays)) && Number(body.programmingDays) > 0
      ? Number(body.programmingDays)
      : 3;

  if (!name) {
    return { error: "Athlete name is required." };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "A valid athlete email is required." };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  if (!allowedPhases.has(phase)) {
    return { error: "Phase must be one of Rehab, Prep, Eccentrics, Iso, Power, or Speed." };
  }

  if (!allowedModels.has(trainingModel)) {
    return { error: "Training model must be 10-Week or 20-Week." };
  }

  if (!allowedFrequencies.has(programmingDays)) {
    return { error: "Programming days must be 3, 4, or 5." };
  }

  return {
    value: {
      name,
      email,
      password,
      phase,
      trainingModel,
      requestedProgramVariant,
      programmingDays
    }
  };
}

router.post("/", async (req, res, next) => {
  try {
    const validated = normalizeAthleteCreatePayload(req.body);
    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }

    const library = await readProgramLibrary();
    const programVariant = resolveAthleteProgramSelection({
      phase: validated.value.phase,
      requestedProgramVariant: validated.value.requestedProgramVariant,
      library
    });

    if (!programVariant) {
      return res.status(400).json({
        error: `Program type must be ${eccentricProgramVariants.join(" or ")} for Eccentrics.`
      });
    }

    validatePassword(validated.value.password);

    const hashedPassword = await bcrypt.hash(validated.value.password, 12);
    const athlete = await prisma.user.create({
      data: {
        name: validated.value.name,
        email: validated.value.email,
        password: hashedPassword,
        role: "ATHLETE",
        athleteProfile: {
          create: {
            phase: validated.value.phase,
            phaseStartedAt: new Date(),
            rehabProfile: JSON.stringify({
              inhibitedMuscles: [],
              padPlacementImages: []
            }),
            programmingDays: validated.value.programmingDays,
            trainingModel: validated.value.trainingModel,
            programVariant,
            coachNotes: ""
          }
        }
      },
      include: {
        athleteProfile: {
          include: {
            user: true
          }
        }
      }
    });

    await recordAudit({
      req,
      action: "athlete.create",
      targetType: "athlete",
      targetId: athlete.athleteProfile.id,
      targetLabel: athlete.email,
      metadata: {
        phase: validated.value.phase,
        trainingModel: validated.value.trainingModel,
        programmingDays: validated.value.programmingDays
      }
    });

    return res.status(201).json({
      athlete: serializeAthleteProfile(athlete.athleteProfile)
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(400).json({ error: "An athlete with that email already exists." });
    }

    if (error?.status === 400) {
      return res.status(400).json({ error: error.message });
    }

    return next(error);
  }
});

router.get("/", async (_req, res, next) => {
  try {
    const athletes = await prisma.athleteProfile.findMany({
      include: { user: true },
      orderBy: { user: { name: "asc" } }
    });

    return res.json({
      athletes: athletes.map(serializeAthleteProfile)
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const athlete = await getAthleteProfileOr404(req.params.id, res);
    if (!athlete) {
      return;
    }

    return res.json({ athlete: serializeAthleteProfile(athlete) });
  } catch (error) {
    return next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const athlete = await getAthleteProfileOr404(req.params.id, res);
    if (!athlete) {
      return;
    }

    const phase =
      typeof req.body?.phase === "string" && req.body.phase.trim().length > 0
        ? req.body.phase.trim()
        : null;
    const trainingModel =
      typeof req.body?.trainingModel === "string" && req.body.trainingModel.trim().length > 0
        ? req.body.trainingModel.trim()
        : null;
    const requestedProgramVariant =
      typeof req.body?.programVariant === "string" ? req.body.programVariant.trim() : "";
    const programmingDays =
      Number.isFinite(Number(req.body?.programmingDays)) && Number(req.body.programmingDays) > 0
        ? Number(req.body.programmingDays)
        : null;
    const coachNotes =
      typeof req.body?.coachNotes === "string" ? req.body.coachNotes.trim() : null;

    // valdProfileId is optional; "" / null both mean "unlink from VALD".
    // We pull it conditionally so existing PUT callers that don't send
    // the field keep their current value.
    const hasValdProfileIdInBody = Object.prototype.hasOwnProperty.call(req.body || {}, "valdProfileId");
    let valdProfileIdInput = athlete.valdProfileId;
    if (hasValdProfileIdInBody) {
      const raw = req.body.valdProfileId;
      if (raw === null || raw === "") {
        valdProfileIdInput = null;
      } else if (typeof raw === "string" && uuidPattern.test(raw.trim())) {
        valdProfileIdInput = raw.trim().toLowerCase();
      } else {
        return res.status(400).json({ error: "valdProfileId must be a UUID or null." });
      }
    }

    if (!phase) {
      return res.status(400).json({ error: "Phase is required." });
    }

    if (!allowedPhases.has(phase)) {
      return res.status(400).json({ error: "Phase must be one of Rehab, Prep, Eccentrics, Iso, Power, or Speed." });
    }

    if (!trainingModel) {
      return res.status(400).json({ error: "Training model is required." });
    }

    if (!allowedModels.has(trainingModel)) {
      return res.status(400).json({ error: "Training model must be 10-Week or 20-Week." });
    }

    if (!allowedFrequencies.has(programmingDays)) {
      return res.status(400).json({ error: "Programming days must be 3, 4, or 5." });
    }

    const library = await readProgramLibrary();
    const programVariant = resolveAthleteProgramSelection({
      phase,
      requestedProgramVariant,
      fallbackProgramVariant: athlete.programVariant,
      library
    });

    if (!programVariant) {
      return res.status(400).json({
        error: `Program type must be ${eccentricProgramVariants.join(" or ")} for Eccentrics.`
      });
    }

    const updated = await prisma.athleteProfile.update({
      where: { id: athlete.id },
      data: {
        phase,
        phaseStartedAt: phase !== athlete.phase ? new Date() : athlete.phaseStartedAt,
        trainingModel,
        programVariant,
        programmingDays,
        coachNotes: coachNotes ?? athlete.coachNotes,
        valdProfileId: valdProfileIdInput
      },
      include: { user: true }
    });

    /* Audit metadata records the *summary* of what changed, not the
       raw body — bodies can contain free-text coachNotes which we
       don't want duplicated into audit logs. Just flag which fields
       moved. */
    const changedFields = [];
    if (phase !== athlete.phase) changedFields.push("phase");
    if (trainingModel !== athlete.trainingModel) changedFields.push("trainingModel");
    if (programVariant !== athlete.programVariant) changedFields.push("programVariant");
    if (programmingDays !== athlete.programmingDays) changedFields.push("programmingDays");
    if (coachNotes !== null && coachNotes !== athlete.coachNotes) changedFields.push("coachNotes");
    if (hasValdProfileIdInBody && valdProfileIdInput !== athlete.valdProfileId) changedFields.push("valdProfileId");

    await recordAudit({
      req,
      action: "athlete.update",
      targetType: "athlete",
      targetId: athlete.id,
      targetLabel: athlete.user.email,
      metadata: { changedFields }
    });

    return res.json({ athlete: serializeAthleteProfile(updated) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(400).json({ error: "That VALD profile is already linked to another athlete." });
    }
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const athlete = await getAthleteProfileOr404(req.params.id, res);
    if (!athlete) {
      return;
    }

    await prisma.user.delete({
      where: { id: athlete.userId }
    });

    await recordAudit({
      req,
      action: "athlete.delete",
      targetType: "athlete",
      targetId: athlete.id,
      targetLabel: athlete.user.email,
      metadata: { name: athlete.user.name, phase: athlete.phase }
    });

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.put("/:id/reset-password", passwordChangeLimiter, async (req, res, next) => {
  try {
    const athlete = await getAthleteProfileOr404(req.params.id, res);
    if (!athlete) {
      return;
    }

    const password = typeof req.body?.password === "string" ? req.body.password : "";
    validatePassword(password);

    const hashedPassword = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: athlete.userId },
      data: {
        password: hashedPassword,
        tokenVersion: { increment: 1 }
      }
    });

    await recordAudit({
      req,
      action: "athlete.password_reset",
      targetType: "athlete",
      targetId: athlete.id,
      targetLabel: athlete.user.email
    });

    const refreshedAthlete = await getAthleteProfileOr404(athlete.id, res);
    if (!refreshedAthlete) {
      return;
    }

    return res.json({
      athlete: serializeAthleteProfile(refreshedAthlete)
    });
  } catch (error) {
    if (error?.status === 400) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
});

router.get("/:id/lifts", async (req, res, next) => {
  try {
    const athlete = await getAthleteProfileOr404(req.params.id, res);
    if (!athlete) {
      return;
    }

    const { weekStart, weekEnd } = getWeekRange(req.query.week);
    const lifts = await prisma.lift.findMany({
      where: {
        athleteId: athlete.id,
        date: {
          gte: weekStart,
          lte: weekEnd
        }
      },
      orderBy: [{ date: "asc" }, { orderIndex: "asc" }, { createdAt: "asc" }]
    });
    const library = await readProgramLibrary();
    const enrichedLifts = enrichLiftBlocks({
      lifts,
      athlete,
      weekStart,
      library
    });
    const withHistory = await attachLastLoggedWeight(enrichedLifts);

    return res.json({ lifts: withHistory.map(serializeLift) });
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/lifts", async (req, res, next) => {
  try {
    const athlete = await getAthleteProfileOr404(req.params.id, res);
    if (!athlete) {
      return;
    }

    const validated = validateLiftInput(req.body);
    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }

    // Append manually-added lifts to the end of the day's existing
    // block order so they don't all collide at orderIndex 0.
    const dayMax = await prisma.lift.aggregate({
      where: { athleteId: athlete.id, date: validated.value.date },
      _max: { orderIndex: true }
    });
    const lift = await prisma.lift.create({
      data: {
        athleteId: athlete.id,
        ...validated.value,
        orderIndex: (dayMax._max.orderIndex ?? -1) + 1
      }
    });

    await recordAudit({
      req,
      action: "lift.create",
      targetType: "lift",
      targetId: lift.id,
      targetLabel: lift.exerciseName,
      metadata: { athleteId: athlete.id, date: lift.date }
    });

    return res.status(201).json({ lift: serializeLift(lift) });
  } catch (error) {
    return next(error);
  }
});

router.put("/:id/lifts/:liftId", async (req, res, next) => {
  try {
    const athlete = await getAthleteProfileOr404(req.params.id, res);
    if (!athlete) {
      return;
    }

    const existingLift = await prisma.lift.findFirst({
      where: {
        id: req.params.liftId,
        athleteId: athlete.id
      }
    });

    if (!existingLift) {
      return res.status(404).json({ error: "Lift not found." });
    }

    const validated = validateLiftInput(req.body);
    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }

    const lift = await prisma.lift.update({
      where: { id: existingLift.id },
      data: {
        ...validated.value,
        completed:
          typeof req.body?.completed === "boolean" ? req.body.completed : existingLift.completed
      }
    });

    await recordAudit({
      req,
      action: "lift.update",
      targetType: "lift",
      targetId: lift.id,
      targetLabel: lift.exerciseName,
      metadata: { athleteId: athlete.id }
    });

    return res.json({ lift: serializeLift(lift) });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id/lifts/:liftId", async (req, res, next) => {
  try {
    const athlete = await getAthleteProfileOr404(req.params.id, res);
    if (!athlete) {
      return;
    }

    const existingLift = await prisma.lift.findFirst({
      where: {
        id: req.params.liftId,
        athleteId: athlete.id
      }
    });

    if (!existingLift) {
      return res.status(404).json({ error: "Lift not found." });
    }

    await prisma.lift.delete({ where: { id: existingLift.id } });

    await recordAudit({
      req,
      action: "lift.delete",
      targetType: "lift",
      targetId: existingLift.id,
      targetLabel: existingLift.exerciseName,
      metadata: { athleteId: athlete.id }
    });

    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

// Swap a lift's orderIndex with its neighbor in the same (athleteId,
// date) bucket. Body: { direction: "up" | "down" }. The neighbor is
// chosen from the same day's lifts sorted by (orderIndex, createdAt)
// — what the athlete actually sees on their training-day view.
router.patch("/:id/lifts/:liftId/reorder", async (req, res, next) => {
  try {
    const athlete = await getAthleteProfileOr404(req.params.id, res);
    if (!athlete) return;

    const direction = req.body?.direction;
    if (direction !== "up" && direction !== "down") {
      return res.status(400).json({ error: "direction must be 'up' or 'down'." });
    }

    const target = await prisma.lift.findFirst({
      where: { id: req.params.liftId, athleteId: athlete.id }
    });
    if (!target) return res.status(404).json({ error: "Lift not found." });

    const sameDay = await prisma.lift.findMany({
      where: { athleteId: athlete.id, date: target.date },
      orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }]
    });
    const idx = sameDay.findIndex((l) => l.id === target.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sameDay.length) {
      return res.status(400).json({ error: "Already at the boundary." });
    }

    const neighbor = sameDay[swapIdx];
    const [updatedTarget, updatedNeighbor] = await prisma.$transaction([
      prisma.lift.update({
        where: { id: target.id },
        data: { orderIndex: neighbor.orderIndex }
      }),
      prisma.lift.update({
        where: { id: neighbor.id },
        data: { orderIndex: target.orderIndex }
      })
    ]);

    return res.json({
      lifts: [serializeLift(updatedTarget), serializeLift(updatedNeighbor)]
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/rehab", async (req, res, next) => {
  try {
    const athlete = await getAthleteProfileOr404(req.params.id, res);
    if (!athlete) {
      return;
    }

    if (typeof req.body?.note !== "string" || req.body.note.trim().length < 2) {
      return res.status(400).json({ error: "Rehab note is required." });
    }

    const note = await prisma.rehabNote.create({
      data: {
        athleteId: athlete.id,
        note: req.body.note.trim()
      }
    });

    await recordAudit({
      req,
      action: "athlete.rehab_note.create",
      targetType: "rehabNote",
      targetId: note.id,
      targetLabel: athlete.user.email,
      metadata: { athleteId: athlete.id }
    });

    return res.status(201).json({ note: serializeRehabNote(note) });
  } catch (error) {
    return next(error);
  }
});

router.put("/:id/rehab/:noteId", async (req, res, next) => {
  try {
    const athlete = await getAthleteProfileOr404(req.params.id, res);
    if (!athlete) {
      return;
    }

    if (typeof req.body?.note !== "string" || req.body.note.trim().length < 2) {
      return res.status(400).json({ error: "Rehab note is required." });
    }

    const existingNote = await prisma.rehabNote.findFirst({
      where: {
        id: req.params.noteId,
        athleteId: athlete.id
      }
    });

    if (!existingNote) {
      return res.status(404).json({ error: "Rehab note not found." });
    }

    const updatedNote = await prisma.rehabNote.update({
      where: { id: existingNote.id },
      data: {
        note: req.body.note.trim()
      }
    });

    await recordAudit({
      req,
      action: "athlete.rehab_note.update",
      targetType: "rehabNote",
      targetId: updatedNote.id,
      targetLabel: athlete.user.email,
      metadata: { athleteId: athlete.id }
    });

    return res.json({ note: serializeRehabNote(updatedNote) });
  } catch (error) {
    return next(error);
  }
});

router.put("/:id/vald-profile", async (req, res, next) => {
  try {
    const athlete = await getAthleteProfileOr404(req.params.id, res);
    if (!athlete) {
      return;
    }

    const raw = req.body?.valdProfileId;
    let valdProfileId;
    if (raw === null || raw === "" || raw === undefined) {
      valdProfileId = null;
    } else if (typeof raw === "string" && uuidPattern.test(raw.trim())) {
      valdProfileId = raw.trim().toLowerCase();
    } else {
      return res.status(400).json({ error: "valdProfileId must be a UUID or null." });
    }

    const updated = await prisma.athleteProfile.update({
      where: { id: athlete.id },
      data: { valdProfileId },
      include: { user: true }
    });

    await recordAudit({
      req,
      action: "athlete.vald_profile.update",
      targetType: "athlete",
      targetId: athlete.id,
      targetLabel: athlete.user.email,
      metadata: { valdProfileId }
    });

    return res.json({ athlete: serializeAthleteProfile(updated) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(400).json({ error: "That VALD profile is already linked to another athlete." });
    }
    return next(error);
  }
});

router.put("/:id/leaderboard-visibility", async (req, res, next) => {
  try {
    const athlete = await getAthleteProfileOr404(req.params.id, res);
    if (!athlete) {
      return;
    }

    if (typeof req.body?.hideFromLeaderboard !== "boolean") {
      return res.status(400).json({ error: "hideFromLeaderboard must be a boolean." });
    }

    const updated = await prisma.athleteProfile.update({
      where: { id: athlete.id },
      data: { hideFromLeaderboard: req.body.hideFromLeaderboard },
      include: { user: true }
    });

    await recordAudit({
      req,
      action: "athlete.leaderboard_visibility.update",
      targetType: "athlete",
      targetId: athlete.id,
      targetLabel: athlete.user.email,
      metadata: { hideFromLeaderboard: req.body.hideFromLeaderboard }
    });

    return res.json({ athlete: serializeAthleteProfile(updated) });
  } catch (error) {
    return next(error);
  }
});

router.put("/:id/rehab-profile", async (req, res, next) => {
  try {
    const athlete = await getAthleteProfileOr404(req.params.id, res);
    if (!athlete) {
      return;
    }

    const rehabProfile = normalizeRehabProfile(req.body?.rehabProfile);

    const updated = await prisma.athleteProfile.update({
      where: { id: athlete.id },
      data: {
        rehabProfile: JSON.stringify(rehabProfile)
      },
      include: { user: true }
    });

    /* Audit rehab-profile updates without dumping the body —
       pad-placement images live here and can be megabytes of
       base64. Just record that an update happened. */
    await recordAudit({
      req,
      action: "athlete.rehab_profile.update",
      targetType: "athlete",
      targetId: athlete.id,
      targetLabel: athlete.user.email
    });

    return res.json({ athlete: serializeAthleteProfile(updated) });
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/apply-program", async (req, res, next) => {
  try {
    const athlete = await getAthleteProfileOr404(req.params.id, res);
    if (!athlete) {
      return;
    }

    const { weekStart, weekEnd } = getWeekRange(req.body?.week);
    const library = await readProgramLibrary();
    const summary = summarizeProgramLibrary(library);
    // Eccentrics matches by (variant, frequency); the Alactic/Lactic
    // split times frequency gives a unique program per slot. Every
    // other phase matches by program name only — the name already
    // identifies the program including its day count, so the
    // athlete's programmingDays is informational, not a gate. Legacy
    // fallback covers athletes whose programVariant still holds
    // "Standard" from before the name-keyed picker.
    const matchedProgram = library.programs.find((program) => {
      if (program.phase !== athlete.phase) return false;
      if (athlete.phase === "Eccentrics") {
        if (Number(program.frequency) !== Number(athlete.programmingDays)) return false;
        return (program.variant || standardProgramVariant) === athlete.programVariant;
      }
      if (program.name === athlete.programVariant) return true;
      return (
        athlete.programVariant === standardProgramVariant &&
        (program.variant || standardProgramVariant) === standardProgramVariant &&
        Number(program.frequency) === Number(athlete.programmingDays)
      );
    });

    if (!matchedProgram) {
      return res.status(404).json({
        error: `No program template found for ${athlete.phase} / ${athlete.programVariant} / ${athlete.programmingDays} days.`,
        availableVariants: summary.variants,
        availableFrequencies: summary.frequencies
      });
    }

    const liftsToCreate = matchedProgram.days.flatMap((day) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + Number(day.dayOffset));

      return day.lifts.map((configuredLift, idx) => {
        const libraryLift = library.liftLibrary.find((lift) => lift.id === configuredLift.liftId);

        return {
          athleteId: athlete.id,
          date,
          blockLabel: configuredLift.blockLabel || "",
          exerciseName: configuredLift.exerciseName || libraryLift?.name || "Program Lift",
          sets: Number(configuredLift.sets || libraryLift?.defaultSets || 3),
          reps: Number(configuredLift.reps || libraryLift?.defaultReps || 8),
          weight: configuredLift.weight || libraryLift?.defaultWeight || "Coach Prescribed",
          notes: configuredLift.notes || libraryLift?.defaultNotes || "",
          completed: false,
          orderIndex: idx
        };
      });
    });

    await prisma.$transaction([
      prisma.lift.deleteMany({
        where: {
          athleteId: athlete.id,
          date: {
            gte: weekStart,
            lte: weekEnd
          }
        }
      }),
      prisma.lift.createMany({
        data: liftsToCreate
      })
    ]);

    const lifts = await prisma.lift.findMany({
      where: {
        athleteId: athlete.id,
        date: {
          gte: weekStart,
          lte: weekEnd
        }
      },
      orderBy: [{ date: "asc" }, { orderIndex: "asc" }, { createdAt: "asc" }]
    });

    await recordAudit({
      req,
      action: "athlete.apply_program",
      targetType: "athlete",
      targetId: athlete.id,
      targetLabel: athlete.user.email,
      metadata: {
        programId: matchedProgram.id,
        programName: matchedProgram.name,
        phase: matchedProgram.phase,
        variant: matchedProgram.variant || standardProgramVariant,
        frequency: matchedProgram.frequency,
        weekStart
      }
    });

    return res.json({
      program: {
        id: matchedProgram.id,
        name: matchedProgram.name,
        phase: matchedProgram.phase,
        variant: matchedProgram.variant || standardProgramVariant,
        frequency: matchedProgram.frequency
      },
      lifts: lifts.map(serializeLift)
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/rehab", async (req, res, next) => {
  try {
    const athlete = await getAthleteProfileOr404(req.params.id, res);
    if (!athlete) {
      return;
    }

    const notes = await prisma.rehabNote.findMany({
      where: { athleteId: athlete.id },
      orderBy: { createdAt: "desc" }
    });

    return res.json({ notes: notes.map(serializeRehabNote) });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
