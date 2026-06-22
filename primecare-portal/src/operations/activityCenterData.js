import { getNotificationEventsRead } from "@/api/notificationApi.js";
import {
  getInventoryLedgerRead,
  getPurchaseOrdersRead,
} from "@/api/primecareSupabaseApi.js";
import { getUserProvisioningEventsRead } from "@/api/userProvisioningApi.js";
import { loadOperationsCenterAdminBundle } from "@/operations/operationsCenterAdminData.js";
import { mapProvisioningEventRow } from "@/operations/userProvisioningEngine.js";
import { mergeActivityCenterEvents } from "@/operations/activityCenterEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

/** Aggregate operational events from existing read APIs (RLS-scoped). */
export async function loadActivityCenterBundle(tenantId, options = {}) {
  const tid = str(tenantId);
  const limit = Math.min(Number(options.limit) || 150, 200);

  const [notifyRes, opsBundle, auditRes, ledgerRes, poRes] = await Promise.all([
    getNotificationEventsRead({ tenantId: tid, limit }),
    tid ? loadOperationsCenterAdminBundle(tid) : Promise.resolve({ directoryUsers: [] }),
    tid ? getUserProvisioningEventsRead({ tenantId: tid, limit: 80 }) : Promise.resolve({ data: { events: [] } }),
    getInventoryLedgerRead(),
    getPurchaseOrdersRead(),
  ]);

  const userNameById = new Map();
  for (const user of opsBundle.directoryUsers || []) {
    userNameById.set(str(user.userId), str(user.name || user.displayName));
  }
  for (const agent of opsBundle.agents || []) {
    if (agent.userId) userNameById.set(str(agent.userId), str(agent.name));
  }

  const provisioningEvents = (auditRes?.data?.events || []).map((row) =>
    mapProvisioningEventRow(row, userNameById)
  );

  const notifications = Array.isArray(notifyRes?.data) ? notifyRes.data : [];
  const inventoryMovements = (ledgerRes?.data?.movements || []).slice(0, 60);
  const purchaseOrders = (poRes?.data?.purchaseOrders || []).slice(0, 40);

  const events = mergeActivityCenterEvents({
    notifications,
    provisioningEvents,
    inventoryMovements,
    purchaseOrders,
    userNameById,
  });

  return {
    ok: notifyRes?.success !== false,
    error: notifyRes?.error || ledgerRes?.error || poRes?.error || null,
    events,
    counts: {
      notifications: notifications.length,
      provisioning: provisioningEvents.length,
      inventory: inventoryMovements.length,
      purchaseOrders: purchaseOrders.length,
      merged: events.length,
    },
  };
}
