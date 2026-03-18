import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../lib/api";
import {
  buildWorkoutDayGroups,
  formatCalendarDate,
  groupLiftsByBlock,
  startOfWeek,
  toDateInputValue
} from "../../utils/date";

export default function AthleteHomePage() {
  const { token } = useAuth();
  const [weekStart] = useState(startOfWeek());
  const [selectedDayKey, setSelectedDayKey] = useState("");
  const [selectedBlockLabel, setSelectedBlockLabel] = useState("");
  const [lifts, setLifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const workoutDays = useMemo(() => buildWorkoutDayGroups(lifts), [lifts]);
  const selectedWorkoutDay = useMemo(() => {
    if (workoutDays.length === 0) {
      return null;
    }

    return workoutDays.find((day) => day.key === selectedDayKey) || workoutDays[0];
  }, [selectedDayKey, workoutDays]);
  const selectedLifts = selectedWorkoutDay?.lifts || [];
  const selectedBlocks = useMemo(() => groupLiftsByBlock(selectedLifts), [selectedLifts]);
  const selectedBlock = useMemo(() => {
    if (selectedBlocks.length === 0) {
      return null;
    }

    return selectedBlocks.find((block) => block.label === selectedBlockLabel) || selectedBlocks[0];
  }, [selectedBlockLabel, selectedBlocks]);

  useEffect(() => {
    async function loadWeek() {
      setLoading(true);
      setError("");

      try {
        const data = await apiRequest(`/api/me/lifts?week=${toDateInputValue(weekStart)}`, {
          token
        });
        setLifts(data.lifts);
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoading(false);
      }
    }

    loadWeek();
  }, [token, weekStart]);

  useEffect(() => {
    if (workoutDays.length === 0) {
      setSelectedDayKey("");
      return;
    }

    if (!workoutDays.some((day) => day.key === selectedDayKey)) {
      setSelectedDayKey(workoutDays[0].key);
    }
  }, [selectedDayKey, workoutDays]);

  useEffect(() => {
    if (selectedBlocks.length === 0) {
      setSelectedBlockLabel("");
      return;
    }

    if (!selectedBlocks.some((block) => block.label === selectedBlockLabel)) {
      setSelectedBlockLabel(selectedBlocks[0].label);
    }
  }, [selectedBlockLabel, selectedBlocks]);

  async function toggleComplete(liftId, completed) {
    const previous = lifts;
    setLifts((current) =>
      current.map((lift) => (lift.id === liftId ? { ...lift, completed } : lift))
    );

    try {
      await apiRequest(`/api/me/lifts/${liftId}`, {
        method: "PUT",
        token,
        body: { completed }
      });
    } catch (toggleError) {
      setLifts(previous);
      setError(toggleError.message);
    }
  }

  return (
    <div className="page-stack">
      <section className="ios-card hero-card">
        <div>
          <p className="eyebrow">This Week</p>
          <h2>Training plan</h2>
        </div>
        <p className="muted-copy">
          Tap a training day to see assigned lifts. Check items off as you finish them.
        </p>
      </section>

      <section className="date-strip">
        {workoutDays.length === 0 ? (
          <p className="empty-state">No training days assigned for this week yet.</p>
        ) : (
          workoutDays.map((day) => (
            <button
              key={day.key}
              className={`date-pill ${day.key === selectedWorkoutDay?.key ? "is-active" : ""}`}
              type="button"
              onClick={() => setSelectedDayKey(day.key)}
            >
              <span>{day.label}</span>
              <strong>{formatCalendarDate(day.date)}</strong>
            </button>
          ))
        )}
      </section>

      <section className="ios-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Selected Training Day</p>
            <h2>{selectedWorkoutDay ? selectedWorkoutDay.label : "No workout day selected"}</h2>
            {selectedWorkoutDay ? (
              <p className="muted-copy compact-copy">{formatCalendarDate(selectedWorkoutDay.date)}</p>
            ) : null}
          </div>
        </div>

        {loading ? <p className="empty-state">Loading your lifts...</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        {!loading && !error && selectedLifts.length === 0 ? (
          <p className="empty-state">No lifts assigned for this day.</p>
        ) : null}

        {selectedBlocks.length > 0 ? (
          <>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Blocks</p>
                <h3>Choose a block</h3>
              </div>
            </div>

            <div className="tab-switcher block-tabbar">
              {selectedBlocks.map((block) => (
                <button
                  key={block.label}
                  className={`tab-toggle block-tab ${block.label === selectedBlock?.label ? "is-active" : ""}`}
                  type="button"
                  onClick={() => setSelectedBlockLabel(block.label)}
                >
                  {block.label}
                </button>
              ))}
            </div>

            {selectedBlock ? (
              <p className="muted-copy compact-copy block-tab-meta">
                {selectedBlock.lifts.length} exercises in {selectedBlock.label}
              </p>
            ) : null}

            {selectedBlock ? (
              <section className="lift-block-group">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Open Block</p>
                    <h3>{selectedBlock.label}</h3>
                  </div>
                </div>

                <div className="lift-card-list">
                  {selectedBlock.lifts.map((lift) => (
                    <article
                      key={lift.id}
                      className={`lift-card ${lift.completed ? "is-complete" : ""}`}
                    >
                      <div className="lift-card-top">
                        <div>
                          <h3>{lift.exerciseName}</h3>
                          <p className="lift-meta">
                            {lift.sets} x {lift.reps} • {lift.weight}
                          </p>
                        </div>

                        <label className="check-chip">
                          <input
                            type="checkbox"
                            checked={lift.completed}
                            onChange={(event) => toggleComplete(lift.id, event.target.checked)}
                          />
                          <span>{lift.completed ? "Done" : "Mark done"}</span>
                        </label>
                      </div>

                      <p className="lift-notes">{lift.notes || "No notes from your coach for this lift."}</p>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
