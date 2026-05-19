// Pull the first numeric value out of a free-text weight string.
// Handles "225 lb", "55 lb DBs", "78%", "Bodyweight" (returns null).
// Returns null when no number is present so the caller can suppress
// the delta chip rather than guess.
export function parseWeightNumber(value) {
  if (value == null) return null;
  const match = String(value).match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

// Returns { delta, sign, label } or null if either input can't be
// parsed. sign is "up" | "down" | "same"; label is what we render
// (e.g. "+5 lb", "-10 lb", "0 lb").
export function weightDelta(loggedValue, priorValue) {
  const current = parseWeightNumber(loggedValue);
  const prior = parseWeightNumber(priorValue);
  if (current == null || prior == null) return null;
  const delta = current - prior;
  const sign = delta > 0 ? "up" : delta < 0 ? "down" : "same";
  const rounded = Math.round(delta * 10) / 10;
  const formatted = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  const label = `${delta > 0 ? "+" : ""}${formatted} lb`;
  return { delta, sign, label };
}
