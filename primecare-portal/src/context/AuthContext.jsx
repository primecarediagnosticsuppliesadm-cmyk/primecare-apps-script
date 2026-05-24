import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getCurrentUser, loginUser, logoutUser } from "@/api/primecareApi";
import { supabase } from "@/api/supabaseClient";
import { ALLOW_LEGACY_APPS_SCRIPT, REQUIRE_SUPABASE_AUTH } from "@/config/environment";

const AuthContext = createContext(null);

const STORAGE_KEY = "primecare_auth_token";
const VALID_ROLES = new Set(["admin", "executive", "agent", "lab"]);

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

function normalizeRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return VALID_ROLES.has(normalized) ? normalized : null;
}

function buildUserFromProfile(sessionUser, profile) {
  const role = normalizeRole(profile?.role);
  if (!profile) {
    throw new Error("Your PrimeCare profile is missing. Contact an administrator.");
  }
  if (profile.active !== true) {
    throw new Error("Your PrimeCare profile is inactive. Contact an administrator.");
  }
  if (!role) {
    throw new Error("Your PrimeCare role is not authorized for pilot access.");
  }

  const name =
    profile.agent_name ||
    sessionUser?.user_metadata?.name ||
    sessionUser?.email ||
    "PrimeCare User";

  return {
    id: sessionUser.id,
    userId: sessionUser.id,
    userName: name,
    name,
    email: sessionUser.email || "",
    role,
    tenantId: profile.tenant_id,
    tenant_id: profile.tenant_id,
    labId: profile.lab_id || "",
    lab_id: profile.lab_id || "",
    agentId: profile.agent_id || "",
    agent_id: profile.agent_id || "",
    agentName: profile.agent_name || "",
    active: profile.active === true,
    defaultPage: role === "lab" ? "labOrders" : "dashboard",
    authSource: "supabase",
  };
}

export function AuthProvider({ children }) {
  const useSupabaseAuth = Boolean(supabase) && REQUIRE_SUPABASE_AUTH;
  const [authToken, setAuthToken] = useState(
    import.meta.env.DEV === true ? localStorage.getItem(STORAGE_KEY) || "" : ""
  );
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  const applySupabaseSession = useCallback(async (session) => {
    setAuthError("");

    if (!session?.user) {
      setAuthToken("");
      setCurrentUser(null);
      return;
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("user_id, tenant_id, role, lab_id, agent_id, agent_name, active")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "Failed to load PrimeCare profile.");
    }

    const user = buildUserFromProfile(session.user, profile);
    setAuthToken(session.access_token || "");
    setCurrentUser((prev) => {
      if (!prev) return user;
      if (
        prev.id === user.id &&
        prev.role === user.role &&
        prev.tenantId === user.tenantId &&
        prev.agentId === user.agentId &&
        prev.agentName === user.agentName &&
        prev.labId === user.labId &&
        prev.email === user.email
      ) {
        return prev;
      }
      return user;
    });
  }, []);

  const bootstrapUser = useCallback(async (token) => {
    try {
      if (!token) {
        setCurrentUser(null);
        return;
      }

      if (import.meta.env.DEV === true) {
        const devUser = decodeDevSessionUser(token);
        if (devUser) {
          setCurrentUser(devUser);
          return;
        }
      }

      const res = await getCurrentUser({ sessionToken: token });

      if (!res?.success || !res?.authenticated) {
        localStorage.removeItem(STORAGE_KEY);
        setAuthToken("");
        setCurrentUser(null);
        return;
      }

      setCurrentUser(res.user || null);
    } catch (err) {
      console.error("Failed to bootstrap legacy current user", err);
      localStorage.removeItem(STORAGE_KEY);
      setAuthToken("");
      setCurrentUser(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      try {
        setAuthLoading(true);
        setAuthError("");

        if (useSupabaseAuth) {
          localStorage.removeItem(STORAGE_KEY);
          const { data, error } = await supabase.auth.getSession();
          if (error) throw new Error(error.message || "Failed to restore Supabase session.");
          await applySupabaseSession(data?.session || null);
          return;
        }

        if (REQUIRE_SUPABASE_AUTH) {
          throw new Error("Supabase Auth is required for PrimeCare pilot access.");
        }

        if (!ALLOW_LEGACY_APPS_SCRIPT) {
          throw new Error("Legacy Apps Script auth is disabled in this environment.");
        }

        await bootstrapUser(authToken);
      } catch (err) {
        console.error("Auth bootstrap failed", err);
        setAuthError(err?.message || "Authentication failed.");
        setCurrentUser(null);
        setAuthToken("");
      } finally {
        if (mounted) {
          setAuthLoading(false);
        }
      }
    };

    run();

    return () => {
      mounted = false;
    };
  }, [applySupabaseSession, authToken, bootstrapUser, useSupabaseAuth]);

  useEffect(() => {
    if (!useSupabaseAuth) return undefined;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED") {
        if (session?.access_token) {
          setAuthToken(session.access_token);
        }
        return;
      }

      applySupabaseSession(session).catch(async (err) => {
        console.error("Supabase auth state rejected", err);
        setAuthError(err?.message || "Authentication failed.");
        setAuthToken("");
        setCurrentUser(null);
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [applySupabaseSession, useSupabaseAuth]);

  const applyDevLocalSession = useCallback((user) => {
    if (import.meta.env.DEV !== true || !ALLOW_LEGACY_APPS_SCRIPT) return;

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

  const login = useCallback(async ({ loginId, password }) => {
    setAuthError("");

    if (useSupabaseAuth) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginId,
        password,
      });

      if (error) {
        throw new Error(error.message || "Login failed");
      }

      await applySupabaseSession(data?.session || null);
      return { success: true };
    }

    if (REQUIRE_SUPABASE_AUTH) {
      throw new Error("Supabase Auth is required for PrimeCare pilot access.");
    }

    if (!ALLOW_LEGACY_APPS_SCRIPT) {
      throw new Error("Legacy Apps Script auth is disabled in this environment.");
    }

    const res = await loginUser({ loginId, password });

    if (!res?.success || !res?.sessionToken) {
      throw new Error(res?.message || "Login failed");
    }

    localStorage.setItem(STORAGE_KEY, res.sessionToken);
    setAuthToken(res.sessionToken);
    setCurrentUser(res.user || null);

    return res;
  }, [applySupabaseSession, useSupabaseAuth]);

  const signOut = useCallback(async () => {
    try {
      if (useSupabaseAuth) {
        await supabase.auth.signOut();
        return;
      }

      const isDevSession =
        import.meta.env.DEV === true && authToken && decodeDevSessionUser(authToken);

      if (authToken && !isDevSession) {
        await logoutUser({ sessionToken: authToken });
      }
    } catch (err) {
      console.error("Logout request failed", err);
    } finally {
      localStorage.removeItem(STORAGE_KEY);
      setAuthToken("");
      setCurrentUser(null);
    }
  }, [authToken, useSupabaseAuth]);

  const value = useMemo(() => {
    return {
      authToken,
      user: currentUser,
      currentUser,
      loading: authLoading,
      authLoading,
      authError,
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
    authError,
    devLoginLocalAdmin,
    devLoginLocalAgent,
    devLoginLocalLab,
    devLoginLocalExecutive,
    login,
    signOut,
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