"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCoachData } from "@/lib/coach-data";
import { getAthleteStatus } from "@/lib/training";

export default function CoachDashboardPage() {
  const router = useRouter();
  const { roster, notesByAthlete, createBlankAthlete } = useCoachData();

  function handleAddAthlete() {
    const athlete = createBlankAthlete();
    router.push(`/coach/athlete/${athlete.id}`);
  }

  return (
    <main className="dashboard-shell">
      <section className="dashboard-panel dashboard-hero">
        <div className="brand-lockup">
          <div className="logo-badge">
            <Image src="/iht-logo.png" alt="IHT logo" width={54} height={37} className="brand-logo" priority />
          </div>
          <div>
            <p className="eyebrow">IHT Coach Backend</p>
            <h1>Open an athlete to edit their full profile and programming on a dedicated page.</h1>
          </div>
        </div>
        <Link className="ghost-button" href="/">
          Athlete View
        </Link>
      </section>

      <section className="dashboard-grid dashboard-grid-single">
        <div className="dashboard-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Roster</p>
              <h2>Active athletes</h2>
            </div>
            <div className="header-actions">
              <span className="pill">{roster.length} athletes</span>
              <button className="primary-button" type="button" onClick={handleAddAthlete}>
                Add athlete
              </button>
            </div>
          </div>

          <div className="coach-list">
            {roster.map((athlete) => {
              const status = getAthleteStatus(athlete);
              const note = notesByAthlete[athlete.id] ?? "No notes yet.";

              return (
                <Link className="coach-card coach-card-link" href={`/coach/athlete/${athlete.id}`} key={athlete.id}>
                  <div className="coach-row">
                    <div>
                      <h3>{athlete.name}</h3>
                      <p>{athlete.team}</p>
                    </div>
                    <span className="pill">Open</span>
                  </div>

                  <div className="coach-metrics">
                    <div>
                      <span>Current phase</span>
                      <strong>{athlete.currentPhase}</strong>
                    </div>
                    <div>
                      <span>Programming</span>
                      <strong>{athlete.programmingDays} days / week</strong>
                    </div>
                    <div>
                      <span>Days in phase</span>
                      <strong>{status.daysInPhase}</strong>
                    </div>
                    <div>
                      <span>Review flag</span>
                      <strong>{status.needsReview ? "Needs attention" : "On track"}</strong>
                    </div>
                  </div>

                  <p className="coach-note">{note}</p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
