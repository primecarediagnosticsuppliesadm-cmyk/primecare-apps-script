import { getUserProvisioningEventsRead } from "@/api/userProvisioningApi.js";
import { loadOperationsCenterAdminBundle } from "@/operations/operationsCenterAdminData.js";
import { mapProvisioningEventRow } from "@/operations/userProvisioningEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

/** Loads provisioning directory context plus a larger audit event window for Access Audit. */
export async function loadAccessAuditBundle(tenantId) {
  const tid = str(tenantId);
  if (!tid) {
    return {
      ok: false,
      error: "Tenant context is missing. Re-login and try again.",
      auditEvents: [],
      directoryUsers: [],
      labAssignments: [],
      distributorAssignments: [],
    };
  }

  const [baseBundle, auditRes] = await Promise.all([
    loadOperationsCenterAdminBundle(tid),
    getUserProvisioningEventsRead({ tenantId: tid, limit: 500 }),
  ]);

  const userNameById = new Map(
    (baseBundle.directoryUsers || []).map((u) => [str(u.userId), str(u.name)])
  );
  const auditEvents = (auditRes?.data?.events || []).map((row) =>
    mapProvisioningEventRow(row, userNameById)
  );

  return {
    ...baseBundle,
    auditEvents,
    warning: baseBundle.warning || auditRes?.error || null,
  };
}
