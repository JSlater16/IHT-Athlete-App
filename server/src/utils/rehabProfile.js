const emptyRehabProfile = {
  inhibitedMuscles: [],
  padPlacementImages: []
};
const maxPadPlacementImages = 8;

function parseBoolean(value) {
  return value === true;
}

function normalizePainScale(value, pain) {
  if (!pain) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(10, Math.round(parsed)));
}

function normalizeMuscleFrequency(value) {
  if (value === "" || value === null || typeof value === "undefined") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed);
}

function normalizeInhibitedMuscles(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((muscle, index) => {
      const name = typeof muscle?.name === "string" ? muscle.name.trim() : "";
      const pain = parseBoolean(muscle?.pain);

      if (!name) {
        return null;
      }

      return {
        id:
          typeof muscle?.id === "string" && muscle.id.trim().length > 0
            ? muscle.id.trim()
            : `muscle-${Date.now()}-${index}`,
        name,
        frequency: normalizeMuscleFrequency(muscle?.frequency),
        pain,
        painScale: normalizePainScale(muscle?.painScale, pain),
        primary: parseBoolean(muscle?.primary),
        left: parseBoolean(muscle?.left),
        right: parseBoolean(muscle?.right)
      };
    })
    .filter(Boolean);
}

function normalizePadPlacementImages(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .slice(0, maxPadPlacementImages)
    .map((image, index) => {
      const imageData =
        typeof image?.imageData === "string" && image.imageData.startsWith("data:image/")
          ? image.imageData
          : "";

      if (!imageData) {
        return null;
      }

      return {
        id:
          typeof image?.id === "string" && image.id.trim().length > 0
            ? image.id.trim()
            : `pad-${Date.now()}-${index}`,
        imageData,
        side: image?.side === "Right" ? "Right" : "Left",
        result: image?.result === "Negative" ? "Negative" : "Positive"
      };
    })
    .filter(Boolean);
}

function normalizeRehabProfile(input) {
  return {
    inhibitedMuscles: normalizeInhibitedMuscles(input?.inhibitedMuscles),
    padPlacementImages: normalizePadPlacementImages(input?.padPlacementImages)
  };
}

function parseRehabProfile(rawValue) {
  if (!rawValue || typeof rawValue !== "string") {
    return emptyRehabProfile;
  }

  try {
    return normalizeRehabProfile(JSON.parse(rawValue));
  } catch (_error) {
    return emptyRehabProfile;
  }
}

module.exports = {
  emptyRehabProfile,
  maxPadPlacementImages,
  normalizeRehabProfile,
  parseRehabProfile
};
