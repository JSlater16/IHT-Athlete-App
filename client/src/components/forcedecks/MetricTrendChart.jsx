// Hand-rolled SVG line chart for a single metric across many sessions.
// Matches the existing Sparkline/HexChart approach (no chart library).
//
// Props:
//   points: [{ testDate: ISOString, value: Number }]  — oldest-first
//   unit:   String                                    — metric unit for Y-axis tick labels

const WIDTH = 720;
const HEIGHT = 320;
const PAD_LEFT = 56;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 36;
const PLOT_W = WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_H = HEIGHT - PAD_TOP - PAD_BOTTOM;

function formatTick(value, unit) {
  const abs = Math.abs(value);
  let formatted;
  if (abs >= 1000) formatted = Math.round(value).toLocaleString();
  else if (abs >= 100) formatted = Math.round(value).toString();
  else if (abs >= 10) formatted = value.toFixed(1);
  else if (abs >= 1) formatted = value.toFixed(2);
  else formatted = value.toFixed(2);
  return unit ? `${formatted} ${unit}` : formatted;
}

function formatDateShort(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function pickXTickIndices(n) {
  // Choose up to 5 evenly-spaced indices in [0, n-1]. Always include
  // first and last when there's more than one point.
  if (n <= 1) return [0];
  if (n <= 5) return Array.from({ length: n }, (_, i) => i);
  const target = 5;
  const step = (n - 1) / (target - 1);
  const indices = [];
  for (let i = 0; i < target; i += 1) {
    indices.push(Math.round(i * step));
  }
  return Array.from(new Set(indices));
}

export default function MetricTrendChart({ points, unit }) {
  if (!Array.isArray(points) || points.length === 0) {
    return <div className="fd-empty">No data for this metric yet.</div>;
  }
  if (points.length < 2) {
    return <div className="fd-empty">Only one session recorded — trend appears after the next test.</div>;
  }

  const values = points.map((p) => p.value);
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  // Pad the Y range a bit so the chart doesn't crowd the top/bottom edges.
  const range = maxV - minV;
  const yPad = range === 0 ? Math.max(Math.abs(maxV) * 0.05, 1) : range * 0.1;
  const yMin = minV - yPad;
  const yMax = maxV + yPad;
  const yMid = (yMin + yMax) / 2;

  const n = points.length;
  const xFor = (i) => PAD_LEFT + (n === 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W);
  const yFor = (v) => PAD_TOP + PLOT_H - ((v - yMin) / (yMax - yMin)) * PLOT_H;

  const polyline = points.map((p, i) => `${xFor(i)},${yFor(p.value)}`).join(" ");

  const xTickIndices = pickXTickIndices(n);
  const yTicks = [yMax, yMid, yMin];

  return (
    <svg
      className="fd-trend-chart-svg"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Session trend chart"
    >
      {/* Y-axis gridlines + labels */}
      {yTicks.map((tick, i) => {
        const y = yFor(tick);
        return (
          <g key={`y-${i}`}>
            <line
              className="fd-trend-gridline"
              x1={PAD_LEFT}
              x2={PAD_LEFT + PLOT_W}
              y1={y}
              y2={y}
            />
            <text className="fd-trend-axis" x={PAD_LEFT - 8} y={y + 4} textAnchor="end">
              {formatTick(tick, unit)}
            </text>
          </g>
        );
      })}

      {/* X axis line */}
      <line
        className="fd-trend-axis-line"
        x1={PAD_LEFT}
        x2={PAD_LEFT + PLOT_W}
        y1={PAD_TOP + PLOT_H}
        y2={PAD_TOP + PLOT_H}
      />

      {/* X-axis date labels */}
      {xTickIndices.map((idx) => (
        <text
          key={`x-${idx}`}
          className="fd-trend-axis"
          x={xFor(idx)}
          y={PAD_TOP + PLOT_H + 22}
          textAnchor="middle"
        >
          {formatDateShort(points[idx].testDate)}
        </text>
      ))}

      {/* Trend line */}
      <polyline className="fd-trend-line" points={polyline} fill="none" />

      {/* Point markers (latest emphasised) */}
      {points.map((p, i) => {
        const isLatest = i === points.length - 1;
        return (
          <circle
            key={i}
            className={isLatest ? "fd-trend-point fd-trend-point-latest" : "fd-trend-point"}
            cx={xFor(i)}
            cy={yFor(p.value)}
            r={isLatest ? 5 : 3.5}
          >
            <title>{`${formatDateShort(p.testDate)} — ${formatTick(p.value, unit)}`}</title>
          </circle>
        );
      })}
    </svg>
  );
}
