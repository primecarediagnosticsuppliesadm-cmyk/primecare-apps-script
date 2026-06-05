/**
 * Distributor OS stage progress — Draft → Setup → Catalog → First Lab → Active
 */

import { isCatalogAssigned } from "@/catalog/distributorCatalogEngine.js";
import {
  evaluateAdminUserGate,
  buildProvisioningChecks,
} from "@/distributor/distributorProvisioningEngine.js";
import {
  LIFECYCLE_STATUS,
  resolveDistributorLifecycleStatus,
} from "@/distributor/distributorLifecycleEngine.js";
import { PERSISTENCE_STATUS, resolvePersistenceStatus } from "@/tenant/durableTenantStore.js";

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export const DISTRIBUTOR_STAGES = [
  { id: "draft", label: "Draft" },
  { id: "setup", label: "Setup" },
  { id: "catalog", label: "Catalog" },
  { id: "first_lab", label: "First Lab" },
  { id: "active", label: "Active" },
];

export function buildDistributorStageChecklist({
  distributorRow = null,
  catalogBundle = null,
  snapshot = null,
} = {}) {
  const config = distributorRow?.config || {};
  const metrics = distributorRow?.metrics || {};
  const labsFromSnapshot = num(snapshot?.labs?.length);
  const effectiveLabCount = labsFromSnapshot > 0 ? labsFromSnapshot : num(metrics.labs);

  const persistenceStatus = resolvePersistenceStatus(distributorRow || {});
  const durable =
    persistenceStatus === PERSISTENCE_STATUS.DURABLE ||
    distributorRow?.durable === true ||
    distributorRow?.source === "database";

  const adminPass = evaluateAdminUserGate(config).pass;
  const catalogPass =
    isCatalogAssigned(config) ||
    Boolean(catalogBundle?.catalogAssigned) ||
    num(catalogBundle?.assignedCount) > 0;

  const checks = buildProvisioningChecks({
    config,
    metrics: { ...metrics, labs: effectiveLabCount },
    isLive: false,
    source: distributorRow?.source,
    durable: distributorRow?.durable,
    persistenceStatus,
    lastIsolationPass: distributorRow?.lastIsolationPass,
    isolationChecks: distributorRow?.isolationChecks,
  });

  const checkById = (id) => checks.find((c) => c.id === id);
  const securityPass =
    checkById("isolation_verified")?.status === "PASS" ||
    config.isolationAcknowledged === true;
  const firstLabPass = effectiveLabCount >= 1 || checkById("at_least_one_lab")?.status === "PASS";

  const lifecycle = resolveDistributorLifecycleStatus(distributorRow || {});
  const contractCount = num(snapshot?.contracts?.length);
  const activePass =
    lifecycle === LIFECYCLE_STATUS.ACTIVE ||
    str(distributorRow?.status).toUpperCase() === "ACTIVE" ||
    distributorRow?.provisioning?.lifecycle === "activated";

  const contractPass = contractCount > 0 || activePass;

  return [
    {
      id: "durable",
      label: "Saved permanently",
      pass: durable,
      tab: "launch",
    },
    {
      id: "admin",
      label: "Admin assigned",
      pass: adminPass,
      tab: "launch",
    },
    {
      id: "catalog",
      label: "Catalog assigned",
      pass: catalogPass,
      tab: "catalog",
    },
    {
      id: "security",
      label: "Security check passed",
      pass: securityPass,
      tab: "launch",
    },
    {
      id: "first_lab",
      label: "First lab added",
      pass: firstLabPass,
      tab: "labs",
    },
    {
      id: "active",
      label: "Active contract/status",
      pass: contractPass,
      tab: contractCount > 0 ? "contracts" : "launch",
    },
  ];
}

export function resolveDistributorStageId(checklist = []) {
  const byId = (id) => checklist.find((c) => c.id === id)?.pass;
  const active = byId("active");
  const firstLab = byId("first_lab");
  const catalog = byId("catalog");
  const admin = byId("admin");
  const security = byId("security");
  const durable = byId("durable");

  if (active) return "active";
  if (firstLab) return "first_lab";
  if (catalog) return "catalog";
  if (durable && admin && security) return "setup";
  return "draft";
}

export function buildDistributorStageModel(options = {}) {
  const checklist = buildDistributorStageChecklist(options);
  const currentStageId = resolveDistributorStageId(checklist);
  const currentIndex = DISTRIBUTOR_STAGES.findIndex((s) => s.id === currentStageId);

  return {
    stages: DISTRIBUTOR_STAGES.map((stage, index) => ({
      ...stage,
      state:
        index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming",
    })),
    currentStageId,
    currentStageLabel: DISTRIBUTOR_STAGES.find((s) => s.id === currentStageId)?.label || "Draft",
    checklist,
    incomplete: checklist.filter((c) => !c.pass),
  };
}
