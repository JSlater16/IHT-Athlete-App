import { useState } from "react";

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
const PAD_TOP = 24;
const PAD_BOTTOM = 36;
const PLOT_W = WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_H = HEIGHT - PAD_TOP - PAD_BOTTOM;

// Tooltip layout
const TT_W = 130;
const TT_H = 44;
const TT_OFFSET = 14;

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
  const [hoveredIdx, setHoveredIdx] = useState(null);

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
        const isHovered = hoveredIdx === i;
        return (
          <circle
            key={`pt-${i}`}
            className={isLatest ? "fd-trend-point fd-trend-point-latest" : "fd-trend-point"}
            cx={xFor(i)}
            cy={yFor(p.value)}
            r={isHovered ? (isLatest ? 7 : 5.5) : isLatest ? 5 : 3.5}
          />
        );
      })}

      {/* Wide invisible hit targets so the user doesn't have to be pixel-precise */}
      {points.map((p, i) => (
        <circle
          key={`hit-${i}`}
          className="fd-trend-hit"
          cx={xFor(i)}
          cy={yFor(p.value)}
          r={14}
          onMouseEnter={() => setHoveredIdx(i)}
          onMouseLeave={() => setHoveredIdx((current) => (current === i ? null : current))}
          onFocus={() => setHoveredIdx(i)}
          onBlur={() => setHoveredIdx((current) => (current === i ? null : current))}
          tabIndex={0}
          role="button"
          aria-label={`${formatDateShort(p.testDate)} — ${formatTick(p.value, unit)}`}
        />
      ))}

      {/* Tooltip — always mounted, animated via opacity/transform */}
      <Tooltip
        hoveredIdx={hoveredIdx}
        points={points}
        xFor={xFor}
        yFor={yFor}
        unit={unit}
      />
    </svg>
  );
}

function Tooltip({ hoveredIdx, points, xFor, yFor, unit }) {
  // Stay mounted but invisible when no hover so the fade-out animates
  // on mouse-leave. We persist the last hovered index in render data so
  // the tooltip content doesn't blank-out mid-fade.
  const idx = hoveredIdx ?? 0;
  const p = points[idx];
  if (!p) return null;
  const px = xFor(idx);
  const py = yFor(p.value);

  // Flip below the point when there's not enough room above.
  const placeAbove = py - TT_OFFSET - TT_H > PAD_TOP;
  const ttY = placeAbove ? py - TT_OFFSET - TT_H : py + TT_OFFSET;

  // Keep the tooltip inside the plot horizontally.
  const desiredX = px - TT_W / 2;
  const minX = PAD_LEFT;
  const maxX = PAD_LEFT + PLOT_W - TT_W;
  const ttX = Math.max(minX, Math.min(maxX, desiredX));

  const active = hoveredIdx !== null;

  return (
    <g transform={`translate(${ttX}, ${ttY})`} pointerEvents="none">
      <g className={`fd-trend-tooltip ${active ? "is-active" : ""}`} pointerEvents="none">
        <rect className="fd-trend-tooltip-bg" width={TT_W} height={TT_H} rx={6} ry={6} />
        <text className="fd-trend-tooltip-date" x={10} y={17}>
          {formatDateShort(p.testDate)}
        </text>
        <text className="fd-trend-tooltip-value" x={10} y={34}>
          {formatTick(p.value, unit)}
        </text>
      </g>
    </g>
  );
}
