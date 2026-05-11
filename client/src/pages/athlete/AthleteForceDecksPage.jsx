import ForcedecksDashboard from "../../components/forcedecks/ForcedecksDashboard";

export default function AthleteForceDecksPage() {
  return (
    <ForcedecksDashboard
      scope="self"
      headerSlot={
        <header className="fd-page-header">
          <div>
            <h1 className="fd-page-title">ForceDecks</h1>
            <p className="fd-page-sub">Readiness, jump output, and your trend across recent sessions.</p>
          </div>
        </header>
      }
    />
  );
}
