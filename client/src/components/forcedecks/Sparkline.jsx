// Tiny hand-rolled SVG sparkline. Renders up to N points (newest last)
// as a thin cyan polyline. Empty / single-point inputs render nothing
// so the caller can lay out the badge / value next to it without an
// awkward stub.

const W = 80;
const H = 24;
const PAD = 2;

export default function Sparkline({ values, ariaLabel }) {
  if (!Array.isArray(values) || values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = (W - PAD * 2) / (values.length - 1);

  const points = values
    .map((v, i) => {
      const x = PAD + i * stepX;
      const y = H - PAD - ((v - min) / span) * (H - PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      className="fd-sparkline"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={ariaLabel || "trend"}
      aria-hidden={ariaLabel ? undefined : true}
    >
      <polyline points={points} />
    </svg>
  );
}
