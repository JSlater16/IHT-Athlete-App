import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../lib/api";
import ConfirmModal from "../../components/ConfirmModal";

const phaseOptions = ["Rehab", "Prep", "Eccentrics", "Iso", "Power", "Speed"];
const standardProgramVariant = "Standard";
const eccentricProgramVariants = ["Alactic Eccentrics", "Lactic Eccentrics"];
const workoutPlacementOptions = ["Prep", "Block 1", "Block 2", "Block 3", "Block 4"];
const customExerciseCategory = "Custom";

function countProgramLifts(program) {
  return (program.days || []).reduce((total, day) => total + (day.lifts || []).length, 0);
}

function createExerciseForm() {
  return {
    name: "",
    category: "",
    defaultSets: "3",
    defaultReps: "5",
    defaultWeight: "Bodyweight",
    defaultNotes: ""
  };
}

function createProgramLiftRow() {
  return {
    liftId: "",
    blockLabel: "Block 1",
    exerciseName: "",
    sets: "3",
    reps: "5",
    weight: "Bodyweight",
    notes: ""
  };
}

function createProgramDay(dayOffset = 0) {
  return { dayOffset, lifts: [createProgramLiftRow()] };
}

function createDaysForFrequency(frequency) {
  return Array.from({ length: Number(frequency) }, (_, index) => createProgramDay(index));
}

function createProgramForm() {
  return {
    name: "",
    phase: "Prep",
    variant: standardProgramVariant,
    frequency: 3,
    days: createDaysForFrequency(3)
  };
}

function programToForm(program) {
  // Convert a stored program to editable form state. We keep numeric
  // fields as strings here so the <input type="number"> components
  // behave correctly (no NaN from empty intermediate states).
  return {
    name: program.name || "",
    phase: program.phase || "Prep",
    variant: program.variant || standardProgramVariant,
    frequency: Number(program.frequency) || 3,
    days: (program.days || []).map((day) => ({
      dayOffset: Number(day.dayOffset) || 0,
      lifts: (day.lifts || []).map((lift) => ({
        liftId: lift.liftId || "",
        blockLabel: lift.blockLabel || "Block 1",
        exerciseName: lift.exerciseName || "",
        sets: String(lift.sets ?? "3"),
        reps: String(lift.reps ?? "5"),
        weight: lift.weight || "Bodyweight",
        notes: lift.notes || ""
      }))
    }))
  };
}

function getVariantOptions(phase) {
  return phase === "Eccentrics" ? eccentricProgramVariants : [standardProgramVariant];
}

function normalizeExerciseName(value) {
  return String(value || "").trim().toLowerCase();
}

