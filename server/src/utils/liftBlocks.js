const { standardProgramVariant } = require("./programVariant");

function toDateKey(dateInput) {
  const date = new Date(dateInput);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function enrichLiftBlocks({ lifts, athlete, weekStart, library }) {
  if (!Array.isArray(lifts) || lifts.length === 0) {
    return lifts;
  }

  if (lifts.every((lift) => typeof lift.blockLabel === "string" && lift.blockLabel.trim().length > 0)) {
    return lifts;
  }

  // Mirrors the apply-program match: name-based for everything except
  // Eccentrics, with a legacy fallback for stored "Standard". For
  // non-Eccentrics the program name is the source of truth, so
  // programmingDays is informational and not part of the match.
  const matchedProgram = library.programs.find((program) => {
    if (program.phase !== athlete.phase) return false;
    if (athlete.phase === "Eccentrics") {
      if (Number(program.frequency) !== Number(athlete.programmingDays)) return false;
      return (
        (program.variant || standardProgramVariant) ===
        (athlete.programVariant || standardProgramVariant)
      );
    }
    if (program.name === athlete.programVariant) return true;
    return (
      (athlete.programVariant || standardProgramVariant) === standardProgramVariant &&
      (program.variant || standardProgramVariant) === standardProgramVariant &&
      Number(program.frequency) === Number(athlete.programmingDays)
    );
  });

  if (!matchedProgram) {
    return lifts;
  }

  const programDaysByOffset = new Map(
    matchedProgram.days.map((day) => [Number(day.dayOffset), day.lifts || []])
  );

  const liftsByDate = lifts.reduce((accumulator, lift) => {
    const key = toDateKey(lift.date);
    if (!accumulator.has(key)) {
      accumulator.set(key, []);
    }
    accumulator.get(key).push(lift);
    return accumulator;
  }, new Map());

  const enrichedById = new Map();

  for (const [dateKey, dateLifts] of liftsByDate.entries()) {
    const date = new Date(`${dateKey}T12:00:00`);
    const dayOffset = Math.round((date.getTime() - weekStart.getTime()) / 86400000);
    const templateLifts = programDaysByOffset.get(dayOffset);

    if (!templateLifts || templateLifts.length === 0) {
      for (const lift of dateLifts) {
        enrichedById.set(lift.id, lift);
      }
      continue;
    }

    const usedTemplateIndexes = new Set();

    for (const lift of dateLifts) {
      if (lift.blockLabel) {
        enrichedById.set(lift.id, lift);
        continue;
      }

      const exactMatchIndex = templateLifts.findIndex((templateLift, index) => {
        return !usedTemplateIndexes.has(index) &&
          normalizeName(templateLift.exerciseName) === normalizeName(lift.exerciseName);
      });

      const fallbackIndex = templateLifts.findIndex((_, index) => !usedTemplateIndexes.has(index));
      const templateIndex = exactMatchIndex >= 0 ? exactMatchIndex : fallbackIndex;
      const matchedTemplate = templateIndex >= 0 ? templateLifts[templateIndex] : null;

      if (templateIndex >= 0) {
        usedTemplateIndexes.add(templateIndex);
      }

      enrichedById.set(lift.id, {
        ...lift,
        blockLabel: matchedTemplate?.blockLabel || lift.blockLabel || ""
      });
    }
  }

  return lifts.map((lift) => enrichedById.get(lift.id) || lift);
}

module.exports = {
  enrichLiftBlocks
};
