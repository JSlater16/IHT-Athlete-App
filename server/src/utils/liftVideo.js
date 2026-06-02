"use strict";

function normalize(name) {
  return String(name || "").toLowerCase().trim();
}

// Decorates each lift row with `videoLiftId` (the matching library
// lift id, or null) and `hasVideo` (true when that lift has an
// uploaded demo video on disk). Matches by case-insensitive name —
// the same heuristic the program builder uses to autocomplete lifts.
function attachVideoFlag(lifts, library, videoIdSet) {
  if (!Array.isArray(lifts) || lifts.length === 0) return lifts;
  const byNormalizedName = new Map(
    (library?.liftLibrary || []).map((l) => [normalize(l.name), l.id])
  );
  return lifts.map((lift) => {
    const videoLiftId = byNormalizedName.get(normalize(lift.exerciseName)) || null;
    const hasVideo = Boolean(videoLiftId && videoIdSet.has(videoLiftId));
    return { ...lift, videoLiftId, hasVideo };
  });
}

module.exports = { attachVideoFlag };
