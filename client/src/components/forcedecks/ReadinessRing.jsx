// Circular readiness score (0-100). Single-color stroke whose hue is
// interpolated from score: red (0deg) at 0, yellow (60deg) at 50,
// green (120deg) at 100. score may be null when no test is available.

const SIZE = 168;
const STROKE = 12;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

function colorFor(score) {
  if (score == null) return "rgba(243, 246, 248, 0.25)";
  const clamped = Math.max(0, Math.min(100, score));
  const hue = clamped * 1.2; // 0 -> 0deg red, 50 -> 60deg yellow, 100 -> 120deg green
  return `hsl(${hue}, 80%, 50%)`;
}

export default function ReadinessRing({ score }) {
  const display = score == null ? "—" : Math.round(score);
  const offset = score == null ? CIRC : CIRC - (Math.max(0, Math.min(100, score)) / 100) * CIRC;
  const stroke = colorFor(score);

  return (
    <div className="fd-readiness-ring">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={
          score == null ? "Readiness score unavailable" : `Readiness score ${display} of 100`
        }
      >
        {/* Track */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="rgba(243, 246, 248, 0.08)"
          strokeWidth={STROKE}
        />
        {/* Score arc */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={stroke}
          strokeWidth={STROKE}
          strokeLinecap="butt"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          style={{ transition: "stroke-dashoffset 320ms var(--ease-out), stroke 320ms var(--ease-out)" }}
        />
        <text
          x="50%"
          y="46%"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#1EE3D6"
          fontSize="46"
          fontWeight="700"
          letterSpacing="-0.04em"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {display}
        </text>
        <text
          x="50%"
          y="64%"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="rgba(243, 246, 248, 0.55)"
          fontSize="11"
          letterSpacing="0.1em"
        >
          READINESS
        </text>
      </svg>
    </div>
  );
}
