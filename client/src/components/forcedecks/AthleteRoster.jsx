import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

function deltaLabel(delta) {
  if (delta == null) return "—";
  if (delta === 0) return "0";
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${Math.abs(delta)}`;
}

export default function AthleteRoster() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: "loading", athletes: [], error: null });
  const [query, setQuery] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    apiRequest("/api/forcedecks/roster", { token, signal: ctrl.signal })
      .then((data) =>
        setState({ status: "ready", athletes: data?.athletes || [], error: null })
      )
      .catch((err) => {
        if (err.name === "AbortError") return;
        setState({ status: "error", athletes: [], error: err.message || "Failed to load" });
      });
    return () => ctrl.abort();
  }, [token]);

  const filteredAthletes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return state.athletes;
    return state.athletes.filter((a) => (a.name || "").toLowerCase().includes(needle));
  }, [state.athletes, query]);

  return (
    <div className="fd-module">
      <div className="fd-page">
        <header className="fd-page-header">
          <div>
            <h1 className="fd-page-title">ForceDecks Roster</h1>
            <p className="fd-page-sub">
              Latest readiness across every active athlete. Flagged rows dropped &gt; 10 points
              since their previous test.
            </p>
          </div>
        </header>

        {state.status === "ready" && state.athletes.length > 0 ? (
          <input
            type="search"
            className="fd-search-input"
            placeholder="Search athletes…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Filter athletes by name"
          />
        ) : null}

        {state.status === "loading" ? (
          <div className="fd-empty">Loading roster…</div>
        ) : state.status === "error" ? (
          <div className="fd-empty fd-empty-error">{state.error}</div>
        ) : state.athletes.length === 0 ? (
          <div className="fd-empty">No active athletes.</div>
        ) : filteredAthletes.length === 0 ? (
          <div className="fd-empty">No athletes match “{query}”.</div>
        ) : (
          <table className="fd-roster-table">
            <thead>
              <tr>
                <th>Athlete</th>
                <th>Latest test</th>
                <th>Readiness</th>
                <th>Δ vs previous</th>
                <th aria-label="Flag" />
              </tr>
            </thead>
            <tbody>
              {filteredAthletes.map((a) => (
                <tr
                  key={a.athleteId}
                  className={a.flagged ? "fd-roster-row fd-row-flagged" : "fd-roster-row"}
                  onClick={() => navigate(`/dashboard/forcedecks/${a.athleteId}`)}
                  tabIndex={0}
                  role="link"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/dashboard/forcedecks/${a.athleteId}`);
                    }
                  }}
                >
                  <td className="fd-roster-name">{a.name}</td>
                  <td className="fd-roster-date">{formatDate(a.latest?.testDate)}</td>
                  <td className="fd-roster-readiness">
                    {a.latest?.readinessScore != null ? a.latest.readinessScore : "—"}
                  </td>
                  <td className={`fd-roster-delta ${a.delta != null && a.delta < 0 ? "is-down" : ""}`}>
                    {deltaLabel(a.delta)}
                  </td>
                  <td>{a.flagged ? <span className="fd-flag-dot" aria-label="Flagged" /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
