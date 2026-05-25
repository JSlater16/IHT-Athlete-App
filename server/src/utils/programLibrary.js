const path = require("path");
const fs = require("fs/promises");
const { prisma } = require("./prisma");
const {
  standardProgramVariant,
  eccentricProgramVariants,
  allowedProgramVariants
} = require("./programVariant");

const LIBRARY_FILE = path.resolve(__dirname, "..", "..", "data", "programLibrary.json");
const allowedFrequencies = new Set([3, 4, 5]);

// Source of truth lives in Postgres so the library survives Render's
// ephemeral filesystem. The JSON file at LIBRARY_FILE is only the
// initial seed used to populate the DB row on first read of a fresh
// environment.
async function readProgramLibrary() {
  let row = await prisma.programLibraryStore.findUnique({ where: { id: 1 } });
  if (!row) {
    const seed = await readLibraryFromFile();
    row = await prisma.programLibraryStore.upsert({
      where: { id: 1 },
      create: { id: 1, data: seed },
      update: {}
    });
  }
  const library = row.data && typeof row.data === "object" ? row.data : {};
  // Older library files only had liftLibrary + programs. Default the
  // new miscWorkouts slot so callers don't have to null-check.
  if (!Array.isArray(library.miscWorkouts)) {
    library.miscWorkouts = [];
  }
  return library;
}

async function writeProgramLibrary(library) {
  await prisma.programLibraryStore.upsert({
    where: { id: 1 },
    create: { id: 1, data: library },
    update: { data: library }
  });
}

// Used only on first-ever read to seed the DB row. Treats a missing
// file as an empty library so a brand-new environment doesn't crash.
async function readLibraryFromFile() {
  try {
    const file = await fs.readFile(LIBRARY_FILE, "utf8");
    return JSON.parse(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      return { liftLibrary: [], programs: [], miscWorkouts: [] };
    }
    throw error;
  }
}

// Validates a proposed library shape and throws a 400-coded error if
// it fails. Used by every mutating route so we validate BEFORE
// touching the file on disk.
function assertValidLibrary(library) {
  const error = validateProgramLibrary(library);
  if (error) {
    const err = new Error(error);
    err.status = 400;
    throw err;
  }
}

function summarizeProgramLibrary(library) {
  const phases = [...new Set(library.programs.map((program) => program.phase))].sort();
  const variants = [...new Set(library.programs.map((program) => program.variant || standardProgramVariant))].sort();
  const frequencies = [...new Set(library.programs.map((program) => Number(program.frequency)))].sort(
    (left, right) => left - right
  );

  return {
    phases,
    variants,
    frequencies,
    liftCount: library.liftLibrary.length,
    programCount: library.programs.length,
    miscCount: Array.isArray(library.miscWorkouts) ? library.miscWorkouts.length : 0
  };
}

function validateProgramLibrary(library) {
  if (!library || typeof library !== "object") {
    return "Library payload is required.";
  }

  if (!Array.isArray(library.liftLibrary) || !Array.isArray(library.programs)) {
    return "Library must include liftLibrary and programs arrays.";
  }

  const liftIds = new Set();
  for (const lift of library.liftLibrary) {
    if (!lift?.id || !lift?.name) {
      return "Every lift must include id and name.";
    }
    liftIds.add(lift.id);
  }

  for (const program of library.programs) {
    if (!program?.id || !program?.name || !program?.phase) {
      return "Every program must include id, name, and phase.";
    }

    const variant = program.variant || standardProgramVariant;

    if (!allowedProgramVariants.has(variant)) {
      return "Every program variant must be Standard, Alactic Eccentrics, or Lactic Eccentrics.";
    }

    if (program.phase === "Eccentrics" && !eccentricProgramVariants.includes(variant)) {
      return "Eccentrics programs must use Alactic Eccentrics or Lactic Eccentrics as the variant.";
    }

    if (program.phase !== "Eccentrics" && variant !== standardProgramVariant) {
      return "Only Eccentrics programs can use a non-Standard variant.";
    }

    if (!allowedFrequencies.has(Number(program.frequency))) {
      return "Every program frequency must be 3, 4, or 5.";
    }

    if (!Array.isArray(program.days) || program.days.length === 0) {
      return "Every program must include at least one day.";
    }

    for (const day of program.days) {
      if (!Number.isFinite(Number(day.dayOffset)) || Number(day.dayOffset) < 0 || Number(day.dayOffset) > 6) {
        return "Program day offsets must be between 0 and 6.";
      }

      if (!Array.isArray(day.lifts) || day.lifts.length === 0) {
        return "Every program day must include at least one lift.";
      }

      for (const configuredLift of day.lifts) {
        if (!configuredLift?.liftId || !liftIds.has(configuredLift.liftId)) {
          return "Every programmed lift must reference a valid liftId from the lift library.";
        }
      }
    }
  }

  // miscWorkouts is optional. When present, validate each entry has
  // id/name and references valid liftIds.
  if (library.miscWorkouts !== undefined) {
    if (!Array.isArray(library.miscWorkouts)) {
      return "miscWorkouts must be an array.";
    }
    for (const workout of library.miscWorkouts) {
      if (!workout?.id || !workout?.name) {
        return "Every misc workout must include id and name.";
      }
      if (!Array.isArray(workout.lifts) || workout.lifts.length === 0) {
        return `Misc workout "${workout.name}" must include at least one lift.`;
      }
      for (const lift of workout.lifts) {
        if (!lift?.liftId || !liftIds.has(lift.liftId)) {
          return `Misc workout "${workout.name}" must reference valid library lifts.`;
        }
      }
    }
  }

  return null;
}

module.exports = {
  LIBRARY_FILE,
  readProgramLibrary,
  summarizeProgramLibrary,
  validateProgramLibrary,
  assertValidLibrary,
  writeProgramLibrary
};
