const express = require("express");
const {
  readProgramLibrary,
  summarizeProgramLibrary,
  validateProgramLibrary,
  assertValidLibrary,
  writeProgramLibrary
} = require("../utils/programLibrary");
const { resolveProgramVariant, standardProgramVariant } = require("../utils/programVariant");
const { recordAudit } = require("../utils/audit");

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

// Resolve every day-lift entry in a program payload. Each entry either
// references an existing liftId or carries a `newLift: {...}` object.
// Returns { nextLifts, resolvedDays } where nextLifts is the library's
// liftLibrary with any newly-created lifts appended (and deduped by
// slug across the same submission).
function resolveProgramLifts({ days, liftLibrary }) {
  const liftsById = new Map(liftLibrary.map((lift) => [lift.id, lift]));
  const liftsBySlug = new Map(liftLibrary.map((lift) => [slugify(lift.name), lift]));
  const existingIds = new Set(liftLibrary.map((lift) => lift.id));
  const nextLifts = liftLibrary.slice();

  function resolveNewLift(payload, dayIndex, liftIndex) {
    const normalized = normalizeExercisePayload(payload);
    if (normalized.error) {
      const err = new Error(
        `Day ${dayIndex + 1}, exercise ${liftIndex + 1}: ${normalized.error}`
      );
      err.status = 400;
      throw err;
    }

    // Dedup by slug — two inline new-lifts with the same name in the
    // same save become one library entry, referenced twice.
    const slug = slugify(normalized.value.name);
    const existing = liftsBySlug.get(slug);
    if (existing) {
      return existing.id;
    }

    const id = createUniqueId(slug || "exercise", existingIds);
    existingIds.add(id);
    const created = { id, ...normalized.value };
    nextLifts.push(created);
    liftsById.set(id, created);
    liftsBySlug.set(slug, created);
    return id;
  }

  const resolvedDays = days.map((day, dayIndex) => ({
    ...day,
    lifts: day.lifts.map((lift, liftIndex) => {
      let liftId = typeof lift?.liftId === "string" ? lift.liftId.trim() : "";
      if (liftId && !liftsById.has(liftId)) {
        liftId = "";
      }
      if (!liftId && lift?.newLift) {
        liftId = resolveNewLift(lift.newLift, dayIndex, liftIndex);
      }
      if (!liftId) {
        const err = new Error(
          `Day ${dayIndex + 1}, exercise ${liftIndex + 1}: pick a library exercise or fill in a new one.`
        );
        err.status = 400;
        throw err;
      }
      return { ...lift, liftId };
    })
  }));

  return { nextLifts, resolvedDays };
}

function normalizeProgramPayload(body, liftLibrary) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const phase = typeof body?.phase === "string" ? body.phase.trim() : "";
  const requestedVariant = typeof body?.variant === "string" ? body.variant.trim() : standardProgramVariant;
  const frequency = Number(body?.frequency);
  const days = Array.isArray(body?.days) ? body.days : [];

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

  if (days.length !== frequency) {
    return { error: "Program must include one configured day for each weekly training day." };
  }

  // Resolve inline newLift entries first — this may extend liftLibrary
  // and substitute liftIds.
  let resolution;
  try {
    resolution = resolveProgramLifts({ days, liftLibrary });
  } catch (error) {
    return { error: error.message };
  }

  const normalizedDays = resolution.resolvedDays.map((day, dayIndex) => {
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
        const liftId = lift.liftId;
        const blockLabel = typeof lift?.blockLabel === "string" ? lift.blockLabel.trim() : "";
        const exerciseName = typeof lift?.exerciseName === "string" ? lift.exerciseName.trim() : "";
        const weight = typeof lift?.weight === "string" ? lift.weight.trim() : "";
        const notes = typeof lift?.notes === "string" ? lift.notes.trim() : "";
        const sets = Number(lift?.sets);
        const reps = Number(lift?.reps);

        if (!Number.isFinite(sets) || sets < 1) {
          throw new Error(`Day ${dayIndex + 1}, exercise ${liftIndex + 1} needs valid sets.`);
        }

        if (!Number.isFinite(reps) || reps < 1) {
          throw new Error(`Day ${dayIndex + 1}, exercise ${liftIndex + 1} needs valid reps.`);
        }

        if (!weight) {
          throw new Error(`Day ${dayIndex + 1}, exercise ${liftIndex + 1} needs a weight value.`);
        }

        return { liftId, blockLabel, exerciseName, sets, reps, weight, notes };
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
    },
    nextLifts: resolution.nextLifts
  };
}

