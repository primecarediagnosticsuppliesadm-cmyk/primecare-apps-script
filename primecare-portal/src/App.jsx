import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import LoginPage from "./pages/LoginPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import { useAuth } from "./context/AuthContext";
import { ROLES } from "./config/roles";
import HqGlobalSearch, {
  HqSearchTriggerButton,
  useHqGlobalSearchShortcut,
} from "@/components/hq/HqGlobalSearch.jsx";
import HqHelpDrawer, { HqHelpButton } from "@/components/hq/HqHelpDrawer.jsx";
import { PERMISSIONS } from "./config/permissions";
import { getDefaultPageForRole } from "./config/menuConfig";
import {
  getPagePathForKey,
  resolveInitialPageForRole,
  resolvePageKeyForRole,
  resolvePageKeyFromPath,
  syncPagePathToUrl,
} from "./config/pageRouting.js";
import { PortalToastProvider } from "@/context/PortalToastContext";
import { TenantViewProvider } from "@/context/TenantViewContext.jsx";
import OperatingZoneSync from "@/components/OperatingZoneSync.jsx";

function canRoleAccessPage(role, pageKey) {
  if (!role || !pageKey) return false;
  const resolved = resolvePageKeyForRole(role, pageKey);
  return Array.isArray(PERMISSIONS[resolved]) && PERMISSIONS[resolved].includes(role);
}

const PortalLayout = lazy(() => import("./layout/PortalLayout"));
const PrimeCareWebPortal = lazy(() => import("./PrimeCareWebPortal"));

function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();

  if (value === "agent") return ROLES.AGENT;
  if (value === "admin") return ROLES.ADMIN;
  if (value === "executive") return ROLES.EXECUTIVE;
  if (value === "lab") return ROLES.LAB;

  return null;
}

function UnauthorizedScreen({ message, onLogout }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md rounded-2xl border bg-white p-6 shadow-sm text-center">
        <h2 className="text-xl font-semibold text-red-700">Unauthorized</h2>
        <p className="mt-2 text-gray-600">
          {message || "Your account is not authorized for PrimeCare pilot access."}
        </p>
        <button
          type="button"
          onClick={onLogout}
          className="mt-5 rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
        >
          Back to login
        </button>
      </div>
    </div>
  );
}

function ExecutivePortalHeader({ currentUser, pageTitle, onLogout, role, activePage, setActivePage }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const showHqChrome = role === ROLES.ADMIN || role === ROLES.EXECUTIVE;

  useHqGlobalSearchShortcut(() => {
    if (showHqChrome) setSearchOpen(true);
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">{pageTitle}</h1>
          <p className="text-sm text-gray-500">
            PrimeCare HQ · Logged in as <span className="font-medium">{currentUser.role}</span>
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          {showHqChrome ? (
            <>
              <HqSearchTriggerButton
                onClick={() => setSearchOpen(true)}
                className="min-w-0 flex-1 sm:max-w-xs md:max-w-sm"
              />
              <HqHelpButton onClick={() => setHelpOpen(true)} />
            </>
          ) : null}
          <button
            type="button"
            onClick={onLogout}
            className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Logout
          </button>
        </div>
      </div>
      {showHqChrome ? (
        <>
          <HqGlobalSearch
            tenantId={currentUser?.tenantId}
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
            setActivePage={setActivePage}
          />
          <HqHelpDrawer
            pageKey={activePage}
            open={helpOpen}
            onClose={() => setHelpOpen(false)}
            setActivePage={setActivePage}
          />
        </>
      ) : null}
    </>
  );
}

function PortalLoadingScreen() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="rounded-2xl border bg-white p-6 shadow-sm text-center">
        <h2 className="text-xl font-semibold">Loading PrimeCare Portal...</h2>
        <p className="mt-2 text-gray-500">Preparing portal modules and role-based views.</p>
      </div>
    </div>
  );
}

