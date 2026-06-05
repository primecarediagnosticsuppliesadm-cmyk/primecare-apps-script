import {
  getCollectionsRead,
  getLabsCredit,
  getOrdersRead,
} from "@/api/primecareSupabaseApi.js";
import {
  collectDistributorLabIds,
  filterContractsByDistributor,
  filterRowsByDistributorLabs,
  filterRowsByTenant,
  rowTenantId,
} from "@/distributor/distributorOsEngine.js";
import { labIdKey } from "@/utils/labId.js";
import {
  fetchAgentProfilesForTenant,
  loadDistributorWorkspaceBundle,
  resolveDistributorWorkspace,
} from "@/distributor/distributorWorkspaceData.js";
import { readLabContractRegistry } from "@/labContract/labContractStore.js";

function str(v) {
  return String(v ?? "").trim();
}

function normalizeLabRow(lab) {
  return {
    tenantId: rowTenantId(lab),
    labId: str(lab.labId ?? lab.lab_id),
    labName: str(lab.labName ?? lab.lab_name),
    outstanding: Number(lab.outstanding ?? lab.outstandingAmount ?? 0),
    assignedAgent: str(lab.assignedAgent ?? lab.assigned_agent ?? ""),
    status: str(lab.status ?? "Active"),
  };
}

function normalizeOrderRow(order) {
  return {
    ...order,
    tenantId: rowTenantId(order),
  };
}

function normalizeCollectionRow(row) {
  return {
    ...row,
    tenantId: rowTenantId(row),
  };
}

/**
 * Load scoped operational snapshot for Distributor OS overview + Predator.
 */
export async function loadDistributorOsSnapshot(currentUser, scopeTenantId, options = {}) {
  const tenantId = str(scopeTenantId);
  const homeTenantId = str(currentUser?.tenantId || currentUser?.tenant_id);
  if (!tenantId) {
    return {
      homeTenantId,
      scopeTenantId: "",
      workspace: null,
      labs: [],
      orders: [],
      collections: [],
      contracts: [],
      agents: [],
      labIds: new Set(),
    };
  }

  const [bundle, labsRes, ordersRes, collRes, agents] = await Promise.all([
    loadDistributorWorkspaceBundle(currentUser, { force: options.force }),
    getLabsCredit(),
    getOrdersRead(),
    getCollectionsRead(),
    fetchAgentProfilesForTenant(tenantId),
  ]);

  const workspace = resolveDistributorWorkspace(bundle, tenantId, {
    viewTenantId: tenantId,
    readOnly: tenantId !== homeTenantId,
    homeTenantId: bundle.homeTenantId || homeTenantId,
  });

  const rawLabs = Array.isArray(labsRes?.data)
    ? labsRes.data
    : Array.isArray(labsRes?.data?.labs)
      ? labsRes.data.labs
      : [];
  const labs = filterRowsByTenant(rawLabs.map(normalizeLabRow), tenantId);
  const labIds = collectDistributorLabIds(labs, tenantId);

  const rawOrders = Array.isArray(ordersRes?.data?.orders) ? ordersRes.data.orders : [];
  let orders = filterRowsByTenant(rawOrders.map(normalizeOrderRow), tenantId);
  if (!orders.length && labIds.size) {
    orders = rawOrders
      .map(normalizeOrderRow)
      .filter((o) => labIds.has(labIdKey(o.labId)));
  }

  const rawCollections = Array.isArray(collRes?.data?.collections)
    ? collRes.data.collections
    : [];
  let collections = filterRowsByTenant(rawCollections.map(normalizeCollectionRow), tenantId);
  if (!collections.length && labIds.size) {
    collections = filterRowsByDistributorLabs(
      rawCollections.map(normalizeCollectionRow),
      labIds,
      "labId"
    );
  }

  const hqRegistry = readLabContractRegistry(homeTenantId);
  const scopedRegistry = readLabContractRegistry(tenantId);
  const contracts = [
    ...filterContractsByDistributor(hqRegistry.contracts, tenantId),
    ...filterContractsByDistributor(scopedRegistry.contracts, tenantId),
  ];

  return {
    homeTenantId: bundle.homeTenantId || homeTenantId,
    scopeTenantId: tenantId,
    workspace,
    labs,
    orders,
    collections,
    contracts,
    agents,
    labIds,
    registry: bundle.registry || [],
  };
}
