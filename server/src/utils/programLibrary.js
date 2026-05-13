const path = require("path");
const fs = require("fs/promises");
const {
  standardProgramVariant,
  eccentricProgramVariants
} = require("./programVariant");

const LIBRARY_FILE = path.resolve(__dirname, "..", "..", "data", "programLibrary.json");
const allowedFrequencies = new Set([3, 4, 5]);

async function readProgramLibrary() {
  const file = await fs.readFile(LIBRARY_FILE, "utf8");
  const parsed = JSON.parse(file);
  // Older library files only had liftLibrary + programs. Default the
  // new miscWorkouts slot so callers don't have to null-check.
  if (!Array.isArray(parsed.miscWorkouts)) {
    parsed.miscWorkouts = [];
  }
  return parsed;
}

async function writeProgramLibrary(library) {
  // Atomic: write to a temp file in the same directory, then rename
  // over the real one. If the process dies mid-write the original is
  // intact. fs.rename is atomic on POSIX when source/target share a
  // filesystem (they always do here — same dir).
  const tmp = `${LIBRARY_FILE}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(library, null, 2), "utf8");
  await fs.rename(tmp, LIBRARY_FILE);
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

    const variant = (program.variant || standardProgramVariant).toString().trim();

    if (!variant) {
      return "Every program needs a variant.";
    }

    // Eccentrics still requires one of the two named variants. All
    // other phases accept any free-form variant string so coaches can
    // label tracks like "Base" / "Advanced" / "Returning Athlete".
    if (program.phase === "Eccentrics" && !eccentricProgramVariants.includes(variant)) {
      return "Eccentrics programs must use Alactic Eccentrics or Lactic Eccentrics as the variant.";
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
