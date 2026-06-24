import { supabase } from "@/api/supabaseClient.js";
import {
  getQualificationReviewRead,
  getStockDashboard,
} from "@/api/primecareSupabaseApi.js";
import { loadVisibleLabContracts } from "@/labContract/labContractStore.js";
import { loadOperationsCenterAdminBundle } from "@/operations/operationsCenterAdminData.js";
import { CONTRACT_STATUSES } from "@/labContract/labContractTypes.js";
import { isQualificationPipelineReady } from "@/utils/qualificationPipeline.js";

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export const PILOT_CHECK_FIX_ACTIONS = {
  labs_created: { page: "labs", label: "Add labs" },
  labs_owned: { page: "operationsCenter", tab: "labOwnership", label: "Assign primary owners" },
  agents_provisioned: { page: "operationsCenter", tab: "pilotOnboarding", label: "Import agents" },
  contracts_active: { page: "labContractEngine", label: "Activate contracts" },
  qualification_complete: { page: "qualificationReview", label: "Complete qualification" },
  inventory_available: { page: "stock", label: "Review stock" },
  rls_active: { page: "", label: "Apply SQL migrations in Supabase" },
  ownership_active: { page: "operationsCenter", tab: "labOwnership", label: "Review ownership" },
};

export function makePilotCheck(id, label, status, detail = "", missingItems = []) {
  const fixAction = PILOT_CHECK_FIX_ACTIONS[id] || null;
  return {
    id,
    label,
    status,
    detail,
    missingItems: Array.isArray(missingItems) ? missingItems : [],
    fixAction,
  };
}

export function aggregatePilotCheckStatus(checks = []) {
  const statuses = checks.map((c) => c.status);
  if (statuses.includes("FAIL")) return "FAIL";
  if (statuses.includes("WARN")) return "WARN";
  return "PASS";
}

/**
 * Build pilot hardening checks from a preloaded bundle (sync).
 * @param {object} data
 */
