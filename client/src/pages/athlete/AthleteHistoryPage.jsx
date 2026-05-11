import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../lib/api";
import { Skeleton } from "../../components/Skeleton";
import {
  addDays,
  buildWorkoutDayGroups,
  formatCalendarDate,
  formatDateTime,
  formatWeekRange,
  groupLiftsByBlock,
  startOfWeek,
  toDateInputValue
} from "../../utils/date";

function getHistoryWeeks() {
  const currentWeek = startOfWeek();
  return Array.from({ length: 6 }, (_, index) => addDays(currentWeek, index * -7));
}

export default function AthleteHistoryPage() {
  const { token } = useAuth();
  const [weeks, setWeeks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();

    async function loadHistory() {
      setLoading(true);
      setError("");

      try {
        const historyWeeks = getHistoryWeeks();
        const responses = await Promise.all(
          historyWeeks.map(async (weekStart) => {
            const data = await apiRequest(`/api/me/lifts?week=${toDateInputValue(weekStart)}`, {
              token,
              signal: ctrl.signal
            });

            return {
              weekStart: toDateInputValue(weekStart),
              lifts: data?.lifts || []
            };
          })
        );

        setWeeks(responses);
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

    loadHistory();
    return () => ctrl.abort();
  }, [token]);

  return (
    <div className="page-stack">
      <section className="ios-card hero-card">
        <div>
          <p className="eyebrow">History</p>
          <h2>Past weeks</h2>
        </div>
        <p className="muted-copy">
          Expand a week to review previous training and what you logged.
        </p>
      </section>

      {loading ? (
        <div className="history-stack">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="history-week skeleton-history-week">
              <Skeleton variant="title" width="55%" />
              <Skeleton variant="line" width="35%" style={{ marginTop: "0.55rem" }} />
            </div>
          ))}
        </div>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}

      <div className="history-stack">
        {weeks.map((week) => (
          <details key={week.weekStart} className="history-week" open={week.weekStart === weeks[0]?.weekStart}>
            <summary>
              <div>
                <p className="week-title">{formatWeekRange(week.weekStart)}</p>
                <span className="week-count">{week.lifts.length} lifts</span>
              </div>
            </summary>

            <div className="history-lifts">
              {week.lifts.length === 0 ? (
                <p className="empty-state">No lifts logged for this week.</p>
              ) : (
                buildWorkoutDayGroups(week.lifts).map((day) => (
                  <div key={day.key} className="history-day-group">
                    <div className="section-heading">
                      <div>
                        <p className="eyebrow">{day.label}</p>
                        <h3>{formatCalendarDate(day.date)}</h3>
                      </div>
                    </div>
                    {groupLiftsByBlock(day.lifts).map((block) => (
                      <div key={block.label} className="history-block-group">
                        <p className="history-block-label">{block.label}</p>
                        {block.lifts.map((lift) => (
                          <article key={lift.id} className="history-lift-row">
                            <div>
                              <strong>{lift.exerciseName}</strong>
                              <p className="lift-meta">
                                {lift.sets} x {lift.reps} • {lift.weight}
                              </p>
                              <p className="lift-notes">{lift.notes || "No notes."}</p>
                            </div>
                            <div className="history-lift-status">
                              <span className={`status-badge ${lift.completed ? "is-complete" : ""}`}>
                                {lift.completed ? "Completed" : "Assigned"}
                              </span>
                              <span className="history-date">{formatDateTime(lift.date)}</span>
                            </div>
                          </article>
                        ))}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
