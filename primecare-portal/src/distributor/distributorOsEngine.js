import { labIdKey } from "@/utils/labId.js";

function str(v) {
  return String(v ?? "").trim();
}

export const DISTRIBUTOR_OS_TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "overview", label: "Overview" },
  { id: "launch", label: "Launch" },
  { id: "catalog", label: "Catalog" },
  { id: "labs", label: "Labs" },
  { id: "orders", label: "Orders" },
  { id: "collections", label: "Collections" },
  { id: "contracts", label: "Contracts" },
  { id: "agents", label: "Agents" },
  { id: "commissions", label: "Commissions" },
  { id: "billing", label: "Billing" },
  { id: "risks", label: "Risks" },
];

/**
 * @typedef {Object} DistributorOsScope
 * @property {string} tenantId - Selected distributor tenant (never HQ in OS mode).
 * @property {string} [tenantName]
 * @property {string} [homeTenantId] - Executive/admin home tenant (PrimeCare HQ).
 * @property {boolean} [locked]
 * @property {string} [source]
 */

export function buildDistributorOsScope({
  tenantId,
  tenantName = "",
  homeTenantId = "",
  lifecycleStatus = "",
  canOperate = true,
} = {}) {
  const id = str(tenantId);
  const home = str(homeTenantId);
  return {
    tenantId: id,
    tenantName: str(tenantName),
    homeTenantId: home,
    locked: Boolean(id && home && id !== home),
    source: "distributor_os",
    lifecycleStatus: str(lifecycleStatus),
    canOperate: Boolean(canOperate),
  };
}

export function isValidDistributorOsScope(scope, homeTenantId = "") {
  const tenantId = str(scope?.tenantId);
  const home = str(homeTenantId || scope?.homeTenantId);
  return Boolean(tenantId && home && tenantId !== home);
}

export function rowTenantId(row) {
  return str(row?.tenantId ?? row?.tenant_id ?? row?.Tenant_ID);
}

export function filterRowsByTenant(rows, tenantId, options = {}) {
  const target = str(tenantId);
  if (!target || !Array.isArray(rows)) return [];
  const key = options.tenantKey || rowTenantId;
  return rows.filter((row) => key(row) === target);
}

export function filterContractsByDistributor(contracts, distributorTenantId) {
  const target = str(distributorTenantId);
  if (!target || !Array.isArray(contracts)) return [];
  return contracts.filter(
    (c) =>
      str(c.distributorId) === target ||
      str(c.tenantId) === target ||
      str(c.tenant_id) === target
  );
}

export function collectDistributorLabIds(labs, tenantId) {
  const target = str(tenantId);
  if (!target) return new Set();
  return new Set(
    filterRowsByTenant(labs, target)
      .map((lab) => labIdKey(lab.labId ?? lab.lab_id))
      .filter(Boolean)
  );
}

export function filterRowsByDistributorLabs(rows, labIds, labField = "labId") {
  if (!labIds?.size || !Array.isArray(rows)) return [];
  return rows.filter((row) => labIds.has(labIdKey(row[labField] ?? row.lab_id)));
}

export function detectHqLeakage(rows, distributorTenantId, homeTenantId) {
  const distributor = str(distributorTenantId);
  const home = str(homeTenantId);
  if (!distributor || !home || distributor === home || !Array.isArray(rows)) {
    return { leaked: false, count: 0, homeCount: 0 };
  }
  const homeRows = rows.filter((row) => rowTenantId(row) === home);
  return {
    leaked: homeRows.length > 0,
    count: homeRows.length,
    homeCount: homeRows.length,
  };
}

export function filterDistributorRegistry(registry, homeTenantId) {
  const home = str(homeTenantId);
  return (Array.isArray(registry) ? registry : []).filter(
    (row) => row?.id && row.id !== home && !row.isHome
  );
}

export function distributorOsBannerText(tenantName) {
  const name = str(tenantName) || "selected distributor";
  return `You are operating inside ${name}`;
}