export function buildPilotHardeningChecks(data = {}) {
  const distributorId = str(data.distributorId);
  const labs = data.labs || [];
  const ownershipRows = data.ownershipRows || [];
  const ownershipMetrics = data.ownershipMetrics || null;
  const agents = data.agents || data.directoryUsers?.filter((u) => u.role === "agent") || [];
  const contracts = data.contracts || [];
  const qualifications = data.qualifications || [];
  const inventory = data.inventory || [];
  const rlsProbe = data.rlsProbe || {};

  const scopedLabs = distributorId
    ? labs.filter((l) => str(l.tenantId ?? l.tenant_id) === distributorId)
    : labs;

  const activeOwnership = ownershipRows.filter((r) => str(r.status).toUpperCase() === "ACTIVE");
  const ownedLabKeys = new Set(
    activeOwnership.map((r) => `${str(r.labTenantId ?? r.lab_tenant_id)}::${str(r.labId ?? r.lab_id)}`.toLowerCase())
  );

  const legacyOwned = scopedLabs.filter((l) =>
    Boolean(str(l.assignedAgentId ?? l.assigned_agent_id ?? l.agentId ?? l.agent_id))
  ).length;

  const durableOwned = scopedLabs.filter((l) => {
    const key = `${str(l.tenantId)}::${str(l.labId ?? l.lab_id)}`.toLowerCase();
    return ownedLabKeys.has(key);
  }).length;

  const unassignedCount =
    ownershipMetrics?.unassignedLabs ??
    scopedLabs.filter((l) => {
      const key = `${str(l.tenantId)}::${str(l.labId ?? l.lab_id)}`.toLowerCase();
      const hasLegacy = Boolean(str(l.assignedAgentId ?? l.assigned_agent_id ?? l.agentId));
      return !ownedLabKeys.has(key) && !hasLegacy;
    }).length;

  const activeAgents = agents.filter((a) => a.active !== false);
  const scopedContracts = distributorId
    ? contracts.filter((c) => str(c.distributorId ?? c.distributor_id) === distributorId)
    : contracts;
  const activeContracts = scopedContracts.filter((c) => str(c.status) === CONTRACT_STATUSES.ACTIVE);
  const qualifiedLabs = qualifications.filter(isQualificationPipelineReady);
  const skusInStock = inventory.filter((row) => num(row.currentStock ?? row.current_stock) > 0).length;

  const labMissing = [];
  if (scopedLabs.length < 25) {
    labMissing.push(`${Math.max(0, 25 - scopedLabs.length)} more lab(s) for pilot target (25)`);
  }
  if (scopedLabs.length === 0) labMissing.push("Create at least one lab");

  const ownershipMissing = [];
  if (unassignedCount > 0) ownershipMissing.push(`${unassignedCount} lab(s) without primary owner`);
  if (scopedLabs.length === 0) ownershipMissing.push("No labs to assign");

  const agentMissing = [];
  if (activeAgents.length < 5) {
    agentMissing.push(`${Math.max(0, 5 - activeAgents.length)} more active agent(s) for pilot target (5)`);
  }
  if (activeAgents.length === 0) agentMissing.push("Provision at least one field agent");

  const contractMissing =
    activeContracts.length < 1 && scopedLabs.length > 0 ? ["Activate at least one lab contract"] : [];
  const qualMissing =
    qualifiedLabs.length < 1 && scopedLabs.length > 0
      ? ["Move at least one lab through qualification to Won"]
      : [];
  const inventoryMissing = skusInStock < 1 ? ["Add stock for at least one SKU"] : [];
  const rlsMissing =
    rlsProbe.tempAnonPolicyCount == null
      ? ["Run pilot_hardening_validation_queries.sql in Supabase"]
      : rlsProbe.tempAnonPolicyCount > 0
        ? [`Remove ${rlsProbe.tempAnonPolicyCount} temp_anon RLS policy(s)`]
        : [];
  const ownershipTableMissing =
    rlsProbe.ownershipTableExists === false
      ? ["Apply user_provisioning_phase3c_lab_ownership_migration.sql"]
      : activeOwnership.length === 0 && legacyOwned === 0 && scopedLabs.length > 0
        ? ["Assign primary owners via Lab Ownership"]
        : [];

  const checks = [
    makePilotCheck(
      "labs_created",
      "Labs created",
      scopedLabs.length >= 1 ? (scopedLabs.length >= 25 ? "PASS" : "WARN") : "FAIL",
      `${scopedLabs.length} lab(s)${distributorId ? ` for distributor` : ""}`,
      labMissing
    ),
    makePilotCheck(
      "labs_owned",
      "Labs owned (primary)",
      unassignedCount === 0 && scopedLabs.length > 0
        ? "PASS"
        : unassignedCount > 0 && scopedLabs.length > 0
          ? "FAIL"
          : scopedLabs.length === 0
            ? "FAIL"
            : "WARN",
      `${durableOwned} durable · ${legacyOwned} legacy · ${unassignedCount} unassigned`,
      ownershipMissing
    ),
    makePilotCheck(
      "agents_provisioned",
      "Agents provisioned",
      activeAgents.length >= 5 ? "PASS" : activeAgents.length >= 1 ? "WARN" : "FAIL",
      `${activeAgents.length} active agent(s)`,
      agentMissing
    ),
    makePilotCheck(
      "contracts_active",
      "Contracts active",
      activeContracts.length >= 1 ? "PASS" : scopedLabs.length > 0 ? "FAIL" : "WARN",
      `${activeContracts.length} active contract(s)`,
      contractMissing
    ),
    makePilotCheck(
      "qualification_complete",
      "Qualification complete",
      qualifiedLabs.length >= 1 ? "PASS" : scopedLabs.length > 0 ? "WARN" : "FAIL",
      `${qualifiedLabs.length} qualified/won lab(s)`,
      qualMissing
    ),
    makePilotCheck(
      "inventory_available",
      "Inventory available",
      skusInStock >= 1 ? "PASS" : "FAIL",
      `${skusInStock} SKU(s) with stock > 0`,
      inventoryMissing
    ),
    makePilotCheck(
      "rls_active",
      "RLS active (no temp anon)",
      rlsProbe.tempAnonPolicyCount === 0
        ? "PASS"
        : rlsProbe.tempAnonPolicyCount == null
          ? "WARN"
          : "FAIL",
      rlsProbe.tempAnonPolicyCount == null
        ? "Run pilot_hardening_validation_queries.sql in Supabase"
        : `${rlsProbe.tempAnonPolicyCount} temp_anon policies`,
      rlsMissing
    ),
    makePilotCheck(
      "ownership_active",
      "Ownership table active",
      rlsProbe.ownershipTableExists === false
        ? "FAIL"
        : activeOwnership.length > 0 || legacyOwned > 0
          ? "PASS"
          : scopedLabs.length > 0
            ? "WARN"
            : "WARN",
      rlsProbe.ownershipTableExists === false
        ? "lab_ownership missing — apply phase3c migration"
        : `${activeOwnership.length} ACTIVE ownership row(s)`,
      ownershipTableMissing
    ),
  ];

  return {
    checks,
    status: aggregatePilotCheckStatus(checks),
    summary: {
      labCount: scopedLabs.length,
      unassignedLabs: unassignedCount,
      agentCount: activeAgents.length,
      activeContractCount: activeContracts.length,
      qualifiedLabCount: qualifiedLabs.length,
      skusInStock,
    },
  };
}

