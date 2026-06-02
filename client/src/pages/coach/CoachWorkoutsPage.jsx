import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../lib/api";
import ConfirmModal from "../../components/ConfirmModal";
import LiftTable from "../../components/LiftTable";
import VideoModal from "../../components/VideoModal";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

const phaseOptions = ["Rehab", "Prep", "Eccentrics", "Iso", "Power", "Speed"];
const allFrequencies = [3, 4, 5];
const standardProgramVariant = "Standard";
const eccentricProgramVariants = ["Alactic Eccentrics", "Lactic Eccentrics"];
const workoutPlacementOptions = ["Prep", "Block 1", "Block 2", "Block 3", "Block 4"];
const customExerciseCategory = "Custom";

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function familyKey(program) {
  return `${program.name}|${program.phase}|${program.variant || standardProgramVariant}`;
}

function groupProgramFamilies(programs) {
  const map = new Map();
  for (const p of programs) {
    const key = familyKey(p);
    if (!map.has(key)) {
      map.set(key, {
        key,
        name: p.name,
        phase: p.phase,
        variant: p.variant || standardProgramVariant,
        byFrequency: new Map()
      });
    }
    map.get(key).byFrequency.set(Number(p.frequency), p);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.phase !== b.phase) return phaseOptions.indexOf(a.phase) - phaseOptions.indexOf(b.phase);
    if (a.variant !== b.variant) return a.variant.localeCompare(b.variant);
    return a.name.localeCompare(b.name);
  });
}

function phaseClass(phase) {
  return `phase-${phase ? phase.toLowerCase() : "default"}`;
}

// CSV columns match REQUIRED_COLUMNS in server/src/utils/csvImporter.js
// so an exported program round-trips cleanly through the existing
// importer. Order is preserved.
const PROGRAM_CSV_COLUMNS = [
  "program_id", "program_name", "program_phase", "program_variant",
  "program_frequency", "day_offset", "day_name", "block_label", "order",
  "lift_id", "exercise_name", "category", "sets", "reps", "weight", "notes"
];

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildProgramFamilyCsv(family, liftLibrary) {
  const byId = new Map((liftLibrary || []).map((l) => [l.id, l]));
  const programs = Array.from(family.byFrequency.values()).sort(
    (a, b) => Number(a.frequency) - Number(b.frequency)
  );
  const lines = [PROGRAM_CSV_COLUMNS.join(",")];
  for (const program of programs) {
    for (const day of program.days || []) {
      (day.lifts || []).forEach((lift, idx) => {
        const libLift = byId.get(lift.liftId);
        const row = {
          program_id: program.id,
          program_name: program.name,
          program_phase: program.phase,
          program_variant: program.variant || standardProgramVariant,
          program_frequency: program.frequency,
          day_offset: day.dayOffset,
          day_name: "",
          block_label: lift.blockLabel || "",
          order: idx + 1,
          lift_id: lift.liftId || "",
          exercise_name: libLift?.name || "",
          category: libLift?.category || "",
          sets: lift.sets,
          reps: lift.reps,
          weight: lift.weight || "",
          notes: lift.notes || ""
        };
        lines.push(PROGRAM_CSV_COLUMNS.map((c) => csvEscape(row[c])).join(","));
      });
    }
  }
  return lines.join("\n") + "\n";
}

function safeFilenamePart(value) {
  return String(value || "").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
}

function downloadProgramFamilyCsv(family, liftLibrary) {
  const csv = buildProgramFamilyCsv(family, liftLibrary);
  const name = safeFilenamePart(family.name) || "program";
  const variant = family.variant && family.variant !== standardProgramVariant
    ? `_${safeFilenamePart(family.variant)}`
    : "";
  const filename = `${name}${variant}.csv`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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
  return Array.from({ length: Number(frequency) }, (_, i) => createProgramDay(i));
}

function createProgramForm(seed = {}) {
  return {
    name: seed.name || "",
    phase: seed.phase || "Prep",
    variant: seed.variant || standardProgramVariant,
    frequency: Number(seed.frequency) || 3,
    days: seed.days || createDaysForFrequency(Number(seed.frequency) || 3)
  };
}