function libraryResponse(library) {
  return { library, summary: summarizeProgramLibrary(library) };
}

router.get("/", async (_req, res, next) => {
  try {
    const library = await readProgramLibrary();
    return res.json(libraryResponse(library));
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

    /* /import is a wholesale replace of the library, so this gets
       logged as an update rather than create. The metadata records
       counts only — the full library is huge and lives on disk
       anyway. */
    await recordAudit({
      req,
      action: "program_library.update",
      targetType: "program_library",
      targetLabel: "import",
      metadata: {
        liftCount: Array.isArray(library?.liftLibrary) ? library.liftLibrary.length : 0,
        programCount: Array.isArray(library?.programs) ? library.programs.length : 0
      }
    });

    return res.status(201).json(libraryResponse(library));
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

    assertValidLibrary(nextLibrary);
    await writeProgramLibrary(nextLibrary);

    await recordAudit({
      req,
      action: "program_library.create",
      targetType: "lift_library_entry",
      targetId: createdLift.id,
      targetLabel: createdLift.name,
      metadata: { category: createdLift.category }
    });

    return res.status(201).json({ lift: createdLift, ...libraryResponse(nextLibrary) });
  } catch (error) {
    if (error?.status === 400) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
});

// Shared handler for POST /programs (create) and PUT /programs/:id
// (replace). Lift entries inside the program payload may carry a
// `newLift` object — those are created in-library as part of the same
// atomic write.
async function saveProgram(req, res, { mode }) {
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

  const programId = mode === "update" ? req.params.id : null;
  if (mode === "update") {
    const exists = library.programs.some((p) => p.id === programId);
    if (!exists) {
      return res.status(404).json({ error: "Program not found." });
    }
  }

  const existingProgramIds = new Set(library.programs.map((p) => p.id));
  const id =
    mode === "update"
      ? programId
      : createUniqueId(slugify(validated.value.name), existingProgramIds);
  const savedProgram = { id, ...validated.value };

  const nextPrograms =
    mode === "update"
      ? library.programs.map((p) => (p.id === id ? savedProgram : p))
      : [...library.programs, savedProgram];

  const nextLibrary = {
    ...library,
    liftLibrary: validated.nextLifts,
    programs: nextPrograms
  };

  // Validate BEFORE writing. If anything's off, the file on disk is
  // untouched and the client gets a clean 400.
  try {
    assertValidLibrary(nextLibrary);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  await writeProgramLibrary(nextLibrary);

  await recordAudit({
    req,
    action: mode === "update" ? "program_library.update" : "program_library.create",
    targetType: "program",
    targetId: savedProgram.id,
    targetLabel: savedProgram.name,
    metadata: {
      phase: savedProgram.phase,
      variant: savedProgram.variant,
      frequency: savedProgram.frequency,
      liftCountDelta: validated.nextLifts.length - library.liftLibrary.length
    }
  });

  return res.status(mode === "update" ? 200 : 201).json({
    program: savedProgram,
    ...libraryResponse(nextLibrary)
  });
}

router.put("/lifts/:id", async (req, res, next) => {
  try {
    const library = await readProgramLibrary();
    const target = library.liftLibrary.find((l) => l.id === req.params.id);
    if (!target) {
      return res.status(404).json({ error: "Lift not found." });
    }

    const validated = normalizeExercisePayload(req.body);
    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }

    const updatedLift = { id: target.id, ...validated.value };
    const nextLibrary = {
      ...library,
      liftLibrary: library.liftLibrary.map((l) => (l.id === target.id ? updatedLift : l))
    };

    assertValidLibrary(nextLibrary);
    await writeProgramLibrary(nextLibrary);

    await recordAudit({
      req,
      action: "program_library.update",
      targetType: "lift_library_entry",
      targetId: updatedLift.id,
      targetLabel: updatedLift.name,
      metadata: { category: updatedLift.category }
    });

    return res.json({ lift: updatedLift, ...libraryResponse(nextLibrary) });
  } catch (error) {
    if (error?.status === 400) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
});

router.delete("/lifts/:id", async (req, res, next) => {
  try {
    const library = await readProgramLibrary();
    const target = library.liftLibrary.find((l) => l.id === req.params.id);
    if (!target) {
      return res.status(404).json({ error: "Lift not found." });
    }

    // Refuse deletion if any program still uses this lift — the
    // validateProgramLibrary check would catch it after the fact, but
    // we want a clear error before touching anything.
    const usedIn = (library.programs || []).filter((p) =>
      (p.days || []).some((d) => (d.lifts || []).some((l) => l.liftId === target.id))
    );
    if (usedIn.length > 0) {
      return res.status(400).json({
        error: `In use by ${usedIn.length} program${usedIn.length === 1 ? "" : "s"} (${usedIn
          .slice(0, 3)
          .map((p) => p.name)
          .join(", ")}${usedIn.length > 3 ? "..." : ""}). Remove it from those programs first.`
      });
    }

    const nextLibrary = {
      ...library,
      liftLibrary: library.liftLibrary.filter((l) => l.id !== target.id)
    };

    await writeProgramLibrary(nextLibrary);

    await recordAudit({
      req,
      action: "program_library.delete",
      targetType: "lift_library_entry",
      targetId: target.id,
      targetLabel: target.name,
      metadata: { category: target.category }
    });

    return res.json(libraryResponse(nextLibrary));
  } catch (error) {
    return next(error);
  }
});

router.post("/programs", async (req, res, next) => {
  try {
    return await saveProgram(req, res, { mode: "create" });
  } catch (error) {
    return next(error);
  }
});

router.put("/programs/:id", async (req, res, next) => {
  try {
    return await saveProgram(req, res, { mode: "update" });
  } catch (error) {
    return next(error);
  }
});

// ============== Misc workouts (one-off single-day templates) ==============

function normalizeMiscPayload(body, liftLibrary) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const lifts = Array.isArray(body?.lifts) ? body.lifts : [];

  if (!name) {
    return { error: "Misc workout name is required." };
  }
  if (lifts.length === 0) {
    return { error: "Misc workout must include at least one lift." };
  }

  let resolution;
  try {
    resolution = resolveProgramLifts({ days: [{ dayOffset: 0, lifts }], liftLibrary });
  } catch (error) {
    return { error: error.message };
  }

  const normalizedLifts = resolution.resolvedDays[0].lifts.map((lift, liftIndex) => {
    const liftId = lift.liftId;
    const blockLabel = typeof lift?.blockLabel === "string" ? lift.blockLabel.trim() : "";
    const exerciseName = typeof lift?.exerciseName === "string" ? lift.exerciseName.trim() : "";
    const weight = typeof lift?.weight === "string" ? lift.weight.trim() : "";
    const notes = typeof lift?.notes === "string" ? lift.notes.trim() : "";
    const sets = Number(lift?.sets);
    const reps = Number(lift?.reps);

    if (!Number.isFinite(sets) || sets < 1) {
      throw new Error(`Lift ${liftIndex + 1} needs valid sets.`);
    }
    if (!Number.isFinite(reps) || reps < 1) {
      throw new Error(`Lift ${liftIndex + 1} needs valid reps.`);
    }
    if (!weight) {
      throw new Error(`Lift ${liftIndex + 1} needs a weight value.`);
    }
    return { liftId, blockLabel, exerciseName, sets, reps, weight, notes };
  });

  return { value: { name, lifts: normalizedLifts }, nextLifts: resolution.nextLifts };
}

async function saveMiscWorkout(req, res, { mode }) {
  const library = await readProgramLibrary();
  const existing = Array.isArray(library.miscWorkouts) ? library.miscWorkouts : [];

  let validated;
  try {
    validated = normalizeMiscPayload(req.body, library.liftLibrary);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
  if (validated.error) {
    return res.status(400).json({ error: validated.error });
  }

  const workoutId = mode === "update" ? req.params.id : null;
  if (mode === "update" && !existing.some((w) => w.id === workoutId)) {
    return res.status(404).json({ error: "Misc workout not found." });
  }

  const existingIds = new Set(existing.map((w) => w.id));
  const id =
    mode === "update"
      ? workoutId
      : createUniqueId(slugify(validated.value.name) || "misc-workout", existingIds);
  const savedWorkout = { id, ...validated.value };

  const nextMisc =
    mode === "update"
      ? existing.map((w) => (w.id === id ? savedWorkout : w))
      : [...existing, savedWorkout];

  const nextLibrary = {
    ...library,
    liftLibrary: validated.nextLifts,
    miscWorkouts: nextMisc
  };

  try {
    assertValidLibrary(nextLibrary);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  await writeProgramLibrary(nextLibrary);

  await recordAudit({
    req,
    action: mode === "update" ? "program_library.update" : "program_library.create",
    targetType: "misc_workout",
    targetId: savedWorkout.id,
    targetLabel: savedWorkout.name,
    metadata: { liftCount: savedWorkout.lifts.length }
  });

  return res.status(mode === "update" ? 200 : 201).json({
    miscWorkout: savedWorkout,
    ...libraryResponse(nextLibrary)
  });
}

router.post("/misc", async (req, res, next) => {
  try {
    return await saveMiscWorkout(req, res, { mode: "create" });
  } catch (error) {
    return next(error);
  }
});

router.put("/misc/:id", async (req, res, next) => {
  try {
    return await saveMiscWorkout(req, res, { mode: "update" });
  } catch (error) {
    return next(error);
  }
});

router.delete("/misc/:id", async (req, res, next) => {
  try {
    const library = await readProgramLibrary();
    const existing = Array.isArray(library.miscWorkouts) ? library.miscWorkouts : [];
    const target = existing.find((w) => w.id === req.params.id);
    if (!target) {
      return res.status(404).json({ error: "Misc workout not found." });
    }

    const nextLibrary = {
      ...library,
      miscWorkouts: existing.filter((w) => w.id !== target.id)
    };

    await writeProgramLibrary(nextLibrary);

    await recordAudit({
      req,
      action: "program_library.delete",
      targetType: "misc_workout",
      targetId: target.id,
      targetLabel: target.name
    });

    return res.json(libraryResponse(nextLibrary));
  } catch (error) {
    return next(error);
  }
});

// ============== Programs ==============

router.delete("/programs/:id", async (req, res, next) => {
  try {
    const library = await readProgramLibrary();
    const target = library.programs.find((p) => p.id === req.params.id);
    if (!target) {
      return res.status(404).json({ error: "Program not found." });
    }

    const nextLibrary = {
      ...library,
      programs: library.programs.filter((p) => p.id !== target.id)
    };

    // No need to re-validate — removing a program can't introduce
    // dangling liftIds or other inconsistencies.
    await writeProgramLibrary(nextLibrary);

    await recordAudit({
      req,
      action: "program_library.delete",
      targetType: "program",
      targetId: target.id,
      targetLabel: target.name,
      metadata: { phase: target.phase, variant: target.variant, frequency: target.frequency }
    });

    return res.json(libraryResponse(nextLibrary));
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
