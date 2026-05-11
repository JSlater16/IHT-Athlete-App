// Hand-rolled SVG radar / "hex" chart for ForceDecks metrics.
// Each spoke is one metric; the perimeter represents the athlete's
// personal best (100%) and the filled cyan polygon represents the
// latest test as a fraction of PR.

const DEFAULT_SIZE = 520;
const LABEL_PAD = 18;
const RINGS = [0.25, 0.5, 0.75, 1.0];

// Visual scale floor. Anything at or below this fraction of PR is
// drawn at the center of the chart; anything at PR is drawn at the
// perimeter; values in between are rescaled to fill the radius.
// This dramatically amplifies the visible difference between an
// athlete who's near their PR (e.g. 95%) and one who's regressed
// (e.g. 75%) — without it, both polygons hug the perimeter.
const SCALE_FLOOR = 0.6;
const SCALE_RANGE = 1 - SCALE_FLOOR;

function rescale(ratio) {
  if (!Number.isFinite(ratio) || ratio <= SCALE_FLOOR) return 0;
  if (ratio >= 1) return 1;
  return (ratio - SCALE_FLOOR) / SCALE_RANGE;
}

function polarToCartesian(cx, cy, r, angle) {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

function pointsString(points) {
  return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
}

// Split long labels onto two lines so 13 spokes can fit without
// overlapping. Splits roughly in the middle on the first space.
function splitLabel(label) {
  if (!label || label.length <= 14) return [label || ""];
  const idx = label.indexOf(" ", Math.floor(label.length / 2) - 4);
  if (idx === -1 || idx > label.length - 3) return [label];
  return [label.slice(0, idx), label.slice(idx + 1)];
}

function anchorFor(x, cx) {
  const delta = x - cx;
  if (Math.abs(delta) < 6) return "middle";
  return delta > 0 ? "start" : "end";
}

export default function HexChart({ metrics, latestMetrics, bests, size = DEFAULT_SIZE }) {
  if (!metrics?.length) return null;

  const N = metrics.length;
  const cx = size / 2;
  const cy = size / 2;
  // Reserve room around the outside for labels.
  const R = size * 0.36;

  // Spokes start at top (-π/2) and go clockwise.
  const angles = metrics.map((_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / N);

  // PR perimeter = the outer hex polygon.
  const prPoints = angles.map((a) => polarToCartesian(cx, cy, R, a));

  // Latest polygon = each spoke at radius R * rescale(latest / best).
  // Rescaling lifts ratios from the [0, 1] linear scale onto a
  // [SCALE_FLOOR, 1] -> [0, 1] window so subtle PR deficits become
  // visually obvious instead of getting buried at the perimeter.
  const latestData = metrics.map((m, i) => {
    const best = bests?.[m.key];
    const latestVal = latestMetrics?.[m.key]?.value;
    const ratio =
      Number.isFinite(latestVal) && Number.isFinite(best) && best > 0
        ? Math.min(1, latestVal / best)
        : 0;
    const isBelowFloor = ratio > 0 && ratio < SCALE_FLOOR;
    return {
      point: polarToCartesian(cx, cy, R * rescale(ratio), angles[i]),
      ratio,
      isBelowFloor
    };
  });
  const latestPoints = latestData.map((d) => d.point);

  return (
    <svg
      className="fd-hex-svg"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="ForceDecks hex chart of latest test vs personal best"
    >
      {/* Concentric reference rings */}
      {RINGS.map((ratio) => (
        <polygon
          key={`ring-${ratio}`}
          points={pointsString(angles.map((a) => polarToCartesian(cx, cy, R * ratio, a)))}
          fill="none"
          stroke="rgba(243, 246, 248, 0.08)"
          strokeWidth="1"
        />
      ))}

      {/* Spokes from center to perimeter */}
      {angles.map((a, i) => {
        const [x2, y2] = polarToCartesian(cx, cy, R, a);
        return (
          <line
            key={`spoke-${i}`}
            x1={cx}
            y1={cy}
            x2={x2}
            y2={y2}
            stroke="rgba(243, 246, 248, 0.08)"
            strokeWidth="1"
          />
        );
      })}

      {/* PR polygon — dashed near-white outline */}
      <polygon
        points={pointsString(prPoints)}
        fill="rgba(243, 246, 248, 0.03)"
        stroke="rgba(243, 246, 248, 0.42)"
        strokeWidth="1.5"
        strokeDasharray="3 4"
      />

      {/* Latest polygon — filled cyan */}
      <polygon
        points={pointsString(latestPoints)}
        fill="rgba(30, 227, 214, 0.42)"
        stroke="#1EE3D6"
        strokeWidth="2.5"
        strokeLinejoin="miter"
      />

      {/* Vertex dots for the latest polygon. Below-floor metrics
         (severely off PR) get a red dot so they stand out even when
         the polygon stays at center. */}
      {latestData.map(({ point: [x, y], isBelowFloor }, i) => (
        <circle
          key={`dot-${i}`}
          cx={x}
          cy={y}
          r={isBelowFloor ? 5 : 4}
          fill={isBelowFloor ? "#ef4444" : "#1EE3D6"}
          stroke="#071018"
          strokeWidth="1.5"
        />
      ))}

      {/* Spoke labels */}
      {metrics.map((m, i) => {
        const [lx, ly] = polarToCartesian(cx, cy, R + LABEL_PAD, angles[i]);
        const lines = splitLabel(m.label);
        const baseDy = -((lines.length - 1) * 5);
        return (
          <text
            key={`label-${m.key}`}
            x={lx}
            y={ly + baseDy}
            textAnchor={anchorFor(lx, cx)}
            fontSize="10"
            fontWeight="600"
            letterSpacing="0.04em"
            fill="rgba(243, 246, 248, 0.75)"
            style={{ textTransform: "uppercase", fontVariantNumeric: "tabular-nums" }}
          >
            {lines.map((line, lineIdx) => (
              <tspan key={lineIdx} x={lx} dy={lineIdx === 0 ? 0 : 12}>
                {line}
              </tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
}
