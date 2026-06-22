import { getLabsCredit, getOrdersRead, getOperationsPlatformUsersRead, getPurchaseOrdersRead } from "@/api/primecareSupabaseApi.js";
import { loadMasterCatalog } from "@/catalog/masterCatalogData.js";
import { buildHqSearchIndex } from "@/operations/hqGlobalSearchEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

let cachedIndex = null;
let cachedAt = 0;
const CACHE_MS = 90_000;

/** Load searchable HQ index from existing read APIs (RLS-scoped). */
export async function loadHqGlobalSearchIndex(tenantId, options = {}) {
  const tid = str(tenantId);
  const force = options.force === true;
  if (!force && cachedIndex && Date.now() - cachedAt < CACHE_MS) {
    return { ok: true, index: cachedIndex };
  }

  const [labsRes, usersRes, ordersRes, catalogRes, poRes] = await Promise.all([
    getLabsCredit(),
    tid ? getOperationsPlatformUsersRead({ tenantId: tid }) : Promise.resolve({ data: { users: [] } }),
    getOrdersRead(),
    tid ? loadMasterCatalog({ tenantId: tid }) : Promise.resolve({ products: [] }),
    getPurchaseOrdersRead(),
  ]);

  const labs = Array.isArray(labsRes?.data) ? labsRes.data : [];
  const users = (usersRes?.data?.users || []).map((row) => ({
    userId: row.user_id ?? row.userId,
    name: row.user_name ?? row.display_name ?? row.displayName,
    email: row.email ?? row.profile_email,
    role: row.role,
    agentId: row.agent_id ?? row.agentId,
  }));
  const orders = ordersRes?.success !== false && Array.isArray(ordersRes?.data?.orders) ? ordersRes.data.orders : [];
  const products = catalogRes?.products || catalogRes?.rows || [];
  const purchaseOrders = poRes?.data?.purchaseOrders || [];

  const index = buildHqSearchIndex({ labs, users, orders, products, purchaseOrders });
  cachedIndex = index;
  cachedAt = Date.now();

  return {
    ok: true,
    index,
    errors: [labsRes?.error, usersRes?.error, ordersRes?.error, catalogRes?.error, poRes?.error].filter(Boolean),
  };
}

export function invalidateHqGlobalSearchCache() {
  cachedIndex = null;
  cachedAt = 0;
}
