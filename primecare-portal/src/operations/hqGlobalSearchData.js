import {
  getLabsCredit,
  getLabCatalogRead,
  getOrdersRead,
  getOperationsPlatformUsersRead,
  getPurchaseOrdersRead,
  getStockDashboard,
} from "@/api/primecareSupabaseApi.js";
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

function mergeProductsById(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const row of list || []) {
      const productId = str(row.productId ?? row.product_id ?? row.sku);
      if (!productId) continue;
      if (!map.has(productId)) {
        map.set(productId, {
          productId,
          productName: row.productName ?? row.product_name ?? row.name ?? productId,
          sku: row.sku ?? productId,
          category: row.category,
        });
      }
    }
  }
  return Array.from(map.values());
}

function readApiError(res, loadError) {
  return loadError || (res?.success === false ? res?.error : null) || null;
}

/** Load searchable HQ index from existing read APIs (RLS-scoped). */
export async function loadHqGlobalSearchIndex(tenantId, options = {}) {
  const tid = str(tenantId);
  const force = options.force === true;
  if (!force && cachedIndex && Date.now() - cachedAt < CACHE_MS) {
    return { ok: true, index: cachedIndex, coverage: cachedCoverage };
  }

  const [labsLoad, usersLoad, ordersLoad, catalogLoad, labCatalogAllLoad, stockLoad, poLoad] =
    await Promise.all([
      safeLoad("labs", () => getLabsCredit()),
      safeLoad("users", () =>
        tid ? getOperationsPlatformUsersRead({ tenantId: tid }) : Promise.resolve({ data: { users: [] } })
      ),
      safeLoad("orders", () => getOrdersRead()),
      safeLoad("catalog", () =>
        tid ? loadMasterCatalog({ tenantId: tid }) : Promise.resolve({ products: [] })
      ),
      safeLoad("labCatalogAll", () => getLabCatalogRead({})),
      safeLoad("stock", () => getStockDashboard()),
      safeLoad("purchaseOrders", () => getPurchaseOrdersRead()),
    ]);

  const labsRes = labsLoad.result;
  const usersRes = usersLoad.result;
  const ordersRes = ordersLoad.result;
  const catalogRes = catalogLoad.result;
  const labCatalogAllRes = labCatalogAllLoad.result;
  const stockRes = stockLoad.result;
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
  const catalogProducts = catalogLoad.ok ? catalogRes?.products || catalogRes?.rows || [] : [];
  const labCatalogProducts =
    labCatalogAllLoad.ok && labCatalogAllRes?.success !== false
      ? labCatalogAllRes?.data?.products || []
      : [];
  const stockProducts = stockLoad.ok ? stockRes?.data?.inventory || [] : [];
  const products = mergeProductsById(catalogProducts, labCatalogProducts, stockProducts);
  const purchaseOrders = poLoad.ok ? poRes?.data?.purchaseOrders || [] : [];

  const index = buildHqSearchIndex({ labs, users, orders, products, purchaseOrders });
  const coverage = buildHqSearchCoverageReport(index, {
    labs: labs.length,
    users: users.length,
    orders: orders.length,
    products: products.length,
    purchaseOrders: purchaseOrders.length,
    labsError: readApiError(labsRes, labsLoad.error),
    usersError: readApiError(usersRes, usersLoad.error),
    ordersError: readApiError(ordersRes, ordersLoad.error),
    productsError: readApiError(catalogRes, catalogLoad.error || labCatalogAllLoad.error || stockLoad.error),
    purchaseOrdersError: readApiError(poRes, poLoad.error),
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
      labCatalogAllLoad.error,
      stockLoad.error,
      poLoad.error,
      labsRes?.error,
      usersRes?.error,
      ordersRes?.error,
      catalogRes?.error,
      labCatalogAllRes?.error,
      poRes?.error,
    ].filter(Boolean),
  };
}

export function invalidateHqGlobalSearchCache() {
  cachedIndex = null;
  cachedCoverage = null;
  cachedAt = 0;
}