function programToForm(program) {
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

function createMiscLiftRow() {
  return createProgramLiftRow();
}

function createMiscForm() {
  return { name: "", lifts: [createMiscLiftRow()] };
}

function miscToForm(workout) {
  return {
    name: workout.name || "",
    lifts: (workout.lifts || []).map((lift) => ({
      liftId: lift.liftId || "",
      blockLabel: lift.blockLabel || "Block 1",
      exerciseName: lift.exerciseName || "",
      sets: String(lift.sets ?? "3"),
      reps: String(lift.reps ?? "5"),
      weight: lift.weight || "Bodyweight",
      notes: lift.notes || ""
    }))
  };
}

function summarizeMiscBlocks(workout) {
  const counts = new Map();
  for (const lift of workout.lifts || []) {
    const label = lift.blockLabel || "Block 1";
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => workoutPlacementOptions.indexOf(a[0]) - workoutPlacementOptions.indexOf(b[0]))
    .map(([label, count]) => `${label} (${count})`)
    .join(" · ");
}

export default function CoachWorkoutsPage() {
  const { token } = useAuth();
  const [library, setLibrary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [programSearch, setProgramSearch] = useState("");
  const [miscSearch, setMiscSearch] = useState("");
  const [liftSearch, setLiftSearch] = useState("");
  const [videoUploadingId, setVideoUploadingId] = useState(null);
  const [videoModal, setVideoModal] = useState({ liftId: null, name: "" });

  // Misc workout modal (single-day standalone workouts)
  const [miscModal, setMiscModal] = useState({ open: false, mode: "create", miscId: null });
  const [miscForm, setMiscForm] = useState(createMiscForm());
  const [miscError, setMiscError] = useState("");
  const [miscSubmitting, setMiscSubmitting] = useState(false);
  const [pendingMiscDelete, setPendingMiscDelete] = useState(null);
  const [miscDeleting, setMiscDeleting] = useState(false);
  const miscFocusRef = useRef(null);

  // Program modal
  const [programModal, setProgramModal] = useState({ open: false, mode: "create", programId: null });
  const [programForm, setProgramForm] = useState(createProgramForm());
  const [programError, setProgramError] = useState("");
  const [programSubmitting, setProgramSubmitting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Builder navigation
  const [editorView, setEditorView] = useState("days"); // "days" | "blocks"
  const [activeSegment, setActiveSegment] = useState(0); // active day index OR active block index
  const focusNextRowRef = useRef(null);

  // Pending-autosave handle so manual Save can cancel a queued PUT
  // before firing its own. Avoids a race where the older autosave
  // body overwrites the freshly-saved one.
  const programAutosaveRef = useRef(null);
  const miscAutosaveRef = useRef(null);

  // CSV import
  const csvInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [importReport, setImportReport] = useState(null);

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
    } catch (e) {
      if (e.name === "AbortError") return;
      setError(e.message);
    } finally {
      if (!signal || !signal.aborted) setLoading(false);
    }
  }

  const liftNameById = useMemo(
    () => new Map((library?.liftLibrary || []).map((l) => [l.id, l.name])),
    [library]
  );

  const liftByNormalizedName = useMemo(
    () => new Map((library?.liftLibrary || []).map((l) => [normalizeText(l.name), l])),
    [library]
  );

  const filteredPrograms = useMemo(() => {
    const programs = library?.programs || [];
    const q = programSearch.trim().toLowerCase();
    if (!q) return programs;
    return programs.filter((program) => {
      const dayText = (program.days || [])
        .flatMap((d) => d.lifts || [])
        .map((l) => l.exerciseName || liftNameById.get(l.liftId) || l.liftId)
        .join(" ")
        .toLowerCase();
      return [program.name, program.phase, program.variant, dayText]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [library, liftNameById, programSearch]);

  const families = useMemo(() => groupProgramFamilies(filteredPrograms), [filteredPrograms]);

  const filteredMisc = useMemo(() => {
    const workouts = library?.miscWorkouts || [];
    const q = miscSearch.trim().toLowerCase();
    const list = q
      ? workouts.filter((w) => {
          const liftText = (w.lifts || [])
            .map((l) => l.exerciseName || liftNameById.get(l.liftId) || l.liftId)
            .join(" ")
            .toLowerCase();
          return [w.name, liftText].filter(Boolean).join(" ").toLowerCase().includes(q);
        })
      : workouts;
    return list.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [library, liftNameById, miscSearch]);

  // ------- Misc workout handlers -------

  function openMiscCreate() {
    setMiscForm(createMiscForm());
    setMiscError("");
    setMiscModal({ open: true, mode: "create", miscId: null });
  }

  function openMiscEdit(workout) {
    setMiscForm(miscToForm(workout));
    setMiscError("");
    setMiscModal({ open: true, mode: "edit", miscId: workout.id });
  }

  function closeMiscModal({ skipFlush = false } = {}) {
    if (miscAutosaveRef.current) {
      clearTimeout(miscAutosaveRef.current);
      miscAutosaveRef.current = null;
    }
    if (!skipFlush && miscModal.mode === "edit" && miscModal.miscId) {
      const body = buildMiscBody();
      apiRequest(`/api/program-library/misc/${miscModal.miscId}`, {
        method: "PUT",
        token,
        body
      })
        .then((data) => {
          if (data?.library) setLibrary(data.library);
        })
        .catch(() => {});
    }
    setMiscModal({ open: false, mode: "create", miscId: null });
    setMiscForm(createMiscForm());
    setMiscError("");
  }

  function updateMiscLiftField(_dayIndex, liftIndex, field, value) {
    setMiscForm((cur) => ({
      ...cur,
      lifts: cur.lifts.map((l, i) => {
        if (i !== liftIndex) return l;
        if (field === "exerciseName") {
          const matched = liftByNormalizedName.get(normalizeText(value));
          return { ...l, exerciseName: value, liftId: matched?.id || "" };
        }
        return { ...l, [field]: value };
      })
    }));
  }

  function addMiscLift() {
    miscFocusRef.current = { dayIndex: 0 };
    setMiscForm((cur) => ({ ...cur, lifts: [...cur.lifts, createMiscLiftRow()] }));
  }

  function removeMiscLift(_dayIndex, liftIndex) {
    setMiscForm((cur) => ({ ...cur, lifts: cur.lifts.filter((_, i) => i !== liftIndex) }));
  }

  function moveMiscLift(_dayIndex, liftIndex, direction) {
    setMiscForm((cur) => {
      const target = liftIndex + direction;
      if (target < 0 || target >= cur.lifts.length) return cur;
      const nextLifts = cur.lifts.slice();
      [nextLifts[liftIndex], nextLifts[target]] = [nextLifts[target], nextLifts[liftIndex]];
      return { ...cur, lifts: nextLifts };
    });
  }

  function buildMiscBody() {
    return {
      name: miscForm.name.trim(),
      lifts: miscForm.lifts.map((lift) => {
        const trimmedName = lift.exerciseName.trim();
        const matched = liftByNormalizedName.get(normalizeText(trimmedName));
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
    };
  }

  function validateMiscForm() {
    if (!miscForm.name.trim()) return "Workout name is required.";
    if (miscForm.lifts.length === 0) return "Add at least one lift.";
    for (let liftIndex = 0; liftIndex < miscForm.lifts.length; liftIndex += 1) {
      const lift = miscForm.lifts[liftIndex];
      if (!lift.exerciseName.trim()) return `Lift ${liftIndex + 1}: exercise is required.`;
      if (Number(lift.sets) < 1 || Number(lift.reps) < 1) {
        return `Lift ${liftIndex + 1}: sets and reps must be at least 1.`;
      }
      if (!lift.weight.trim()) return `Lift ${liftIndex + 1}: weight is required.`;
    }
    return null;
  }

  async function handleSaveMisc(event) {
    event.preventDefault();
    setMiscError("");
    const isEdit = miscModal.mode === "edit";
    if (!isEdit) {
      const validationError = validateMiscForm();
      if (validationError) {
        setMiscError(validationError);
        return;
      }
    }
    if (miscAutosaveRef.current) {
      clearTimeout(miscAutosaveRef.current);
      miscAutosaveRef.current = null;
    }
    setMiscSubmitting(true);
    try {
      const body = buildMiscBody();
      const data = await apiRequest(
        isEdit ? `/api/program-library/misc/${miscModal.miscId}` : "/api/program-library/misc",
        { method: isEdit ? "PUT" : "POST", token, body }
      );
      if (!data?.library) throw new Error("Unexpected response from server.");
      setLibrary(data.library);
      closeMiscModal({ skipFlush: true });
      setToast(isEdit ? "Workout saved." : "Workout created.");
    } catch (e) {
      setMiscError(e.message);
    } finally {
      setMiscSubmitting(false);
    }
  }

  // Autosave misc workouts in edit mode. Tracked via miscAutosaveRef
  // so Save / close can cancel a queued PUT.
  useEffect(() => {
    if (!miscModal.open) return;
    if (miscModal.mode !== "edit") return;
    if (!miscModal.miscId) return;

    const timeout = setTimeout(async () => {
      miscAutosaveRef.current = null;
      try {
        const body = buildMiscBody();
        const data = await apiRequest(
          `/api/program-library/misc/${miscModal.miscId}`,
          { method: "PUT", token, body }
        );
        if (data?.library) setLibrary(data.library);
        setMiscError("");
      } catch (e) {
        setMiscError(e.message || "Autosave failed");
      }
    }, 500);
    miscAutosaveRef.current = timeout;

    return () => {
      clearTimeout(timeout);
      if (miscAutosaveRef.current === timeout) miscAutosaveRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [miscForm, miscModal.open, miscModal.mode, miscModal.miscId]);

  function requestMiscDelete() {
    if (miscModal.mode !== "edit") return;
    setPendingMiscDelete({ id: miscModal.miscId, name: miscForm.name });
  }

  async function confirmMiscDelete() {
    if (!pendingMiscDelete) return;
    setMiscDeleting(true);
    try {
      const data = await apiRequest(`/api/program-library/misc/${pendingMiscDelete.id}`, {
        method: "DELETE",
        token
      });
      if (data?.library) setLibrary(data.library);
      else await loadLibrary();
      setPendingMiscDelete(null);
      closeMiscModal();
      setToast("Workout deleted.");
    } catch (e) {
      setMiscError(e.message);
      setPendingMiscDelete(null);
    } finally {
      setMiscDeleting(false);
    }
  }

  // ------- Program modal handlers -------

  function openProgramCreate(seed = {}) {
    setProgramForm(createProgramForm(seed));
    setProgramError("");
    setEditorView("days");
    setActiveSegment(0);
    setProgramModal({ open: true, mode: "create", programId: null });
  }

  function openProgramEdit(program) {
    setProgramForm(programToForm(program));
    setProgramError("");
    setEditorView("days");
    setActiveSegment(0);
    setProgramModal({ open: true, mode: "edit", programId: program.id });
  }

  function closeProgramModal({ skipFlush = false } = {}) {
    // Flush any pending autosave so the 500ms debounce window can't
    // drop a final edit on close. Skipped after handleSaveProgram —
    // that path already PUT the latest body and a second PUT here
    // would just be a race.
    if (programAutosaveRef.current) {
      clearTimeout(programAutosaveRef.current);
      programAutosaveRef.current = null;
    }
    if (!skipFlush && programModal.mode === "edit" && programModal.programId) {
      const body = buildProgramBody();
      apiRequest(`/api/program-library/programs/${programModal.programId}`, {
        method: "PUT",
        token,
        body
      })
        .then((data) => {
          if (data?.library) setLibrary(data.library);
        })
        .catch(() => {});
    }
    setProgramModal({ open: false, mode: "create", programId: null });
    setProgramForm(createProgramForm());
    setProgramError("");
  }

  function openFamilyFrequency(family, frequency) {
    const existing = family.byFrequency.get(frequency);
    if (existing) {
      openProgramEdit(existing);
    } else {
      // Create a new program in the same family, prefilled.
      openProgramCreate({
        name: family.name,
        phase: family.phase,
        variant: family.variant,
        frequency
      });
    }
  }

  function updateProgramDay(dayIndex, updater) {
    setProgramForm((cur) => ({
      ...cur,
      days: cur.days.map((d, i) => (i === dayIndex ? updater(d) : d))
    }));
  }

  function handleFrequencyChange(value) {
    const nextFrequency = Number(value);
    setProgramForm((cur) => {
      const nextDays = createDaysForFrequency(nextFrequency).map((defaultDay, index) => {
        const existing = cur.days[index];
        return existing
          ? { ...existing, dayOffset: Number.isFinite(Number(existing.dayOffset)) ? Number(existing.dayOffset) : index }
          : defaultDay;
      });
      return { ...cur, frequency: nextFrequency, days: nextDays };
    });
    setActiveSegment(0);
  }

  function handleProgramPhaseChange(value) {
    setProgramForm((cur) => ({
      ...cur,
      phase: value,
      variant: value === "Eccentrics" ? eccentricProgramVariants[0] : standardProgramVariant
    }));
  }

  function addProgramLift(dayIndex) {
    focusNextRowRef.current = { dayIndex };
    updateProgramDay(dayIndex, (d) => ({ ...d, lifts: [...d.lifts, createProgramLiftRow()] }));
  }

  function removeProgramLift(dayIndex, liftIndex) {
    updateProgramDay(dayIndex, (d) => ({
      ...d,
      lifts: d.lifts.filter((_, i) => i !== liftIndex)
    }));
  }

  function moveProgramLift(dayIndex, liftIndex, direction) {
    updateProgramDay(dayIndex, (d) => {
      const target = liftIndex + direction;
      if (target < 0 || target >= d.lifts.length) return d;
      const nextLifts = d.lifts.slice();
      [nextLifts[liftIndex], nextLifts[target]] = [nextLifts[target], nextLifts[liftIndex]];
      return { ...d, lifts: nextLifts };
    });
  }

  function updateProgramLiftField(dayIndex, liftIndex, field, value) {
    updateProgramDay(dayIndex, (d) => ({
      ...d,
      lifts: d.lifts.map((l, i) => {
        if (i !== liftIndex) return l;
        if (field === "exerciseName") {
          const trimmed = value.trim();
          const matched = liftByNormalizedName.get(normalizeText(value));
          // Cases:
          //  - empty: preserve the existing liftId so an accidental
          //    clear doesn't strip the row's library reference and
          //    cause it to be dropped on save.
          //  - matched: lock to the matched library lift.
          //  - non-empty, no match: clear liftId so the server treats
          //    it as a new-lift declaration.
          const nextLiftId = !trimmed ? l.liftId : matched?.id || "";
          return { ...l, exerciseName: value, liftId: nextLiftId };
        }
        return { ...l, [field]: value };
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
          const matched = liftByNormalizedName.get(normalizeText(trimmedName));
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
          return `Day ${dayIndex + 1}, lift ${liftIndex + 1}: exercise name is required.`;
        }
        if (Number(lift.sets) < 1 || Number(lift.reps) < 1) {
          return `Day ${dayIndex + 1}, lift ${liftIndex + 1}: sets and reps must be at least 1.`;
        }
        if (!lift.weight.trim()) {
          return `Day ${dayIndex + 1}, lift ${liftIndex + 1}: weight is required.`;
        }
      }
    }
    return null;
  }

  async function handleSaveProgram(event) {
    event.preventDefault();
    setProgramError("");
    const isEdit = programModal.mode === "edit";
    if (!isEdit) {
      const validationError = validateProgramForm();
      if (validationError) {
        setProgramError(validationError);
        return;
      }
    }
    // Kill any queued autosave so a stale body can't land after our
    // explicit Save and erase the change.
    if (programAutosaveRef.current) {
      clearTimeout(programAutosaveRef.current);
      programAutosaveRef.current = null;
    }
    setProgramSubmitting(true);
    try {
      const body = buildProgramBody();
      const data = await apiRequest(
        isEdit
          ? `/api/program-library/programs/${programModal.programId}`
          : "/api/program-library/programs",
        { method: isEdit ? "PUT" : "POST", token, body }
      );
      if (!data?.library) throw new Error("Unexpected response from server.");
      setLibrary(data.library);
      closeProgramModal({ skipFlush: true });
      setToast(isEdit ? "Program saved." : "Program created.");
    } catch (e) {
      setProgramError(e.message);
    } finally {
      setProgramSubmitting(false);
    }
  }

  // Autosave the program in edit mode whenever the form changes.
  // Debounced PUT, tracked via programAutosaveRef so manual Save or
  // modal close can cancel a queued one and prevent a stale-body PUT
  // from clobbering a freshly-persisted state.
  useEffect(() => {
    if (!programModal.open) return;
    if (programModal.mode !== "edit") return;
    if (!programModal.programId) return;

    const timeout = setTimeout(async () => {
      programAutosaveRef.current = null;
      try {
        const body = buildProgramBody();
        const data = await apiRequest(
          `/api/program-library/programs/${programModal.programId}`,
          { method: "PUT", token, body }
        );
        if (data?.library) setLibrary(data.library);
        setProgramError("");
      } catch (e) {
        setProgramError(e.message || "Autosave failed");
      }
    }, 500);
    programAutosaveRef.current = timeout;

    return () => {
      clearTimeout(timeout);
      if (programAutosaveRef.current === timeout) programAutosaveRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programForm, programModal.open, programModal.mode, programModal.programId]);

  function requestProgramDelete(program) {
    setPendingDelete({ id: program.id, name: program.name });
  }

  async function confirmProgramDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const data = await apiRequest(`/api/program-library/programs/${pendingDelete.id}`, {
        method: "DELETE",
        token
      });
      if (data?.library) setLibrary(data.library);
      else await loadLibrary();
      setPendingDelete(null);
      setToast("Program deleted.");
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleting(false);
    }
  }

  async function handleImportCsvSelected(event) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setImportError("");
    setImportReport(null);
    setImporting(true);
    try {
      const content = await file.text();
      const data = await apiRequest("/api/program-library/csv-import", {
        method: "POST",
        token,
        body: { content }
      });
      if (data?.library) setLibrary(data.library);
      if (data?.importReport) setImportReport(data.importReport);
      setToast(
        `Imported ${data?.importReport?.programsImported?.length ?? 0} programs · ` +
        `+${data?.importReport?.liftsAdded ?? 0} new lifts`
      );
    } catch (e) {
      setImportError(e.message || "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  // ------- Lift video upload / delete / play -------

  function setLiftHasVideo(liftId, hasVideo) {
    setLibrary((cur) => {
      if (!cur) return cur;
      return {
        ...cur,
        liftLibrary: (cur.liftLibrary || []).map((l) =>
          l.id === liftId ? { ...l, hasVideo } : l
        )
      };
    });
  }

  async function handleVideoUpload(liftId, file) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".mp4")) {
      setError("Only .mp4 video files are supported.");
      return;
    }
    setVideoUploadingId(liftId);
    setError("");
    try {
      const form = new FormData();
      form.append("video", file);
      const response = await fetch(`${API_BASE_URL}/api/program-library/lifts/${liftId}/video`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form
      });
      if (!response.ok) {
        const text = await response.text();
        let message = text;
        try { message = JSON.parse(text).error || message; } catch { /* keep text */ }
        throw new Error(message || "Upload failed.");
      }
      setLiftHasVideo(liftId, true);
      setToast("Video uploaded.");
    } catch (e) {
      setError(e.message || "Upload failed.");
    } finally {
      setVideoUploadingId(null);
    }
  }

  async function handleVideoDelete(liftId) {
    setError("");
    try {
      await apiRequest(`/api/program-library/lifts/${liftId}/video`, {
        method: "DELETE",
        token
      });
      setLiftHasVideo(liftId, false);
      setToast("Video removed.");
    } catch (e) {
      setError(e.message || "Delete failed.");
    }
  }

  function openVideoModal(liftId, name) {
    setVideoModal({ liftId, name });
  }

  function closeVideoModal() {
    setVideoModal({ liftId: null, name: "" });
  }

  const filteredLifts = useMemo(() => {
    const lifts = library?.liftLibrary || [];
    const q = liftSearch.trim().toLowerCase();
    if (!q) return lifts;
    return lifts.filter(
      (l) =>
        (l.name || "").toLowerCase().includes(q) ||
        (l.category || "").toLowerCase().includes(q)
    );
  }, [library, liftSearch]);

  // ------- Render -------

  return (
    <div className="coach-page-stack">
      {toast ? <div className="dashboard-toast is-success">{toast}</div> : null}

      <section className="coach-page-header">
        <div>
          <p className="eyebrow">Workouts</p>
          <h2>Program library</h2>
        </div>
        <div className="header-action-row">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={handleImportCsvSelected}
          />
          <button
            className="ghost-button"
            type="button"
            onClick={() => csvInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? "Importing..." : "Import CSV"}
          </button>
          <button className="primary-button" type="button" onClick={() => openProgramCreate()}>
            New program
          </button>
        </div>
      </section>

      {importError ? (
        <p className="form-error">{importError}</p>
      ) : null}
      {importReport ? (
        <p className="muted-copy compact-copy">
          Imported {importReport.programsImported.length} program
          {importReport.programsImported.length === 1 ? "" : "s"}
          {" · "}+{importReport.liftsAdded} new lift
          {importReport.liftsAdded === 1 ? "" : "s"} ({importReport.liftsReused} reused
          {importReport.liftConflicts.length > 0
            ? `, ${importReport.liftConflicts.length} name conflict${importReport.liftConflicts.length === 1 ? "" : "s"}`
            : ""}
          ).
        </p>
      ) : null}

      <section className="dashboard-card">
        <div className="toolbar">
          <input
            className="search-input"
            type="search"
            placeholder="Search programs"
            value={programSearch}
            onChange={(event) => setProgramSearch(event.target.value)}
          />
        </div>

        {loading ? <p className="empty-state">Loading workouts...</p> : null}
        {error ? <p className="form-error">{error}</p> : null}

        {!loading && !error && families.length === 0 ? (
          <p className="empty-state">
            {programSearch ? "No programs match that search." : "No programs yet. Click New program to start."}
          </p>
        ) : null}

        {!loading && !error && families.length > 0 ? (
          <div className="program-family-grid">
            {families.map((family) => (
              <ProgramFamilyCard
                key={family.key}
                family={family}
                liftLibrary={library?.liftLibrary || []}
                onOpenFrequency={openFamilyFrequency}
              />
            ))}
          </div>
        ) : null}
      </section>

      <section className="dashboard-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Library</p>
            <h2>Exercise videos</h2>
            <p className="muted-copy compact-copy">
              Upload a demo clip for any lift (mp4, up to 50 MB). Athletes see a play icon next to the exercise in their weekly view.
            </p>
          </div>
        </div>

        <div className="toolbar">
          <input
            className="search-input"
            type="search"
            placeholder="Search exercises"
            value={liftSearch}
            onChange={(event) => setLiftSearch(event.target.value)}
          />
        </div>

        {loading ? (
          <p className="empty-state">Loading…</p>
        ) : filteredLifts.length === 0 ? (
          <p className="empty-state">
            {liftSearch ? `No exercises match "${liftSearch}".` : "No exercises in the library."}
          </p>
        ) : (
          <ul className="exercise-video-list">
            {filteredLifts.map((lift) => {
              const isUploading = videoUploadingId === lift.id;
              return (
                <li className="exercise-video-row" key={lift.id}>
                  <div className="exercise-video-meta">
                    <strong>{lift.name}</strong>
                    {lift.category ? (
                      <span className="muted-copy compact-copy">{lift.category}</span>
                    ) : null}
                  </div>
                  <div className="exercise-video-actions">
                    {lift.hasVideo ? (
                      <button
                        type="button"
                        className="ghost-button compact-button"
                        onClick={() => openVideoModal(lift.id, lift.name)}
                      >
                        ▶ Play
                      </button>
                    ) : null}
                    <label className={`exercise-video-upload ${isUploading ? "is-busy" : ""}`}>
                      <input
                        type="file"
                        accept="video/mp4,.mp4"
                        disabled={isUploading}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (file) handleVideoUpload(lift.id, file);
                        }}
                      />
                      {isUploading ? "Uploading…" : lift.hasVideo ? "Replace" : "Upload"}
                    </label>
                    {lift.hasVideo ? (
                      <button
                        type="button"
                        className="ghost-button compact-button"
                        onClick={() => handleVideoDelete(lift.id)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="dashboard-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Misc.</p>
            <h2>One-off workouts</h2>
            <p className="muted-copy compact-copy">
              Single-day sessions you can use on their own — testing days, fillers, anything that isn't part of a multi-week program.
            </p>
          </div>
          <button className="primary-button" type="button" onClick={openMiscCreate}>
            New misc workout
          </button>
        </div>

        <div className="toolbar">
          <input
            className="search-input"
            type="search"
            placeholder="Search misc workouts"
            value={miscSearch}
            onChange={(event) => setMiscSearch(event.target.value)}
          />
        </div>

        {filteredMisc.length === 0 ? (
          <p className="empty-state">
            {miscSearch
              ? "No misc workouts match that search."
              : "No misc workouts yet. Click New misc workout to build one."}
          </p>
        ) : (
          <div className="misc-workout-grid">
            {filteredMisc.map((workout) => (
              <article
                key={workout.id}
                className="misc-workout-card"
                onClick={() => openMiscEdit(workout)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openMiscEdit(workout);
                  }
                }}
              >
                <header className="misc-workout-card-header">
                  <h3>{workout.name}</h3>
                  <span className="status-badge">{(workout.lifts || []).length} lifts</span>
                </header>
                <p className="muted-copy compact-copy">{summarizeMiscBlocks(workout) || "—"}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      {miscModal.open ? (
        <MiscWorkoutModal
          mode={miscModal.mode}
          form={miscForm}
          library={library}
          liftByNormalizedName={liftByNormalizedName}
          focusNextRowRef={miscFocusRef}
          onFieldChange={(field, value) => setMiscForm((cur) => ({ ...cur, [field]: value }))}
          onUpdateLiftField={updateMiscLiftField}
          onAddLift={addMiscLift}
          onRemoveLift={removeMiscLift}
          onMoveLift={moveMiscLift}
          onSubmit={handleSaveMisc}
          onClose={closeMiscModal}
          onDelete={miscModal.mode === "edit" ? requestMiscDelete : null}
          error={miscError}
          submitting={miscSubmitting}
        />
      ) : null}

      {programModal.open ? (
        <ProgramFormModal
          mode={programModal.mode}
          form={programForm}
          editorView={editorView}
          setEditorView={(v) => {
            setEditorView(v);
            setActiveSegment(0);
          }}
          activeSegment={activeSegment}
          setActiveSegment={setActiveSegment}
          library={library}
          liftByNormalizedName={liftByNormalizedName}
          onFieldChange={(field, value) =>
            setProgramForm((cur) => ({ ...cur, [field]: value }))
          }
          onPhaseChange={handleProgramPhaseChange}
          onFrequencyChange={handleFrequencyChange}
          onUpdateDay={updateProgramDay}
          onUpdateLiftField={updateProgramLiftField}
          onAddLift={addProgramLift}
          onRemoveLift={removeProgramLift}
          onMoveLift={moveProgramLift}
          onDelete={
            programModal.mode === "edit"
              ? () =>
                  requestProgramDelete({
                    id: programModal.programId,
                    name: programForm.name
                  })
              : null
          }
          onSubmit={handleSaveProgram}
          onClose={closeProgramModal}
          error={programError}
          submitting={programSubmitting}
          focusNextRowRef={focusNextRowRef}
        />
      ) : null}

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Delete program"
        message={
          pendingDelete
            ? `Delete "${pendingDelete.name}"? Athletes whose week has already been applied won't change.`
            : ""
        }
        confirmLabel={deleting ? "Deleting..." : "Delete"}
        cancelLabel="Cancel"
        danger
        onConfirm={confirmProgramDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmModal
        open={Boolean(pendingMiscDelete)}
        title="Delete misc workout"
        message={
          pendingMiscDelete
            ? `Delete "${pendingMiscDelete.name}"? This removes it from the library — anything already assigned to an athlete is unaffected.`
            : ""
        }
        confirmLabel={miscDeleting ? "Deleting..." : "Delete"}
        cancelLabel="Cancel"
        danger
        onConfirm={confirmMiscDelete}
        onCancel={() => setPendingMiscDelete(null)}
      />

      {videoModal.liftId ? (
        <VideoModal
          liftId={videoModal.liftId}
          title={videoModal.name}
          onClose={closeVideoModal}
        />
      ) : null}
    </div>
  );
}

// ------- Components -------

function ProgramFamilyCard({ family, liftLibrary, onOpenFrequency }) {
  return (
    <article className={`program-family-card ${phaseClass(family.phase)}`}>
      <header className="program-family-card-header">
        <div>
          <h3 className="program-family-name">{family.name}</h3>
          <p className="muted-copy compact-copy">
            {family.phase}
            {family.variant && family.variant !== standardProgramVariant ? ` · ${family.variant}` : ""}
          </p>
        </div>
        <button
          type="button"
          className="program-family-download"
          onClick={() => downloadProgramFamilyCsv(family, liftLibrary)}
          aria-label={`Download ${family.name} as CSV`}
          title="Download as CSV"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
      </header>
      <div className="program-family-frequencies">
        {allFrequencies.map((freq) => {
          const exists = family.byFrequency.has(freq);
          return (
            <button
              key={freq}
              type="button"
              className={`program-family-freq ${exists ? "is-existing" : "is-empty"}`}
              onClick={() => onOpenFrequency(family, freq)}
              title={exists ? `Edit ${freq}-day version` : `Create a ${freq}-day version`}
            >
              {exists ? `${freq} days` : `+ ${freq} days`}
            </button>
          );
        })}
      </div>
    </article>
  );
}

function MiscWorkoutModal({
  mode,
  form,
  library,
  liftByNormalizedName,
  focusNextRowRef,
  onFieldChange,
  onUpdateLiftField,
  onAddLift,
  onRemoveLift,
  onMoveLift,
  onSubmit,
  onClose,
  onDelete,
  error,
  submitting
}) {
  const isEdit = mode === "edit";
  const entries = form.lifts.map((lift, liftIndex) => ({
    dayIndex: 0,
    liftIndex,
    lift,
    liftsInDay: form.lifts.length
  }));

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card modal-card-wide"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Misc. workout</p>
            <h2>{isEdit ? "Edit workout" : "New misc workout"}</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <form className="form-grid" onSubmit={onSubmit}>
          <label className="field">
            <span>Workout name</span>
            <input
              type="text"
              value={form.name}
              onChange={(event) => onFieldChange("name", event.target.value)}
              placeholder="e.g. Power testing day"
              required
              autoFocus
            />
          </label>

          <LiftTable
            entries={entries}
            library={library}
            liftByNormalizedName={liftByNormalizedName}
            onUpdateLiftField={onUpdateLiftField}
            onRemoveLift={onRemoveLift}
            onMoveLift={onMoveLift}
            showDayColumn={false}
            focusNextRowRef={focusNextRowRef}
          />

          <button type="button" className="ghost-button builder-add-lift" onClick={onAddLift}>
            + Add lift
          </button>

          {error ? <p className="form-error">{error}</p> : null}

          <div className="modal-actions program-modal-actions">
            {onDelete ? (
              <button className="ghost-button danger" type="button" onClick={onDelete}>
                Delete workout
              </button>
            ) : <span />}
            <div className="modal-actions-right">
              <button className="ghost-button" type="button" onClick={onClose}>
                Cancel
              </button>
              <button className="primary-button" type="submit" disabled={submitting}>
                {submitting ? (isEdit ? "Saving..." : "Creating...") : isEdit ? "Save workout" : "Create workout"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProgramFormModal(props) {
  const {
    mode,
    form,
    editorView,
    setEditorView,
    activeSegment,
    setActiveSegment,
    library,
    liftByNormalizedName,
    onFieldChange,
    onPhaseChange,
    onFrequencyChange,
    onUpdateDay,
    onUpdateLiftField,
    onAddLift,
    onRemoveLift,
    onMoveLift,
    onDelete,
    onSubmit,
    onClose,
    error,
    submitting,
    focusNextRowRef
  } = props;

  const title = mode === "edit" ? "Edit program" : "New program";
  const submitLabel = mode === "edit" ? "Save program" : "Create program";
  const savingLabel = mode === "edit" ? "Saving..." : "Creating...";

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card modal-card-wide"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Program builder</p>
            <h2>{title}</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <form className="form-grid" onSubmit={onSubmit}>
          <label className="field">
            <span>Program name</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => onFieldChange("name", e.target.value)}
              required
            />
          </label>

          <div className="inline-fields three-up">
            <label className="field">
              <span>Phase</span>
              <select value={form.phase} onChange={(e) => onPhaseChange(e.target.value)}>
                {phaseOptions.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Program type</span>
              <select
                value={form.variant}
                onChange={(e) => onFieldChange("variant", e.target.value)}
                disabled={form.phase !== "Eccentrics"}
              >
                {getVariantOptions(form.phase).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Frequency</span>
              <select value={form.frequency} onChange={(e) => onFrequencyChange(e.target.value)}>
                {allFrequencies.map((f) => <option key={f} value={f}>{f} days</option>)}
              </select>
            </label>
          </div>

          <ProgramBuilderBody
            form={form}
            editorView={editorView}
            setEditorView={setEditorView}
            activeSegment={activeSegment}
            setActiveSegment={setActiveSegment}
            library={library}
            liftByNormalizedName={liftByNormalizedName}
            onUpdateDay={onUpdateDay}
            onUpdateLiftField={onUpdateLiftField}
            onAddLift={onAddLift}
            onRemoveLift={onRemoveLift}
            onMoveLift={onMoveLift}
            focusNextRowRef={focusNextRowRef}
          />

          {error ? <p className="form-error">{error}</p> : null}

          <div className="modal-actions program-modal-actions">
            {onDelete ? (
              <button className="ghost-button danger" type="button" onClick={onDelete}>
                Delete program
              </button>
            ) : <span />}
            <div className="modal-actions-right">
              <button className="ghost-button" type="button" onClick={onClose}>
                Cancel
              </button>
              <button className="primary-button" type="submit" disabled={submitting}>
                {submitting ? savingLabel : submitLabel}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProgramBuilderBody({
  form,
  editorView,
  setEditorView,
  activeSegment,
  setActiveSegment,
  library,
  liftByNormalizedName,
  onUpdateDay,
  onUpdateLiftField,
  onAddLift,
  onRemoveLift,
  onMoveLift,
  focusNextRowRef
}) {
  // Compute segments: days[] in "days" view, populated blocks[] in "blocks" view.
  const daySegments = form.days.map((day, dayIndex) => ({
    key: `day-${dayIndex}`,
    label: `Day ${dayIndex + 1}`,
    entries: day.lifts.map((lift, liftIndex) => ({
      dayIndex,
      liftIndex,
      lift,
      liftsInDay: day.lifts.length
    }))
  }));

  const blockMap = new Map();
  for (const placement of workoutPlacementOptions) blockMap.set(placement, []);
  form.days.forEach((day, dayIndex) => {
    day.lifts.forEach((lift, liftIndex) => {
      const label = workoutPlacementOptions.includes(lift.blockLabel) ? lift.blockLabel : "Block 1";
      blockMap.get(label).push({ dayIndex, liftIndex, lift, liftsInDay: day.lifts.length });
    });
  });
  const blockSegments = Array.from(blockMap.entries())
    .filter(([, entries]) => entries.length > 0)
    .map(([label, entries]) => ({ key: `block-${label}`, label, entries }));

  const segments = editorView === "days" ? daySegments : blockSegments;
  const safeActive = Math.min(activeSegment, Math.max(0, segments.length - 1));
  const active = segments[safeActive] || null;

  return (
    <div className="builder-body">
      <div className="builder-toolbar">
        <div className="builder-view-toggle" role="tablist" aria-label="Editor view">
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

        <div className="builder-segment-tabs" role="tablist" aria-label={editorView === "days" ? "Days" : "Blocks"}>
          {segments.length === 0 ? (
            <span className="muted-copy compact-copy">No lifts assigned yet — use By day to add.</span>
          ) : (
            segments.map((seg, index) => (
              <button
                key={seg.key}
                type="button"
                role="tab"
                aria-selected={index === safeActive}
                className={`builder-segment-tab ${index === safeActive ? "is-active" : ""}`}
                onClick={() => setActiveSegment(index)}
              >
                {seg.label}
                <span className="builder-segment-tab-count">{seg.entries.length}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {active ? (
        <>
          {editorView === "days" ? (
            <DayHeader
              day={form.days[safeActive]}
              dayIndex={safeActive}
              onUpdateDay={onUpdateDay}
            />
          ) : null}

          <LiftTable
            entries={active.entries}
            library={library}
            liftByNormalizedName={liftByNormalizedName}
            onUpdateLiftField={onUpdateLiftField}
            onRemoveLift={onRemoveLift}
            onMoveLift={onMoveLift}
            showDayColumn={editorView === "blocks"}
            focusNextRowRef={focusNextRowRef}
          />

          {editorView === "days" ? (
            <button
              type="button"
              className="ghost-button builder-add-lift"
              onClick={() => onAddLift(safeActive)}
            >
              + Add lift
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function DayHeader({ day, dayIndex, onUpdateDay }) {
  return (
    <div className="builder-day-header">
      <label className="field compact-field">
        <span>Week position</span>
        <select
          value={day.dayOffset}
          onChange={(event) =>
            onUpdateDay(dayIndex, (current) => ({
              ...current,
              dayOffset: Number(event.target.value)
            }))
          }
        >
          {Array.from({ length: 7 }, (_, i) => (
            <option key={i} value={i}>Day {i + 1}</option>
          ))}
        </select>
      </label>
    </div>
  );
}


