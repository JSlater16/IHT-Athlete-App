import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

function formatValue(value, unit) {
  if (!Number.isFinite(value)) return "—";
  const decimals = Math.abs(value) >= 100 ? 0 : 1;
  return `${value.toFixed(decimals)}${unit ? ` ${unit}` : ""}`;
}

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString();
  } catch (_err) {
    return "";
  }
}

export default function AthleteLeaderboardPage() {
  const { token } = useAuth();
  const [state, setState] = useState({ status: "loading", data: null, error: null });

  useEffect(() => {
    const ctrl = new AbortController();
    setState({ status: "loading", data: null, error: null });
    apiRequest("/api/forcedecks/leaderboard", { token, signal: ctrl.signal })
      .then((data) => setState({ status: "ready", data, error: null }))
      .catch((err) => {
        if (err.name === "AbortError") return;
        setState({ status: "error", data: null, error: err.message || "Failed to load" });
      });
    return () => ctrl.abort();
  }, [token]);

  return (
    <div className="fd-module">
      <div className="fd-page">
        <header className="fd-page-header">
          <div>
            <h1 className="fd-page-title">Leaderboards</h1>
            <p className="fd-page-sub">All-time PR per athlete on jump height and peak power.</p>
          </div>
        </header>

        {state.status === "loading" ? (
          <div className="fd-empty">Loading…</div>
        ) : state.status === "error" ? (
          <div className="fd-empty fd-empty-error">{state.error}</div>
        ) : !state.data || state.data.boards.length === 0 ? (
          <div className="fd-empty">No leaderboards available yet.</div>
        ) : (
          <Boards data={state.data} />
        )}
      </div>
    </div>
  );
}

function Boards({ data }) {
  const viewerId = data.viewerAthleteId;
  return (
    <div className="lb-board-grid">
      {data.boards.map((board) => (
        <Board key={board.metricKey} board={board} viewerId={viewerId} />
      ))}
    </div>
  );
}

function Board({ board, viewerId }) {
  return (
    <section className="lb-board">
      <header className="lb-board-header">
        <h2 className="lb-board-title">{board.label}</h2>
        <span className="lb-board-unit">{board.unit ? `(${board.unit})` : ""}</span>
      </header>

      {board.rows.length === 0 ? (
        <div className="fd-empty">No qualifying tests yet.</div>
      ) : (
        <ol className="lb-row-list">
          {board.rows.map((row, idx) => {
            const rank = idx + 1;
            const isViewer = viewerId && row.athleteId === viewerId;
            const rankClass = rank === 1 ? "lb-rank-1" : rank === 2 ? "lb-rank-2" : rank === 3 ? "lb-rank-3" : "";
            return (
              <li
                key={row.athleteId}
                className={`lb-row ${isViewer ? "is-viewer" : ""}`}
              >
                <span className={`lb-row-rank ${rankClass}`}>{rank}</span>
                <div className="lb-row-name">
                  <strong>{row.name}</strong>
                  <span className="lb-row-date">{formatDate(row.testDate)}</span>
                </div>
                <span className="lb-row-value">{formatValue(row.value, row.unit)}</span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
