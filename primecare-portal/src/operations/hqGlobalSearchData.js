import { getLabsCredit, getOrdersRead, getOperationsPlatformUsersRead, getPurchaseOrdersRead } from "@/api/primecareSupabaseApi.js";
import { loadMasterCatalog } from "@/catalog/masterCatalogData.js";
import {
  buildHqSearchCoverageReport,
  buildHqSearchIndex,
  logHqSearchDiagnostics,
} from "@/operations/hqGlobalSearchEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

let cachedIndex = null;
let cachedCoverage = null;
let cachedAt = 0;
const CACHE_MS = 90_000;

async function safeLoad(label, loader) {
  try {
    const result = await loader();
    return { ok: true, result, error: null };
  } catch (err) {
    return { ok: false, result: null, error: err?.message || `Failed to load ${label}` };
  }
}

function mapPlatformUsers(rows = []) {
  return rows.map((row) => ({
    userId: row.user_id ?? row.userId,
    name: row.user_name ?? row.display_name ?? row.agent_name ?? row.displayName,
    displayName: row.display_name ?? row.displayName,
    agentName: row.agent_name ?? row.agentName,
    userName: row.user_name ?? row.userName,
    username: row.username,
    email: row.email ?? row.profile_email,
    role: row.role,
    roleLabel: row.roleLabel,
    agentId: row.agent_id ?? row.agentId,
  }));
}

/** Load searchable HQ index from existing read APIs (RLS-scoped). */
export async function loadHqGlobalSearchIndex(tenantId, options = {}) {
  const tid = str(tenantId);
  const force = options.force === true;
  if (!force && cachedIndex && Date.now() - cachedAt < CACHE_MS) {
    return { ok: true, index: cachedIndex, coverage: cachedCoverage };
  }

  const [labsLoad, usersLoad, ordersLoad, catalogLoad, poLoad] = await Promise.all([
    safeLoad("labs", () => getLabsCredit()),
    safeLoad("users", () =>
      tid ? getOperationsPlatformUsersRead({ tenantId: tid }) : Promise.resolve({ data: { users: [] } })
    ),
    safeLoad("orders", () => getOrdersRead()),
    safeLoad("catalog", () =>
      tid ? loadMasterCatalog({ tenantId: tid }) : Promise.resolve({ products: [] })
    ),
    safeLoad("purchaseOrders", () => getPurchaseOrdersRead()),
  ]);

  const labsRes = labsLoad.result;
  const usersRes = usersLoad.result;
  const ordersRes = ordersLoad.result;
  const catalogRes = catalogLoad.result;
  const poRes = poLoad.result;

  const labs = labsLoad.ok && Array.isArray(labsRes?.data) ? labsRes.data : [];
  const users =
    usersLoad.ok && usersRes?.success !== false
      ? mapPlatformUsers(usersRes?.data?.users || [])
      : [];
  const orders =
    ordersLoad.ok && ordersRes?.success !== false && Array.isArray(ordersRes?.data?.orders)
      ? ordersRes.data.orders
      : [];
  const products = catalogLoad.ok ? catalogRes?.products || catalogRes?.rows || [] : [];
  const purchaseOrders = poLoad.ok ? poRes?.data?.purchaseOrders || [] : [];

  const index = buildHqSearchIndex({ labs, users, orders, products, purchaseOrders });
  const coverage = buildHqSearchCoverageReport(index, {
    labs: labs.length,
    users: users.length,
    orders: orders.length,
    products: products.length,
    purchaseOrders: purchaseOrders.length,
    labsError: labsLoad.error || labsRes?.error || null,
    usersError: usersLoad.error || usersRes?.error || null,
    ordersError: ordersLoad.error || ordersRes?.error || null,
    productsError: catalogLoad.error || catalogRes?.error || null,
    purchaseOrdersError: poLoad.error || poRes?.error || null,
  });

  logHqSearchDiagnostics(coverage);

  cachedIndex = index;
  cachedCoverage = coverage;
  cachedAt = Date.now();

  return {
    ok: true,
    index,
    coverage,
    errors: [
      labsLoad.error,
      usersLoad.error,
      ordersLoad.error,
      catalogLoad.error,
      poLoad.error,
      labsRes?.error,
      usersRes?.error,
      ordersRes?.error,
      catalogRes?.error,
      poRes?.error,
    ].filter(Boolean),
  };
}

export function invalidateHqGlobalSearchCache() {
  cachedIndex = null;
  cachedCoverage = null;
  cachedAt = 0;
}
