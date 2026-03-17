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
  