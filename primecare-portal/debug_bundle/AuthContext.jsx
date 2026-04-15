import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getCurrentUser, loginUser, logoutUser } from "@/api/primecareApi";

const AuthContext = createContext(null);

const STORAGE_KEY = "primecare_auth_token";

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
      if (authToken) {
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
      signOut,
      logout: signOut,
    };
  }, [authToken, currentUser, authLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}