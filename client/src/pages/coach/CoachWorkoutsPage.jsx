import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { apiRequest } from "../../lib/api";

function countProgramLifts(program) {
  return (program.days || []).reduce((total, day) => total + (day.lifts || []).length, 0);
}

export default function CoachWorkoutsPage() {
  const { token } = useAuth();
  const [library, setLibrary] = useState(null);
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
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

    loadLibrary();
  }, [token]);

  const liftNameById = useMemo(() => {
    return new Map((library?.liftLibrary || []).map((lift) => [lift.id, lift.name]));
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
        .map((lift) => liftNameById.get(lift.liftId) || lift.liftId)
        .join(" ")
        .toLowerCase();

      return [
        program.name,
        program.phase,
        program.variant,
        `${program.frequency} day`,
        dayText
      ]
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

  return (
    <div className="coach-page-stack">
      <section className="coach-page-header">
        <div>
          <p className="eyebrow">Workouts</p>
          <h2>Program library</h2>
          <p className="muted-copy">Browse every imported template by phase, variant, and frequency.</p>
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
                                  {liftNameById.get(lift.liftId) || lift.liftId}
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
    </div>
  );
}
