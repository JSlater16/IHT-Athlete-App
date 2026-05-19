import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { amitMuscles } from "../../data/amitMuscles";
import { muscleFrequencies } from "../../data/muscleFrequencies";
import { apiRequest } from "../../lib/api";
import LiftTable from "../../components/LiftTable";
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
const workoutPlacementOptions = ["Prep", "Block 1", "Block 2", "Block 3", "Block 4"];

function normalizeName(value) {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function scoreValdProfileForAthlete(profile, athleteName) {
  const athleteTokens = new Set(normalizeName(athleteName));
  if (athleteTokens.size === 0) return 0;
  const profileTokens = new Set([
    ...normalizeName(profile.givenName),
    ...normalizeName(profile.familyName)
  ]);
  let overlap = 0;
  for (const t of athleteTokens) if (profileTokens.has(t)) overlap += 1;
  // Bonus for full-name exact match.
  if (overlap === athleteTokens.size && overlap === profileTokens.size) overlap += 1;
  return overlap;
}

function rankValdProfiles(profiles, athleteName, query) {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? profiles.filter((p) => `${p.givenName} ${p.familyName}`.toLowerCase().includes(q))
    : profiles;
  return filtered
    .map((p) => ({ ...p, _score: scoreValdProfileForAthlete(p, athleteName) }))
    .sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      return `${a.familyName} ${a.givenName}`.localeCompare(`${b.familyName} ${b.givenName}`);
    });
}

function createManualLiftForm(selectedDateKey = "") {
  return {
    exerciseName: "",
    selectedDates: selectedDateKey ? [selectedDateKey] : [],
    sets: "3",
    reps: "5",
    weight: "Bodyweight",
    blockLabel: "Block 1",
    notes: ""
  };
}

