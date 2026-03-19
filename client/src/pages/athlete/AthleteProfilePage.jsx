import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../lib/api";
import { formatCalendarDate, formatDateTime } from "../../utils/date";

export default function AthleteProfilePage() {
  const { token } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      setLoading(true);
      setError("");

      try {
        const data = await apiRequest("/api/me/profile", { token });
        setProfile(data.profile);
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [token]);

  useEffect(() => {
    if (!passwordSuccess) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setPasswordSuccess(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [passwordSuccess]);

  async function handleChangePassword(event) {
    event.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");

    if (!passwordForm.currentPassword) {
      setPasswordError("Current password is required.");
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    setPasswordSubmitting(true);

    try {
      await apiRequest("/api/me/change-password", {
        method: "PUT",
        token,
        body: {
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        }
      });
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
      });
      setPasswordSuccess("Password updated successfully.");
    } catch (submitError) {
      setPasswordError(submitError.message);
    } finally {
      setPasswordSubmitting(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="ios-card hero-card">
        <div>
          <p className="eyebrow">Profile</p>
          <h2>Your training profile</h2>
        </div>
        <p className="muted-copy">This section is read-only and reflects what your coach has set.</p>
      </section>

      {loading ? <p className="empty-state">Loading profile...</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {profile ? (
        <>
          <section className="ios-card profile-card">
            <div className="avatar-placeholder">{profile.name.charAt(0)}</div>
            <div>
              <h2>{profile.name}</h2>
              <p className="profile-subtle">{profile.email}</p>
            </div>
            <span className="phase-badge">{profile.phase}</span>
          </section>

          <section className="ios-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Phase Timeline</p>
                <h2>{profile.trainingModel} progression</h2>
              </div>
            </div>

            {profile.phaseTimeline?.isStandardPhase ? (
              <>
                <div className="program-summary-grid">
                  <span className="metric-chip">{profile.phaseTimeline.weeksPerPhase} weeks per phase</span>
                  <span className="metric-chip">Week {profile.phaseTimeline.weekOfPhase || 1}</span>
                  <span className="metric-chip">{profile.programmingDays} days per week</span>
                  {profile.programVariant && profile.programVariant !== "Standard" ? (
                    <span className="metric-chip">{profile.programVariant}</span>
                  ) : null}
                </div>
                <p className="muted-copy">
                  In phase since {formatCalendarDate(profile.phaseStartedAt)}. Expected phase end{" "}
                  {formatCalendarDate(profile.phaseTimeline.expectedPhaseEndAt)}.
                </p>
              </>
            ) : (
              <p className="muted-copy">
                Rehab sits outside the standard Prep, Eccentrics, Iso, Power, Speed progression.
              </p>
            )}
          </section>

          <section className="ios-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Coach Notes</p>
                <h2>Current guidance</h2>
              </div>
            </div>
            <p className="notes-block">{profile.coachNotes || "No coach notes available yet."}</p>
            <p className="profile-subtle">Last updated {formatDateTime(profile.updatedAt)}</p>
          </section>

          <section className="ios-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Security</p>
                <h2>Change password</h2>
              </div>
            </div>
            <p className="muted-copy">Update your password here without needing your coach to reset it.</p>

            <form className="form-grid" onSubmit={handleChangePassword}>
              <label className="field">
                <span>Current password</span>
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({
                      ...current,
                      currentPassword: event.target.value
                    }))
                  }
                  required
                />
              </label>

              <label className="field">
                <span>New password</span>
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({
                      ...current,
                      newPassword: event.target.value
                    }))
                  }
                  minLength={8}
                  required
                />
              </label>

              <label className="field">
                <span>Confirm new password</span>
                <input
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) =>
                    setPasswordForm((current) => ({
                      ...current,
                      confirmPassword: event.target.value
                    }))
                  }
                  minLength={8}
                  required
                />
              </label>

              {passwordError ? <p className="form-error">{passwordError}</p> : null}
              {passwordSuccess ? <p className="form-success">{passwordSuccess}</p> : null}

              <button className="primary-button" type="submit" disabled={passwordSubmitting}>
                {passwordSubmitting ? "Updating..." : "Save New Password"}
              </button>
            </form>
          </section>
        </>
      ) : null}
    </div>
  );
}