/**
 * Load remote probes + bundle for executable pilot hardening checks.
 */
export async function loadPilotHardeningCheckBundle(options = {}) {
  const distributorId = str(options.distributorId);
  const tenantId = str(options.tenantId ?? options.hqTenantId);

  const rlsProbe = { tempAnonPolicyCount: null, ownershipTableExists: null };

  if (supabase) {
    const ownershipProbe = await supabase.from("lab_ownership").select("id").limit(1);
    rlsProbe.ownershipTableExists = !/lab_ownership|relation.*does not exist/i.test(
      ownershipProbe.error?.message || ""
    );
  }

  let ownershipRows = [];
  if (supabase && tenantId && rlsProbe.ownershipTableExists) {
    const { data } = await supabase
      .from("lab_ownership")
      .select("id, tenant_id, lab_tenant_id, lab_id, primary_agent_id, status")
      .eq("tenant_id", tenantId)
      .eq("status", "ACTIVE");
    ownershipRows = data || [];
  }

  return {
    distributorId,
    tenantId,
    ownershipRows,
    rlsProbe,
    ...(options.bundle || {}),
  };
}

/**
 * Aggregate all data sources needed for executable pilot hardening checks.
 */
export async function loadPilotHardeningCheckData(currentUser = null, options = {}) {
  const tenantId = str(options.tenantId ?? options.hqTenantId ?? currentUser?.tenantId);
  const distributorId = str(options.distributorId);

  const [adminBundle, contracts, stockRes, qualRes] = await Promise.all([
    tenantId ? loadOperationsCenterAdminBundle(tenantId) : Promise.resolve(null),
    loadVisibleLabContracts().catch(() => []),
    getStockDashboard().catch(() => ({ data: { inventory: [] } })),
    getQualificationReviewRead().catch(() => ({ data: [] })),
  ]);

  const inventory = Array.isArray(stockRes?.data?.inventory) ? stockRes.data.inventory : [];
  const qualifications = Array.isArray(qualRes?.data)
    ? qualRes.data
    : Array.isArray(qualRes?.data?.qualifications)
      ? qualRes.data.qualifications
      : [];

  return {
    distributorId,
    tenantId,
    hqTenantId: tenantId,
    labs: adminBundle?.labAssignments || [],
    agents: adminBundle?.agents || [],
    directoryUsers: adminBundle?.directoryUsers || [],
    ownershipRows: adminBundle?.ownershipRows || [],
    ownershipMetrics: adminBundle?.ownershipMetrics || null,
    contracts: contracts || [],
    qualifications,
    inventory,
  };
}

export async function runPilotHardeningChecks(options = {}) {
  const preloaded = options.bundle || options.data;
  const bundle = preloaded
    ? await loadPilotHardeningCheckBundle({ ...options, bundle: preloaded })
    : await loadPilotHardeningCheckBundle({
        ...options,
        bundle: await loadPilotHardeningCheckData(null, options),
      });
  return buildPilotHardeningChecks(bundle);
}
