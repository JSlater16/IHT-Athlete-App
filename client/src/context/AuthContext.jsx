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

  const value = useMemo(
    () => ({
      token: session?.token || "",
      user: session?.user || null,
      isAuthenticated: Boolean(session?.token),
      async login(email, password) {
        const data = await apiRequest("/api/auth/login", {
          method: "POST",
          body: { email, password }
        });

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
