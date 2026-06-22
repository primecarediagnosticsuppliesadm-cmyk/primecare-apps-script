import React, { useCallback, useEffect, useState } from "react";
import { PageSkeleton } from "@/components/ux";
import AccessAuditPanel from "@/components/operations/AccessAuditPanel.jsx";
import { loadAccessAuditBundle } from "@/operations/accessAuditData.js";
import { Shield } from "lucide-react";

function resolveTenantId(currentUser) {
  return String(currentUser?.tenantId || currentUser?.tenant_id || "").trim() || null;
}

export default function AccessAuditPage({ currentUser = null }) {
  const tenantId = resolveTenantId(currentUser);
  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await loadAccessAuditBundle(tenantId);
      setBundle(data);
      if (!data.ok && data.error) setError(data.error);
      else if (data.warning) setError(data.warning);
    } catch (err) {
      setError(err?.message || "Failed to load access audit");
      setBundle(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !bundle) return <PageSkeleton rows={8} />;

  return (
    <div className="mx-auto max-w-6xl space-y-3 p-3 pb-8">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <Shield className="h-5 w-5 text-indigo-600" />
          Access Audit
        </h1>
        <p className="text-[11px] text-slate-600">
          HQ read-only audit trail for user provisioning, lab assignments, and access changes.
        </p>
      </header>

      <AccessAuditPanel
        tenantId={tenantId}
        bundle={bundle}
        loading={loading}
        error={error}
        onReload={load}
      />
    </div>
  );
}
