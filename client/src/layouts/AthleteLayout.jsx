import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

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

        <nav className="ios-tabbar">
          <NavLink to="/athlete/home" className={({ isActive }) => tabClass(isActive)}>
            <span className="tab-icon">Home</span>
          </NavLink>
          <NavLink to="/athlete/history" className={({ isActive }) => tabClass(isActive)}>
            <span className="tab-icon">History</span>
          </NavLink>
          <NavLink to="/athlete/profile" className={({ isActive }) => tabClass(isActive)}>
            <span className="tab-icon">Profile</span>
          </NavLink>
        </nav>
      </div>
    </div>
  );
}

function tabClass(isActive) {
  return `ios-tab ${isActive ? "is-active" : ""}`;
}
