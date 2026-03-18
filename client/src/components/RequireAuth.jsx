import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RequireAuth({ children, role }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const allowedRoles = Array.isArray(role) ? role : role ? [role] : [];

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <Navigate to={getHomePath(user)} replace />;
  }

  return children;
}

function getHomePath(user) {
  if (user?.role === "COACH" || user?.role === "OWNER") {
    return "/dashboard";
  }

  return "/athlete/home";
}
