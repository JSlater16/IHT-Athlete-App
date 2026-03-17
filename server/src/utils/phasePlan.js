const orderedTrainingPhases = ["Prep", "Eccentrics", "Iso", "Power", "Speed"];
const modelWeeksPerPhase = {
  "10-Week": 2,
  "20-Week": 4
};

function getWeeksPerPhase(trainingModel) {
  return modelWeeksPerPhase[trainingModel] || null;
}

function startOfDay(dateInput) {
  const date = new Date(dateInput);
  date.setHours(0, 0, 0, 0);
  return date;
}

function buildPhaseTimeline(profile, referenceDate = new Date()) {
  const weeksPerPhase = getWeeksPerPhase(profile.trainingModel);
  const phaseStartedAt = profile.phaseStartedAt ? new Date(profile.phaseStartedAt) : null;
  const isStandardPhase = orderedTrainingPhases.includes(profile.phase);

  if (!weeksPerPhase || !phaseStartedAt) {
    return {
      orderedPhases: orderedTrainingPhases,
      weeksPerPhase,
      phaseStartedAt,
      isStandardPhase,
      elapsedDays: null,
      elapsedWeeks: null,
      weekOfPhase: null,
      remainingDays: null,
      expectedPhaseEndAt: null,
      nextPhase: null
    };
  }

  const elapsedDays = Math.max(
    0,
    Math.floor((startOfDay(referenceDate).getTime() - startOfDay(phaseStartedAt).getTime()) / 86400000)
  );
  const elapsedWeeks = Math.floor(elapsedDays / 7);
  const weekOfPhase = elapsedWeeks + 1;
  const phaseLengthDays = weeksPerPhase * 7;
  const remainingDays = Math.max(phaseLengthDays - elapsedDays, 0);
  const expectedPhaseEndAt = new Date(startOfDay(phaseStartedAt));
  expectedPhaseEndAt.setDate(expectedPhaseEndAt.getDate() + phaseLengthDays);
  const phaseIndex = orderedTrainingPhases.indexOf(profile.phase);
  const nextPhase =
    isStandardPhase && phaseIndex >= 0 && phaseIndex < orderedTrainingPhases.length - 1
      ? orderedTrainingPhases[phaseIndex + 1]
      : null;

  return {
    orderedPhases: orderedTrainingPhases,
    weeksPerPhase,
    phaseStartedAt,
    isStandardPhase,
    elapsedDays,
    elapsedWeeks,
    weekOfPhase,
    remainingDays,
    expectedPhaseEndAt,
    nextPhase
  };
}

module.exports = {
  orderedTrainingPhases,
  getWeeksPerPhase,
  buildPhaseTimeline
};
