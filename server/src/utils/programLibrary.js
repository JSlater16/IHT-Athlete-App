const path = require("path");
const fs = require("fs/promises");
const {
  standardProgramVariant,
  eccentricProgramVariants,
  allowedProgramVariants
} = require("./programVariant");

const LIBRARY_FILE = path.resolve(__dirname, "..", "..", "data", "programLibrary.json");
const allowedFrequencies = new Set([3, 4, 5]);

async function readProgramLibrary() {
  const file = await fs.readFile(LIBRARY_FILE, "utf8");
  return JSON.parse(file);
}

async function writeProgramLibrary(library) {
  await fs.writeFile(LIBRARY_FILE, JSON.stringify(library, null, 2), "utf8");
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
    programCount: library.programs.length
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

  return null;
}

module.exports = {
  LIBRARY_FILE,
  readProgramLibrary,
  summarizeProgramLibrary,
  validateProgramLibrary,
  writeProgramLibrary
};
