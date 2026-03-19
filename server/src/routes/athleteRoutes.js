const express = require("express");
const bcrypt = require("bcryptjs");
const { Prisma } = require("@prisma/client");
const { prisma } = require("../utils/prisma");
const { parseDateInput, getWeekRange } = require("../utils/date");
const { readProgramLibrary, summarizeProgramLibrary } = require("../utils/programLibrary");
const { enrichLiftBlocks } = require("../utils/liftBlocks");
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

const router = express.Router();
const allowedPhases = new Set(["Rehab", "Prep", "Eccentrics", "Iso", "Power", "Speed"]);
const allowedModels = new Set(["10-Week", "20-Week"]);
const allowedFrequencies = new Set([3, 4, 5]);

function getPrepProgramNames(library) {
  return [...new Set((library?.programs || []).filter((program) => program.phase === "Prep").map((program) => program.name))]
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function resolveAthleteProgramSelection({
  phase,
  requestedProgramVariant,
  fallbackProgramVariant = "",
  library
}) {
  if (phase === "Prep") {
    const prepProgramNames = getPrepProgramNames(library);
    const requested = typeof requestedProgramVariant === "string" ? requestedProgramVariant.trim() : "";
    const fallback = typeof fallbackProgramVariant === "string" ? fallbackProgramVariant.trim() : "";

    if (requested && prepProgramNames.includes(requested)) {
      return requested;
    }

    if (fallback && prepProgramNames.includes(fallback)) {
      return fallback;
    }

    return prepProgramNames[0] || standardProgramVariant;
  }

  return resolveProgramVariant(phase, requestedProgramVariant || fallbackProgramVariant);
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

    const hashedPassword = await bcrypt.hash(validated.value.password, 10);
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

    return res.status(201).json({
      athlete: serializeAthleteProfile(athlete.athleteProfile)
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(400).json({ error: "An athlete with that email already exists." });
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
        coachNotes: coachNotes ?? athlete.coachNotes
      },
      include: { user: true }
    });

    return res.json({ athlete: serializeAthleteProfile(updated) });
  } catch (error) {
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

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.put("/:id/reset-password", async (req, res, next) => {
  try {
    const athlete = await getAthleteProfileOr404(req.params.id, res);
    if (!athlete) {
      return;
    }

    const validatedPassword = validatePasswordInput(req.body?.password);
    if (validatedPassword.error) {
      return res.status(400).json({ error: validatedPassword.error });
    }

    const hashedPassword = await bcrypt.hash(validatedPassword.value, 10);
    await prisma.user.update({
      where: { id: athlete.userId },
      data: { password: hashedPassword }
    });

    const refreshedAthlete = await getAthleteProfileOr404(athlete.id, res);
    if (!refreshedAthlete) {
      return;
    }

    return res.json({
      athlete: serializeAthleteProfile(refreshedAthlete)
    });
  } catch (error) {
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
      orderBy: [{ date: "asc" }, { createdAt: "asc" }]
    });
    const library = await readProgramLibrary();
    const enrichedLifts = enrichLiftBlocks({
      lifts,
      athlete,
      weekStart,
      library
    });

    return res.json({ lifts: enrichedLifts.map(serializeLift) });
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

    const lift = await prisma.lift.create({
      data: {
        athleteId: athlete.id,
        ...validated.value
      }
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
    return res.json({ success: true });
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

    return res.json({ note: serializeRehabNote(updatedNote) });
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
    const matchedProgram = library.programs.find((program) => {
      const programVariant = program.variant || standardProgramVariant;
      const matchesPrepSelection =
        athlete.phase === "Prep"
          ? program.name === athlete.programVariant
          : programVariant === athlete.programVariant;

      return (
        program.phase === athlete.phase &&
        matchesPrepSelection &&
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

      return day.lifts.map((configuredLift) => {
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
          completed: false
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
      orderBy: [{ date: "asc" }, { createdAt: "asc" }]
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
