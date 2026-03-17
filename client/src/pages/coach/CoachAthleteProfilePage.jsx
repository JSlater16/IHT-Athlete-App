import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { amitMuscles } from "../../data/amitMuscles";
import { apiRequest } from "../../lib/api";
import {
  buildWeekDays,
  formatCalendarDate,
  formatDateTime,
  formatDayShort,
  formatLongDate,
  formatMonthDay,
  formatWeekRange,
  groupLiftsByDate,
  sameDay,
  startOfWeek,
  toDateInputValue
} from "../../utils/date";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "program", label: "Weekly Program" },
  { id: "rehab", label: "Rehab" }
];

const phaseOptions = ["Rehab", "Prep", "Eccentrics", "Iso", "Power", "Speed"];
const fallbackModelOptions = ["10-Week", "20-Week"];
const standardProgramVariant = "Standard";
const eccentricProgramVariants = ["Alactic Eccentrics", "Lactic Eccentrics"];
const orderedTrainingPhases = ["Prep", "Eccentrics", "Iso", "Power", "Speed"];
const maxMuscleSuggestions = 8;
const maxPadPlacementImages = 8;

function createInhibitedMuscle() {
  return {
    id: `muscle-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    pain: false,
    painScale: "",
    primary: false,
    left: false,
    right: false
  };
}

function createPadPlacementImage(imageData = "") {
  return {
    id: `pad-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    imageData,
    side: "Left",
    result: "Positive"
  };
}

function normalizeRehabProfileForm(profile) {
  return {
    inhibitedMuscles: (profile?.inhibitedMuscles || []).map((muscle) => ({
      ...muscle,
      painScale: muscle.pain ? String(muscle.painScale ?? "") : ""
    })),
    padPlacementImages: (profile?.padPlacementImages || []).slice(0, maxPadPlacementImages).map((image) => ({
      ...image,
      side: image.side === "Right" ? "Right" : "Left",
      result: image.result === "Negative" ? "Negative" : "Positive"
    }))
  };
}

function getWeeksPerPhase(model) {
  if (model === "10-Week") {
    return 2;
  }

  if (model === "20-Week") {
    return 4;
  }

  return null;
}

function getMuscleSuggestions(query) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return [];
  }

  const startsWithMatches = [];
  const includesMatches = [];

  for (const muscleName of amitMuscles) {
    const normalizedMuscleName = muscleName.toLowerCase();

    if (normalizedMuscleName.startsWith(normalizedQuery)) {
      startsWithMatches.push(muscleName);
    } else if (normalizedMuscleName.includes(normalizedQuery)) {
      includesMatches.push(muscleName);
    }

    if (startsWithMatches.length + includesMatches.length >= maxMuscleSuggestions) {
      break;
    }
  }

  return [...startsWithMatches, ...includesMatches].slice(0, maxMuscleSuggestions);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

