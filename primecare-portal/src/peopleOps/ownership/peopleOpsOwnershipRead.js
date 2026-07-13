/**
 * Phase 8.4 — Parallel read-only ownership bundle for People Operations.
 * Reuses existing labOwnershipApi reads; no schema or compensation API changes.
 */
import { getLabOwnershipRead } from "@/api/labOwnershipApi.js";

function str(value) {
  return String(value ?? "").trim();
}

export async function loadPeopleOpsOwnershipRead({ currentUser } = {}) {
  const tenantId = str(currentUser?.tenantId ?? currentUser?.tenant_id);
  if (!tenantId) {
    return { success: false, error: "Tenant is required", ownershipRows: [] };
  }

  const [activeRes, inactiveRes] = await Promise.all([
    getLabOwnershipRead({ tenantId, status: "ACTIVE" }),
    getLabOwnershipRead({ tenantId, status: "INACTIVE" }),
  ]);

  const activeRows = activeRes.data?.rows || [];
  const inactiveRows = inactiveRes.data?.rows || [];
  const ownershipRows = [...activeRows, ...inactiveRows];

  return {
    success: activeRes.success || inactiveRes.success,
    error: activeRes.error || inactiveRes.error || "",
    ownershipRows,
    readHealth: {
      activeCount: activeRows.length,
      historyCount: inactiveRows.length,
      tableMissing: /migration\.sql/i.test(str(activeRes.error)),
    },
  };
}
