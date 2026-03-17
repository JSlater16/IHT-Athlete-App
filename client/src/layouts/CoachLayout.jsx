import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

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

        <nav className="sidebar-nav">
          <NavLink to="/dashboard/athletes" className={({ isActive }) => sidebarLinkClass(isActive)}>
            Athletes
          </NavLink>
          <NavLink to="/dashboard/workouts" className={({ isActive }) => sidebarLinkClass(isActive)}>
            Workouts
          </NavLink>
          <NavLink to="/dashboard/amit" className={({ isActive }) => sidebarLinkClass(isActive)}>
            AMIT
          </NavLink>
          {user?.role === "OWNER" ? (
            <NavLink to="/dashboard/staff" className={({ isActive }) => sidebarLinkClass(isActive)}>
 