export default function CoachWorkoutsPage() {
  const { token } = useAuth();
  const [library, setLibrary] = useState(null);
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [isExerciseModalOpen, setIsExerciseModalOpen] = useState(false);
  const [exerciseForm, setExerciseForm] = useState(createExerciseForm());
  const [exerciseError, setExerciseError] = useState("");
  const [exerciseSubmitting, setExerciseSubmitting] = useState(false);

  // Unified program modal state. mode: "create" | "edit"; programId is
  // set only in edit mode (for the PUT path).
  const [programModal, setProgramModal] = useState({ open: false, mode: "create", programId: null });
  const [programForm, setProgramForm] = useState(createProgramForm());
  const [programError, setProgramError] = useState("");
  const [programSubmitting, setProgramSubmitting] = useState(false);
  const [editorView, setEditorView] = useState("days"); // "days" | "blocks"

  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    loadLibrary(ctrl.signal);
    return () => ctrl.abort();
  }, [token]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function loadLibrary(signal) {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest("/api/program-library", { token, signal });
      setLibrary(data?.library || null);
      setSummary(data?.summary || null);
    } catch (loadError) {
      if (loadError.name === "AbortError") return;
      setError(loadError.message);
    } finally {
      if (!signal || !signal.aborted) setLoading(false);
    }
  }

  const liftNameById = useMemo(
    () => new Map((library?.liftLibrary || []).map((lift) => [lift.id, lift.name])),
    [library]
  );

  const liftByNormalizedName = useMemo(
    () => new Map((library?.liftLibrary || []).map((lift) => [normalizeExerciseName(lift.name), lift])),
    [library]
  );

  const filteredPrograms = useMemo(() => {
    const programs = library?.programs || [];
    const query = search.trim().toLowerCase();
    if (!query) return programs;
    return programs.filter((program) => {
      const dayText = (program.days || [])
        .flatMap((day) => day.lifts || [])
        .map((lift) => lift.exerciseName || liftNameById.get(lift.liftId) || lift.liftId)
        .join(" ")
        .toLowerCase();
      return [program.name, program.phase, program.variant, `${program.frequency} day`, dayText]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [library, liftNameById, search]);

  const groupedPrograms = useMemo(() => {
    const groups = new Map();
    for (const program of filteredPrograms) {
      if (!groups.has(program.phase)) groups.set(program.phase, []);
      groups.get(program.phase).push(program);
    }
    return Array.from(groups.entries()).map(([phase, programs]) => ({
      phase,
      programs: [...programs].sort((left, right) => {
        if (left.variant !== right.variant) {
          return String(left.variant || "").localeCompare(String(right.variant || ""));
        }
        return Number(left.frequency) - Number(right.frequency);
      })
    }));
  }, [filteredPrograms]);

  function closeExerciseModal() {
    setIsExerciseModalOpen(false);
    setExerciseForm(createExerciseForm());
    setExerciseError("");
  }

  function openProgramCreate() {
    setProgramForm(createProgramForm());
    setProgramError("");
    setEditorView("days");
    setProgramModal({ open: true, mode: "create", programId: null });
  }

  function openProgramEdit(program) {
    setProgramForm(programToForm(program));
    setProgramError("");
    setEditorView("days");
    setProgramModal({ open: true, mode: "edit", programId: program.id });
  }

  function closeProgramModal() {
    setProgramModal({ open: false, mode: "create", programId: null });
    setProgramForm(createProgramForm());
    setProgramError("");
  }

  async function handleCreateExercise(event) {
    event.preventDefault();
    setExerciseError("");

    if (!exerciseForm.name.trim()) return setExerciseError("Exercise name is required.");
    if (!exerciseForm.category.trim()) return setExerciseError("Category is required.");
    if (Number(exerciseForm.defaultSets) < 1 || Number(exerciseForm.defaultReps) < 1) {
      return setExerciseError("Sets and reps must be at least 1.");
    }
    if (!exerciseForm.defaultWeight.trim()) return setExerciseError("Default weight is required.");

    setExerciseSubmitting(true);
    try {
      const data = await apiRequest("/api/program-library/lifts", {
        method: "POST",
        token,
        body: {
          name: exerciseForm.name.trim(),
          category: exerciseForm.category.trim(),
          defaultSets: Number(exerciseForm.defaultSets),
          defaultReps: Number(exerciseForm.defaultReps),
          defaultWeight: exerciseForm.defaultWeight.trim(),
          defaultNotes: exerciseForm.defaultNotes.trim()
        }
      });
      if (!data?.library) throw new Error("Unexpected response from server.");
      setLibrary(data.library);
      setSummary(data.summary);
      closeExerciseModal();
      setToast("Exercise created.");
    } catch (submitError) {
      setExerciseError(submitError.message);
    } finally {
      setExerciseSubmitting(false);
    }
  }

  function updateProgramDay(dayIndex, updater) {
    setProgramForm((current) => ({
      ...current,
      days: current.days.map((day, index) => (index === dayIndex ? updater(day) : day))
    }));
  }

  function handleFrequencyChange(value) {
    const nextFrequency = Number(value);
    setProgramForm((current) => {
      const nextDays = createDaysForFrequency(nextFrequency).map((defaultDay, index) => {
        const existingDay = current.days[index];
        return existingDay
          ? {
              ...existingDay,
              dayOffset: Number.isFinite(Number(existingDay.dayOffset))
                ? Number(existingDay.dayOffset)
                : index
            }
          : defaultDay;
      });
      return { ...current, frequency: nextFrequency, days: nextDays };
    });
  }

  function handleProgramPhaseChange(value) {
    setProgramForm((current) => ({
      ...current,
      phase: value,
      variant: value === "Eccentrics" ? eccentricProgramVariants[0] : standardProgramVariant
    }));
  }

  function addProgramLift(dayIndex) {
    updateProgramDay(dayIndex, (day) => ({ ...day, lifts: [...day.lifts, createProgramLiftRow()] }));
  }

  function removeProgramLift(dayIndex, liftIndex) {
    updateProgramDay(dayIndex, (day) => ({
      ...day,
      lifts: day.lifts.filter((_, index) => index !== liftIndex)
    }));
  }

  function moveProgramLift(dayIndex, liftIndex, direction) {
    updateProgramDay(dayIndex, (day) => {
      const target = liftIndex + direction;
      if (target < 0 || target >= day.lifts.length) return day;
      const nextLifts = day.lifts.slice();
      [nextLifts[liftIndex], nextLifts[target]] = [nextLifts[target], nextLifts[liftIndex]];
      return { ...day, lifts: nextLifts };
    });
  }

  function updateProgramLiftField(dayIndex, liftIndex, field, value) {
    updateProgramDay(dayIndex, (day) => ({
      ...day,
      lifts: day.lifts.map((lift, index) => {
        if (index !== liftIndex) return lift;

        if (field === "exerciseName") {
          const matched = liftByNormalizedName.get(normalizeExerciseName(value));
          return {
            ...lift,
            exerciseName: value,
            liftId: matched?.id || ""
          };
        }

        return { ...lift, [field]: value };
      })
    }));
  }

  function buildProgramBody() {
    return {
      name: programForm.name.trim(),
      phase: programForm.phase,
      variant: programForm.variant,
      frequency: Number(programForm.frequency),
      days: programForm.days.map((day) => ({
        dayOffset: Number(day.dayOffset),
        lifts: day.lifts.map((lift) => {
          const trimmedName = lift.exerciseName.trim();
          const matched = liftByNormalizedName.get(normalizeExerciseName(trimmedName));
          const liftId = matched?.id || lift.liftId || "";
          const entry = {
            liftId,
            blockLabel: lift.blockLabel,
            exerciseName: trimmedName,
            sets: Number(lift.sets),
            reps: Number(lift.reps),
            weight: lift.weight.trim(),
            notes: lift.notes.trim()
          };
          // No match in library → ask the server to create the lift
          // atomically as part of this save.
          if (!liftId) {
            entry.newLift = {
              name: trimmedName,
              category: customExerciseCategory,
              defaultSets: Number(lift.sets),
              defaultReps: Number(lift.reps),
              defaultWeight: lift.weight.trim(),
              defaultNotes: lift.notes.trim()
            };
          }
          return entry;
        })
      }))
    };
  }

  function validateProgramForm() {
    if (!programForm.name.trim()) return "Program name is required.";
    for (let dayIndex = 0; dayIndex < programForm.days.length; dayIndex += 1) {
      const day = programForm.days[dayIndex];
      if (!day.lifts.length) return `Day ${dayIndex + 1} needs at least one exercise.`;
      for (let liftIndex = 0; liftIndex < day.lifts.length; liftIndex += 1) {
        const lift = day.lifts[liftIndex];
        if (!lift.exerciseName.trim()) {
          return `Enter an exercise for Day ${dayIndex + 1}, lift ${liftIndex + 1}.`;
        }
        if (Number(lift.sets) < 1 || Number(lift.reps) < 1) {
          return `Day ${dayIndex + 1}, lift ${liftIndex + 1} needs valid sets and reps.`;
        }
        if (!lift.weight.trim()) {
          return `Day ${dayIndex + 1}, lift ${liftIndex + 1} needs a weight value.`;
        }
      }
    }
    return null;
  }

  async function handleSaveProgram(event) {
    event.preventDefault();
    setProgramError("");

    const validationError = validateProgramForm();
    if (validationError) {
      setProgramError(validationError);
      return;
    }

    setProgramSubmitting(true);
    try {
      const body = buildProgramBody();
      const isEdit = programModal.mode === "edit";
      const data = await apiRequest(
        isEdit
          ? `/api/program-library/programs/${programModal.programId}`
          : "/api/program-library/programs",
        { method: isEdit ? "PUT" : "POST", token, body }
      );
      if (!data?.library) throw new Error("Unexpected response from server.");
      setLibrary(data.library);
      setSummary(data.summary);
      closeProgramModal();
      setToast(isEdit ? "Program updated." : "Program created.");
    } catch (submitError) {
      setProgramError(submitError.message);
    } finally {
      setProgramSubmitting(false);
    }
  }

  function requestDelete(program) {
    setPendingDelete({ id: program.id, name: program.name });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const data = await apiRequest(`/api/program-library/programs/${pendingDelete.id}`, {
        method: "DELETE",
        token
      });
      if (data?.library) {
        setLibrary(data.library);
        setSummary(data.summary);
      } else {
        // Server returned 204 or empty — reload as a fallback.
        await loadLibrary();
      }
      setPendingDelete(null);
      setToast("Program deleted.");
    } catch (delError) {
      setError(delError.message);
    } finally {
      setDeleting(false);
    }
  }

  const modalTitle = programModal.mode === "edit" ? "Edit program" : "Create program";
  const modalSubmitLabel = programModal.mode === "edit" ? "Save program" : "Create program";
  const modalSavingLabel = programModal.mode === "edit" ? "Saving..." : "Creating...";

  return (
    <div className="coach-page-stack">
      {toast ? <div className="dashboard-toast is-success">{toast}</div> : null}

      <section className="coach-page-header">
        <div>
          <p className="eyebrow">Workouts</p>
          <h2>Program library</h2>
          <p className="muted-copy">Browse, edit, and build training programs by phase and frequency.</p>
        </div>

        <div className="header-action-row">
          <button className="ghost-button" type="button" onClick={() => setIsExerciseModalOpen(true)}>
            New exercise
          </button>
          <button className="primary-button" type="button" onClick={openProgramCreate}>
            New program
          </button>
        </div>
      </section>

      <section className="dashboard-card">
        <div className="toolbar">
          <input
            className="search-input"
            type="search"
            placeholder="Search by phase, variant, frequency, or lift"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {summary ? (
          <div className="program-summary-grid">
            <span className="metric-chip">{summary.programCount} programs</span>
            <span className="metric-chip">{summary.liftCount} library lifts</span>
            <span className="metric-chip">{summary.phases.join(", ")}</span>
            <span className="metric-chip">Frequencies: {summary.frequencies.join(", ")}</span>
          </div>
        ) : null}

        {loading ? <p className="empty-state">Loading workouts...</p> : null}
        {error ? <p className="form-error">{error}</p> : null}

        {!loading && !error && groupedPrograms.length === 0 ? (
          <p className="empty-state">No programs match that search.</p>
        ) : null}

        {!loading && !error ? (
          <div className="workout-library-stack">
            {groupedPrograms.map((group) => (
              <section key={group.phase} className="lift-block-group">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Phase</p>
                    <h3>{group.phase}</h3>
                  </div>
                  <span className="phase-badge">{group.programs.length} templates</span>
                </div>

                <div className="coach-library-grid">
                  {group.programs.map((program) => (
                    <article key={program.id} className="coach-library-card">
                      <header className="coach-workout-summary">
                        <div>
                          <h3>{program.name}</h3>
                          <p className="muted-copy compact-copy">
                            {program.variant || "Standard"} • {program.frequency} days per week
                          </p>
                        </div>
                        <div className="coach-workout-summary-meta">
                          <span className="status-badge">{countProgramLifts(program)} lifts</span>
                        </div>
                      </header>

                      <details className="coach-workout-details">
                        <summary className="inline-link-button">View days</summary>
                        <div className="library-day-stack">
                          {(program.days || []).map((day, index) => (
                            <div key={`${program.id}-${day.dayOffset}-${index}`} className="library-day-card">
                              <div className="section-heading">
                                <strong>Day {index + 1}</strong>
                                <span className="muted-copy">Offset {day.dayOffset}</span>
                              </div>
                              <ul className="library-lift-list">
                                {(day.lifts || []).map((lift, liftIndex) => (
                                  <li key={`${program.id}-${day.dayOffset}-${lift.liftId}-${liftIndex}`}>
                                    {lift.exerciseName || liftNameById.get(lift.liftId) || lift.liftId}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </details>

                      <div className="card-actions">
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => requestDelete(program)}
                        >
                          Delete
                        </button>
                        <button
                          className="primary-button"
                          type="button"
                          onClick={() => openProgramEdit(program)}
                        >
                          Edit
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : null}
      </section>

      {isExerciseModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeExerciseModal}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Workout Library</p>
                <h2>Create exercise</h2>
              </div>
              <button className="ghost-button" type="button" onClick={closeExerciseModal}>
                Close
              </button>
            </div>

            <form className="form-grid" onSubmit={handleCreateExercise}>
              <label className="field">
                <span>Exercise name</span>
                <input
                  type="text"
                  value={exerciseForm.name}
                  onChange={(event) => setExerciseForm((current) => ({ ...current, name: event.target.value }))}
                  required
                />
              </label>

              <label className="field">
                <span>Category</span>
                <input
                  type="text"
                  value={exerciseForm.category}
                  onChange={(event) =>
                    setExerciseForm((current) => ({ ...current, category: event.target.value }))
                  }
                  required
                />
              </label>

              <div className="inline-fields three-up">
                <label className="field">
                  <span>Default sets</span>
                  <input
                    type="number"
                    min="1"
                    value={exerciseForm.defaultSets}
                    onChange={(event) =>
                      setExerciseForm((current) => ({ ...current, defaultSets: event.target.value }))
                    }
                    required
                  />
                </label>

                <label className="field">
                  <span>Default reps</span>
                  <input
                    type="number"
                    min="1"
                    value={exerciseForm.defaultReps}
                    onChange={(event) =>
                      setExerciseForm((current) => ({ ...current, defaultReps: event.target.value }))
                    }
                    required
                  />
                </label>

                <label className="field">
                  <span>Default weight</span>
                  <input
                    type="text"
                    value={exerciseForm.defaultWeight}
                    onChange={(event) =>
                      setExerciseForm((current) => ({ ...current, defaultWeight: event.target.value }))
                    }
                    required
                  />
                </label>
              </div>

              <label className="field">
                <span>Default notes</span>
                <textarea
                  rows="4"
                  value={exerciseForm.defaultNotes}
                  onChange={(event) =>
                    setExerciseForm((current) => ({ ...current, defaultNotes: event.target.value }))
                  }
                />
              </label>

              {exerciseError ? <p className="form-error">{exerciseError}</p> : null}

              <div className="modal-actions">
                <button className="ghost-button" type="button" onClick={closeExerciseModal}>
                  Cancel
                </button>
                <button className="primary-button" type="submit" disabled={exerciseSubmitting}>
                  {exerciseSubmitting ? "Creating..." : "Create exercise"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {programModal.open ? (
        <div className="modal-backdrop" role="presentation" onClick={closeProgramModal}>
          <div
            className="modal-card modal-card-wide"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">Workout Library</p>
                <h2>{modalTitle}</h2>
              </div>
              <button className="ghost-button" type="button" onClick={closeProgramModal}>
                Close
              </button>
            </div>

            <form className="form-grid" onSubmit={handleSaveProgram}>
              <label className="field">
                <span>Program name</span>
                <input
                  type="text"
                  value={programForm.name}
                  onChange={(event) => setProgramForm((current) => ({ ...current, name: event.target.value }))}
                  required
                />
              </label>

              <div className="inline-fields three-up">
                <label className="field">
                  <span>Phase</span>
                  <select
                    value={programForm.phase}
                    onChange={(event) => handleProgramPhaseChange(event.target.value)}
                  >
                    {phaseOptions.map((phase) => (
                      <option key={phase} value={phase}>{phase}</option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Program type</span>
                  <select
                    value={programForm.variant}
                    onChange={(event) =>
                      setProgramForm((current) => ({ ...current, variant: event.target.value }))
                    }
                    disabled={programForm.phase !== "Eccentrics"}
                  >
                    {getVariantOptions(programForm.phase).map((variant) => (
                      <option key={variant} value={variant}>{variant}</option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Frequency</span>
                  <select
                    value={programForm.frequency}
                    onChange={(event) => handleFrequencyChange(event.target.value)}
                  >
                    <option value={3}>3 days</option>
                    <option value={4}>4 days</option>
                    <option value={5}>5 days</option>
                  </select>
                </label>
              </div>

              <ProgramEditorBody
                programForm={programForm}
                editorView={editorView}
                setEditorView={setEditorView}
                library={library}
                liftByNormalizedName={liftByNormalizedName}
                updateProgramDay={updateProgramDay}
                updateProgramLiftField={updateProgramLiftField}
                addProgramLift={addProgramLift}
                removeProgramLift={removeProgramLift}
                moveProgramLift={moveProgramLift}
              />

              {programError ? <p className="form-error">{programError}</p> : null}

              <div className="modal-actions">
                <button className="ghost-button" type="button" onClick={closeProgramModal}>
                  Cancel
                </button>
                <button className="primary-button" type="submit" disabled={programSubmitting}>
                  {programSubmitting ? modalSavingLabel : modalSubmitLabel}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Delete program"
        message={
          pendingDelete
            ? `Delete "${pendingDelete.name}"? This removes it from the library — it won't change athletes whose week has already been applied.`
            : ""
        }
        confirmLabel={deleting ? "Deleting..." : "Delete"}
        cancelLabel="Cancel"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

// Wraps the day/block toggle and renders whichever view is active.
// Lift cards are shared via LiftEditorCard so adding new fields only
// happens in one place.
function ProgramEditorBody({
  programForm,
  editorView,
  setEditorView,
  library,
  liftByNormalizedName,
  updateProgramDay,
  updateProgramLiftField,
  addProgramLift,
  removeProgramLift,
  moveProgramLift
}) {
  return (
    <div className="program-builder-stack">
      <div className="program-builder-view-toggle" role="tablist" aria-label="Program editor view">
        <button
          type="button"
          role="tab"
          aria-selected={editorView === "days"}
          className={`tab-toggle ${editorView === "days" ? "is-active" : ""}`}
          onClick={() => setEditorView("days")}
        >
          By day
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={editorView === "blocks"}
          className={`tab-toggle ${editorView === "blocks" ? "is-active" : ""}`}
          onClick={() => setEditorView("blocks")}
        >
          By block
        </button>
      </div>

      {editorView === "days" ? (
        <DaysView
          programForm={programForm}
          library={library}
          liftByNormalizedName={liftByNormalizedName}
          updateProgramDay={updateProgramDay}
          updateProgramLiftField={updateProgramLiftField}
          addProgramLift={addProgramLift}
          removeProgramLift={removeProgramLift}
          moveProgramLift={moveProgramLift}
        />
      ) : (
        <BlocksView
          programForm={programForm}
          library={library}
          liftByNormalizedName={liftByNormalizedName}
          updateProgramLiftField={updateProgramLiftField}
          removeProgramLift={removeProgramLift}
          moveProgramLift={moveProgramLift}
        />
      )}
    </div>
  );
}

function DaysView({
  programForm,
  library,
  liftByNormalizedName,
  updateProgramDay,
  updateProgramLiftField,
  addProgramLift,
  removeProgramLift,
  moveProgramLift
}) {
  return (
    <>
      {programForm.days.map((day, dayIndex) => (
        <section key={`program-day-${dayIndex}`} className="program-builder-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Program Day</p>
              <h3>Day {dayIndex + 1}</h3>
            </div>
            <label className="field compact-field">
              <span>Week position</span>
              <select
                value={day.dayOffset}
                onChange={(event) =>
                  updateProgramDay(dayIndex, (currentDay) => ({
                    ...currentDay,
                    dayOffset: Number(event.target.value)
                  }))
                }
              >
                {Array.from({ length: 7 }, (_, index) => (
                  <option key={index} value={index}>Day {index + 1}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="program-builder-lift-stack">
            {day.lifts.map((lift, liftIndex) => (
              <LiftEditorCard
                key={`day-${dayIndex}-lift-${liftIndex}`}
                lift={lift}
                dayIndex={dayIndex}
                liftIndex={liftIndex}
                liftsInDay={day.lifts.length}
                library={library}
                liftByNormalizedName={liftByNormalizedName}
                updateProgramLiftField={updateProgramLiftField}
                removeProgramLift={removeProgramLift}
                moveProgramLift={moveProgramLift}
              />
            ))}
          </div>

          <button className="ghost-button" type="button" onClick={() => addProgramLift(dayIndex)}>
            Add exercise to day
          </button>
        </section>
      ))}
    </>
  );
}

function BlocksView({
  programForm,
  library,
  liftByNormalizedName,
  updateProgramLiftField,
  removeProgramLift,
  moveProgramLift
}) {
  // Group all lifts (across all days) by blockLabel. Each entry keeps
  // its dayIndex/liftIndex so edit handlers still target the right
  // slot in the underlying days-array model.
  const blocks = new Map();
  for (const placement of workoutPlacementOptions) {
    blocks.set(placement, []);
  }
  programForm.days.forEach((day, dayIndex) => {
    day.lifts.forEach((lift, liftIndex) => {
      const label = workoutPlacementOptions.includes(lift.blockLabel) ? lift.blockLabel : "Block 1";
      blocks.get(label).push({ dayIndex, liftIndex, lift, liftsInDay: day.lifts.length });
    });
  });
  const populatedBlocks = Array.from(blocks.entries()).filter(([, entries]) => entries.length > 0);

  if (populatedBlocks.length === 0) {
    return <p className="empty-state">No lifts yet. Switch to By day to start adding exercises.</p>;
  }

  return (
    <>
      {populatedBlocks.map(([blockLabel, entries]) => (
        <section key={`block-${blockLabel}`} className="program-builder-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Block</p>
              <h3>{blockLabel}</h3>
            </div>
            <span className="muted-copy compact-copy">
              {entries.length} exercise{entries.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="program-builder-lift-stack">
            {entries.map(({ dayIndex, liftIndex, lift, liftsInDay }) => (
              <LiftEditorCard
                key={`block-${blockLabel}-${dayIndex}-${liftIndex}`}
                lift={lift}
                dayIndex={dayIndex}
                liftIndex={liftIndex}
                liftsInDay={liftsInDay}
                library={library}
                liftByNormalizedName={liftByNormalizedName}
                updateProgramLiftField={updateProgramLiftField}
                removeProgramLift={removeProgramLift}
                moveProgramLift={moveProgramLift}
                dayLabel={`Day ${dayIndex + 1}`}
              />
            ))}
          </div>
        </section>
      ))}
      <p className="muted-copy compact-copy">
        Switch to By day to add new exercises. Reordering and editing work the same in both views.
      </p>
    </>
  );
}

function LiftEditorCard({
  lift,
  dayIndex,
  liftIndex,
  liftsInDay,
  library,
  liftByNormalizedName,
  updateProgramLiftField,
  removeProgramLift,
  moveProgramLift,
  dayLabel
}) {
  const matchedLibrary = liftByNormalizedName.get(normalizeExerciseName(lift.exerciseName));
  const willCreate = lift.exerciseName.trim() && !matchedLibrary;
  const canMoveUp = liftIndex > 0;
  const canMoveDown = liftIndex < liftsInDay - 1;

  return (
    <article className="program-builder-lift-card">
      {dayLabel ? (
        <div className="program-builder-lift-daytag">
          <span className="status-badge">{dayLabel}</span>
        </div>
      ) : null}

      <div className="lift-editor-grid">
        <label className="field">
          <span>Exercise</span>
          <input
            list={`program-lifts-${dayIndex}-${liftIndex}`}
            value={lift.exerciseName}
            onChange={(event) =>
              updateProgramLiftField(dayIndex, liftIndex, "exerciseName", event.target.value)
            }
            placeholder="Type or select exercise"
            required
          />
          <datalist id={`program-lifts-${dayIndex}-${liftIndex}`}>
            {(library?.liftLibrary || []).map((libraryLift) => (
              <option key={libraryLift.id} value={libraryLift.name} />
            ))}
          </datalist>
          {willCreate ? (
            <span className="muted-copy compact-copy program-builder-newlift-hint">
              New library exercise will be created on save.
            </span>
          ) : null}
        </label>

        <label className="field">
          <span>Where in workout</span>
          <select
            value={lift.blockLabel}
            onChange={(event) =>
              updateProgramLiftField(dayIndex, liftIndex, "blockLabel", event.target.value)
            }
          >
            {workoutPlacementOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Sets</span>
          <input
            type="number"
            min="1"
            value={lift.sets}
            onChange={(event) => updateProgramLiftField(dayIndex, liftIndex, "sets", event.target.value)}
            required
          />
        </label>

        <label className="field">
          <span>Reps</span>
          <input
            type="number"
            min="1"
            value={lift.reps}
            onChange={(event) => updateProgramLiftField(dayIndex, liftIndex, "reps", event.target.value)}
            required
          />
        </label>

        <label className="field">
          <span>Weight</span>
          <input
            type="text"
            value={lift.weight}
            onChange={(event) => updateProgramLiftField(dayIndex, liftIndex, "weight", event.target.value)}
            required
          />
        </label>

        <label className="field field-full">
          <span>Notes</span>
          <textarea
            rows="3"
            value={lift.notes}
            onChange={(event) => updateProgramLiftField(dayIndex, liftIndex, "notes", event.target.value)}
          />
        </label>
      </div>

      <div className="card-actions program-builder-lift-actions">
        <div className="program-builder-lift-order">
          <button
            type="button"
            className="ghost-button icon-button"
            onClick={() => moveProgramLift(dayIndex, liftIndex, -1)}
            disabled={!canMoveUp}
            aria-label="Move exercise up"
            title="Move up"
          >
            ↑
          </button>
          <button
            type="button"
            className="ghost-button icon-button"
            onClick={() => moveProgramLift(dayIndex, liftIndex, 1)}
            disabled={!canMoveDown}
            aria-label="Move exercise down"
            title="Move down"
          >
            ↓
          </button>
        </div>
        <button
          className="ghost-button"
          type="button"
          onClick={() => removeProgramLift(dayIndex, liftIndex)}
          disabled={liftsInDay === 1}
        >
          Remove exercise
        </button>
      </div>
    </article>
  );
}
