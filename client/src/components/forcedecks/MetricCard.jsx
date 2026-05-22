import Sparkline from "./Sparkline";

function formatValue(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  // Tabular-ish formatting: 0-1 keeps 3 decimals, < 100 keeps 2, else 0.
  const abs = Math.abs(value);
  if (abs >= 100) return Math.round(value).toLocaleString();
  if (abs >= 10) return value.toFixed(1);
  if (abs >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

function deltaVsPrevious(value, previousValue) {
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(previousValue) ||
    previousValue === 0
  ) {
    return null;
  }
  const pct = ((value - previousValue) / previousValue) * 100;
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(1)}% from last`;
}

function badgeFor(value, best, previousValue) {
  if (value == null || best == null || !Number.isFinite(value) || !Number.isFinite(best) || best === 0) {
    return null;
  }
  const pct = ((value - best) / best) * 100;
  // Match-PR threshold of 0.05% absorbs float noise from re-imports.
  if (Math.abs(pct) < 0.05) {
    const delta = deltaVsPrevious(value, previousValue);
    return { tone: "pr", label: delta ? `PR · ${delta}` : "PR" };
  }
  const tone = pct < 0 ? "down" : "up";
  const sign = pct > 0 ? "+" : "−";
  return { tone, label: `${sign}${Math.abs(pct).toFixed(1)}% from PR` };
}

export default function MetricCard({ label, value, unit, sparklineData, best, previousValue, onClick }) {
  const badge = badgeFor(value, best, previousValue);
  const interactive = typeof onClick === "function";

  const content = (
    <>
      <div className="fd-metric-name">{label}</div>
      <div className="fd-metric-row">
        <div>
          <span className="fd-metric-value">{formatValue(value)}</span>
          {unit ? <span className="fd-metric-unit">{unit}</span> : null}
        </div>
        <Sparkline values={sparklineData} ariaLabel={`${label} trend`} />
      </div>
      {badge ? (
        <div className={`fd-badge is-${badge.tone}`}>{badge.label}</div>
      ) : (
        <div className="fd-badge is-empty">—</div>
      )}
    </>
  );

  if (!interactive) {
    return <div className="fd-card fd-metric-card">{content}</div>;
  }

  return (
    <button
      type="button"
      className="fd-card fd-metric-card fd-metric-card-clickable"
      onClick={onClick}
      aria-label={`${label} — view full trend`}
    >
      {content}
    </button>
  );
}
