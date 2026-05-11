import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiRequest } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import ForcedecksDashboard from "../../components/forcedecks/ForcedecksDashboard";
import HexChartModal from "../../components/forcedecks/HexChartModal";

// Coach drill-down: dashboard for one specific athlete. Header shows
// the athlete's name + a back link to the roster, plus a button that
// opens the hex-chart modal (latest test vs PR).
export default function CoachForceDecksAthletePage() {
  const { athleteId } = useParams();
  const { token } = useAuth();
  const [name, setName] = useState("");
  const [hexOpen, setHexOpen] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    apiRequest(`/api/forcedecks/athletes/${athleteId}?limit=1`, { token, signal: ctrl.signal })
      .then((data) => setName(data?.name || ""))
      .catch((err) => {
        if (err.name !== "AbortError") setName("");
      });
    return () => ctrl.abort();
  }, [athleteId, token]);

  return (
    <>
      <ForcedecksDashboard
        scope="coach"
        athleteId={athleteId}
        headerSlot={
          <header className="fd-page-header">
            <div>
              <Link to="/dashboard/forcedecks" className="fd-back-link">
                ← Roster
              </Link>
              <h1 className="fd-page-title">{name || "Athlete"}</h1>
              <p className="fd-page-sub">Full coach view — all metrics, latest session, trend.</p>
            </div>
            <div className="fd-page-actions">
              <button
                type="button"
                className="fd-report-button"
                onClick={() => setHexOpen(true)}
              >
                View Hex Chart
              </button>
            </div>
          </header>
        }
      />

      <HexChartModal
        open={hexOpen}
        athleteId={athleteId}
        athleteName={name || "Athlete"}
        onClose={() => setHexOpen(false)}
      />
    </>
  );
}
