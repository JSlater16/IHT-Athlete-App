import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../lib/api";

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
  return {
    dayOffset,
    lifts: [createProgramLiftRow()]
  };
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
  const [isProgramModalOpen, setIsProgramModalOpen] = useState(false);
  const [exerciseForm, setExerciseForm] = useState(createExerciseForm());
  const [exerciseError, setExerciseError] = useState("");
  const [exerciseSubmitting, setExerciseSubmitting] = useState(false);
  const [programForm, setProgramForm] = useState(createProgramForm());
  const [programError, setProgramError] = useState("");
  const [programSubmitting, setProgramSubmitting] = useState(false);

  useEffect(() => {
    loadLibrary();
  }, [token]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function loadLibrary() {
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest("/api/program-library", { token });
      setLibrary(data.library);
      setSummary(data.summary);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  const liftNameById = useMemo(() => {
    return new Map((library?.liftLibrary || []).map((lift) => [lift.id, lift.name]));
  }, [library]);

  const liftByNormalizedName = useMemo(() => {
    return new Map(
      (library?.liftLibrary || []).map((lift) => [normalizeExerciseName(lift.name), lift])
    );
  }, [library]);

  const filteredPrograms = useMemo(() => {
    const programs = library?.programs || [];
    const query = search.trim().toLowerCase();

    if (!query) {
      return programs;
    }

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
      if (!groups.has(program.phase)) {
        groups.set(program.phase, []);
      }

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
    setExerciseSubmitting(false);
  }

  function closeProgramModal() {
    setIsProgramModalOpen(false);
    setProgramForm(createProgramForm());
    setProgramError("");
    setProgramSubmitting(false);
  }

  async function handleCreateExercise(event) {
    event.preventDefault();
    setExerciseError("");

    if (!exerciseForm.name.trim()) {
      setExerciseError("Exercise name is required.");
      return;
    }

    if (!exerciseForm.category.trim()) {
      setExerciseError("Category is required.");
      return;
    }

    if (Number(exerciseForm.defaultSets) < 1 || Number(exerciseForm.defaultReps) < 1) {
      setExerciseError("Sets and reps must be at least 1.");
      return;
    }

    if (!exerciseForm.defaultWeight.trim()) {
      setExerciseError("Default weight is required.");
      return;
    }

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

      setLibrary(data.library);
      setSummary(data.summary);
      closeExerciseModal();
      setToast("Exercise created.");
    } catch (submitError) {
      setExerciseError(submitError.message);
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
              dayOffset: Number.isFinite(Number(existingDay.dayOffset)) ? Number(existingDay.dayOffset) : index
            }
          : defaultDay;
      });

      return {
        ...current,
        frequency: nextFrequency,
        days: nextDays
      };
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
    updateProgramDay(dayIndex, (day) => ({
      ...day,
      lifts: [...day.lifts, createProgramLiftRow()]
    }));
  }

  function removeProgramLift(dayIndex, liftIndex) {
    updateProgramDay(dayIndex, (day) => ({
      ...day,
      lifts: day.lifts.filter((_, index) => index !== liftIndex)
    }));
  }

  function updateProgramLiftField(dayIndex, liftIndex, field, value) {
    updateProgramDay(dayIndex, (day) => ({
      ...day,
      lifts: day.lifts.map((lift, index) => {
        if (index !== liftIndex) {
          return lift;
        }

        if (field === "exerciseName") {
          const matchedLift = liftByNormalizedName.get(normalizeExerciseName(value));
          return {
            ...lift,
            exerciseName: value,
            liftId: matchedLift?.id || ""
          };
        }

        if (field === "liftId") {
          const matchedLift = (library?.liftLibrary || []).find((libraryLift) => libraryLift.id === value);
          return {
            ...lift,
            liftId: value,
            exerciseName: matchedLift?.name || lift.exerciseName
          };
        }

        return { ...lift, [field]: value };
      })
    }));
  }

  async function createLibraryExerciseFromLift(lift) {
    const data = await apiRequest("/api/program-library/lifts", {
      method: "POST",
      token,
      body: {
        name: lift.exerciseName.trim(),
        category: customExerciseCategory,
        defaultSets: Number(lift.sets),
        defaultReps: Number(lift.reps),
        defaultWeight: lift.weight.trim(),
        defaultNotes: lift.notes.trim()
      }
    });

    setLibrary(data.library);
    setSummary(data.summary);
    return data.lift;
  }

  async function handleCreateProgram(event) {
    event.preventDefault();
    setProgramError("");

    if (!programForm.name.trim()) {
      setProgramError("Program name is required.");
      return;
    }

    if ((library?.liftLibrary || []).length === 0) {
      setProgramError("Create at least one exercise before creating a program.");
      return;
    }

    for (let dayIndex = 0; dayIndex < programForm.days.length; dayIndex += 1) {
      const day = programForm.days[dayIndex];

      if (!day.lifts.length) {
        setProgramError(`Day ${dayIndex + 1} needs at least one exercise.`);
        return;
      }

      for (let liftIndex = 0; liftIndex < day.lifts.length; liftIndex += 1) {
        const lift = day.lifts[liftIndex];

        if (!lift.exerciseName.trim()) {
          setProgramError(`Enter an exercise for Day ${dayIndex + 1}, lift ${liftIndex + 1}.`);
          return;
        }

        if (Number(lift.sets) < 1 || Number(lift.reps) < 1) {
          setProgramError(`Day ${dayIndex + 1}, lift ${liftIndex + 1} needs valid sets and reps.`);
          return;
        }

        if (!lift.weight.trim()) {
          setProgramError(`Day ${dayIndex + 1}, lift ${liftIndex + 1} needs a weight value.`);
          return;
        }
      }
    }

    setProgramSubmitting(true);

    try {
      const createdLiftCache = new Map();
      const daysWithResolvedLiftIds = [];

      for (const day of programForm.days) {
        const resolvedLifts = [];

        for (const lift of day.lifts) {
          const normalizedName = normalizeExerciseName(lift.exerciseName);
          let resolvedLiftId = lift.liftId;

          if (!resolvedLiftId) {
            const matchedLift = liftByNormalizedName.get(normalizedName);
            if (matchedLift) {
              resolvedLiftId = matchedLift.id;
            } else if (createdLiftCache.has(normalizedName)) {
              resolvedLiftId = createdLiftCache.get(normalizedName).id;
            } else {
              const createdLift = await createLibraryExerciseFromLift(lift);
              createdLiftCache.set(normalizedName, createdLift);
              resolvedLiftId = createdLift.id;
            }
          }

          resolvedLifts.push({
            liftId: resolvedLiftId,
            blockLabel: lift.blockLabel,
            exerciseName: lift.exerciseName.trim(),
            sets: Number(lift.sets),
            reps: Number(lift.reps),
            weight: lift.weight.trim(),
            notes: lift.notes.trim()
          });
        }

        daysWithResolvedLiftIds.push({
          dayOffset: Number(day.dayOffset),
          lifts: resolvedLifts
        });
      }

      const data = await apiRequest("/api/program-library/programs", {
        method: "POST",
        token,
        body: {
          name: programForm.name.trim(),
          phase: programForm.phase,
          variant: programForm.variant,
          frequency: Number(programForm.frequency),
          days: daysWithResolvedLiftIds
        }
      });

      setLibrary(data.library);
      setSummary(data.summary);
      closeProgramModal();
      setToast("Program created.");
    } catch (submitError) {
      setProgramError(submitError.message);
      setProgramSubmitting(false);
    }
  }

  return (
    <div className="coach-page-stack">
      {toast ? <div className="dashboard-toast is-success">{toast}</div> : null}

      <section className="coach-page-header">
        <div>
          <p className="eyebrow">Workouts</p>
          <h2>Program library</h2>
          <p className="muted-copy">Browse every imported template by phase, variant, and frequency.</p>
        </div>

        <div className="header-action-row">
          <button className="ghost-button" type="button" onClick={() => setIsExerciseModalOpen(true)}>
            Create exercise
          </button>
          <button className="primary-button" type="button" onClick={() => setIsProgramModalOpen(true)}>
            Create program
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
                    <details key={program.id} className="coach-library-card coach-workout-details">
                      <summary className="coach-workout-summary">
                        <div>
                          <h3>{program.name}</h3>
                          <p className="muted-copy compact-copy">
                            {program.variant || "Standard"} • {program.frequency} days per week
                          </p>
                        </div>
                        <div className="coach-workout-summary-meta">
                          <span className="status-badge">{countProgramLifts(program)} lifts</span>
                          <span className="inline-link-button">View workout</span>
                        </div>
                      </summary>

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

      {isProgramModalOpen ? (
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
                <h2>Create program</h2>
              </div>
              <button className="ghost-button" type="button" onClick={closeProgramModal}>
                Close
              </button>
            </div>

            <form className="form-grid" onSubmit={handleCreateProgram}>
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
                  <select value={programForm.phase} onChange={(event) => handleProgramPhaseChange(event.target.value)}>
                    {phaseOptions.map((phase) => (
                      <option key={phase} value={phase}>
                        {phase}
                      </option>
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
                      <option key={variant} value={variant}>
                        {variant}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Frequency</span>
                  <select value={programForm.frequency} onChange={(event) => handleFrequencyChange(event.target.value)}>
                    <option value={3}>3 days</option>
                    <option value={4}>4 days</option>
                    <option value={5}>5 days</option>
                  </select>
                </label>
              </div>

              <div className="program-builder-stack">
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
                            <option key={index} value={index}>
                              Day {index + 1}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="program-builder-lift-stack">
                      {day.lifts.map((lift, liftIndex) => (
                        <article key={`day-${dayIndex}-lift-${liftIndex}`} className="program-builder-lift-card">
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
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="field">
                              <span>Sets</span>
                              <input
                                type="number"
                                min="1"
                                value={lift.sets}
                                onChange={(event) =>
                                  updateProgramLiftField(dayIndex, liftIndex, "sets", event.target.value)
                                }
                                required
                              />
                            </label>

                            <label className="field">
                              <span>Reps</span>
                              <input
                                type="number"
                                min="1"
                                value={lift.reps}
                                onChange={(event) =>
                                  updateProgramLiftField(dayIndex, liftIndex, "reps", event.target.value)
                                }
                                required
                              />
                            </label>

                            <label className="field">
                              <span>Weight</span>
                              <input
                                type="text"
                                value={lift.weight}
                                onChange={(event) =>
                                  updateProgramLiftField(dayIndex, liftIndex, "weight", event.target.value)
                                }
                                required
                              />
                            </label>

                            <label className="field field-full">
                              <span>Notes</span>
                              <textarea
                                rows="3"
                                value={lift.notes}
                                onChange={(event) =>
                                  updateProgramLiftField(dayIndex, liftIndex, "notes", event.target.value)
                                }
                              />
                            </label>
                          </div>

                          <div className="card-actions">
                            <button
                              className="ghost-button"
                              type="button"
                              onClick={() => removeProgramLift(dayIndex, liftIndex)}
                              disabled={day.lifts.length === 1}
                            >
                              Remove exercise
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>

                    <button className="ghost-button" type="button" onClick={() => addProgramLift(dayIndex)}>
                      Add exercise to day
                    </button>
                  </section>
                ))}
              </div>

              {programError ? <p className="form-error">{programError}</p> : null}

              <div className="modal-actions">
                <button className="ghost-button" type="button" onClick={closeProgramModal}>
                  Cancel
                </button>
                <button className="primary-button" type="submit" disabled={programSubmitting}>
                  {programSubmitting ? "Creating..." : "Create program"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
