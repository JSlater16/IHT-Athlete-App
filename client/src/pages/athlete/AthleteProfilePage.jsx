import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../lib/api";
import { formatCalendarDate, formatDateTime } from "../../utils/date";

export default function AthleteProfilePage() {
  const { token } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
        </>
      ) : null}
    </div>
  );
}
