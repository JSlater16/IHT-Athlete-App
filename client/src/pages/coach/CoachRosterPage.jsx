import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../lib/api";
import { formatDateTime } from "../../utils/date";

function createEmptyAthleteForm() {
  return {
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    phase: "Prep",
    trainingModel: "10-Week",
    programmingDays: 3,
    programVariant: "Standard"
  };
}

export default function CoachRosterPage() {
  const { token } = useAuth();
  const [athletes, setAthletes] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState(createEmptyAthleteForm());
  const [createError, setCreateError] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [resetAthlete, setResetAthlete] = useState(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);

  useEffect(() => {
    loadRoster();
  }, [token]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function loadRoster() {
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest("/api/athletes", { token });
      setAthletes(data.athletes);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  const filteredAthletes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return athletes;
    }

    return athletes.filter((athlete) => {
      return athlete.name.toLowerCase().includes(query) || athlete.phase.toLowerCase().includes(query);
    });
  }, [athletes, search]);

  function closeCreateModal() {
    setIsCreateModalOpen(false);
    setCreateForm(createEmptyAthleteForm());
    setCreateError("");
    setCreateSubmitting(false);
  }

  async function handleCreateAthlete(event) {
    event.preventDefault();
    setCreateError("");

    if (!createForm.name.trim()) {
      setCreateError("Athlete name is required.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createForm.email.trim())) {
      setCreateError("Enter a valid athlete email.");
      return;
    }

    if (createForm.password.length < 8) {
      setCreateError("Password must be at least 8 characters.");
      return;
    }

    if (createForm.password !== createForm.confirmPassword) {
      setCreateError("Passwords do not match.");
      return;
    }

    setCreateSubmitting(true);

    try {
      await apiRequest("/api/athletes", {
        method: "POST",
        token,
        body: {
          name: createForm.name.trim(),
          email: createForm.email.trim(),
          password: createForm.password,
          phase: createForm.phase,
          trainingModel: createForm.trainingModel,
          programmingDays: Number(createForm.programmingDays),
          programVariant: createForm.programVariant
        }
      });
      closeCreateModal();
      await loadRoster();
      setToast("Athlete created.");
    } catch (submitError) {
      setCreateError(submitError.message);
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handleDeleteAthlete(athlete) {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${athlete.name}? This will remove their profile, lifts, and rehab notes.`
    );

    if (!confirmed) {
      return;
    }

    try {
      await apiRequest(`/api/athletes/${athlete.id}`, {
        method: "DELETE",
        token
      });
      await loadRoster();
      setToast("Athlete deleted.");
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  function openResetModal(athlete) {
    setResetAthlete(athlete);
    setResetPassword("");
    setResetError("");
    setResetSubmitting(false);
  }

  function closeResetModal() {
    setResetAthlete(null);
    setResetPassword("");
    setResetError("");
    setResetSubmitting(false);
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    setResetError("");

    if (resetPassword.length < 8) {
      setResetError("Temporary password must be at least 8 characters.");
      return;
    }

    setResetSubmitting(true);

    try {
      await apiRequest(`/api/athletes/${resetAthlete.id}/reset-password`, {
        method: "PUT",
        token,
        body: { password: resetPassword }
      });
      closeResetModal();
      setToast("Athlete password updated. Share it securely.");
    } catch (submitError) {
      setResetError(submitError.message);
    } finally {
      setResetSubmitting(false);
    }
  }

  return (
    <div className="coach-page-stack">
      {toast ? <div className="dashboard-toast is-success">{toast}</div> : null}

      <section className="coach-page-header">
        <div>
          <p className="eyebrow">Athletes</p>
          <h2>All athletes</h2>
          <p className="muted-copy">Search the athlete list and jump into each athlete profile.</p>
        </div>
        <button className="primary-button" type="button" onClick={() => setIsCreateModalOpen(true)}>
          Add Athlete
        </button>
      </section>

      <section className="dashboard-card">
        <div className="toolbar">
          <input
            className="search-input"
            type="search"
            placeholder="Search by athlete or phase"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {loading ? <p className="empty-state">Loading roster...</p> : null}
        {error ? <p className="form-error">{error}</p> : null}

        {!loading && !error ? (
          <div className="table-wrap">
            <table className="roster-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phase</th>
                  <th>Last Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAthletes.map((athlete) => (
                  <tr key={athlete.id}>
                    <td>
                      <div className="table-name-cell">
                        <span className="avatar-mini">{athlete.name.charAt(0)}</span>
                        <div>
                          <strong>{athlete.name}</strong>
                          <span>{athlete.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="phase-badge">{athlete.phase}</span>
                    </td>
                    <td>{formatDateTime(athlete.updatedAt)}</td>
                    <td>
                      <div className="staff-actions">
                        <Link className="inline-link-button" to={`/dashboard/athletes/${athlete.id}`}>
                          Edit
                        </Link>
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => openResetModal(athlete)}
                        >
                          Reset Password
                        </button>
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => handleDeleteAthlete(athlete)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredAthletes.length === 0 ? (
              <p className="empty-state">No athletes match that search.</p>
            ) : null}
          </div>
        ) : null}
      </section>

      {isCreateModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeCreateModal}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">New Athlete</p>
                <h2>Create athlete account</h2>
              </div>
              <button className="ghost-button" type="button" onClick={closeCreateModal}>
                Close
              </button>
            </div>

            <form className="form-grid" onSubmit={handleCreateAthlete}>
              <label className="field">
                <span>Name</span>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                  required
                />
              </label>

              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                  required
                />
              </label>

              <div className="inline-fields three-up">
                <label className="field">
                  <span>Phase</span>
                  <select
                    value={createForm.phase}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        phase: event.target.value,
                        programVariant: event.target.value === "Eccentrics" ? current.programVariant : "Standard"
                      }))
                    }
                  >
                    <option value="Rehab">Rehab</option>
                    <option value="Prep">Prep</option>
                    <option value="Eccentrics">Eccentrics</option>
                    <option value="Iso">Iso</option>
                    <option value="Power">Power</option>
                    <option value="Speed">Speed</option>
                  </select>
                </label>

                <label className="field">
                  <span>Training model</span>
                  <select
                    value={createForm.trainingModel}
                    onChange={(event) =>
                      setCreateForm((current) => ({ ...current, trainingModel: event.target.value }))
                    }
                  >
                    <option value="10-Week">10-Week</option>
                    <option value="20-Week">20-Week</option>
                  </select>
                </label>

                <label className="field">
                  <span>Days per week</span>
                  <select
                    value={createForm.programmingDays}
                    onChange={(event) =>
                      setCreateForm((current) => ({
                        ...current,
                        programmingDays: Number(event.target.value)
                      }))
                    }
                  >
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                    <option value={5}>5</option>
                  </select>
                </label>
              </div>

              <label className="field">
                <span>Program type</span>
                <select
                  value={createForm.programVariant}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, programVariant: event.target.value }))
                  }
                >
                  {createForm.phase === "Eccentrics" ? (
                    <>
                      <option value="Alactic Eccentrics">Alactic Eccentrics</option>
                      <option value="Lactic Eccentrics">Lactic Eccentrics</option>
                    </>
                  ) : (
                    <option value="Standard">Standard</option>
                  )}
                </select>
              </label>

              <label className="field">
                <span>Temporary password</span>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, password: event.target.value }))
                  }
                  minLength={8}
                  required
                />
              </label>

              <label className="field">
                <span>Confirm password</span>
                <input
                  type="password"
                  value={createForm.confirmPassword}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, confirmPassword: event.target.value }))
                  }
                  minLength={8}
                  required
                />
              </label>

              {createError ? <p className="form-error">{createError}</p> : null}

              <div className="modal-actions">
                <button className="ghost-button" type="button" onClick={closeCreateModal}>
                  Cancel
                </button>
                <button className="primary-button" type="submit" disabled={createSubmitting}>
                  {createSubmitting ? "Creating..." : "Create Athlete"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {resetAthlete ? (
        <div className="modal-backdrop" role="presentation" onClick={closeResetModal}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">Athlete Access</p>
                <h2>Reset password</h2>
              </div>
              <button className="ghost-button" type="button" onClick={closeResetModal}>
                Close
              </button>
            </div>

            <p className="muted-copy">
              Set a new temporary password for {resetAthlete.name}. They will use it the next time they sign in.
            </p>

            <form className="form-grid" onSubmit={handleResetPassword}>
              <label className="field">
                <span>Temporary password</span>
                <input
                  type="password"
                  value={resetPassword}
                  onChange={(event) => setResetPassword(event.target.value)}
                  minLength={8}
                  required
                />
              </label>

              {resetError ? <p className="form-error">{resetError}</p> : null}

              <div className="modal-actions">
                <button className="ghost-button" type="button" onClick={closeResetModal}>
                  Cancel
                </button>
                <button className="primary-button" type="submit" disabled={resetSubmitting}>
                  {resetSubmitting ? "Updating..." : "Save Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
