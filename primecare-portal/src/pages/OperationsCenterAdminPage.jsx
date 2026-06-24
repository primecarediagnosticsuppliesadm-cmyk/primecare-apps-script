import React, { useCallback, useEffect, useState } from "react";
import { PageSkeleton } from "@/components/ux";
import UserProvisioningPanel from "@/components/operations/UserProvisioningPanel.jsx";
import { loadOperationsCenterAdminBundle } from "@/operations/operationsCenterAdminData.js";
import { findDirectoryUserForLabAgent } from "@/operations/operationsCenterAdminEngine.js";
import { consumeHqNavContext } from "@/operations/hqGlobalSearchEngine.js";
import { Radio } from "lucide-react";

function resolveTenantId(currentUser) {
  return String(currentUser?.tenantId || currentUser?.tenant_id || "").trim() || null;
}

function str(v) {
  return String(v ?? "").trim();
}

export default function OperationsCenterAdminPage({ currentUser = null, setActivePage = null }) {
  const tenantId = resolveTenantId(currentUser);
  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [focusUserId, setFocusUserId] = useState("");
  const [navIntent, setNavIntent] = useState(null);
  const clearNavIntent = useCallback(() => setNavIntent(null), []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await loadOperationsCenterAdminBundle(tenantId);
      setBundle(data);
      if (!data.ok && data.error) setError(data.error);
      else if (data.warning) setError(data.warning);
    } catch (err) {
      setError(err?.message || "Failed to load operations center");
      setBundle(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading || !bundle) return;
    const ctx = consumeHqNavContext("operationsCenter");
    if (!ctx) return;

    if (str(ctx.tab) === "labOwnership") {
      setNavIntent({
        tab: "labOwnership",
        openAssignDrawer: Boolean(ctx.openAssignDrawer),
        focusLabId: String(ctx.labId || "").trim(),
      });
      return;
    }

    if (str(ctx.tab) === "pilotOnboarding") {
      setNavIntent({ tab: "pilotOnboarding" });
      return;
    }

    const user = findDirectoryUserForLabAgent(bundle.directoryUsers || [], ctx);
    if (user?.userId) {
      setFocusUserId(String(user.userId));
      setNavIntent({
        openAssignDrawer: Boolean(ctx.openAssignDrawer),
        focusLabId: String(ctx.labId || "").trim(),
      });
      return;
    }

    if (ctx.agentId || ctx.agentName) {
      setStatusMessage("Could not match agent in directory — use Assign on the user row.");
    }
  }, [loading, bundle]);

  if (loading) return <PageSkeleton rows={8} />;

  return (
    <div className="mx-auto max-w-6xl space-y-3 p-3 pb-8">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <Radio className="h-5 w-5 text-indigo-600" />
          User &amp; Access
        </h1>
        <p className="text-[11px] text-slate-600">
          HQ user provisioning — directory, assignments, deactivation, and audit.
        </p>
      </header>

      <UserProvisioningPanel
        tenantId={tenantId}
        bundle={bundle}
        loading={loading}
        error={error}
        statusMessage={statusMessage}
        actorRole={currentUser?.role}
        focusUserId={focusUserId}
        openAssignDrawer={navIntent?.openAssignDrawer === true}
        focusLabId={navIntent?.focusLabId || ""}
        initialTab={navIntent?.tab || ""}
        onNavIntentHandled={clearNavIntent}
        onReload={load}
        onError={setError}
        onStatus={setStatusMessage}
        setActivePage={setActivePage}
      />
    </div>
  );
}