export default function CoachAthleteProfilePage() {
  const { athleteId } = useParams();
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [profile, setProfile] = useState(null);
  const [overviewForm, setOverviewForm] = useState({
    phase: "",
    coachNotes: "",
    programmingDays: 3,
    trainingModel: "",
    programVariant: standardProgramVariant
  });
  const [library, setLibrary] = useState(null);
  const [librarySummary, setLibrarySummary] = useState({
    phases: [],
    variants: [],
    frequencies: [],
    liftCount: 0,
    programCount: 0
  });
  const [rehabNotes, setRehabNotes] = useState([]);
  const [weekStart, setWeekStart] = useState(startOfWeek());
  const [selectedDay, setSelectedDay] = useState(new Date());
  const [weeklyLifts, setWeeklyLifts] = useState([]);
  const [newRehabNote, setNewRehabNote] = useState("");
  const [rehabProfileForm, setRehabProfileForm] = useState({
    inhibitedMuscles: [],
    padPlacementImages: []
  });
  const [activeMuscleFieldId, setActiveMuscleFieldId] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const statusTimerRef = useRef(null);

  const weekDays = useMemo(() => buildWeekDays(weekStart), [weekStart]);
  const liftsByDate = useMemo(() => groupLiftsByDate(weeklyLifts), [weeklyLifts]);
  const selectedDateKey = toDateInputValue(selectedDay);
  const selectedDayLifts = liftsByDate[selectedDateKey] || [];
  const modelOptions = fallbackModelOptions;
  const variantOptions = overviewForm.phase === "Eccentrics" ? eccentricProgramVariants : [standardProgramVariant];
  const frequencyOptions = useMemo(() => {
    const options = librarySummary.frequencies.length > 0 ? librarySummary.frequencies : [3, 4, 5];
    return overviewForm.programmingDays && !options.includes(Number(overviewForm.programmingDays))
      ? [Number(overviewForm.programmingDays), ...options].sort((left, right) => left - right)
      : options;
  }, [librarySummary.frequencies, overviewForm.programmingDays]);
  const matchedProgram = useMemo(() => {
    if (!library?.programs) {
      return null;
    }

    return (
      library.programs.find((program) => {
        return (
          program.phase === overviewForm.phase &&
          (program.variant || standardProgramVariant) === overviewForm.programVariant &&
          Number(program.frequency) === Number(overviewForm.programmingDays)
        );
      }) || null
    );
  }, [library, overviewForm.phase, overviewForm.programVariant, overviewForm.programmingDays]);
  const overviewPhaseTimeline = useMemo(() => {
    const weeksPerPhase = getWeeksPerPhase(overviewForm.trainingModel);
    const isStandardPhase = orderedTrainingPhases.includes(overviewForm.phase);
    const phaseStartedAt =
      profile && overviewForm.phase === profile.phase && profile.phaseStartedAt
        ? new Date(profile.phaseStartedAt)
        : new Date();

    if (!weeksPerPhase) {
      return null;
    }

    const expectedPhaseEndAt = new Date(phaseStartedAt);
    expectedPhaseEndAt.setDate(expectedPhaseEndAt.getDate() + weeksPerPhase * 7);
    const phaseIndex = orderedTrainingPhases.indexOf(overviewForm.phase);

    return {
      weeksPerPhase,
      isStandardPhase,
      phaseStartedAt,
      expectedPhaseEndAt,
      nextPhase:
        isStandardPhase && phaseIndex >= 0 && phaseIndex < orderedTrainingPhases.length - 1
          ? orderedTrainingPhases[phaseIndex + 1]
          : null
    };
  }, [overviewForm.phase, overviewForm.trainingModel, profile]);
  const hasUnsavedProgrammingSettings = Boolean(
    profile &&
      (overviewForm.phase !== profile.phase ||
        overviewForm.trainingModel !== profile.trainingModel ||
        overviewForm.programVariant !== profile.programVariant ||
        Number(overviewForm.programmingDays) !== Number(profile.programmingDays))
  );

  useEffect(() => {
    setSelectedDay(weekStart);
  }, [weekStart]);

  useEffect(() => {
    async function loadAthletePage() {
      setLoading(true);
      setError("");

      try {
        const [profileData, liftsData, rehabData, libraryData] = await Promise.all([
          apiRequest(`/api/athletes/${athleteId}`, { token }),
          apiRequest(`/api/athletes/${athleteId}/lifts?week=${toDateInputValue(weekStart)}`, { token }),
          apiRequest(`/api/athletes/${athleteId}/rehab`, { token }),
          apiRequest("/api/program-library", { token })
        ]);

        setProfile(profileData.athlete);
        setOverviewForm({
          phase: profileData.athlete.phase || "",
          coachNotes: profileData.athlete.coachNotes || "",
          programmingDays: profileData.athlete.programmingDays || 3,
          trainingModel: profileData.athlete.trainingModel || "",
          programVariant: profileData.athlete.programVariant || standardProgramVariant
        });
        setRehabProfileForm(normalizeRehabProfileForm(profileData.athlete.rehabProfile));
        setWeeklyLifts(liftsData.lifts);
        setRehabNotes(rehabData.notes);
        setLibrary(libraryData.library);
        setLibrarySummary(libraryData.summary);
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoading(false);
      }
    }

    loadAthletePage();
  }, [athleteId, token, weekStart]);

  function showStatus(message) {
    setStatusMessage(message);
    window.clearTimeout(statusTimerRef.current);
    statusTimerRef.current = window.setTimeout(() => setStatusMessage(""), 2200);
  }

  useEffect(() => {
    return () => {
      window.clearTimeout(statusTimerRef.current);
    };
  }, []);

  async function refreshWeeklyLifts() {
    const data = await apiRequest(`/api/athletes/${athleteId}/lifts?week=${toDateInputValue(weekStart)}`, {
      token
    });
    setWeeklyLifts(data.lifts);
  }

  async function refreshRehabNotes() {
    const data = await apiRequest(`/api/athletes/${athleteId}/rehab`, { token });
    setRehabNotes(data.notes);
  }

  async function handleOverviewSave(event) {
    event.preventDefault();
    setError("");

    try {
      const data = await apiRequest(`/api/athletes/${athleteId}`, {
        method: "PUT",
        token,
        body: {
          phase: overviewForm.phase,
          coachNotes: overviewForm.coachNotes,
          trainingModel: overviewForm.trainingModel,
          programVariant: overviewForm.programVariant,
          programmingDays: Number(overviewForm.programmingDays)
        }
      });
      setProfile(data.athlete);
      setOverviewForm({
        phase: data.athlete.phase,
        coachNotes: data.athlete.coachNotes,
        trainingModel: data.athlete.trainingModel,
        programVariant: data.athlete.programVariant,
        programmingDays: data.athlete.programmingDays
      });
      showStatus("Overview updated.");
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function handleUpdateLift(lift) {
    setError("");

    try {
      await apiRequest(`/api/athletes/${athleteId}/lifts/${lift.id}`, {
        method: "PUT",
        token,
        body: {
          ...lift,
          sets: Number(lift.sets),
          reps: Number(lift.reps),
          date: toDateInputValue(lift.date)
        }
      });
      showStatus("Lift updated.");
    } catch (updateError) {
      setError(updateError.message);
    }
  }

  async function handleDeleteLift(liftId) {
    setError("");

    try {
      await apiRequest(`/api/athletes/${athleteId}/lifts/${liftId}`, {
        method: "DELETE",
        token
      });
      setWeeklyLifts((current) => current.filter((lift) => lift.id !== liftId));
      showStatus("Lift removed.");
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  async function handleApplyProgram() {
    setError("");

    if (hasUnsavedProgrammingSettings) {
      setError("Save the athlete overview first so the phase, model, program type, and frequency are current.");
      return;
    }

    try {
      const data = await apiRequest(`/api/athletes/${athleteId}/apply-program`, {
        method: "POST",
        token,
        body: {
          week: toDateInputValue(weekStart)
        }
      });
      setWeeklyLifts(data.lifts);
      showStatus(`Applied ${data.program.name}.`);
    } catch (applyError) {
      setError(applyError.message);
    }
  }

  async function handleAddRehabNote(event) {
    event.preventDefault();
    setError("");

    try {
      await apiRequest(`/api/athletes/${athleteId}/rehab`, {
        method: "POST",
        token,
        body: { note: newRehabNote }
      });
      setNewRehabNote("");
      await refreshRehabNotes();
      showStatus("Rehab note added.");
    } catch (submitError) {
      setError(submitError.message);
    }
  }

  async function handleRehabProfileSave(event) {
    event.preventDefault();
    setError("");

    try {
      const data = await apiRequest(`/api/athletes/${athleteId}/rehab-profile`, {
        method: "PUT",
        token,
        body: { rehabProfile: rehabProfileForm }
      });
      setProfile(data.athlete);
      setRehabProfileForm(normalizeRehabProfileForm(data.athlete.rehabProfile));
      showStatus("Rehab profile updated.");
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  function addInhibitedMuscle() {
    setRehabProfileForm((current) => ({
      ...current,
      inhibitedMuscles: [...(current.inhibitedMuscles || []), createInhibitedMuscle()]
    }));
  }

  async function handlePadPlacementUpload(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    const currentCount = rehabProfileForm.padPlacementImages?.length || 0;
    const remainingSlots = maxPadPlacementImages - currentCount;

    if (remainingSlots <= 0) {
      setError(`You can upload up to ${maxPadPlacementImages} pad placement images.`);
      return;
    }

    const acceptedFiles = files
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, remainingSlots);

    if (acceptedFiles.length === 0) {
      setError("Upload an image file for pad placement.");
      return;
    }

    if (acceptedFiles.length < files.length) {
      setError(`Only ${remainingSlots} more pad placement image${remainingSlots === 1 ? "" : "s"} can be added.`);
    } else {
      setError("");
    }

    try {
      const images = await Promise.all(acceptedFiles.map(readFileAsDataUrl));
      setRehabProfileForm((current) => ({
        ...current,
        padPlacementImages: [
          ...(current.padPlacementImages || []),
          ...images.map((imageData) => createPadPlacementImage(imageData))
        ].slice(0, maxPadPlacementImages)
      }));
    } catch (uploadError) {
      setError(uploadError.message);
    }
  }

  function updateInhibitedMuscle(muscleId, field, value) {
    setRehabProfileForm((current) => ({
      ...current,
      inhibitedMuscles: (current.inhibitedMuscles || []).map((muscle) => {
        if (muscle.id !== muscleId) {
          return muscle;
        }

        if (field === "pain") {
          return {
            ...muscle,
            pain: value,
            painScale: value ? muscle.painScale || "" : ""
          };
        }

        return {
          ...muscle,
          [field]: value
        };
      })
    }));
  }

  function removeInhibitedMuscle(muscleId) {
    setRehabProfileForm((current) => ({
      ...current,
      inhibitedMuscles: (current.inhibitedMuscles || []).filter((muscle) => muscle.id !== muscleId)
    }));
    setActiveMuscleFieldId((current) => (current === muscleId ? "" : current));
  }

  function updatePadPlacementImage(imageId, field, value) {
    setRehabProfileForm((current) => ({
      ...current,
      padPlacementImages: (current.padPlacementImages || []).map((image) =>
        image.id === imageId ? { ...image, [field]: value } : image
      )
    }));
  }

  function removePadPlacementImage(imageId) {
    setRehabProfileForm((current) => ({
      ...current,
      padPlacementImages: (current.padPlacementImages || []).filter((image) => image.id !== imageId)
    }));
  }

  function updateLiftField(liftId, field, value) {
    setWeeklyLifts((current) =>
      current.map((lift) => (lift.id === liftId ? { ...lift, [field]: value } : lift))
    );
  }

  return (
    <div className="coach-page-stack">
      {loading ? <p className="empty-state">Loading athlete profile...</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {statusMessage ? <p className="form-success">{statusMessage}</p> : null}

      {profile ? (
        <>
          <section className="dashboard-card athlete-header-card">
            <div className="athlete-header-main">
              <div className="avatar-large">{profile.name.charAt(0)}</div>
              <div>
                <p className="eyebrow">Athlete Profile</p>
                <h2>{profile.name}</h2>
                <p className="muted-copy">{profile.email}</p>
              </div>
            </div>
            <div className="header-meta">
              <span className="phase-badge">{profile.phase}</span>
              <span className="muted-copy">Updated {formatDateTime(profile.updatedAt)}</span>
            </div>
          </section>

          <section className="tab-switcher">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`tab-toggle ${activeTab === tab.id ? "is-active" : ""}`}
                type="button"
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </section>

          {activeTab === "overview" ? (
            <section className="dashboard-card">
              <form className="form-grid" onSubmit={handleOverviewSave}>
                <div className="inline-fields four-up">
                  <label className="field">
                    <span>Training phase</span>
                    <select
                      value={overviewForm.phase}
                      onChange={(event) =>
                        setOverviewForm((current) => ({
                          ...current,
                          phase: event.target.value,
                          programVariant:
                            event.target.value === "Eccentrics"
                              ? eccentricProgramVariants.includes(current.programVariant)
                                ? current.programVariant
                                : eccentricProgramVariants[0]
                              : standardProgramVariant
                        }))
                      }
                      required
                    >
                      {phaseOptions.map((phase) => (
                        <option key={phase} value={phase}>
                          {phase}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Training model</span>
                    <select
                      value={overviewForm.trainingModel}
                      onChange={(event) =>
                        setOverviewForm((current) => ({
                          ...current,
                          trainingModel: event.target.value
                        }))
                      }
                      required
                    >
                      {modelOptions.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Program type</span>
                    <select
                      value={overviewForm.programVariant}
                      onChange={(event) =>
                        setOverviewForm((current) => ({
                          ...current,
                          programVariant: event.target.value
                        }))
                      }
                      disabled={overviewForm.phase !== "Eccentrics"}
                      required
                    >
                      {variantOptions.map((variant) => (
                        <option key={variant} value={variant}>
                          {variant}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span>Days per week</span>
                    <select
                      value={overviewForm.programmingDays}
                      onChange={(event) =>
                        setOverviewForm((current) => ({
                          ...current,
                          programmingDays: Number(event.target.value)
                        }))
                      }
                      required
                    >
                      {frequencyOptions.map((frequency) => (
                        <option key={frequency} value={frequency}>
                          {frequency} days
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <p className="muted-copy compact-copy">
                  Training model controls phase duration only: 10-Week = 2 weeks per phase, 20-Week = 4 weeks per
                  phase.
                </p>
                <p className="muted-copy compact-copy">
                  Program type stays `Standard` for every phase except `Eccentrics`, where you can choose `Alactic
                  Eccentrics` or `Lactic Eccentrics`.
                </p>

                <label className="field">
                  <span>Coach notes</span>
                  <textarea
                    rows="6"
                    value={overviewForm.coachNotes}
                    onChange={(event) =>
                      setOverviewForm((current) => ({ ...current, coachNotes: event.target.value }))
                    }
                  />
                </label>

                <button className="primary-button desktop-button" type="submit">
                  Save overview
                </button>
              </form>

              <div className="template-match-card">
                <strong>Phase progression</strong>
                {overviewPhaseTimeline?.isStandardPhase ? (
                  <>
                    <div className="program-summary-grid">
                      <span className="metric-chip">{overviewForm.trainingModel}</span>
                      <span className="metric-chip">{overviewPhaseTimeline.weeksPerPhase} weeks per phase</span>
                      <span className="metric-chip">
                        Started {formatCalendarDate(overviewPhaseTimeline.phaseStartedAt)}
                      </span>
                    </div>
                    <p className="muted-copy">
                      Current order: {orderedTrainingPhases.join(" -> ")}. Expected phase end{" "}
                      {formatCalendarDate(overviewPhaseTimeline.expectedPhaseEndAt)}
                      {overviewPhaseTimeline.nextPhase ? `. Next phase: ${overviewPhaseTimeline.nextPhase}.` : "."}
                    </p>
                  </>
                ) : (
                  <p className="muted-copy">
                    Rehab is handled outside the standard Prep, Eccentrics, Iso, Power, Speed timeline.
                  </p>
                )}
              </div>
            </section>
          ) : null}

          {activeTab === "program" ? (
            <div className="coach-program-layout">
              <section className="dashboard-card">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Week</p>
                    <h2>{formatWeekRange(weekStart)}</h2>
                  </div>
                  <input
                    type="date"
                    value={toDateInputValue(weekStart)}
                    onChange={(event) => setWeekStart(startOfWeek(new Date(`${event.target.value}T12:00:00`)))}
                  />
                </div>

                <div className="date-strip desktop-strip">
                  {weekDays.map((day) => (
                    <button
                      key={toDateInputValue(day)}
                      className={`date-pill ${sameDay(day, selectedDay) ? "is-active" : ""}`}
                      type="button"
                      onClick={() => setSelectedDay(day)}
                    >
                      <span>{formatDayShort(day)}</span>
                      <strong>{formatMonthDay(day)}</strong>
                    </button>
                  ))}
                </div>

                <div className="day-program-header">
                  <div>
                    <p className="eyebrow">Selected Day</p>
                    <h3>{formatLongDate(selectedDay)}</h3>
                  </div>
                </div>

                <div className="lift-editor-list">
                  {selectedDayLifts.length === 0 ? (
                    <p className="empty-state">No lifts assigned for this day yet.</p>
                  ) : (
                    selectedDayLifts.map((lift) => (
                      <article key={lift.id} className="lift-editor-card">
                        <div className="lift-editor-grid">
                          <label className="field">
                            <span>Exercise</span>
                            <input
                              type="text"
                              value={lift.exerciseName}
                              onChange={(event) =>
                                updateLiftField(lift.id, "exerciseName", event.target.value)
                              }
                            />
                          </label>

                          <label className="field">
                            <span>Sets</span>
                            <input
                              type="number"
                              min="1"
                              value={lift.sets}
                              onChange={(event) => updateLiftField(lift.id, "sets", event.target.value)}
                            />
                          </label>

                          <label className="field">
                            <span>Reps</span>
                            <input
                              type="number"
                              min="1"
                              value={lift.reps}
                              onChange={(event) => updateLiftField(lift.id, "reps", event.target.value)}
                            />
                          </label>

                          <label className="field">
                            <span>Weight</span>
                            <input
                              type="text"
                              value={lift.weight}
                              onChange={(event) => updateLiftField(lift.id, "weight", event.target.value)}
                            />
                          </label>

                          <label className="field field-full">
                            <span>Notes</span>
                            <textarea
                              rows="3"
                              value={lift.notes || ""}
                              onChange={(event) => updateLiftField(lift.id, "notes", event.target.value)}
                            />
                          </label>
                        </div>

                        <div className="card-actions">
                          <button className="ghost-button" type="button" onClick={() => handleDeleteLift(lift.id)}>
                            Delete
                          </button>
                          <button
                            className="primary-button desktop-button"
                            type="button"
                            onClick={() => handleUpdateLift(lift)}
                          >
                            Save lift
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>

              <div className="program-side-stack">
                <section className="dashboard-card">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">Template Engine</p>
                      <h2>Auto-program this week</h2>
                    </div>
                  </div>

                  <div className="program-summary-grid">
                    <span className="metric-chip">Phase: {overviewForm.phase}</span>
                    <span className="metric-chip">Model: {overviewForm.trainingModel}</span>
                    <span className="metric-chip">Program Type: {overviewForm.programVariant}</sp