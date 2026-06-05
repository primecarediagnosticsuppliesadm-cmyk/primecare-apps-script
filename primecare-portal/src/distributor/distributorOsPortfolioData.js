import {
  getCollectionsRead,
  getLabsCredit,
  getOrdersRead,
} from "@/api/primecareSupabaseApi.js";
import { buildDistributorOsPortfolioModel } from "@/distributor/distributorOsPortfolioEngine.js";
import { filterContractsByDistributor, filterDistributorRegistry } from "@/distributor/distributorOsEngine.js";
import { fetchAgentProfilesForTenant, loadDistributorWorkspaceBundle } from "@/distributor/distributorWorkspaceData.js";
import { readLabContractRegistry } from "@/labContract/labContractStore.js";

function str(v) {
  return String(v ?? "").trim();
}

function normalizeLabs(res) {
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.data?.labs)) return res.data.labs;
  return [];
}

function normalizeOrders(res) {
  return Array.isArray(res?.data?.orders) ? res.data.orders : [];
}

function normalizeCollections(res) {
  return Array.isArray(res?.data?.collections) ? res.data.collections : [];
}

/**
 * Load portfolio-wide data for Distributor OS dashboard, billing, and comparison.
 */
export async function loadDistributorOsPortfolio(currentUser, options = {}) {
  const homeTenantId = str(currentUser?.tenantId || currentUser?.tenant_id);

  const [bundle, labsRes, ordersRes, collRes] = await Promise.all([
    loadDistributorWorkspaceBundle(currentUser, { force: options.force }),
    getLabsCredit(),
    getOrdersRead(),
    getCollectionsRead(),
  ]);

  const registry = bundle.registry || [];
  const distributors = filterDistributorRegistry(registry, homeTenantId);

  const labs = normalizeLabs(labsRes);
  const orders = normalizeOrders(ordersRes);
  const collections = normalizeCollections(collRes);

  const contractCounts = {};
  const agentCounts = {};

  await Promise.all(
    distributors.map(async (d) => {
      const hqContracts = readLabContractRegistry(homeTenantId).contracts || [];
      const scopedContracts = readLabContractRegistry(d.id).contracts || [];
      contractCounts[d.id] = [
        ...filterContractsByDistributor(hqContracts, d.id),
        ...filterContractsByDistributor(scopedContracts, d.id),
      ].length;

      const agents = await fetchAgentProfilesForTenant(d.id);
      agentCounts[d.id] = agents.length;
    })
  );

  const portfolio = buildDistributorOsPortfolioModel({
    distributors,
    labs,
    orders,
    collections,
    contractCounts,
    agentCounts,
    homeTenantId,
  });

  return {
    ...portfolio,
    bundle,
    raw: { labs, orders, collections },
  };
}
