const standardProgramVariant = "Standard";
const eccentricProgramVariants = ["Alactic Eccentrics", "Lactic Eccentrics"];
const allowedProgramVariants = new Set([standardProgramVariant, ...eccentricProgramVariants]);

function resolveProgramVariant(phase, value) {
  const trimmedValue = typeof value === "string" ? value.trim() : "";

  // Eccentrics is still constrained — coaches expect those two named
  // tracks. Every other phase accepts whatever free-form variant the
  // coach supplies ("Standard", "Base", "Advanced", "Returning", etc).
  if (phase === "Eccentrics") {
    return eccentricProgramVariants.includes(trimmedValue) ? trimmedValue : null;
  }

  return trimmedValue || standardProgramVariant;
}

module.exports = {
  standardProgramVariant,
  eccentricProgramVariants,
  allowedProgramVariants,
  resolveProgramVariant
};
