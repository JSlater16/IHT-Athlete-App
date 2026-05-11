import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../lib/api";

const AuthContext = createContext(null);
const STORAGE_KEY = "liftlab-session";

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch (_error) {
      return null;
    }
  });

  useEffect(() => {
    if (session) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [session]);

  useEffect(() => {
    function handleInvalidAuth() {
      setSession(null);
    }

    window.addEventListener("app:auth-invalid", handleInvalidAuth);
    return () => window.removeEventListener("app:auth-invalid", handleInvalidAuth);
  }, []);

  const value = useMemo(
    () => ({
      token: session?.token || "",
      user: session?.user || null,
      isAuthenticated: Boolean(session?.token),
      async login(email, password, expectedRoles = []) {
        const data = await apiRequest("/api/auth/login", {
          method: "POST",
          body: { email, password },
          skipAuthRedirect: true
        });

        const roles = Array.isArray(expectedRoles) ? expectedRoles : expectedRoles ? [expectedRoles] : [];
        if (roles.length > 0 && !roles.includes(data.user?.role)) {
          if (roles.length === 1 && roles[0] === "ATHLETE") {
            throw new Error("This login is for athletes only.");
          }

          throw new Error("This login is for coaches only.");
        }

        setSession(data);
        return data;
      },
      logout() {
        setSession(null);
      }
    }),
    [session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
