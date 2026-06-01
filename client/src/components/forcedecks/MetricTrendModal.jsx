import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import MetricTrendChart from "./MetricTrendChart";

// Modal that shows the full session-by-session history for one metric.
// Reuses the HexChartModal scaffolding (backdrop, header, close button,
// escape-to-close). Fetches up to 60 tests so an athlete with 2+ years
// of monthly testing still fits on the chart.

const HISTORY_LIMIT = 60;

function formatValue(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1000) return Math.round(value).toLocaleString();
  if (abs >= 100) return Math.round(value).toString();
  if (abs >= 10) return value.toFixed(1);
  if (abs >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

function pctFromPr(latest, pr) {
  if (latest == null || pr == null || !Number.isFinite(latest) || !Number.isFinite(pr) || pr === 0) {
    return null;
  }
  return ((latest - pr) / pr) * 100;
}

function pctLabel(pct) {
  if (pct == null) return "—";
  // Match-PR threshold (0.05%) absorbs float noise across re-imports.
  if (Math.abs(pct) < 0.05) return "PR";
  const sign = pct > 0 ? "+" : "−";
  return `${sign}${Math.abs(pct).toFixed(1)}% from PR`;
}

export default function MetricTrendModal({
  open,
  scope,
  athleteId,
  metricKey,
  metricLabel,
  unit,
  onClose
}) {
  const { token } = useAuth();
  const [state, setState] = useState({ status: "idle", data: null, error: null });

  useEffect(() => {
    if (!open || !metricKey) return undefined;

    const url =
      scope === "coach" && athleteId
        ? `/api/forcedecks/athletes/${athleteId}?limit=${HISTORY_LIMIT}`
        : `/api/forcedecks/me?limit=${HISTORY_LIMIT}`;

    const ctrl = new AbortController();
    setState({ status: "loading", data: null, error: null });

    apiRequest(url, { token, signal: ctrl.signal })
      .then((data) => setState({ status: "ready", data, error: null }))
      .catch((err) => {
        if (err.name === "AbortError") return;
        setState({ status: "error", data: null, error: err.message || "Failed to load trend" });
      });

    return () => ctrl.abort();
  }, [open, metricKey, scope, athleteId, token]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Build oldest-first point series for the active metric. The API
  // returns newest-first; the chart wants oldest-first so dates flow
  // left-to-right.
  // body_mass is a special metric: it lives on the test row itself
  // (not in t.metrics), is stored in kg, and is displayed in lb.
  const points = useMemo(() => {
    const tests = state.data?.tests || [];
    return tests
      .slice()
      .reverse()
      .map((t) => {
        if (metricKey === "body_mass") {
          const kg = Number(t.bodyMass);
          if (!Number.isFinite(kg) || kg <= 0) return null;
          return { testDate: t.testDate, value: kg * 2.20462 };
        }
        const m = t.metrics?.[metricKey];
        if (!m || !Number.isFinite(Number(m.value))) return null;
        return { testDate: t.testDate, value: Number(m.value) };
      })
      .filter(Boolean);
  }, [state.data, metricKey]);

  const latest = points.length > 0 ? points[points.length - 1] : null;
  const previous = points.length > 1 ? points[points.length - 2] : null;
  // PR semantics don't apply to body weight — the heaviest recorded
  // weight isn't a "record" worth tracking against.
  const showPr = metricKey !== "body_mass";
  const pr = showPr && points.length > 0 ? Math.max(...points.map((p) => p.value)) : null;
  const pct = latest && pr != null ? pctFromPr(latest.value, pr) : null;

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card modal-card-wide fd-hex-modal fd-module"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fd-trend-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="fd-hex-header">
          <div>
            <h2 id="fd-trend-title" className="fd-hex-title">{metricLabel || "Metric"}</h2>
            <p className="fd-hex-sub">Session history</p>
          </div>
          <button type="button" className="fd-report-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="fd-hex-body">
          {state.status === "loading" ? (
            <div className="fd-empty">Loading…</div>
          ) : state.status === "error" ? (
            <div className="fd-empty fd-empty-error">{state.error}</div>
          ) : points.length === 0 ? (
            <div className="fd-empty">No data for this metric yet.</div>
          ) : (
            <>
              <div className="fd-trend-header">
                <div className="fd-trend-stat">
                  <div className="fd-trend-stat-label">Previous</div>
                  <div className="fd-trend-stat-value">
                    {previous ? `${formatValue(previous.value)}${unit ? ` ${unit}` : ""}` : "—"}
                  </div>
                </div>
                {showPr ? (
                  <>
                    <div className="fd-trend-stat">
                      <div className="fd-trend-stat-label">PR</div>
                      <div className="fd-trend-stat-value">
                        {pr != null ? `${formatValue(pr)}${unit ? ` ${unit}` : ""}` : "—"}
                      </div>
                    </div>
                    <div className="fd-trend-stat">
                      <div className="fd-trend-stat-label">vs PR</div>
                      <div
                        className={`fd-trend-stat-value ${
                          pct == null
                            ? ""
                            : Math.abs(pct) < 0.05
                            ? "is-pr"
                            : pct < 0
                            ? "is-down"
                            : "is-up"
                        }`}
                      >
                        {pctLabel(pct)}
                      </div>
                    </div>
                  </>
                ) : null}
              </div>

              <MetricTrendChart points={points} unit={unit} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
