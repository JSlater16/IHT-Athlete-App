"use strict";

function normalize(name) {
  return String(name || "").toLowerCase().trim();
}

// Decorates each lift row with `videoLiftId` (the matching library
// lift id, or null), `videoUrl` (a YouTube URL when set in the
// library, otherwise null), and `hasVideo` (true when either source
// is present). Matches by case-insensitive name — the same heuristic
// the program builder uses to autocomplete lifts.
function attachVideoFlag(lifts, library, videoIdSet) {
  if (!Array.isArray(lifts) || lifts.length === 0) return lifts;
  const byNormalizedName = new Map(
    (library?.liftLibrary || []).map((l) => [
      normalize(l.name),
      { id: l.id, videoUrl: l.videoUrl || null }
    ])
  );
  return lifts.map((lift) => {
    const match = byNormalizedName.get(normalize(lift.exerciseName));
    const videoLiftId = match?.id || null;
    const videoUrl = match?.videoUrl || null;
    const hasVideo = Boolean(
      videoLiftId && (videoIdSet.has(videoLiftId) || videoUrl)
    );
    return { ...lift, videoLiftId, videoUrl, hasVideo };
  });
}

module.exports = { attachVideoFlag };
