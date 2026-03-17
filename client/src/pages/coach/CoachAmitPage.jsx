import { useMemo, useState } from "react";
import { amitMuscles } from "../../data/amitMuscles";

export default function CoachAmitPage() {
  const [search, setSearch] = useState("");

  const filteredMuscles = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return amitMuscles;
    }

    return amitMuscles.filter((muscle) => muscle.toLowerCase().includes(query));
  }, [search]);

  const groupedMuscles = useMemo(() => {
    const groups = new Map();

    for (const muscle of filteredMuscles) {
      const key = muscle.charAt(0).toUpperCase();

      if (!groups.has(key)) {
        groups.set(key, []);
      }

      groups.get(key).push(muscle);
    }

    return Array.from(groups.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [filteredMuscles]);

  return (
    <div className="coach-page-stack">
      <section className="coach-page-header">
        <div>
          <p className="eyebrow">AMIT</p>
          <h2>Muscle reference</h2>
          <p className="muted-copy">Search the full AMIT muscle list used in the rehab workflow.</p>
        </div>
      </section>

      <section className="dashboard-card">
        <div className="toolbar">
          <input
            className="search-input"
            type="search"
            placeholder="Search AMIT muscles"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <span className="metric-chip">{filteredMuscles.length} muscles</span>
        </div>

        {groupedMuscles.length === 0 ? (
          <p className="empty-state">No muscles match that search.</p>
        ) : (
          <div className="amit-group-stack">
            {groupedMuscles.map(([letter, muscles]) => (
              <section key={letter} className="lift-block-group">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Section</p>
                    <h3>{letter}</h3>
                  </div>
                  <span className="phase-badge">{muscles.length} entries</span>
                </div>

                <div className="amit-muscle-grid">
                  {muscles.map((muscle) => (
                    <article key={muscle} className="coach-library-card amit-muscle-card">
                      <strong>{muscle}</strong>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
