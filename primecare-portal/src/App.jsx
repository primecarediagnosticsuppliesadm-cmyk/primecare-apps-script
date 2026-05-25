import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import LoginPage from "./pages/LoginPage";
import { useAuth } from "./context/AuthContext";
import { ROLES } from "./config/roles";
import { PERMISSIONS } from "./config/permissions";
import { getDefaultPageForRole } from "./config/menuConfig";
import { PortalToastProvider } from "@/context/PortalToastContext";

function canRoleAccessPage(role, pageKey) {
  if (!role || !pageKey) return false;
  return Array.isArray(PERMISSIONS[pageKey]) && PERMISSIONS[pageKey].includes(role);
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

  const [role, setRole] = useState(null);
  const [activePage, setActivePage] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

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
      if (!prev) return defaultPage;
      if (canRoleAccessPage(normalizedRole, prev)) return prev;
      return defaultPage;
    });
  }, [isAuthenticated, user]);

  useEffect(() => {
    function handleSetActivePage(event) {
      if (event?.detail) {
        setActivePage(event.detail);
      }
    }

    window.addEventListener("primecare:setActivePage", handleSetActivePage);
    return () => {
      window.removeEventListener("primecare:setActivePage", handleSetActivePage);
    };
  }, []);

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
        <PortalLayout
          role={role}
          activePage={activePage}
          setActivePage={setActivePage}
        >
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold">{pageTitle}</h1>
              <p className="text-sm text-gray-500">
                Logged in as <span className="font-medium">{currentUser.role}</span>
              </p>
            </div>

            <button
              type="button"
              onClick={signOut}
              className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Logout
            </button>
          </div>

          <PrimeCareWebPortal
            role={role}
            activePage={activePage}
            currentUser={currentUser}
            setActivePage={setActivePage}
            authToken={authToken}
          />
        </PortalLayout>
      </Suspense>
    </PortalToastProvider>
  );
}