import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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

export default function CoachLeaderboardPage() {
  const { token } = useAuth();
  const [boardsState, setBoardsState] = useState({ status: "loading", data: null, error: null });
  const [hiddenAthletes, setHiddenAthletes] = useState([]);
  const [statusMessage, setStatusMessage] = useState("");

  async function loadAll(signal) {
    setBoardsState({ status: "loading", data: null, error: null });
    try {
      const [boardsData, athletesData] = await Promise.all([
        apiRequest("/api/forcedecks/leaderboard?full=1", { token, signal }),
        apiRequest("/api/athletes", { token, signal })
      ]);
      setBoardsState({ status: "ready", data: boardsData, error: null });
      setHiddenAthletes(
        (athletesData?.athletes || []).filter((a) => a.hideFromLeaderboard).sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch (err) {
      if (err.name === "AbortError") return;
      setBoardsState({ status: "error", data: null, error: err.message || "Failed to load" });
    }
  }

  useEffect(() => {
    const ctrl = new AbortController();
    loadAll(ctrl.signal);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleRestore(athleteId) {
    try {
      await apiRequest(`/api/athletes/${athleteId}/leaderboard-visibility`, {
        method: "PUT",
        token,
        body: { hideFromLeaderboard: false }
      });
      setStatusMessage("Athlete restored to leaderboard.");
      loadAll();
    } catch (err) {
      setStatusMessage(err.message || "Failed to restore athlete.");
    }
  }

  return (
    <div className="fd-module">
      <div className="fd-page">
        <header className="fd-page-header">
          <div>
            <h1 className="fd-page-title">Leaderboards</h1>
            <p className="fd-page-sub">
              All-time PR per athlete on jump height and peak power. Same view your athletes see.
            </p>
          </div>
        </header>

        {statusMessage ? <div className="fd-empty">{statusMessage}</div> : null}

        {boardsState.status === "loading" ? (
          <div className="fd-empty">Loading…</div>
        ) : boardsState.status === "error" ? (
          <div className="fd-empty fd-empty-error">{boardsState.error}</div>
        ) : !boardsState.data || boardsState.data.boards.length === 0 ? (
          <div className="fd-empty">No leaderboards available yet.</div>
        ) : (
          <div className="lb-board-grid">
            {boardsState.data.boards.map((board) => (
              <Board key={board.metricKey} board={board} />
            ))}
          </div>
        )}

        <section className="lb-board">
          <header className="lb-board-header">
            <h2 className="lb-board-title">Hidden athletes</h2>
            <span className="lb-board-unit">{hiddenAthletes.length} hidden</span>
          </header>

          {hiddenAthletes.length === 0 ? (
            <div className="fd-empty">No athletes are hidden from the leaderboard.</div>
          ) : (
            <ul className="lb-row-list">
              {hiddenAthletes.map((athlete) => (
                <li key={athlete.id} className="lb-row">
                  <span className="lb-row-rank">—</span>
                  <div className="lb-row-name">
                    <strong>{athlete.name}</strong>
                    <Link className="lb-row-date" to={`/dashboard/athletes/${athlete.id}`}>
                      Open profile
                    </Link>
                  </div>
                  <button className="ghost-button" type="button" onClick={() => handleRestore(athlete.id)}>
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

const DEFAULT_VISIBLE = 10;

function Board({ board }) {
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? board.rows : board.rows.slice(0, DEFAULT_VISIBLE);
  const hiddenCount = board.rows.length - DEFAULT_VISIBLE;

  return (
    <section className="lb-board">
      <header className="lb-board-header">
        <h2 className="lb-board-title">{board.label}</h2>
        <span className="lb-board-unit">{board.unit ? `(${board.unit})` : ""}</span>
      </header>

      {board.rows.length === 0 ? (
        <div className="fd-empty">No qualifying tests yet.</div>
      ) : (
        <>
          <ol className="lb-row-list">
            {visibleRows.map((row, idx) => {
              const rank = idx + 1;
              const rankClass = rank === 1 ? "lb-rank-1" : rank === 2 ? "lb-rank-2" : rank === 3 ? "lb-rank-3" : "";
              return (
                <li key={row.athleteId} className="lb-row">
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
          {hiddenCount > 0 ? (
            <button
              type="button"
              className="ghost-button lb-show-more"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Show top 10" : `Show all (${board.rows.length})`}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
