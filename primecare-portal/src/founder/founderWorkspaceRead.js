/**
 * Phase 9.2 — Parallel read-only bundle for Founder OS (compose only).
 */
import { loadOperationsCommandCenterCore } from "@/operations/operationsCommandCenterLoader.js";
import { loadCommercialWorkspaceRead } from "@/commercial/commercialWorkspaceRead.js";
import { loadExecutiveCompensationCenterRead } from "@/api/compensationReadSupabaseApi.js";
import { buildExecutiveCompensationModel } from "@/compensation/executiveCompensationModel.js";
import { buildCommercialWorkspace } from "@/commercial/commercialWorkspaceModel.js";
import { buildExecutiveActionQueue } from "@/operations/executiveActionQueueEngine.js";
import { buildHqPriorityCards } from "@/operations/hqCommandCenterEngine.js";
import { buildExecutiveDailySnapshot } from "@/operations/operationsCommandCenterModel.js";
import { mergeReadHealth } from "@/observability/readHealth.js";

function str(value) {
  return String(value ?? "").trim();
}

export async function loadFounderWorkspaceRead({ currentUser, force = false } = {}) {
  const tenantId = str(currentUser?.tenantId ?? currentUser?.tenant_id);

  const [opsPayload, commercialRaw, compensationRaw] = await Promise.all([
    loadOperationsCommandCenterCore(currentUser, { force }),
    loadCommercialWorkspaceRead({ currentUser, force }),
    loadExecutiveCompensationCenterRead({ currentUser }).catch((err) => ({
      error: err?.message || "compensation_read_failed",
      payrollPeriods: [],
      payrollRuns: [],
      payrollRunLines: [],
      compensationPlans: [],
      planAssignments: [],
      profiles: [],
    })),
  ]);

  const commercialWorkspace = buildCommercialWorkspace({
    qualifications: commercialRaw?.qualifications || opsPayload?.qualifications || [],
    contracts: commercialRaw?.contracts || [],
    visits: commercialRaw?.visits || opsPayload?.visits || [],
  });

  const compensationModel = buildExecutiveCompensationModel({
    payrollPeriods: compensationRaw?.payrollPeriods || [],
    payrollRuns: compensationRaw?.payrollRuns || [],
    payrollRunLines: compensationRaw?.payrollRunLines || [],
    commissionEntries: compensationRaw?.commissionEntries || [],
    compensationPlans: compensationRaw?.compensationPlans || [],
    planAssignments: compensationRaw?.planAssignments || [],
    auditEvents: compensationRaw?.auditEvents || [],
    payrollExports: compensationRaw?.payrollExports || [],
    profiles: compensationRaw?.profiles || [],
    payments: compensationRaw?.payments || [],
    arRows: compensationRaw?.arRows || [],
    labs: compensationRaw?.labs || [],
  });

  const actionQueue = buildExecutiveActionQueue({
    payload: opsPayload,
    contracts: commercialRaw?.contracts || [],
    tenantId,
    ownershipMetrics: opsPayload?.ownershipMetrics,
    directoryUsers: opsPayload?.ownershipDirectoryUsers || [],
  });

  const priorityCards = buildHqPriorityCards({
    dashboard: opsPayload?.dashboard,
    collections: opsPayload?.collections,
    orders: opsPayload?.orders,
    directoryUsers: opsPayload?.ownershipDirectoryUsers,
    auditEvents: opsPayload?.auditEvents,
  });

  const dailySnapshot = buildExecutiveDailySnapshot(opsPayload);

  return {
    success: true,
    tenantId,
    opsPayload,
    commercialRaw,
    commercialWorkspace,
    compensationRaw,
    compensationModel,
    actionQueue,
    priorityCards,
    dailySnapshot,
    readHealth: mergeReadHealth(opsPayload?._dashReadResult),
    loadedAt: new Date().toISOString(),
  };
}
