import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { AthletesIcon, WorkoutsIcon, AmitIcon, StaffIcon, AuditIcon } from "../components/icons";
import InstallAppButton from "../components/InstallAppButton";

export default function CoachLayout() {
  const { logout, user } = useAuth();

  return (
    <div className="coach-shell">
      <aside className="coach-sidebar">
        <div>
          <div className="brand-inline sidebar-brand">
            <img className="brand-logo" src="/iht-logo.png" alt="IHT Performance logo" />
            <div className="brand-inline-copy">
              <p className="eyebrow">IHT Performance</p>
              <h1 className="sidebar-title">Coach Dashboard</h1>
            </div>
          </div>
          <p className="sidebar-copy">Manage athletes, workouts, AMIT references, rehab notes, and staff.</p>
        </div>

        <nav className="sidebar-nav" aria-label="Coach navigation">
          <NavLink to="/dashboard/athletes" className={({ isActive }) => sidebarLinkClass(isActive)}>
            <AthletesIcon className="sidebar-icon" />
            <span>Athletes</span>
          </NavLink>
          <NavLink to="/dashboard/workouts" className={({ isActive }) => sidebarLinkClass(isActive)}>
            <WorkoutsIcon className="sidebar-icon" />
            <span>Workouts</span>
          </NavLink>
          <NavLink to="/dashboard/amit" className={({ isActive }) => sidebarLinkClass(isActive)}>
            <AmitIcon className="sidebar-icon" />
            <span>AMIT</span>
          </NavLink>
          {user?.role === "OWNER" ? (
            <>
              <NavLink to="/dashboard/staff" className={({ isActive }) => sidebarLinkClass(isActive)}>
                <StaffIcon className="sidebar-icon" />
                <span>Staff</span>
              </NavLink>
              <NavLink to="/dashboard/audit" className={({ isActive }) => sidebarLinkClass(isActive)}>
                <AuditIcon className="sidebar-icon" />
                <span>Audit</span>
              </NavLink>
            </>
          ) : null}
        </nav>

        <div className="sidebar-footer">
          <p className="sidebar-user">{user?.name}</p>
          {user?.role === "COACH" || user?.role === "OWNER" ? <InstallAppButton /> : null}
          <button className="ghost-button" type="button" onClick={logout}>
            Log out
          </button>
        </div>
      </aside>

      <main className="coach-main">
        <Outlet />
      </main>
    </div>
  );
}

function sidebarLinkClass(isActive) {
  return `sidebar-link ${isActive ? "is-active" : ""}`;
}
