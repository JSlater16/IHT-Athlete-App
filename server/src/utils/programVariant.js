const standardProgramVariant = "Standard";
const eccentricProgramVariants = ["Alactic Eccentrics", "Lactic Eccentrics"];
const allowedProgramVariants = new Set([standardProgramVariant, ...eccentricProgramVariants]);

function resolveProgramVariant(phase, value) {
  const trimmedValue = typeof value === "string" ? value.trim() : "";

  if (phase === "Eccentrics") {
    return eccentricProgramVariants.includes(trimmedValue) ? trimmedValue : null;
  }

  return standardProgramVariant;
}

module.exports = {
  standardProgramVariant,
  eccentricProgramVariants,
  allowedProgramVariants,
  resolveProgramVariant
};
