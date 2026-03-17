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

  const programVariant = resolveProgramVariant(phase, requestedProgramVariant);

  if (!programVariant) {
    return {
      error: `Program type must be ${eccentricProgramVariants.join(" or ")} for Eccentrics.`
    };
  }

  return {
    value: {
      name,
      email,
      password,
      phase,
      trainingModel,
      programVariant,
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
            programVariant: validated.value.programVariant,
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

    const programVariant = resolveProgramVariant(phase, requestedProgramVariant || athlete.programVariant);

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

    const existingLift = await prisma.lift.findFirs