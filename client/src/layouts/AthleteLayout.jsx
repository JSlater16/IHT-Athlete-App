import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { HomeIcon, ProfileIcon, ForceDecksIcon, LeaderboardIcon } from "../components/icons";

const tabs = [
  { to: "/athlete/home", label: "Home", Icon: HomeIcon },
  { to: "/athlete/forcedecks", label: "ForceDecks", Icon: ForceDecksIcon },
  { to: "/athlete/leaderboard", label: "Boards", Icon: LeaderboardIcon },
  { to: "/athlete/profile", label: "Profile", Icon: ProfileIcon }
];

export default function AthleteLayout() {
  const { logout, user } = useAuth();

  return (
    <div className="athlete-app-shell">
      <div className="athlete-device-frame">
        <header className="athlete-topbar">
          <div className="brand-inline">
            <img className="brand-logo small" src="/iht-logo.png" alt="IHT Performance logo" />
            <div className="brand-inline-copy">
              <p className="eyebrow">IHT Performance Athlete App</p>
              <h1>{user?.name || "Athlete"}</h1>
            </div>
          </div>
          <div className="athlete-topbar-actions">
            <button className="ghost-button" type="button" onClick={logout}>
              Log out
            </button>
          </div>
        </header>

        <main className="athlete-main">
          <Outlet />
        </main>

        <nav className="ios-tabbar" aria-label="Athlete navigation">
          {tabs.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => tabClass(isActive)}>
              <Icon className="tab-icon" />
              <span className="tab-label">{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

function tabClass(isActive) {
  return `ios-tab ${isActive ? "is-active" : ""}`;
}
