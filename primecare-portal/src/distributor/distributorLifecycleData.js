import {
  actionToLifecycleStatus,
  buildLifecycleTimelineEntry,
  isValidLifecycleTransition,
  LIFECYCLE_DB_STATUS,
  LIFECYCLE_STATUS,
  resolveDistributorLifecycleStatus,
} from "@/distributor/distributorLifecycleEngine.js";
import {
  patchDurableTenantMetadata,
  updateDistributorStatusInSupabase,
} from "@/tenant/durableTenantStore.js";
import { getRegistryTenant, upsertRegistryTenant } from "@/tenant/tenantFoundationStore.js";

function str(v) {
  return String(v ?? "").trim();
}

export async function applyDistributorLifecycleAction(tenantId, action, options = {}) {
  const id = str(tenantId);
  if (!id) return { ok: false, error: "Missing distributor tenant id" };

  const existing = getRegistryTenant(id) || options.tenant || {};
  const current = resolveDistributorLifecycleStatus(existing);
  const next = actionToLifecycleStatus(action, current);

  if (!isValidLifecycleTransition(current, next) && action !== "reactivate") {
    return {
      ok: false,
      error: `Cannot ${action} from ${current}`,
      current,
      next,
    };
  }

  const dbStatus = LIFECYCLE_DB_STATUS[next] || "PENDING";
  const now = new Date().toISOString();
  const timelineEntry = buildLifecycleTimelineEntry(action, next);

  const configPatch = {
    ...(existing.config || {}),
    lifecycleStatus: next,
    lifecycleUpdatedAt: now,
    orderingEnabled: next === LIFECYCLE_STATUS.ACTIVE,
    collectionsEnabled: next === LIFECYCLE_STATUS.ACTIVE,
  };

  const provisioningPatch = {
    ...(existing.provisioning || {}),
    lifecycle: next === LIFECYCLE_STATUS.ACTIVE ? "activated" : next,
    timeline: [...(existing.provisioning?.timeline || []), timelineEntry],
  };

  const dbUpdate = await updateDistributorStatusInSupabase(id, dbStatus);
  const metaUpdate = await patchDurableTenantMetadata(id, {
    config: configPatch,
    provisioning: provisioningPatch,
  });

  upsertRegistryTenant({
    ...existing,
    id,
    status: dbStatus,
    config: configPatch,
    provisioning: provisioningPatch,
    durable: dbUpdate.ok || metaUpdate.ok,
  });

  return {
    ok: true,
    tenantId: id,
    action,
    previousStatus: current,
    lifecycleStatus: next,
    dbStatus,
    durable: dbUpdate.ok,
    dbError: dbUpdate.error || null,
    metaError: metaUpdate.error || null,
  };
}
