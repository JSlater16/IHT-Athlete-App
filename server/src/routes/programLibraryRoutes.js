const express = require("express");
const {
  readProgramLibrary,
  summarizeProgramLibrary,
  validateProgramLibrary,
  writeProgramLibrary
} = require("../utils/programLibrary");
const { resolveProgramVariant, standardProgramVariant } = require("../utils/programVariant");

const router = express.Router();
const allowedPhases = new Set(["Rehab", "Prep", "Eccentrics", "Iso", "Power", "Speed"]);
const allowedFrequencies = new Set([3, 4, 5]);

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createUniqueId(baseId, existingIds) {
  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let suffix = 2;
  while (existingIds.has(`${baseId}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseId}-${suffix}`;
}

function normalizeExercisePayload(body) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const category = typeof body?.category === "string" ? body.category.trim() : "";
  const defaultWeight = typeof body?.defaultWeight === "string" ? body.defaultWeight.trim() : "";
  const defaultNotes = typeof body?.defaultNotes === "string" ? body.defaultNotes.trim() : "";
  const defaultSets = Number(body?.defaultSets);
  const defaultReps = Number(body?.defaultReps);

  if (!name) {
    return { error: "Exercise name is required." };
  }

  if (!category) {
    return { error: "Category is required." };
  }

  if (!Number.isFinite(defaultSets) || defaultSets < 1) {
    return { error: "Default sets must be at least 1." };
  }

  if (!Number.isFinite(defaultReps) || defaultReps < 1) {
    return { error: "Default reps must be at least 1." };
  }

  if (!defaultWeight) {
    return { error: "Default weight is required." };
  }

  return {
    value: {
      name,
      category,
      defaultSets,
      defaultReps,
      defaultWeight,
      defaultNotes
    }
  };
}

function normalizeProgramPayload(body, liftLibrary) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const phase = typeof body?.phase === "string" ? body.phase.trim() : "";
  const requestedVariant = typeof body?.variant === "string" ? body.variant.trim() : standardProgramVariant;
  const frequency = Number(body?.frequency);
  const days = Array.isArray(body?.days) ? body.days : [];
  const liftIds = new Set(liftLibrary.map((lift) => lift.id));

  if (!name) {
    return { error: "Program name is required." };
  }

  if (!allowedPhases.has(phase)) {
    return { error: "Phase must be Rehab, Prep, Eccentrics, Iso, Power, or Speed." };
  }

  if (!allowedFrequencies.has(frequency)) {
    return { error: "Frequency must be 3, 4, or 5." };
  }

  const variant = resolveProgramVariant(phase, requestedVariant);
  if (!variant) {
    return { error: "Program type is invalid for the selected phase." };
  }

  if (!Array.isArray(days) || days.length !== frequency) {
    return { error: "Program must include one configured day for each weekly training day." };
  }

  const normalizedDays = days.map((day, dayIndex) => {
    const dayOffset = Number(day?.dayOffset);
    const lifts = Array.isArray(day?.lifts) ? day.lifts : [];

    if (!Number.isFinite(dayOffset) || dayOffset < 0 || dayOffset > 6) {
      throw new Error(`Day ${dayIndex + 1} must use a week position between 0 and 6.`);
    }

    if (lifts.length === 0) {
      throw new Error(`Day ${dayIndex + 1} must include at least one exercise.`);
    }

    return {
      dayOffset,
      lifts: lifts.map((lift, liftIndex) => {
        const liftId = typeof lift?.liftId === "string" ? lift.liftId.trim() : "";
        const blockLabel = typeof lift?.blockLabel === "string" ? lift.blockLabel.trim() : "";
        const exerciseName = typeof lift?.exerciseName === "string" ? lift.exerciseName.trim() : "";
        const weight = typeof lift?.weight === "string" ? lift.weight.trim() : "";
        const notes = typeof lift?.notes === "string" ? lift.notes.trim() : "";
        const sets = Number(lift?.sets);
        const reps = Number(lift?.reps);

        if (!liftId || !liftIds.has(liftId)) {
          throw new Error(`Day ${dayIndex + 1}, exercise ${liftIndex + 1} must use a valid library exercise.`);
        }

        if (!Number.isFinite(sets) || sets < 1) {
          throw new Error(`Day ${dayIndex + 1}, exercise ${liftIndex + 1} needs valid sets.`);
        }

        if (!Number.isFinite(reps) || reps < 1) {
          throw new Error(`Day ${dayIndex + 1}, exercise ${liftIndex + 1} needs valid reps.`);
        }

        if (!weight) {
          throw new Error(`Day ${dayIndex + 1}, exercise ${liftIndex + 1} needs a weight value.`);
        }

        return {
          liftId,
          blockLabel,
          exerciseName,
          sets,
          reps,
          weight,
          notes
        };
      })
    };
  });

  return {
    value: {
      name,
      phase,
      variant,
      frequency,
      days: normalizedDays
    }
  };
}

router.get("/", async (_req, res, next) => {
  try {
    const library = await readProgramLibrary();
    return res.json({
      library,
      summary: summarizeProgramLibrary(library)
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/import", async (req, res, next) => {
  try {
    const library = req.body?.library;
    const validationError = validateProgramLibrary(library);

    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    await writeProgramLibrary(library);

    return res.status(201).json({
      library,
      summary: summarizeProgramLibrary(library)
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/lifts", async (req, res, next) => {
  try {
    const library = await readProgramLibrary();
    const validated = normalizeExercisePayload(req.body);

    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }

    const existingIds = new Set(library.liftLibrary.map((lift) => lift.id));
    const createdLift = {
      id: createUniqueId(slugify(validated.value.name), existingIds),
      ...validated.value
    };

    const nextLibrary = {
      ...library,
      liftLibrary: [...library.liftLibrary, createdLift]
    };

    const validationError = validateProgramLibrary(nextLibrary);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    await writeProgramLibrary(nextLibrary);

    return res.status(201).json({
      lift: createdLift,
      library: nextLibrary,
      summary: summarizeProgramLibrary(nextLibrary)
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/programs", async (req, res, next) => {
  try {
    const library = await readProgramLibrary();
    let validated;

    try {
      validated = normalizeProgramPayload(req.body, library.liftLibrary);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }

    const existingIds = new Set(library.programs.map((program) => program.id));
    const createdProgram = {
      id: createUniqueId(slugify(validated.value.name), existingIds),
      ...validated.value
    };

    const nextLibrary = {
      ...library,
      programs: [...library.programs, createdProgram]
    };

    const validationError = validateProgramLibrary(nextLibrary);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    await writeProgramLibrary(nextLibrary);

    return res.status(201).json({
      program: createdProgram,
      library: nextLibrary,
      summary: summarizeProgramLibrary(nextLibrary)
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
