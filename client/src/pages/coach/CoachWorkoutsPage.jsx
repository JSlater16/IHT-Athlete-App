import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../lib/api";
import ConfirmModal from "../../components/ConfirmModal";

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

function createLiftForm() {
  return {
    name: "",
    category: "",
    defaultSets: "3",
    defaultReps: "5",
    defaultWeight: "Bodyweight",
    defaultNotes: ""
  };
}

function liftToForm(lift) {
  return {
    name: lift.name || "",
    category: lift.category || "",
    defaultSets: String(lift.defaultSets ?? "3"),
    defaultReps: String(lift.defaultReps ?? "5"),
    defaultWeight: lift.defaultWeight || "",
    defaultNotes: lift.defaultNotes || ""
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

function summarizeLiftDefault(lift) {
  return `${lift.defaultSets}×${lift.defaultReps} • ${lift.defaultWeight}`;
}

export default function CoachWorkoutsPage() {
  const { token } = useAuth();
  const [library, setLibrary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [programSearch, setProgramSearch] = useState("");
  const [liftSearch, setLiftSearch] = useState("");

  // Lift modal (create or edit a single library lift)
  const [liftModal, setLiftModal] = useState({ open: false, mode: "create", liftId: null });
  const [liftForm, setLiftForm] = useState(createLiftForm());
  const [liftFormError, setLiftFormError] = useState("");
  const [liftSubmitting, setLiftSubmitting] = useState(false);
  const [pendingLiftDelete, setPendingLiftDelete] = useState(null);
  const [liftDeleting, setLiftDeleting] = useState(false);

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

  const filteredLifts = useMemo(() => {
    const lifts = library?.liftLibrary || [];
    const q = liftSearch.trim().toLowerCase();
    const list = q
      ? lifts.filter((l) =>
          [l.name, l.category, l.defaultWeight, l.defaultNotes]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q)
        )
      : lifts;
    return list.slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [library, liftSearch]);

  // ------- Lift modal handlers -------

  function openLiftCreate() {
    setLiftForm(createLiftForm());
    setLiftFormError("");
    setLiftModal({ open: true, mode: "create", liftId: null });
  }

  function openLiftEdit(lift) {
    setLiftForm(liftToForm(lift));
    setLiftFormError("");
    setLiftModal({ open: true, mode: "edit", liftId: lift.id });
  }

  function closeLiftModal() {
    setLiftModal({ open: false, mode: "create", liftId: null });
    setLiftForm(createLiftForm());
    setLiftFormError("");
  }

  async function handleSaveLift(event) {
    event.preventDefault();
    setLiftFormError("");

    if (!liftForm.name.trim()) return setLiftFormError("Lift name is required.");
    if (!liftForm.category.trim()) return setLiftFormError("Category is required.");
    if (Number(liftForm.defaultSets) < 1 || Number(liftForm.defaultReps) < 1) {
      return setLiftFormError("Sets and reps must be at least 1.");
    }
    if (!liftForm.defaultWeight.trim()) return setLiftFormError("Default weight is required.");

    setLiftSubmitting(true);
    try {
      const body = {
        name: liftForm.name.trim(),
        category: liftForm.category.trim(),
        defaultSets: Number(liftForm.defaultSets),
        defaultReps: Number(liftForm.defaultReps),
        defaultWeight: liftForm.defaultWeight.trim(),
        defaultNotes: liftForm.defaultNotes.trim()
      };
      const isEdit = liftModal.mode === "edit";
      const data = await apiRequest(
        isEdit ? `/api/program-library/lifts/${liftModal.liftId}` : "/api/program-library/lifts",
        { method: isEdit ? "PUT" : "POST", token, body }
      );
      if (!data?.library) throw new Error("Unexpected response from server.");
      setLibrary(data.library);
      closeLiftModal();
      setToast(isEdit ? "Lift updated." : "Lift added.");
    } catch (e) {
      setLiftFormError(e.message);
    } finally {
      setLiftSubmitting(false);
    }
  }

  function requestLiftDelete(lift) {
    setPendingLiftDelete({ id: lift.id, name: lift.name });
  }

  async function confirmLiftDelete() {
    if (!pendingLiftDelete) return;
    setLiftDeleting(true);
    try {
      const data = await apiRequest(`/api/program-library/lifts/${pendingLiftDelete.id}`, {
        method: "DELETE",
        token
      });
      if (data?.library) setLibrary(data.library);
      else await loadLibrary();
      setPendingLiftDelete(null);
      setToast("Lift removed.");
    } catch (e) {
      setLiftFormError(e.message);
      setPendingLiftDelete(null);
    } finally {
      setLiftDeleting(false);
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

  function closeProgramModal() {
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
          const matched = liftByNormalizedName.get(normalizeText(value));
          return { ...l, exerciseName: value, liftId: matched?.id || "" };
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
      closeProgramModal();
      setToast(isEdit ? "Program saved." : "Program created.");
    } catch (e) {
      setProgramError(e.message);
    } finally {
      setProgramSubmitting(false);
    }
  }

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
          <button className="primary-button" type="button" onClick={() => openProgramCreate()}>
            New program
          </button>
        </div>
      </section>

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
                onOpenFrequency={openFamilyFrequency}
              />
            ))}
          </div>
        ) : null}
      </section>

      <section className="dashboard-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Misc.</p>
            <h2>Lift library</h2>
            <p className="muted-copy compact-copy">
              Individual lifts you can drop into any program — one-offs, accessories, custom variations.
            </p>
          </div>
          <button className="primary-button" type="button" onClick={openLiftCreate}>
            New lift
          </button>
        </div>

        <div className="toolbar">
          <input
            className="search-input"
            type="search"
            placeholder="Search lifts"
            value={liftSearch}
            onChange={(event) => setLiftSearch(event.target.value)}
          />
        </div>

        {filteredLifts.length === 0 ? (
          <p className="empty-state">
            {liftSearch ? "No lifts match that search." : "No lifts in the library yet."}
          </p>
        ) : (
          <ul className="misc-lift-list">
            {filteredLifts.map((lift) => (
              <li key={lift.id} className="misc-lift-row">
                <div className="misc-lift-main">
                  <strong>{lift.name}</strong>
                  <span className="muted-copy compact-copy">{lift.category}</span>
                </div>
                <span className="muted-copy compact-copy misc-lift-default">
                  {summarizeLiftDefault(lift)}
                </span>
                <div className="misc-lift-actions">
                  <button className="ghost-button" type="button" onClick={() => openLiftEdit(lift)}>
                    Edit
                  </button>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => requestLiftDelete(lift)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {liftModal.open ? (
        <LiftFormModal
          mode={liftModal.mode}
          form={liftForm}
          onChange={setLiftForm}
          onSubmit={handleSaveLift}
          onClose={closeLiftModal}
          error={liftFormError}
          submitting={liftSubmitting}
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
        open={Boolean(pendingLiftDelete)}
        title="Delete lift"
        message={
          pendingLiftDelete
            ? `Remove "${pendingLiftDelete.name}" from the library? If any program still uses it the delete will be blocked.`
            : ""
        }
        confirmLabel={liftDeleting ? "Removing..." : "Delete"}
        cancelLabel="Cancel"
        danger
        onConfirm={confirmLiftDelete}
        onCancel={() => setPendingLiftDelete(null)}
      />
    </div>
  );
}

// ------- Components -------

function ProgramFamilyCard({ family, onOpenFrequency }) {
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

function LiftFormModal({ mode, form, onChange, onSubmit, onClose, error, submitting }) {
  const isEdit = mode === "edit";
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Lift library</p>
            <h2>{isEdit ? "Edit lift" : "New lift"}</h2>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <form className="form-grid" onSubmit={onSubmit}>
          <label className="field">
            <span>Lift name</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => onChange((cur) => ({ ...cur, name: e.target.value }))}
              required
              autoFocus
            />
          </label>

          <label className="field">
            <span>Category</span>
            <input
              type="text"
              value={form.category}
              onChange={(e) => onChange((cur) => ({ ...cur, category: e.target.value }))}
              required
            />
          </label>

          <div className="inline-fields three-up">
            <label className="field">
              <span>Default sets</span>
              <input
                type="number"
                min="1"
                value={form.defaultSets}
                onChange={(e) => onChange((cur) => ({ ...cur, defaultSets: e.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>Default reps</span>
              <input
                type="number"
                min="1"
                value={form.defaultReps}
                onChange={(e) => onChange((cur) => ({ ...cur, defaultReps: e.target.value }))}
                required
              />
            </label>
            <label className="field">
              <span>Default weight</span>
              <input
                type="text"
                value={form.defaultWeight}
                onChange={(e) => onChange((cur) => ({ ...cur, defaultWeight: e.target.value }))}
                required
              />
            </label>
          </div>

          <label className="field">
            <span>Default notes</span>
            <textarea
              rows="3"
              value={form.defaultNotes}
              onChange={(e) => onChange((cur) => ({ ...cur, defaultNotes: e.target.value }))}
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}

          <div className="modal-actions">
            <button className="ghost-button" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? (isEdit ? "Saving..." : "Adding...") : isEdit ? "Save lift" : "Add lift"}
            </button>
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

function LiftTable({
  entries,
  library,
  liftByNormalizedName,
  onUpdateLiftField,
  onRemoveLift,
  onMoveLift,
  showDayColumn,
  focusNextRowRef
}) {
  // When a new row was just added, focus its Exercise input on next render.
  const lastEntryKey = entries.length > 0 ? `${entries[entries.length - 1].dayIndex}-${entries[entries.length - 1].liftIndex}` : "";
  const exerciseInputsRef = useRef({});

  useEffect(() => {
    const target = focusNextRowRef.current;
    if (!target) return;
    const last = entries[entries.length - 1];
    if (last && last.dayIndex === target.dayIndex) {
      const key = `${last.dayIndex}-${last.liftIndex}`;
      const input = exerciseInputsRef.current[key];
      if (input) input.focus();
    }
    focusNextRowRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEntryKey]);

  if (entries.length === 0) {
    return <p className="empty-state">No lifts in this view yet.</p>;
  }

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
            <th>Notes</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {entries.map(({ dayIndex, liftIndex, lift, liftsInDay }) => {
            const rowKey = `${dayIndex}-${liftIndex}`;
            const matched = liftByNormalizedName.get(normalizeText(lift.exerciseName));
            const willCreate = lift.exerciseName.trim() && !matched;
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
                    onChange={(e) => onUpdateLiftField(dayIndex, liftIndex, "blockLabel", e.target.value)}
                  >
                    {workoutPlacementOptions.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
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
                    onChange={(e) => onUpdateLiftField(dayIndex, liftIndex, "exerciseName", e.target.value)}
                    placeholder="Type or pick"
                    required
                  />
                  <datalist id={`builder-lifts-${rowKey}`}>
                    {(library?.liftLibrary || []).map((l) => (
                      <option key={l.id} value={l.name} />
                    ))}
                  </datalist>
                  {willCreate ? (
                    <span className="muted-copy compact-copy lift-table-newlift-hint">
                      New library lift on save
                    </span>
                  ) : null}
                </td>
                <td>
                  <input
                    type="number"
                    min="1"
                    className="lift-table-input lift-table-num"
                    value={lift.sets}
                    onChange={(e) => onUpdateLiftField(dayIndex, liftIndex, "sets", e.target.value)}
                    required
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="1"
                    className="lift-table-input lift-table-num"
                    value={lift.reps}
                    onChange={(e) => onUpdateLiftField(dayIndex, liftIndex, "reps", e.target.value)}
                    required
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="lift-table-input"
                    value={lift.weight}
                    onChange={(e) => onUpdateLiftField(dayIndex, liftIndex, "weight", e.target.value)}
                    required
                  />
                </td>
                <td className="lift-table-notes">
                  <input
                    type="text"
                    className="lift-table-input"
                    value={lift.notes}
                    onChange={(e) => onUpdateLiftField(dayIndex, liftIndex, "notes", e.target.value)}
                    placeholder="—"
                  />
                </td>
                <td className="lift-table-actions">
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
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

