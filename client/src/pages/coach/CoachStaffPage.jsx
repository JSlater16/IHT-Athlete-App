import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../lib/api";
import { formatDateTime } from "../../utils/date";

function createEmptyCoachForm() {
  return {
    name: "",
    email: "",
    password: "",
    confirmPassword: ""
  };
}

export default function CoachStaffPage() {
  const { token } = useAuth();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState(createEmptyCoachForm());
  const [createError, setCreateError] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [resetCoach, setResetCoach] = useState(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);

  useEffect(() => {
    loadStaff();
  }, [token]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function loadStaff() {
    setLoading(true);
    setError("");

    try {
      const data = await apiRequest("/api/staff", { token });
      setStaff(data.staff);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  function closeCreateModal() {
    setIsCreateModalOpen(false);
    setCreateForm(createEmptyCoachForm());
    setCreateError("");
    setCreateSubmitting(false);
  }

  async function handleCreateCoach(event) {
    event.preventDefault();
    setCreateError("");

    if (!createForm.name.trim()) {
      setCreateError("Name is required.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createForm.email.trim())) {
      setCreateError("Enter a valid email address.");
      return;
    }

    if (createForm.password.length < 8) {
      setCreateError("Temporary password must be at least 8 characters.");
      return;
    }

    if (createForm.password !== createForm.confirmPassword) {
      setCreateError("Passwords do not match.");
      return;
    }

    setCreateSubmitting(true);

    try {
      await apiRequest("/api/staff", {
        method: "POST",
        token,
        body: {
          name: createForm.name.trim(),
          email: createForm.email.trim(),
          password: createForm.password
        }
      });
      closeCreateModal();
      await loadStaff();
      setToast("Coach account created successfully.");
    } catch (submitError) {
      setCreateError(submitError.message);
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handleToggleActive(member) {
    if (member.isActive) {
      const confirmed = window.confirm(
        `Are you sure you want to deactivate ${member.name}? They will lose access immediately.`
      );

      if (!confirmed) {
        return;
      }
    }

    try {
      await apiRequest(`/api/staff/${member.id}/${member.isActive ? "deactivate" : "reactivate"}`, {
        method: "PUT",
        token
      });
      await loadStaff();
      setToast(member.isActive ? "Coach deactivated." : "Coach reactivated.");
    } catch (toggleError) {
      setError(toggleError.message);
    }
  }

  function openResetModal(member) {
    setResetCoach(member);
    setResetPassword("");
    setResetError("");
    setResetSubmitting(false);
  }

  function closeResetModal() {
    setResetCoach(null);
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
      await apiRequest(`/api/staff/${resetCoach.id}/reset-password`, {
        method: "PUT",
        token,
        body: { password: resetPassword }
      });
      closeResetModal();
      setToast("Password updated. Make sure to share it securely.");
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
          <p className="eyebrow">Owner Controls</p>
          <h2>Staff Management</h2>
          <p className="muted-copy">Create, deactivate, reactivate, and reset passwords for coaches.</p>
        </div>

        <button className="primary-button" type="button" onClick={() => setIsCreateModalOpen(true)}>
          Add New Coach
        </button>
      </section>

      <section className="dashboard-card">
        {loading ? <p className="empty-state">Loading staff...</p> : null}
        {error ? <p className="form-error">{error}</p> : null}

        {!loading && !error ? (
          <div className="table-wrap">
            <table className="roster-table staff-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Date Added</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => (
                  <tr key={member.id} className={!member.isActive ? "is-inactive" : ""}>
                    <td>
                      <div className="table-name-cell">
                        <span className="avatar-mini">{member.name.charAt(0)}</span>
                        <div>
                          <strong>{member.name}</strong>
                          <span>{member.role}</span>
                        </div>
                      </div>
                    </td>
                    <td>{member.email}</td>
                    <td>
                      <span className={`status-badge ${member.isActive ? "" : "is-inactive"}`}>
                        {member.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>{formatDateTime(member.createdAt)}</td>
                    <td>
                      <div className="staff-actions">
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => openResetModal(member)}
                        >
                          Reset Password
                        </button>
                        <button
                          className="inline-link-button"
                          type="button"
                          onClick={() => handleToggleActive(member)}
                        >
                          {member.isActive ? "Deactivate" : "Reactivate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {staff.length === 0 ? <p className="empty-state">No coaches have been added yet.</p> : null}
          </div>
        ) : null}
      </section>

      {isCreateModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeCreateModal}>
          <div className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <div>
                <p className="eyebrow">New Staff Member</p>
                <h2>Create coach account</h2>
              </div>
              <button className="ghost-button" type="button" onClick={closeCreateModal}>
                Close
              </button>
            </div>

            <form className="form-grid" onSubmit={handleCreateCoach}>
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
                  {createSubmitting ? "Creating..." : "Create Coach Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {resetCoach ? (
        <div className="modal-backdrop" role="presentation" onClick={closeResetModal}>
          <div
            className="modal-card modal-card-small"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">Password Reset</p>
                <h2>{resetCoach.name}</h2>
              </div>
              <button className="ghost-button" type="button" onClick={closeResetModal}>
                Close
              </button>
            </div>

            <form className="form-grid" onSubmit={handleResetPassword}>
              <label className="field">
                <span>New temporary password</span>
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
                  {resetSubmitting ? "Saving..." : "Save Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
