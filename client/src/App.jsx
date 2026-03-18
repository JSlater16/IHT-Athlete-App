import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import RequireAuth from "./components/RequireAuth";
import AthleteLayout from "./layouts/AthleteLayout";
import CoachLayout from "./layouts/CoachLayout";
import LoginPage from "./pages/LoginPage";
import AthleteHomePage from "./pages/athlete/AthleteHomePage";
import AthleteHistoryPage from "./pages/athlete/AthleteHistoryPage";
import AthleteProfilePage from "./pages/athlete/AthleteProfilePage";
import CoachRosterPage from "./pages/coach/CoachRosterPage";
import CoachAthleteProfilePage from "./pages/coach/CoachAthleteProfilePage";
import CoachWorkoutsPage from "./pages/coach/CoachWorkoutsPage";
import CoachAmitPage from "./pages/coach/CoachAmitPage";
import CoachStaffPage from "./pages/coach/CoachStaffPage";

function HomeRedirect() {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === "COACH") {
    return <Navigate to="/dashboard" replace />;
  }

  if (user.role === "OWNER") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Navigate to="/athlete/home" replace />;
}

function LegacyCoachRedirect() {
  const location = useLocation();
  return <Navigate to={location.pathname.replace(/^\/coach/, "/dashboard") || "/dashboard"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/athlete"
        element={
          <RequireAuth role="ATHLETE">
            <AthleteLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="home" replace />} />
        <Route path="home" element={<AthleteHomePage />} />
        <Route path="history" element={<AthleteHistoryPage />} />
        <Route path="profile" element={<AthleteProfilePage />} />
      </Route>

      <Route
        pa