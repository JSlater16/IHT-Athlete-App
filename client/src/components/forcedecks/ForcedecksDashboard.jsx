import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import ReadinessRing from "./ReadinessRing";
import MetricCard from "./MetricCard";
import MetricTrendModal from "./MetricTrendModal";

// Build a sparkline value array for one metric across the returned
// tests. Tests come back newest-first from the API; the sparkline
// reads oldest -> newest left-to-right, so we reverse them.
function sparklineForMetric(tests, key) {
  return tests
    .slice()
    .reverse()
    .map((t) => t.metrics?.[key]?.value)
    .filter((v) => Number.isFinite(v));
}

function sparklineForBodyMass(tests) {
  return tests
    .slice()
    .reverse()
    .map((t) => (Number.isFinite(Number(t.bodyMass)) ? Number(t.bodyMass) * 2.20462 : null))
    .filter((v) => Number.isFinite(v));
}

export default function ForcedecksDashboard({ scope, athleteId, headerSlot }) {
  const { token, user } = useAuth();
  const [state, setState] = useState({ status: "loading", data: null, error: null });
  const [openMetric, setOpenMetric] = useState(null);
  const [compareMode, setCompareMode] = useState("previous");

  useEffect(() => {
    const ctrl = new AbortController();
    const url =
      scope === "coach" && athleteId
        ? `/api/forcedecks/athletes/${athleteId}?limit=3`
        : "/api/forcedecks/me?limit=3";

    setState({ status: "loading", data: null, error: null });
    apiRequest(url, { token, signal: ctrl.signal })
      .then((data) => setState({ status: "ready", data, error: null }))
      .catch((err) => {
        if (err.name === "AbortError") return;
        setState({ status: "error", data: null, error: err.message || "Failed to load" });
      });

    return () => ctrl.abort();
  }, [scope, athleteId, token]);

  const includeCoachMetrics = scope === "coach" || user?.role === "COACH" || user?.role === "OWNER";

  return (
    <div className="fd-module">
      <div className="fd-page">
        {headerSlot}

        {state.status === "loading" ? (
          <div className="fd-empty">Loading…</div>
        ) : state.status === "error" ? (
          <div className="fd-empty fd-empty-error">{state.error}</div>
        ) : !state.data || !state.data.tests || state.data.tests.length === 0 ? (
          <div className="fd-empty">No ForceDecks tests yet for this athlete.</div>
        ) : (
          <Body
            data={state.data}
            includeCoachMetrics={includeCoachMetrics}
            compareMode={compareMode}
            onCompareModeChange={setCompareMode}
            onSelectMetric={setOpenMetric}
          />
        )}
      </div>

      <MetricTrendModal
        open={Boolean(openMetric)}
        scope={scope}
        athleteId={athleteId}
        metricKey={openMetric?.key || null}
        metricLabel={openMetric?.label || ""}
        unit={openMetric?.unit || ""}
        onClose={() => setOpenMetric(null)}
      />
    </div>
  );
}

function Body({ data, includeCoachMetrics, compareMode, onCompareModeChange, onSelectMetric }) {
  const latest = data.tests[0];
  const metrics = (data.metricCatalog || []).filter((m) =>
    includeCoachMetrics ? true : !m.coachOnly
  );
  const compareLabel = compareMode === "first" ? "first" : "last";

  return (
    <>
      <div className="fd-readiness-block">
        <ReadinessRing score={latest?.readinessScore ?? null} />
        <div className="fd-readiness-meta">
          <div className="fd-readiness-meta-label">LATEST TEST</div>
          <div className="fd-readiness-meta-date">
            {latest?.testDate ? new Date(latest.testDate).toLocaleDateString() : "—"}
          </div>
        </div>
      </div>

      <div className="fd-compare-bar">
        <span className="fd-compare-bar-label">PR compare</span>
        <div className="lb-toggle" role="tablist" aria-label="PR comparison mode">
          <button
            type="button"
            role="tab"
            aria-selected={compareMode === "previous"}
            className={`lb-toggle-btn ${compareMode === "previous" ? "is-active" : ""}`}
            onClick={() => onCompareModeChange("previous")}
          >
            vs Previous
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={compareMode === "first"}
            className={`lb-toggle-btn ${compareMode === "first" ? "is-active" : ""}`}
            onClick={() => onCompareModeChange("first")}
          >
            vs First Session
          </button>
        </div>
      </div>

      <div className="fd-metric-grid">
        {includeCoachMetrics && data.latestBodyMass?.value != null ? (
          <MetricCard
            label="Body Weight"
            value={Number(data.latestBodyMass.value) * 2.20462}
            unit="lb"
            sparklineData={sparklineForBodyMass(data.tests)}
            best={null}
            compareValue={null}
            compareLabel={compareLabel}
            onClick={() =>
              onSelectMetric({ key: "body_mass", label: "Body Weight", unit: "lb" })
            }
          />
        ) : null}
        {metrics.map((m) => {
          const latestValue = latest?.metrics?.[m.key]?.value ?? null;
          const compareValue =
            compareMode === "first"
              ? data.firsts?.[m.key] ?? null
              : data.tests[1]?.metrics?.[m.key]?.value ?? null;
          const unit = latest?.metrics?.[m.key]?.unit ?? m.unit;
          return (
            <MetricCard
              key={m.key}
              label={m.label}
              value={latestValue}
              unit={unit}
              sparklineData={sparklineForMetric(data.tests, m.key)}
              best={data.bests?.[m.key] ?? null}
              compareValue={compareValue}
              compareLabel={compareLabel}
              onClick={() => onSelectMetric({ key: m.key, label: m.label, unit })}
            />
          );
        })}
      </div>
    </>
  );
}
