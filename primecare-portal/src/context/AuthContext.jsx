import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getCurrentUser, loginUser, logoutUser } from "@/api/primecareApi";

const AuthContext = createContext(null);

const STORAGE_KEY = "primecare_auth_token";

/** Local Vite-only session marker; never sent to Apps Script (bootstrap skips API). */
const DEV_SESSION_PREFIX = "__PRIMECARE_DEV_SESSION__:";

function encodeDevSessionUser(user) {
  return DEV_SESSION_PREFIX + btoa(JSON.stringify(user));
}

function decodeDevSessionUser(token) {
  if (!token || !token.startsWith(DEV_SESSION_PREFIX)) return null;
  try {
    const raw = token.slice(DEV_SESSION_PREFIX.length);
    return JSON.parse(atob(raw));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [authToken, setAuthToken] = useState(localStorage.getItem(STORAGE_KEY) || "");
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  console.log("🔵 AuthProvider INIT", {
    storedToken: localStorage.getItem(STORAGE_KEY),
    authToken,
  });

  const bootstrapUser = async (token) => {
    try {
      console.log("🟡 bootstrapUser START", { token });

      if (!token) {
        console.log("⚠️ No token found, clearing user");
        setCurrentUser(null);
        return;
      }

      if (import.meta.env.DEV === true) {
        const devUser = decodeDevSessionUser(token);
        if (devUser) {
          console.log("🧪 Dev session bootstrap (no Apps Script)", { userId: devUser.userId });
          setCurrentUser(devUser);
          return;
        }
      }

      const res = await getCurrentUser({ sessionToken: token });

      console.log("🟢 getCurrentUser RESPONSE", res);

      if (!res?.success || !res?.authenticated) {
        console.log("❌ User not authenticated, clearing session");
        localStorage.removeItem(STORAGE_KEY);
        setAuthToken("");
        setCurrentUser(null);
        return;
      }

      console.log("✅ User authenticated", res.user);
      setCurrentUser(res.user || null);
    } catch (err) {
      console.error("🔥 Failed to bootstrap current user", err);
      localStorage.removeItem(STORAGE_KEY);
      setAuthToken("");
      setCurrentUser(null);
    }
  };

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      try {
        console.log("🔄 Auth bootstrap triggered", { authToken });
        setAuthLoading(true);
        await bootstrapUser(authToken);
      } finally {
        if (mounted) {
          console.log("✅ Auth bootstrap complete");
          setAuthLoading(false);
        }
      }
    };

    run();

    return () => {
      mounted = false;
    };
  }, [authToken]);

  const applyDevLocalSession = useCallback((user) => {
    if (import.meta.env.DEV !== true) return;

    const token = encodeDevSessionUser(user);
    localStorage.setItem(STORAGE_KEY, token);
    setAuthToken(token);
    setCurrentUser(user);
  }, []);

  const devLoginLocalAdmin = useCallback(() => {
    applyDevLocalSession({
      userId: "admin001",
      id: "admin001",
      userName: "Admin User",
      name: "Admin User",
      role: "ADMIN",
      email: "admin@primecare.local",
      tenantId: "6fe055e2-e05d-423b-8e39-26138f2045d6",
      labId: "",
      agentName: "",
      assignedArea: "",
      defaultPage: "dashboard",
    });
  }, [applyDevLocalSession]);

  const devLoginLocalAgent = useCallback(() => {
    applyDevLocalSession({
      userId: "agent001",
      id: "agent001",
      userName: "Kumar",
      name: "Kumar",
      role: "AGENT",
      email: "agent@primecare.local",
      tenantId: "6fe055e2-e05d-423b-8e39-26138f2045d6",
      labId: "",
      agentName: "Kumar",
      assignedArea: "",
      defaultPage: "dashboard",
    });
  }, [applyDevLocalSession]);

  const devLoginLocalLab = useCallback(() => {
    applyDevLocalSession({
      userId: "lab001",
      id: "lab001",
      userName: "ABC Lab",
      name: "ABC Lab",
      role: "LAB",
      email: "lab@primecare.local",
      labId: "LAB_001",
      tenantId: "6fe055e2-e05d-423b-8e39-26138f2045d6",
      agentName: "",
      assignedArea: "",
      defaultPage: "labOrders",
    });
  }, [applyDevLocalSession]);

  const devLoginLocalExecutive = useCallback(() => {
    applyDevLocalSession({
      userId: "exec001",
      id: "exec001",
      userName: "Exec User",
      name: "Exec User",
      role: "EXECUTIVE",
      email: "executive@primecare.local",
      tenantId: "6fe055e2-e05d-423b-8e39-26138f2045d6",
      labId: "",
      agentName: "",
      assignedArea: "",
      defaultPage: "dashboard",
    });
  }, [applyDevLocalSession]);

  const login = async ({ loginId, password }) => {
    console.log("🔐 LOGIN START", { loginId });

    const res = await loginUser({ loginId, password });

    console.log("🟢 loginUser RESPONSE", res);

    if (!res?.success || !res?.sessionToken) {
      console.log("❌ Login failed condition hit");
      throw new Error(res?.message || "Login failed");
    }

    console.log("💾 Saving session token", res.sessionToken);

    localStorage.setItem(STORAGE_KEY, res.sessionToken);
    setAuthToken(res.sessionToken);
    setCurrentUser(res.user || null);

    console.log("✅ LOGIN SUCCESS", {
      token: res.sessionToken,
      user: res.user,
    });

    return res;
  };

  const signOut = async () => {
    console.log("🚪 LOGOUT START");

    try {
      const isDevSession =
        import.meta.env.DEV === true && authToken && decodeDevSessionUser(authToken);

      if (authToken && !isDevSession) {
        await logoutUser({ sessionToken: authToken });
      }
    } catch (err) {
      console.error("❌ Logout request failed", err);
    } finally {
      console.log("🧹 Clearing auth state");
      localStorage.removeItem(STORAGE_KEY);
      setAuthToken("");
      setCurrentUser(null);
    }
  };

  const value = useMemo(() => {
    console.log("📦 AuthContext VALUE UPDATED", {
      authToken,
      currentUser,
      authLoading,
    });

    return {
      authToken,
      user: currentUser,
      currentUser,
      loading: authLoading,
      authLoading,
      isAuthenticated: !!currentUser,
      login,
      devLoginLocalAdmin,
      devLoginLocalAgent,
      devLoginLocalLab,
      devLoginLocalExecutive,
      signOut,
      logout: signOut,
    };
  }, [
    authToken,
    currentUser,
    authLoading,
    devLoginLocalAdmin,
    devLoginLocalAgent,
    devLoginLocalLab,
    devLoginLocalExecutive,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}