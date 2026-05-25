import { useEffect, useRef } from "react";
import { weightDelta } from "../utils/weight";

const workoutPlacementOptions = ["Prep", "Block 1", "Block 2", "Block 3", "Block 4"];

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

// Table-style lift editor used by both the program builder
// (CoachWorkoutsPage) and the per-athlete weekly view
// (CoachAthleteProfilePage). Entries carry positional (dayIndex,
// liftIndex) addresses; callers translate those back to whatever
// stable identity their data model uses.
//
// Props:
//   entries: [{ dayIndex, liftIndex, lift, liftsInDay }]
//   library: program library (used to populate the exercise datalist)
//   liftByNormalizedName: Map keyed by normalized exercise name; used
//     to show a "new library lift on save" hint on the program-builder
//     side. Pass null/empty Map to suppress the hint.
//   onUpdateLiftField(dayIndex, liftIndex, field, value) — required
//   onMoveLift?(dayIndex, liftIndex, direction)   — optional, no arrows
//   onRemoveLift?(dayIndex, liftIndex)            — optional, no trash
//   showDayColumn: bool — whether to render the leading "Day N" column
//   focusNextRowRef?: ref whose .current = { dayIndex } to autofocus
//     the next-added row's exercise field
export default function LiftTable({
  entries,
  library,
  liftByNormalizedName,
  onUpdateLiftField,
  onCommitField,
  onRemoveLift,
  onMoveLift,
  showDayColumn,
  showLoggedColumn,
  focusNextRowRef
}) {
  const handleBlur = (dayIndex, liftIndex, field, value) => {
    if (onCommitField) onCommitField(dayIndex, liftIndex, field, value);
  };
  const lastEntryKey =
    entries.length > 0
      ? `${entries[entries.length - 1].dayIndex}-${entries[entries.length - 1].liftIndex}`
      : "";
  const exerciseInputsRef = useRef({});

  useEffect(() => {
    const target = focusNextRowRef?.current;
    if (!target) return;
    const last = entries[entries.length - 1];
    if (last && last.dayIndex === target.dayIndex) {
      const key = `${last.dayIndex}-${last.liftIndex}`;
      const input = exerciseInputsRef.current[key];
      if (input) input.focus();
    }
    if (focusNextRowRef) focusNextRowRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEntryKey]);

  if (entries.length === 0) {
    return <p className="empty-state">No lifts in this view yet.</p>;
  }

  const lookup = liftByNormalizedName || new Map();
  const showActions = Boolean(onMoveLift || onRemoveLift);

  return (
    <div className="lift-table-wrapper">
      <table className="lift-table">
        <thead>
          <tr>
            {showDayColumn ? <th>Day</th> : null}
            <th>Block</th>
            <th>Exercise</th>
            <th>Sets</th>
            <th>Reps</th>
            <th>Weight</th>
            {showLoggedColumn ? <th>Logged</th> : null}
            <th>Notes</th>
            {showActions ? <th aria-label="Actions" /> : null}
          </tr>
        </thead>
        <tbody>
          {entries.map(({ dayIndex, liftIndex, lift, liftsInDay }) => {
            const rowKey = `${dayIndex}-${liftIndex}`;
            const matched = lookup.get(normalizeText(lift.exerciseName));
            const willCreate = lift.exerciseName.trim() && !matched;
            const isDraft = !lift.exerciseName.trim();
            return (
              <tr key={rowKey} className="lift-table-row">
                {showDayColumn ? (
                  <td className="lift-table-day">
                    <span className="status-badge">Day {dayIndex + 1}</span>
                  </td>
                ) : null}
                <td>
                  <select
                    className="lift-table-input"
                    value={lift.blockLabel}
                    onChange={(e) => {
                      onUpdateLiftField(dayIndex, liftIndex, "blockLabel", e.target.value);
                      // Select changes don't fire blur reliably; commit
                      // immediately so a one-click block change persists.
                      handleBlur(dayIndex, liftIndex, "blockLabel", e.target.value);
                    }}
                  >
                    {workoutPlacementOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="lift-table-exercise">
                  <input
                    ref={(el) => {
                      if (el) exerciseInputsRef.current[rowKey] = el;
                    }}
                    list={`builder-lifts-${rowKey}`}
                    className="lift-table-input"
                    value={lift.exerciseName}
                    onChange={(e) =>
                      onUpdateLiftField(dayIndex, liftIndex, "exerciseName", e.target.value)
                    }
                    onBlur={(e) =>
                      handleBlur(dayIndex, liftIndex, "exerciseName", e.target.value)
                    }
                    placeholder="Type or pick"
                    required
                  />
                  <datalist id={`builder-lifts-${rowKey}`}>
                    {(library?.liftLibrary || []).map((l) => (
                      <option key={l.id} value={l.name} />
                    ))}
                  </datalist>
                  {liftByNormalizedName && willCreate ? (
                    <span className="muted-copy compact-copy lift-table-newlift-hint">
                      New library lift on save
                    </span>
                  ) : null}
                  {isDraft ? (
                    <span className="muted-copy compact-copy lift-table-draft-hint">
                      Draft — won't save until named
                    </span>
                  ) : null}
                </td>
                <td>
                  <input
                    type="number"
                    min="1"
                    className="lift-table-input lift-table-num"
                    value={lift.sets}
                    onChange={(e) =>
                      onUpdateLiftField(dayIndex, liftIndex, "sets", e.target.value)
                    }
                    onBlur={(e) => handleBlur(dayIndex, liftIndex, "sets", e.target.value)}
                    required
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="1"
                    className="lift-table-input lift-table-num"
                    value={lift.reps}
                    onChange={(e) =>
                      onUpdateLiftField(dayIndex, liftIndex, "reps", e.target.value)
                    }
                    onBlur={(e) => handleBlur(dayIndex, liftIndex, "reps", e.target.value)}
                    required
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="lift-table-input"
                    value={lift.weight}
                    onChange={(e) =>
                      onUpdateLiftField(dayIndex, liftIndex, "weight", e.target.value)
                    }
                    onBlur={(e) => handleBlur(dayIndex, liftIndex, "weight", e.target.value)}
                    required
                  />
                </td>
                {showLoggedColumn ? (
                  (() => {
                    const delta = weightDelta(
                      lift.loggedWeight,
                      lift.lastLoggedWeight?.value
                    );
                    return (
                      <td className="lift-table-logged">
                        {lift.loggedWeight ? (
                          <span className="lift-table-logged-row">
                            <strong>{lift.loggedWeight}</strong>
                            {delta ? (
                              <span className={`weight-delta is-${delta.sign}`}>
                                {delta.label}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="muted-copy compact-copy">—</span>
                        )}
                        {lift.lastLoggedWeight ? (
                          <div className="muted-copy compact-copy lift-table-last-logged">
                            Prior: {lift.lastLoggedWeight.value}
                          </div>
                        ) : null}
                      </td>
                    );
                  })()
                ) : null}
                <td className="lift-table-notes">
                  <input
                    type="text"
                    className="lift-table-input"
                    value={lift.notes}
                    onChange={(e) =>
                      onUpdateLiftField(dayIndex, liftIndex, "notes", e.target.value)
                    }
                    onBlur={(e) => handleBlur(dayIndex, liftIndex, "notes", e.target.value)}
                    placeholder="—"
                  />
                </td>
                {showActions ? (
                  <td className="lift-table-actions">
                    {onMoveLift ? (
                      <>
                        <button
                          type="button"
                          className="ghost-button icon-button"
                          onClick={() => onMoveLift(dayIndex, liftIndex, -1)}
                          disabled={liftIndex === 0}
                          aria-label="Move up"
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="ghost-button icon-button"
                          onClick={() => onMoveLift(dayIndex, liftIndex, 1)}
                          disabled={liftIndex >= liftsInDay - 1}
                          aria-label="Move down"
                          title="Move down"
                        >
                          ↓
                        </button>
                      </>
                    ) : null}
                    {onRemoveLift ? (
                      <button
                        type="button"
                        className="ghost-button icon-button"
                        onClick={() => onRemoveLift(dayIndex, liftIndex)}
                        disabled={liftsInDay === 1}
                        aria-label="Remove lift"
                        title="Remove"
                      >
                        ✕
                      </button>
                    ) : null}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
