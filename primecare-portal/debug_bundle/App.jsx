import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import LoginPage from "./pages/LoginPage";
import { useAuth } from "./context/AuthContext";
import { ROLES } from "./config/roles";
import { getDefaultPageForRole } from "./config/menuConfig";

const PortalLayout = lazy(() => import("./layout/PortalLayout"));
const PrimeCareWebPortal = lazy(() => import("./PrimeCareWebPortal"));

function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();

  if (value === "agent") return ROLES.AGENT;
  if (value === "admin") return ROLES.ADMIN;
  if (value === "executive") return ROLES.EXECUTIVE;
  if (value === "lab") return ROLES.LAB;

  return ROLES.EXECUTIVE;
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
  const { user, loading, isAuthenticated, signOut } = useAuth();

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

    const normalizedUser = {
      id: user.id || user.userId || user.User_ID || "USER-001",
      name: user.name || user.userName || user.User_Name || "User",
      role: normalizedRole,
      agentName: user.agentName || user.Agent_Name || "",
      labId: user.labId || user.Lab_ID || "",
      assignedArea: user.assignedArea || user.Area || "",
      email: user.email || user.Email || "",
      defaultPage: user.defaultPage || user.Default_Page || "",
    };

    setCurrentUser(normalizedUser);
    setRole(normalizedRole);
    setActivePage(
      normalizedUser.defaultPage || getDefaultPageForRole(normalizedRole)
    );
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
    return <LoginPage />;
  }

  if (!role || !activePage || !currentUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="rounded-2xl border bg-white p-6 shadow-sm text-center">
          <h2 className="text-xl font-semibold">Unable to load portal</h2>
          <p className="mt-2 text-gray-500">
            User role or navigation could not be initialized.
          </p>
        </div>
      </div>
    );
  }

  return (
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
/>
      </PortalLayout>
    </Suspense>
  );
}