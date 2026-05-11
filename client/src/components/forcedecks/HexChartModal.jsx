import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import HexChart from "./HexChart";

// Modal wrapper for the ForceDecks hex chart. Fetches the athlete's
// latest test + all-time PRs from the existing read endpoint and
// renders the SVG. No AI calls — deterministic, free, instant.

export default function HexChartModal({ open, athleteId, athleteName, onClose }) {
  const { token } = useAuth();
  const [state, setState] = useState({ status: "idle", data: null, error: null });

  useEffect(() => {
    if (!open || !athleteId) return undefined;

    const ctrl = new AbortController();
    setState({ status: "loading", data: null, error: null });

    apiRequest(`/api/forcedecks/athletes/${athleteId}?limit=1`, {
      token,
      signal: ctrl.signal,
    })
      .then((data) => setState({ status: "ready", data, error: null }))
      .catch((err) => {
        if (err.name === "AbortError") return;
        setState({ status: "error", data: null, error: err.message || "Failed to load hex chart" });
      });

    return () => ctrl.abort();
  }, [open, athleteId, token]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const latest = state.data?.tests?.[0];
  const metricCatalog = state.data?.metricCatalog || [];
  const bests = state.data?.bests || {};

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card modal-card-wide fd-hex-modal fd-module"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fd-hex-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="fd-hex-header">
          <div>
            <h2 id="fd-hex-title" className="fd-hex-title">Hex Chart</h2>
            <p className="fd-hex-sub">
              {athleteName} · latest test vs. all-time personal bests
            </p>
          </div>
          <button type="button" className="fd-report-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="fd-hex-body">
          {state.status === "loading" ? (
            <div className="fd-empty">
              <span className="fd-report-spinner" aria-hidden="true" />
              Loading…
            </div>
          ) : state.status === "error" ? (
            <div className="fd-empty fd-empty-error">{state.error}</div>
          ) : !latest ? (
            <div className="fd-empty">No ForceDecks tests yet for this athlete.</div>
          ) : (
            <>
              <HexChart
                metrics={metricCatalog}
                latestMetrics={latest.metrics}
                bests={bests}
              />
              <div className="fd-hex-legend">
                <span className="fd-hex-legend-item">
                  <span className="fd-hex-legend-swatch is-latest" /> Latest test
                  <span className="fd-hex-legend-date">
                    {latest.testDate ? new Date(latest.testDate).toLocaleDateString() : ""}
                  </span>
                </span>
                <span className="fd-hex-legend-item">
                  <span className="fd-hex-legend-swatch is-pr" /> Personal best (perimeter = 100%)
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