export default function App() {
  const { user, loading, isAuthenticated, signOut, authToken, authError } = useAuth();

  const isResetPasswordRoute =
    typeof window !== "undefined" &&
    window.location.pathname.replace(/\/$/, "") === "/reset-password";

  if (isResetPasswordRoute) {
    return <ResetPasswordPage />;
  }

  const [role, setRole] = useState(null);
  const [activePage, setActivePage] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  const navigateToPage = useCallback(
    (pageKey, { replace = false } = {}) => {
      if (!role) return;

      const resolved = resolvePageKeyForRole(role, pageKey);
      if (!canRoleAccessPage(role, resolved)) {
        const fallback = getDefaultPageForRole(role);
        setActivePage(fallback);
        syncPagePathToUrl(fallback, { replace: true });
        return;
      }

      setActivePage(resolved);
      syncPagePathToUrl(resolved, { replace });
    },
    [role]
  );

  useEffect(() => {
    if (!isAuthenticated || !user) {
      setRole(null);
      setActivePage(null);
      setCurrentUser(null);
      return;
    }

    const normalizedRole = normalizeRole(user.role);
    if (!normalizedRole) {
      setRole(null);
      setActivePage(null);
      setCurrentUser(null);
      return;
    }

    const normalizedUser = {
      id: user.id || user.userId || user.User_ID || "",
      name: user.name || user.userName || user.User_Name || "User",
      role: normalizedRole,
      agentName: user.agentName || user.Agent_Name || user.name || user.User_Name || "",
      labId: user.labId || user.Lab_ID || "",
      tenantId: user.tenantId || user.tenant_id || "",
      agentId: user.agentId || user.agent_id || "",
      assignedArea: user.assignedArea || user.Area || "",
      email: user.email || user.Email || "",
      defaultPage: user.defaultPage || user.Default_Page || "",
    };

    setCurrentUser((prev) => {
      if (
        prev &&
        prev.id === normalizedUser.id &&
        prev.role === normalizedUser.role &&
        prev.tenantId === normalizedUser.tenantId &&
        prev.agentId === normalizedUser.agentId &&
        prev.agentName === normalizedUser.agentName &&
        prev.labId === normalizedUser.labId &&
        prev.email === normalizedUser.email
      ) {
        return prev;
      }
      return normalizedUser;
    });
    setRole(normalizedRole);
    setActivePage((prev) => {
      const defaultPage =
        normalizedUser.defaultPage || getDefaultPageForRole(normalizedRole);

      if (!prev) {
        const pathname =
          typeof window !== "undefined" ? window.location.pathname : "/";
        return resolveInitialPageForRole(
          normalizedRole,
          pathname,
          defaultPage,
          (pageKey) => canRoleAccessPage(normalizedRole, pageKey)
        );
      }

      if (canRoleAccessPage(normalizedRole, prev)) {
        return resolvePageKeyForRole(normalizedRole, prev);
      }
      return defaultPage;
    });
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (!role || !activePage) return;

    const expectedPath = getPagePathForKey(activePage);
    const currentPath =
      typeof window !== "undefined"
        ? window.location.pathname.replace(/\/+$/, "") || "/"
        : "/";
    if (currentPath !== expectedPath) {
      syncPagePathToUrl(activePage, { replace: true });
    }
  }, [role, activePage]);

  useEffect(() => {
    if (!role) return;

    function handlePopState() {
      const pathname = window.location.pathname;
      const fromPath = resolvePageKeyFromPath(pathname);
      if (fromPath && canRoleAccessPage(role, fromPath)) {
        setActivePage(resolvePageKeyForRole(role, fromPath));
        return;
      }

      const fallback = getDefaultPageForRole(role);
      setActivePage(fallback);
      syncPagePathToUrl(fallback, { replace: true });
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [role]);

  useEffect(() => {
    function handleSetActivePage(event) {
      if (event?.detail) {
        navigateToPage(event.detail);
      }
    }

    window.addEventListener("primecare:setActivePage", handleSetActivePage);
    return () => {
      window.removeEventListener("primecare:setActivePage", handleSetActivePage);
    };
  }, [navigateToPage]);

  const pageTitle = useMemo(() => {
    if (!currentUser) return "PrimeCare Portal";
    return `PrimeCare Portal — ${currentUser.name}`;
  }, [currentUser]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="rounded-2xl border bg-white p-6 shadow-sm text-center">
          <h2 className="text-xl font-semibold">Loading PrimeCare...</h2>
          <p className="mt-2 text-gray-500">Checking your session.</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (authError) {
      return <UnauthorizedScreen message={authError} onLogout={signOut} />;
    }
    return <LoginPage />;
  }

  if (!role || !activePage || !currentUser) {
    return <UnauthorizedScreen onLogout={signOut} />;
  }

  return (
    <PortalToastProvider>
      <Suspense fallback={<PortalLoadingScreen />}>
        <TenantViewProvider currentUser={currentUser}>
        <OperatingZoneSync activePage={activePage} />
        <PortalLayout
          role={role}
          activePage={activePage}
          setActivePage={navigateToPage}
        >
          <ExecutivePortalHeader
            currentUser={currentUser}
            pageTitle={pageTitle}
            onLogout={signOut}
            role={role}
            activePage={activePage}
            setActivePage={navigateToPage}
          />

          <PrimeCareWebPortal
            role={role}
            activePage={activePage}
            currentUser={currentUser}
            setActivePage={navigateToPage}
            authToken={authToken}
          />
        </PortalLayout>
        </TenantViewProvider>
      </Suspense>
    </PortalToastProvider>
  );
}