function createInhibitedMuscle() {
  return {
    id: `muscle-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: "",
    frequency: "",
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
      frequency:
        muscle.frequency === null || typeof muscle.frequency === "undefined"
          ? ""
          : String(muscle.frequency),
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

function normalizeMuscleLookupKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\bdivision\b/g, " ")
    .replace(/\binternal\b/g, " internus ")
    .replace(/\bexternal\b/g, " externus ")
    .replace(/\bcoli\b/g, " colli ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findMuscleFrequencyMatch(name, lookupEntries) {
  const normalizedName = normalizeMuscleLookupKey(name);
  if (!normalizedName) {
    return null;
  }

  const exactMatch = lookupEntries.find((entry) => entry.key === normalizedName);
  if (exactMatch) {
    return exactMatch.frequency;
  }

  const nameTokens = normalizedName.split(" ").filter(Boolean);
  if (nameTokens.length === 0) {
    return null;
  }

  const tokenMatch = lookupEntries.find((entry) => {
    return (
      entry.key.includes(normalizedName) ||
      normalizedName.includes(entry.key) ||
      nameTokens.every((token) => entry.tokens.includes(token))
    );
  });

  return tokenMatch?.frequency ?? null;
}

function getPainSeverity(painScale) {
  const painValue = Number(painScale);

  if (!Number.isFinite(painValue)) {
    return "";
  }

  if (painValue === 10) {
    return "is-flagged";
  }

  if (painValue >= 8) {
    return "is-critical";
  }

  if (painValue >= 5) {
    return "is-moderate";
  }

  return "";
}

function roundToNearestFive(value) {
  return Math.round(Number(value) / 5) * 5;
}

function calculateVoltaFrequency(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  const adjusted = parsed > 502 ? parsed / 2 : parsed;
  return roundToNearestFive(adjusted);
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
    programVariant: standardProgramVariant,
    valdProfileId: ""
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
  const [manualLiftForm, setManualLiftForm] = useState(createManualLiftForm());
  const [newRehabNote, setNewRehabNote] = useState("");
  const [rehabProfileForm, setRehabProfileForm] = useState({
    inhibitedMuscles: [],
    padPlacementImages: []
  });
  const [editingRehabNoteId, setEditingRehabNoteId] = useState("");
  const [editingRehabNoteText, setEditingRehabNoteText] = useState("");
  const [editingRehabSubmitting, setEditingRehabSubmitting] = useState(false);
  const [activeMuscleFieldId, setActiveMuscleFieldId] = useState("");
  const [activeMuscleSuggestionIndex, setActiveMuscleSuggestionIndex] = useState(-1);
  const [statusMessage, setStatusMessage] = useState("");
  const [valdPicker, setValdPicker] = useState({ open: false, loading: false, error: "", profiles: [], query: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const statusTimerRef = useRef(null);
  const muscleSuggestionRefs = useRef({});
  // Mirror of weeklyLifts so blur-fired save handlers always see the
  // latest optimistic state without closing over a stale snapshot.
  const weeklyLiftsRef = useRef([]);
  useEffect(() => {
    weeklyLiftsRef.current = weeklyLifts;
  }, [weeklyLifts]);

  const weekDays = useMemo(() => buildWeekDays(weekStart), [weekStart]);
  const liftsByDate = useMemo(() => groupLiftsByDate(weeklyLifts), [weeklyLifts]);
  const selectedDateKey = toDateInputValue(selectedDay);
  const selectedDayLifts = liftsByDate[selectedDateKey] || [];
  // Chronological "Day 1, Day 2, ..." mapping across only the dates
  // the athlete actually has lifts on. Matches the labeling the
  // athlete sees on their home page.
  const trainingDayMap = useMemo(() => {
    return Object.entries(liftsByDate)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, lifts], index) => ({
        key,
        date: new Date(lifts[0].date),
        dayNumber: index + 1
      }));
  }, [liftsByDate]);
  const modelOptions = fallbackModelOptions;
  // Program names present in the library for the currently-selected
  // phase. The picker uses these for every non-Eccentrics phase so
  // multiple programs at the same (phase, frequency) slot are
  // distinguishable in the dropdown.
  const phaseProgramOptions = useMemo(() => {
    return [
      ...new Set(
        (library?.programs || [])
          .filter((program) => program.phase === overviewForm.phase)
          .map((program) => program.name)
      )
    ]
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
  }, [library, overviewForm.phase]);
  const variantOptions = useMemo(() => {
    if (overviewForm.phase === "Eccentrics") return eccentricProgramVariants;
    return phaseProgramOptions.length > 0 ? phaseProgramOptions : [standardProgramVariant];
  }, [overviewForm.phase, phaseProgramOptions]);
  const frequencyOptions = useMemo(() => {
    const options = librarySummary.frequencies.length > 0 ? librarySummary.frequencies : [3, 4, 5];
    return overviewForm.programmingDays && !options.includes(Number(overviewForm.programmingDays))
      ? [Number(overviewForm.programmingDays), ...options].sort((left, right) => left - right)
      : options;
  }, [librarySummary.frequencies, overviewForm.programmingDays]);
  const muscleFrequencyLookup = useMemo(() => {
    return muscleFrequencies.map((entry) => {
      const key = normalizeMuscleLookupKey(entry.name);
      return {
        ...entry,
        key,
        tokens: key.split(" ").filter(Boolean)
      };
    });
  }, []);
  const matchedProgram = useMemo(() => {
    if (!library?.programs) {
      return null;
    }

    return (
      library.programs.find((program) => {
        if (program.phase !== overviewForm.phase) return false;
        if (overviewForm.phase === "Eccentrics") {
          if (Number(program.frequency) !== Number(overviewForm.programmingDays)) return false;
          return (program.variant || standardProgramVariant) === overviewForm.programVariant;
        }
        if (program.name === overviewForm.programVariant) return true;
        return (
          overviewForm.programVariant === standardProgramVariant &&
          (program.variant || standardProgramVariant) === standardProgramVariant &&
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
    setManualLiftForm(createManualLiftForm(toDateInputValue(weekStart)));
  }, [weekStart]);

  useEffect(() => {
    const ctrl = new AbortController();

    async function loadAthletePage() {
      setLoading(true);
      setError("");

      try {
        const [profileData, liftsData, rehabData, libraryData] = await Promise.all([
          apiRequest(`/api/athletes/${athleteId}`, { token, signal: ctrl.signal }),
          apiRequest(`/api/athletes/${athleteId}/lifts?week=${toDateInputValue(weekStart)}`, {
            token,
            signal: ctrl.signal
          }),
          apiRequest(`/api/athletes/${athleteId}/rehab`, { token, signal: ctrl.signal }),
          apiRequest("/api/program-library", { token, signal: ctrl.signal })
        ]);

        setProfile(profileData?.athlete || null);
        setOverviewForm({
          phase: profileData?.athlete?.phase || "",
          coachNotes: profileData?.athlete?.coachNotes || "",
          programmingDays: profileData?.athlete?.programmingDays || 3,
          trainingModel: profileData?.athlete?.trainingModel || "",
          programVariant: profileData?.athlete?.programVariant || standardProgramVariant,
          valdProfileId: profileData?.athlete?.valdProfileId || ""
        });
        setRehabProfileForm(normalizeRehabProfileForm(profileData?.athlete?.rehabProfile));
        setWeeklyLifts(liftsData?.lifts || []);
        setRehabNotes(rehabData?.notes || []);
        setLibrary(libraryData?.library || null);
        setLibrarySummary(libraryData?.summary || null);
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

    loadAthletePage();
    return () => ctrl.abort();
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
          programmingDays: Number(overviewForm.programmingDays),
          valdProfileId: overviewForm.valdProfileId.trim() || null
        }
      });
      setProfile(data.athlete);
      setOverviewForm({
        phase: data.athlete.phase,
        coachNotes: data.athlete.coachNotes,
        trainingModel: data.athlete.trainingModel,
        programVariant: data.athlete.programVariant,
        programmingDays: data.athlete.programmingDays,
        valdProfileId: data.athlete.valdProfileId || ""
      });
      showStatus("Overview updated.");
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function openValdPicker() {
    setValdPicker((current) => ({ ...current, open: true, loading: true, error: "", query: "" }));
    try {
      const data = await apiRequest("/api/vald/profiles", { token });
      setValdPicker((current) => ({
        ...current,
        loading: false,
        profiles: data?.profiles || []
      }));
    } catch (err) {
      setValdPicker((current) => ({
        ...current,
        loading: false,
        error: err.message || "Failed to load VALD profiles"
      }));
    }
  }

  function closeValdPicker() {
    setValdPicker({ open: false, loading: false, error: "", profiles: [], query: "" });
  }

  async function handleLinkValdProfile(valdProfileId) {
    setError("");
    try {
      const data = await apiRequest(`/api/athletes/${athleteId}/vald-profile`, {
        method: "PUT",
        token,
        body: { valdProfileId }
      });
      setProfile(data.athlete);
      setOverviewForm((current) => ({ ...current, valdProfileId: data.athlete.valdProfileId || "" }));
      showStatus(valdProfileId ? "Linked to VALD profile." : "Unlinked from VALD profile.");
      closeValdPicker();
    } catch (linkError) {
      setError(linkError.message);
    }
  }

  async function handleToggleLeaderboardVisibility(nextHidden) {
    setError("");
    try {
      const data = await apiRequest(`/api/athletes/${athleteId}/leaderboard-visibility`, {
        method: "PUT",
        token,
        body: { hideFromLeaderboard: nextHidden }
      });
      setProfile(data.athlete);
      showStatus(nextHidden ? "Removed from leaderboard." : "Added to leaderboard.");
    } catch (toggleError) {
      setError(toggleError.message);
    }
  }

  async function commitLiftField(liftId, field, rawValue) {
    setError("");
    const lift = weeklyLiftsRef.current.find((l) => l.id === liftId);
    if (!lift) return;
    const value =
      field === "sets" || field === "reps"
        ? Number(rawValue) || 1
        : rawValue;
    // Skip the PUT when the optimistic state already matches what's
    // on the server — avoids a network round-trip on focus-only blurs.
    if (lift[field] === value) return;
    try {
      const payload = {
        ...lift,
        [field]: value,
        sets: field === "sets" ? Number(value) || 1 : Number(lift.sets),
        reps: field === "reps" ? Number(value) || 1 : Number(lift.reps),
        date: toDateInputValue(lift.date)
      };
      const data = await apiRequest(`/api/athletes/${athleteId}/lifts/${liftId}`, {
        method: "PUT",
        token,
        body: payload
      });
      const saved = data?.lift;
      if (saved) {
        setWeeklyLifts((current) =>
          current.map((l) => (l.id === liftId ? { ...l, ...saved } : l))
        );
      }
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

  async function handleAddLiftForSelectedDay() {
    setError("");
    try {
      const data = await apiRequest(`/api/athletes/${athleteId}/lifts`, {
        method: "POST",
        token,
        body: {
          date: toDateInputValue(selectedDay),
          blockLabel: "Block 1",
          exerciseName: "New lift",
          sets: 3,
          reps: 5,
          weight: "Coach Prescribed",
          notes: ""
        }
      });
      const created = data?.lift;
      if (created) setWeeklyLifts((current) => [...current, created]);
      showStatus("Lift added.");
    } catch (addError) {
      setError(addError.message);
    }
  }

  async function handleMoveLift(liftId, direction) {
    setError("");
    try {
      const data = await apiRequest(
        `/api/athletes/${athleteId}/lifts/${liftId}/reorder`,
        {
          method: "PATCH",
          token,
          body: { direction: direction < 0 ? "up" : "down" }
        }
      );
      const swapped = data?.lifts || [];
      if (swapped.length === 0) return;
      const swappedById = new Map(swapped.map((l) => [l.id, l]));
      setWeeklyLifts((current) =>
        current.map((l) => (swappedById.has(l.id) ? { ...l, ...swappedById.get(l.id) } : l))
      );
    } catch (moveError) {
      setError(moveError.message);
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

  function startEditingRehabNote(note) {
    setEditingRehabNoteId(note.id);
    setEditingRehabNoteText(note.note);
    setError("");
  }

  function cancelEditingRehabNote() {
    setEditingRehabNoteId("");
    setEditingRehabNoteText("");
    setEditingRehabSubmitting(false);
  }

  async function handleSaveEditedRehabNote(noteId) {
    setError("");

    if (editingRehabNoteText.trim().length < 2) {
      setError("Rehab note is required.");
      return;
    }

    setEditingRehabSubmitting(true);

    try {
      await apiRequest(`/api/athletes/${athleteId}/rehab/${noteId}`, {
        method: "PUT",
        token,
        body: { note: editingRehabNoteText.trim() }
      });
      await refreshRehabNotes();
      cancelEditingRehabNote();
      showStatus("Rehab note updated.");
    } catch (saveError) {
      setError(saveError.message);
      setEditingRehabSubmitting(false);
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

        if (field === "name") {
          const matchedFrequency = findMuscleFrequencyMatch(value, muscleFrequencyLookup);

          return {
            ...muscle,
            name: value,
            frequency:
              typeof matchedFrequency === "number"
                ? String(matchedFrequency)
                : muscle.frequency || ""
          };
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
    setActiveMuscleSuggestionIndex(-1);
  }

  function getMuscleSuggestionRefKey(muscleId, suggestionIndex) {
    return `${muscleId}:${suggestionIndex}`;
  }

  function scrollActiveMuscleSuggestion(muscleId, suggestionIndex) {
    window.requestAnimationFrame(() => {
      const suggestionNode =
        muscleSuggestionRefs.current[getMuscleSuggestionRefKey(muscleId, suggestionIndex)];

      if (suggestionNode) {
        suggestionNode.scrollIntoView({
          block: "nearest"
        });
      }
    });
  }

  function handleMuscleInputKeyDown(event, muscleId, suggestions) {
    if (suggestions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveMuscleSuggestionIndex((current) => {
        const nextIndex = (current + 1) % suggestions.length;
        scrollActiveMuscleSuggestion(muscleId, nextIndex);
        return nextIndex;
      });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveMuscleSuggestionIndex((current) => {
        const nextIndex = current <= 0 ? suggestions.length - 1 : current - 1;
        scrollActiveMuscleSuggestion(muscleId, nextIndex);
        return nextIndex;
      });
      return;
    }

    if (event.key === "Enter" && activeMuscleSuggestionIndex >= 0) {
      event.preventDefault();
      updateInhibitedMuscle(muscleId, "name", suggestions[activeMuscleSuggestionIndex]);
      setActiveMuscleFieldId("");
      setActiveMuscleSuggestionIndex(-1);
      return;
    }

    if (event.key === "Escape") {
      setActiveMuscleFieldId("");
      setActiveMuscleSuggestionIndex(-1);
    }
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

  function toggleManualLiftDate(dateKey) {
    setManualLiftForm((current) => {
      const alreadySelected = current.selectedDates.includes(dateKey);

      return {
        ...current,
        selectedDates: alreadySelected
          ? current.selectedDates.filter((value) => value !== dateKey)
          : [...current.selectedDates, dateKey]
      };
    });
  }

  async function handleCreateManualLifts(event) {
    event.preventDefault();
    setError("");

    if (!manualLiftForm.exerciseName.trim()) {
      setError("Exercise name is required.");
      return;
    }

    if (manualLiftForm.selectedDates.length === 0) {
      setError("Select at least one training day.");
      return;
    }

    if (!Number.isFinite(Number(manualLiftForm.sets)) || Number(manualLiftForm.sets) < 1) {
      setError("Sets must be at least 1.");
      return;
    }

    if (!Number.isFinite(Number(manualLiftForm.reps)) || Number(manualLiftForm.reps) < 1) {
      setError("Reps must be at least 1.");
      return;
    }

    if (!manualLiftForm.weight.trim()) {
      setError("Weight is required.");
      return;
    }

    try {
      await Promise.all(
        manualLiftForm.selectedDates.map((date) =>
          apiRequest(`/api/athletes/${athleteId}/lifts`, {
            method: "POST",
            token,
            body: {
              date,
              blockLabel: manualLiftForm.blockLabel,
              exerciseName: manualLiftForm.exerciseName.trim(),
              sets: Number(manualLiftForm.sets),
              reps: Number(manualLiftForm.reps),
              weight: manualLiftForm.weight.trim(),
              notes: manualLiftForm.notes.trim()
            }
          })
        )
      );

      await refreshWeeklyLifts();
      setManualLiftForm(createManualLiftForm(toDateInputValue(selectedDay)));
      showStatus(
        manualLiftForm.selectedDates.length === 1
          ? "Workout added."
          : `Workout added to ${manualLiftForm.selectedDates.length} days.`
      );
    } catch (createError) {
      setError(createError.message);
    }
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
                <div className={`inline-fields ${overviewForm.phase === "Prep" ? "three-up" : "four-up"}`}>
                  <label className="field">
                    <span>Training phase</span>
                    <select
                      value={overviewForm.phase}
                      onChange={(event) => {
                        const nextPhase = event.target.value;
                        const namesForPhase = [
                          ...new Set(
                            (library?.programs || [])
                              .filter((program) => program.phase === nextPhase)
                              .map((program) => program.name)
                          )
                        ]
                          .filter(Boolean)
                          .sort((left, right) => left.localeCompare(right));
                        setOverviewForm((current) => ({
                          ...current,
                          phase: nextPhase,
                          programVariant:
                            nextPhase === "Eccentrics"
                              ? eccentricProgramVariants.includes(current.programVariant)
                                ? current.programVariant
                                : eccentricProgramVariants[0]
                              : namesForPhase.includes(current.programVariant)
                                ? current.programVariant
                                : namesForPhase[0] || standardProgramVariant
                        }));
                      }}
                      required
                    >
                      {phaseOptions.map((phase) => (
                        <option key={phase} value={phase}>
                          {phase}
                        </option>
                      ))}
                    </select>
                  </label>

                  {overviewForm.phase !== "Prep" ? (
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
                  ) : null}

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

                {overviewForm.phase !== "Prep" ? (
                  <p className="muted-copy compact-copy">
                    Training model controls phase duration only: 10-Week = 2 weeks per phase, 20-Week = 4 weeks per
                    phase.
                  </p>
                ) : null}
                <p className="muted-copy compact-copy">
                  Program type stays `Standard` for every phase except `Eccentrics`, where you can choose `Alactic
                  Eccentrics` or `Lactic Eccentrics`. In `Prep`, it now maps to the specific Prep program you want.
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

                <div className="field">
                  <span>VALD Hub profile</span>
                  {profile?.valdProfileId ? (
                    <div className="vald-link-row">
                      <span className="vald-link-status">
                        Linked
                        <span className="vald-link-id"> ({profile.valdProfileId.slice(0, 8)}…)</span>
                      </span>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => handleLinkValdProfile(null)}
                      >
                        Unlink
                      </button>
                      <button className="ghost-button" type="button" onClick={openValdPicker}>
                        Change
                      </button>
                    </div>
                  ) : (
                    <button className="ghost-button" type="button" onClick={openValdPicker}>
                      Pick VALD profile
                    </button>
                  )}
                  <span className="muted-copy compact-copy">
                    Links this athlete to their VALD Hub profile so ForceDecks data syncs automatically.
                  </span>

                  {valdPicker.open ? (
                    <ValdPickerPanel
                      picker={valdPicker}
                      athleteName={profile?.name || ""}
                      currentValdProfileId={profile?.valdProfileId || null}
                      onClose={closeValdPicker}
                      onSelect={handleLinkValdProfile}
                      onQueryChange={(query) => setValdPicker((current) => ({ ...current, query }))}
                    />
                  ) : null}
                </div>

                <button className="primary-button desktop-button" type="submit">
                  Save overview
                </button>
              </form>

              <div className="template-match-card">
                <strong>Leaderboard</strong>
                <p className="muted-copy compact-copy">
                  {profile?.hideFromLeaderboard
                    ? "Currently hidden from the athlete leaderboard."
                    : "Currently shown on the athlete leaderboard for jump height and peak power."}
                </p>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => handleToggleLeaderboardVisibility(!profile?.hideFromLeaderboard)}
                >
                  {profile?.hideFromLeaderboard ? "Show on leaderboard" : "Hide from leaderboard"}
                </button>
              </div>

              <div className="template-match-card">
                <strong>Phase progression</strong>
                {overviewPhaseTimeline?.isStandardPhase ? (
                  <>
                    <div className="program-summary-grid">
                      {overviewForm.phase !== "Prep" ? (
                        <span className="metric-chip">{overviewForm.trainingModel}</span>
                      ) : null}
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
                  {trainingDayMap.length === 0 ? (
                    <p className="muted-copy compact-copy">
                      No lifts assigned this week yet. Apply a program or add lifts manually below.
                    </p>
                  ) : (
                    trainingDayMap.map(({ key, date, dayNumber }) => (
                      <button
                        key={key}
                        className={`date-pill ${sameDay(date, selectedDay) ? "is-active" : ""}`}
                        type="button"
                        onClick={() => setSelectedDay(date)}
                      >
                        <span>Day {dayNumber}</span>
                        <strong>{formatMonthDay(date)}</strong>
                      </button>
                    ))
                  )}
                </div>

                <div className="day-program-header">
                  <div>
                    <p className="eyebrow">Selected Day</p>
                    <h3>{formatLongDate(selectedDay)}</h3>
                  </div>
                  <button
                    type="button"
                    className="primary-button desktop-button builder-add-lift"
                    onClick={handleAddLiftForSelectedDay}
                  >
                    + Add lift
                  </button>
                </div>

                <LiftTable
                  entries={selectedDayLifts.map((lift, idx) => ({
                    dayIndex: 0,
                    liftIndex: idx,
                    lift: {
                      blockLabel: lift.blockLabel || "Block 1",
                      exerciseName: lift.exerciseName || "",
                      sets: String(lift.sets ?? ""),
                      reps: String(lift.reps ?? ""),
                      weight: lift.weight || "",
                      notes: lift.notes || "",
                      loggedWeight: lift.loggedWeight || null,
                      lastLoggedWeight: lift.lastLoggedWeight || null
                    },
                    liftsInDay: selectedDayLifts.length
                  }))}
                  library={library}
                  liftByNormalizedName={null}
                  showLoggedColumn
                  onUpdateLiftField={(_dayIdx, liftIdx, field, value) => {
                    const target = selectedDayLifts[liftIdx];
                    if (target) updateLiftField(target.id, field, value);
                  }}
                  onCommitField={(_dayIdx, liftIdx, field, value) => {
                    const target = selectedDayLifts[liftIdx];
                    if (target) commitLiftField(target.id, field, value);
                  }}
                  onRemoveLift={(_dayIdx, liftIdx) => {
                    const target = selectedDayLifts[liftIdx];
                    if (target) handleDeleteLift(target.id);
                  }}
                  onMoveLift={(_dayIdx, liftIdx, direction) => {
                    const target = selectedDayLifts[liftIdx];
                    if (target) handleMoveLift(target.id, direction);
                  }}
                />
              </section>

              <div className="program-side-stack">
                <section className="dashboard-card">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">Manual Programming</p>
                      <h2>Add specific workouts</h2>
                    </div>
                  </div>

                  <p className="muted-copy">
                    Add a lift to one or more days in this week and choose where it should land in the workout.
                  </p>

                  <form className="form-grid" onSubmit={handleCreateManualLifts}>
                    <label className="field">
                      <span>Exercise</span>
                      <input
                        type="text"
                        value={manualLiftForm.exerciseName}
                        onChange={(event) =>
                          setManualLiftForm((current) => ({
                            ...current,
                            exerciseName: event.target.value
                          }))
                        }
                        placeholder="Trap bar deadlift"
                        required
                      />
                    </label>

                    <div className="inline-fields three-up">
                      <label className="field">
                        <span>Sets</span>
                        <input
                          type="number"
                          min="1"
                          value={manualLiftForm.sets}
                          onChange={(event) =>
                            setManualLiftForm((current) => ({
                              ...current,
                              sets: event.target.value
                            }))
                          }
                          required
                        />
                      </label>

                      <label className="field">
                        <span>Reps</span>
                        <input
                          type="number"
                          min="1"
                          value={manualLiftForm.reps}
                          onChange={(event) =>
                            setManualLiftForm((current) => ({
                              ...current,
                              reps: event.target.value
                            }))
                          }
                          required
                        />
                      </label>

                      <label className="field">
                        <span>Weight</span>
                        <input
                          type="text"
                          value={manualLiftForm.weight}
                          onChange={(event) =>
                            setManualLiftForm((current) => ({
                              ...current,
                              weight: event.target.value
                            }))
                          }
                          required
                        />
                      </label>
                    </div>

                    <label className="field">
                      <span>Where in workout</span>
                      <select
                        value={manualLiftForm.blockLabel}
                        onChange={(event) =>
                          setManualLiftForm((current) => ({
                            ...current,
                            blockLabel: event.target.value
                          }))
                        }
                      >
                        {workoutPlacementOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="field">
                      <span>Days this week</span>
                      <div className="manual-day-grid">
                        {weekDays.map((day) => {
                          const dateKey = toDateInputValue(day);
                          const isSelected = manualLiftForm.selectedDates.includes(dateKey);

                          return (
                            <label key={dateKey} className={`manual-day-pill ${isSelected ? "is-selected" : ""}`}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleManualLiftDate(dateKey)}
                              />
                              <span>{formatDayShort(day)}</span>
                              <strong>{formatMonthDay(day)}</strong>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <label className="field">
                      <span>Notes</span>
                      <textarea
                        rows="3"
                        value={manualLiftForm.notes}
                        onChange={(event) =>
                          setManualLiftForm((current) => ({
                            ...current,
                            notes: event.target.value
                          }))
                        }
                        placeholder="Optional coaching notes"
                      />
                    </label>

                    <button className="primary-button desktop-button" type="submit">
                      Add to weekly program
                    </button>
                  </form>
                </section>

                <section className="dashboard-card">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">Template Engine</p>
                      <h2>Auto-program this week</h2>
                    </div>
                  </div>

                  <div className="program-summary-grid">
                    <span className="metric-chip">Phase: {overviewForm.phase}</span>
                    {overviewForm.phase !== "Prep" ? (
                      <span className="metric-chip">Model: {overviewForm.trainingModel}</span>
                    ) : null}
                    <span className="metric-chip">Program Type: {overviewForm.programVariant}</span>
                    <span className="metric-chip">
                      Frequency: {matchedProgram?.frequency ?? overviewForm.programmingDays}x / week
                    </span>
                  </div>

                  {matchedProgram ? (
                    <div className="template-match-card">
                      <strong>{matchedProgram.name}</strong>
                      <p className="muted-copy">
                        {matchedProgram.days.length} programmed days will be applied to this week.
                      </p>
                    </div>
                  ) : (
                    <p className="empty-state">
                      No template matches this phase and program type yet.
                    </p>
                  )}

                  <button
                    className="primary-button desktop-button"
                    type="button"
                    onClick={handleApplyProgram}
                    disabled={!matchedProgram}
                  >
                    Apply program to week
                  </button>

                  <p className="muted-copy compact-copy">
                    Applying a template replaces that athlete&apos;s lifts for the selected week.
                  </p>
                </section>

                <section className="dashboard-card">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">Lift Library</p>
                      <h2>Current library</h2>
                    </div>
                  </div>

                  <div className="program-summary-grid">
                    <span className="metric-chip">{librarySummary.liftCount} lifts</span>
                    <span className="metric-chip">{librarySummary.programCount} templates</span>
                    <span className="metric-chip">{librarySummary.frequencies.length} frequencies</span>
                  </div>

                  <div className="library-list">
                    <strong>Weekly frequencies</strong>
                    <p className="muted-copy">{frequencyOptions.join(", ")} days per week</p>
                    <strong>Program types</strong>
                    <p className="muted-copy">
                      {librarySummary.variants.length > 0
                        ? librarySummary.variants.join(", ")
                        : "No program types loaded yet."}
                    </p>
                    <strong>Phases Covered</strong>
                    <p className="muted-copy">
                      {librarySummary.phases.length > 0
                        ? librarySummary.phases.join(", ")
                        : "No phases loaded yet."}
                    </p>
                  </div>
                </section>

                <section className="dashboard-card">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">Library Workflow</p>
                      <h2>Program imports are managed offline</h2>
                    </div>
                  </div>
                  <p className="muted-copy">
                    Send your CSV program files separately, along with the phase and whether each one
                    is the 3, 4, or 5 day version. The website will use the finished library, while
                    10-Week and 20-Week only control whether the athlete spends 2 or 4 weeks in each
                    standard phase. Eccentrics templates can be imported separately as Alactic or
                    Lactic.
                  </p>
                </section>
              </div>
            </div>
          ) : null}

          {activeTab === "rehab" ? (
            <div className="coach-program-layout">
              <section className="dashboard-card">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Rehab</p>
                    <h2>Inhibited muscles</h2>
                  </div>
                </div>

                <form className="form-grid" onSubmit={handleRehabProfileSave}>
                  <div className="rehab-muscle-stack">
                    {(rehabProfileForm.inhibitedMuscles || []).length === 0 ? (
                      <p className="empty-state">No inhibited muscles added yet.</p>
                    ) : (
                      (rehabProfileForm.inhibitedMuscles || []).map((muscle) => {
                        const suggestions =
                          activeMuscleFieldId === muscle.id ? getMuscleSuggestions(muscle.name) : [];
                        const painSeverityClass = muscle.pain ? getPainSeverity(muscle.painScale) : "";
                        const calculatedFrequency = calculateVoltaFrequency(muscle.frequency);

                        return (
                        <article
                          key={muscle.id}
                          className={`rehab-muscle-card ${
                            activeMuscleFieldId === muscle.id && suggestions.length > 0
                              ? "is-autocomplete-open"
                              : ""
                          }`}
                        >
                          <div className="rehab-muscle-row">
                            <label className="field rehab-muscle-field">
                              <span>Inhibited muscle</span>
                              <input
                                type="text"
                                value={muscle.name}
                                autoComplete="off"
                                onFocus={() => {
                                  setActiveMuscleFieldId(muscle.id);
                                  setActiveMuscleSuggestionIndex(-1);
                                }}
                                onBlur={() => {
                                  window.setTimeout(() => {
                                    setActiveMuscleFieldId((current) => (current === muscle.id ? "" : current));
                                    setActiveMuscleSuggestionIndex(-1);
                                  }, 120);
                                }}
                                onChange={(event) =>
                                  updateInhibitedMuscle(muscle.id, "name", event.target.value)
                                }
                                onKeyDown={(event) =>
                                  handleMuscleInputKeyDown(event, muscle.id, suggestions)
                                }
                                placeholder="Adductor Longus"
                              />
                              {suggestions.length > 0 ? (
                                <div className="rehab-muscle-autocomplete" role="listbox">
                                  {suggestions.map((muscleName, suggestionIndex) => (
                                    <button
                                      key={muscleName}
                                      ref={(node) => {
                                        const refKey = getMuscleSuggestionRefKey(muscle.id, suggestionIndex);

                                        if (node) {
                                          muscleSuggestionRefs.current[refKey] = node;
                                        } else {
                                          delete muscleSuggestionRefs.current[refKey];
                                        }
                                      }}
                                      className={`rehab-muscle-option ${
                                        suggestionIndex === activeMuscleSuggestionIndex ? "is-active" : ""
                                      }`}
                                      type="button"
                                      onMouseDown={(event) => {
                                        event.preventDefault();
                                        updateInhibitedMuscle(muscle.id, "name", muscleName);
                                        setActiveMuscleFieldId("");
                                        setActiveMuscleSuggestionIndex(-1);
                                      }}
                                    >
                                      {muscleName}
                                    </button>
                                  ))}
                                </div>
                              ) : null}
                            </label>

                            <div className="field rehab-frequency-result">
                              <span>Frequency</span>
                              <div className="rehab-frequency-pill">
                                {calculatedFrequency === null ? "--" : calculatedFrequency}
                              </div>
                            </div>

                            <div className="field">
                              <span>Pain</span>
                              <div className="rehab-inline-check">
                                <input
                                  type="checkbox"
                                  checked={Boolean(muscle.pain)}
                                  onChange={(event) =>
                                    updateInhibitedMuscle(muscle.id, "pain", event.target.checked)
                                  }
                                />
                                <input
                                  className={`rehab-pain-input ${painSeverityClass}`.trim()}
                                  type="number"
                                  min="0"
                                  max="10"
                                  value={muscle.painScale}
                                  onChange={(event) =>
                                    updateInhibitedMuscle(muscle.id, "painScale", event.target.value)
                                  }
                                  disabled={!muscle.pain}
                                  placeholder="0-10"
                                />
                                {painSeverityClass === "is-flagged" ? (
                                  <span className="rehab-flag-icon" aria-label="Flagged" title="Flagged" />
                                ) : null}
                              </div>
                            </div>

                            <label className="field checkbox-field">
                              <span>Primary</span>
                              <input
                                type="checkbox"
                                checked={Boolean(muscle.primary)}
                                onChange={(event) =>
                                  updateInhibitedMuscle(muscle.id, "primary", event.target.checked)
                                }
                              />
                            </label>

                            <label className="field checkbox-field">
                              <span>Left</span>
                              <input
                                type="checkbox"
                                checked={Boolean(muscle.left)}
                                onChange={(event) =>
                                  updateInhibitedMuscle(muscle.id, "left", event.target.checked)
                                }
                              />
                            </label>

                            <label className="field checkbox-field">
                              <span>Right</span>
                              <input
                                type="checkbox"
                                checked={Boolean(muscle.right)}
                                onChange={(event) =>
                                  updateInhibitedMuscle(muscle.id, "right", event.target.checked)
                                }
                              />
                            </label>

                            <div className="field rehab-remove-field">
                              <span>&nbsp;</span>
                              <button
                                className="ghost-button"
                                type="button"
                                onClick={() => removeInhibitedMuscle(muscle.id)}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </article>
                        );
                      })
                    )}
                  </div>

                  <div className="rehab-add-muscle-row">
                    <button className="ghost-button" type="button" onClick={addInhibitedMuscle}>
                      Add inhibited muscle
                    </button>
                  </div>

                  <section className="rehab-media-section">
                    <div className="section-heading">
                      <div>
                        <p className="eyebrow">Pad Placements</p>
                        <h3>Upload placement photos</h3>
                      </div>
                      <p className="muted-copy compact-copy">
                        {(rehabProfileForm.padPlacementImages || []).length} / {maxPadPlacementImages} images saved
                      </p>
                    </div>

                    <label className="field rehab-upload-field">
                      <span>Add pad placement images</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handlePadPlacementUpload}
                        disabled={(rehabProfileForm.padPlacementImages || []).length >= maxPadPlacementImages}
                      />
                    </label>

                    {(rehabProfileForm.padPlacementImages || []).length === 0 ? (
                      <p className="empty-state">No pad placement images uploaded yet.</p>
                    ) : (
                      <div className="pad-placement-grid">
                        {(rehabProfileForm.padPlacementImages || []).map((image, index) => (
                          <article key={image.id} className="pad-placement-card">
                            <img
                              className="pad-placement-preview"
                              src={image.imageData}
                              alt={`Pad placement ${index + 1}`}
                            />

                            <div className="pad-placement-meta">
                              <label className="field">
                                <span>Side</span>
                                <select
                                  value={image.side}
                                  onChange={(event) =>
                                    updatePadPlacementImage(image.id, "side", event.target.value)
                                  }
                                >
                                  <option value="Left">Left</option>
                                  <option value="Right">Right</option>
                                </select>
                              </label>

                              <label className="field">
                                <span>Result</span>
                                <select
                                  value={image.result}
                                  onChange={(event) =>
                                    updatePadPlacementImage(image.id, "result", event.target.value)
                                  }
                                >
                                  <option value="Positive">Positive</option>
                                  <option value="Negative">Negative</option>
                                </select>
                              </label>
                            </div>

                            <button
                              className="ghost-button"
                              type="button"
                              onClick={() => removePadPlacementImage(image.id)}
                            >
                              Remove image
                            </button>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>

                  <div className="card-actions">
                    <button className="primary-button desktop-button" type="submit">
                      Save rehab profile
                    </button>
                  </div>
                </form>
              </section>

              <div className="program-side-stack rehab-side-stack">
                <section className="dashboard-card">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">Rehab Notes</p>
                      <h2>Add a rehab note</h2>
                    </div>
                  </div>

                  <form className="form-grid" onSubmit={handleAddRehabNote}>
                    <label className="field">
                      <span>Note</span>
                      <textarea
                        rows="6"
                        value={newRehabNote}
                        onChange={(event) => setNewRehabNote(event.target.value)}
                        required
                      />
                    </label>
                    <button className="primary-button desktop-button" type="submit">
                      Save rehab note
                    </button>
                  </form>
                </section>

                <section className="dashboard-card">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">History</p>
                    <h2>Past rehab notes</h2>
                  </div>
                </div>

                <div className="rehab-list">
                  {rehabNotes.length === 0 ? (
                    <p className="empty-state">No rehab notes yet.</p>
                  ) : (
                    rehabNotes.map((note) => (
                      <article key={note.id} className="rehab-note-card">
                        {editingRehabNoteId === note.id ? (
                          <>
                            <textarea
                              rows="4"
                              value={editingRehabNoteText}
                              onChange={(event) => setEditingRehabNoteText(event.target.value)}
                            />
                            <div className="rehab-note-actions">
                              <button
                                className="ghost-button"
                                type="button"
                                onClick={cancelEditingRehabNote}
                                disabled={editingRehabSubmitting}
                              >
                                Cancel
                              </button>
                              <button
                                className="primary-button desktop-button"
                                type="button"
                                onClick={() => handleSaveEditedRehabNote(note.id)}
                                disabled={editingRehabSubmitting}
                              >
                                {editingRehabSubmitting ? "Saving..." : "Save"}
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <p>{note.note}</p>
                            <div className="rehab-note-actions">
                              <button
                                className="ghost-button"
                                type="button"
                                onClick={() => startEditingRehabNote(note)}
                              >
                                Edit
                              </button>
                            </div>
                          </>
                        )}
                        <span>{formatDateTime(note.createdAt)}</span>
                      </article>
                    ))
                  )}
                </div>
                </section>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ValdPickerPanel({ picker, athleteName, currentValdProfileId, onClose, onSelect, onQueryChange }) {
  const ranked = rankValdProfiles(picker.profiles, athleteName, picker.query);

  return (
    <div className="vald-picker-panel">
      <div className="vald-picker-header">
        <strong>Pick a VALD profile</strong>
        <button className="ghost-button" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <input
        type="search"
        className="vald-picker-search"
        placeholder="Search by name"
        value={picker.query}
        onChange={(event) => onQueryChange(event.target.value)}
      />
      {picker.loading ? (
        <p className="muted-copy compact-copy">Loading profiles…</p>
      ) : picker.error ? (
        <p className="form-error">{picker.error}</p>
      ) : ranked.length === 0 ? (
        <p className="muted-copy compact-copy">No matching VALD profiles.</p>
      ) : (
        <ul className="vald-picker-list">
          {ranked.map((profile) => {
            const linkedElsewhere =
              profile.linkedAthlete && profile.profileId !== currentValdProfileId;
            const isCurrent = profile.profileId === currentValdProfileId;
            return (
              <li key={profile.profileId} className="vald-picker-row">
                <div className="vald-picker-row-name">
                  <strong>
                    {profile.givenName || profile.familyName
                      ? `${profile.givenName} ${profile.familyName}`.trim()
                      : "(no name)"}
                  </strong>
                  {profile.dateOfBirth ? (
                    <span className="vald-picker-row-dob">
                      DOB {new Date(profile.dateOfBirth).toLocaleDateString()}
                    </span>
                  ) : null}
                  {linkedElsewhere ? (
                    <span className="vald-picker-row-linked">
                      Linked to {profile.linkedAthlete.name}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={isCurrent ? "ghost-button" : "primary-button"}
                  disabled={linkedElsewhere || isCurrent}
                  onClick={() => onSelect(profile.profileId)}
                >
                  {isCurrent ? "Current" : linkedElsewhere ? "Taken" : "Link"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
