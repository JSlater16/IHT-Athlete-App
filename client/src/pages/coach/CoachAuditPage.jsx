import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../lib/api";
import { Skeleton } from "../../components/Skeleton";
import { formatDateTime } from "../../utils/date";

/* Human-readable labels for the dotted action strings stored in the
   database. Unknown actions fall through to a title-cased version of
   the raw string. */
const actionLabels = {
  "auth.login_success": "Sign-in",
  "auth.login_failure": "Failed sign-in",
  "auth.login_blocked": "Sign-in blocked (deactivated)",
  "coach.create": "Coach created",
  "coach.deactivate": "Coach deactivated",
  "coach.reactivate": "Coach reactivated",
  "coach.password_reset": "Coach password reset",
  "athlete.create": "Athlete created",
  "athlete.delete": "Athlete deleted",
  "athlete.password_reset": "Athlete password reset"
};

function prettyAction(action) {
  if (actionLabels[action]) return actionLabels[action];
  return action
    .split(".")
    .map((part) => part.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()))
    .join(" — ");
}

function actionTone(action) {
  if (action.startsWith("auth.login_success")) return "success";
  if (action.startsWith("auth.login_failure") || action.startsWith("auth.login_blocked")) {
    return "warning";
  }
  if (action.endsWith("delete") || action.endsWith("deactivate")) return "danger";
  if (action.endsWith("password_reset")) return "warning";
  return "neutral";
}

function formatMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") return "";
  const entries = Object.entries(metadata);
  if (entries.length === 0) return "";
  return entries.map(([key, value]) => `${key}: ${value}`).join(" · ");
}

export default function CoachAuditPage() {
  const { token } = useAuth();
  const [entries, setEntries] = useState([]);
  const [availableActions, setAvailableActions] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search.trim()), 220);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    const ctrl = new AbortController();

    async function loadFirstPage() {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams();
        if (actionFilter) params.set("action", actionFilter);
        if (debouncedSearch) params.set("q", debouncedSearch);

        const data = await apiRequest(`/api/audit-log?${params.toString()}`, {
          token,
          signal: ctrl.signal
        });
        setEntries(data?.entries || []);
        setNextCursor(data?.nextCursor || null);
        setAvailableActions(data?.availableActions || []);
      } catch (loadError) {
        if (loadError.name === "AbortError") {
          return;
        }
        setError(loadError.message);
      } finally {
        if (!ctrl.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadFirstPage();
    return () => ctrl.abort();
  }, [actionFilter, debouncedSearch, token]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);

    try {
      const params = new URLSearchParams();
      if (actionFilter) params.set("action", actionFilter);
      if (debouncedSearch) params.set("q", debouncedSearch);
      params.set("cursor", nextCursor);

      const data = await apiRequest(`/api/audit-log?${params.toString()}`, { token });
      setEntries((current) => [...current, ...data.entries]);
      setNextCursor(data.nextCursor);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoadingMore(false);
    }
  }

  const summary = useMemo(() => {
    if (loading) return null;
    const total = entries.length;
    const failedLogins = entries.filter((entry) => entry.action === "auth.login_failure").length;
    return { total, failedLogins };
  }, [entries, loading]);

  return (
    <div className="coach-page-stack">
      <section className="coach-page-header">
        <div>
          <p className="eyebrow">Audit</p>
          <h2>Activity log</h2>
          <p className="muted-copy">
            Owner-only record of sign-ins, password resets, and coach or athlete lifecycle events.
          </p>
        </div>
        {summary ? (
          <div className="header-action-row">
            <span className="metric-chip">{summary.total} shown</span>
            {summary.failedLogins > 0 ? (
              <span className="metric-chip audit-chip-warning">
                {summary.failedLogins} failed sign-in{summary.failedLogins === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="dashboard-card">
        <div className="toolbar audit-toolbar">
          <input
            className="search-input"
            type="search"
            placeholder="Search actor, target, or IP"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <label className="field compact-field audit-filter-field">
            <span>Event</span>
            <select
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
            >
              <option value="">All events</option>
              {availableActions.map((action) => (
                <option key={action} value={action}>
                  {prettyAction(action)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        <div className="table-wrap">
          <table className="roster-table audit-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
                <th>Actor</th>
                <th>Target</th>
                <th>Details</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, index) => (
                    <tr key={`skeleton-${index}`} className="skeleton-audit-row" aria-hidden="true">
                      <td>
                        <Skeleton variant="line" width="140px" />
                      </td>
                      <td>
                        <Skeleton variant="badge" width="120px" />
                      </td>
                      <td>
                        <Skeleton variant="line" width="130px" />
                      </td>
                      <td>
                        <Skeleton variant="line" width="150px" />
                      </td>
                      <td>
                        <Skeleton variant="line" width="180px" />
                      </td>
                      <td>
                        <Skeleton variant="line" width="90px" />
                      </td>
                    </tr>
                  ))
                : null}
              {!loading &&
                entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="audit-when">{formatDateTime(entry.createdAt)}</td>
                    <td>
                      <span className={`audit-action-badge tone-${actionTone(entry.action)}`}>
                        {prettyAction(entry.action)}
                      </span>
                    </td>
                    <td>
                      {entry.actorName ? (
                        <div className="audit-actor">
                          <strong>{entry.actorName}</strong>
                          <span className="audit-role">{entry.actorRole || "—"}</span>
                        </div>
                      ) : (
                        <span className="muted-copy">—</span>
                      )}
                    </td>
                    <td>
                      <div className="audit-target">
                        <strong>{entry.targetLabel || entry.targetId || "—"}</strong>
                        <span className="audit-target-type">{entry.targetType || "—"}</span>
                      </div>
                    </td>
                    <td className="audit-metadata">{formatMetadata(entry.metadata) || "—"}</td>
                    <td className="audit-ip">{entry.ip || "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>

          {!loading && entries.length === 0 ? (
            <p className="empty-state">No audit events match those filters yet.</p>
          ) : null}
        </div>

        {nextCursor ? (
          <div className="audit-pagination">
            <button
              className="ghost-button"
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
            >
              {loadingMore ? "Loading…" : "Load older events"}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
