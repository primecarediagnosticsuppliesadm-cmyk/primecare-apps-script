/**
 * Distributor OS stage progress — Draft → Setup → Catalog → First Lab → Active
 */

import { isCatalogAssigned } from "@/catalog/distributorCatalogEngine.js";
import { buildProvisioningChecks } from "@/distributor/distributorProvisioningEngine.js";
import { evaluateScopedIsolationForDistributor } from "@/distributor/distributorOsEngine.js";
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
  const labCountsAvailable = Boolean(snapshot);
  const contractCount = num(
    snapshot?.contractNonTerminatedCount ?? snapshot?.contracts?.length
  );

  const persistenceStatus = resolvePersistenceStatus(distributorRow || {});
  const durable =
    persistenceStatus === PERSISTENCE_STATUS.DURABLE ||
    distributorRow?.durable === true ||
    distributorRow?.source === "database";

  const catalogPass =
    isCatalogAssigned(config) ||
    Boolean(catalogBundle?.catalogAssigned) ||
    num(catalogBundle?.assignedCount) > 0;

  const scopedIsolationAvailable = Boolean(snapshot);
  const scopedIsolation = scopedIsolationAvailable
    ? evaluateScopedIsolationForDistributor(
        distributorRow?.id,
        snapshot?.homeTenantId,
        {
          labs: snapshot?.labs || [],
          orders: snapshot?.orders || [],
          collections: snapshot?.collections || [],
        }
      )
    : null;

  const checks = buildProvisioningChecks({
    config,
    metrics: { ...metrics, contracts: contractCount },
    status: distributorRow?.status,
    provisioningLifecycle: distributorRow?.provisioning?.lifecycle,
    isLive: false,
    source: distributorRow?.source,
    durable: distributorRow?.durable,
    persistenceStatus,
    lastIsolationPass: distributorRow?.lastIsolationPass,
    isolationChecks: distributorRow?.isolationChecks,
    contractCount,
    supabaseContractCount: contractCount,
    supabaseLabCount: labsFromSnapshot,
    liveLabCount: labsFromSnapshot,
    labCountsAvailable,
    scopedIsolationAvailable,
    scopedIsolation,
    liveScopedIsolationPass: scopedIsolation?.pass === true,
  });

  const checkById = (id) => checks.find((c) => c.id === id);
  const isolationPass = checkById("isolation_verified")?.status === "PASS";
  const firstLabPass = checkById("at_least_one_lab")?.status === "PASS";
  const contractPass = checkById("contract_configured")?.status === "PASS";

  const lifecycle = resolveDistributorLifecycleStatus(distributorRow || {});
  const activatedPass =
    lifecycle === LIFECYCLE_STATUS.ACTIVE ||
    str(distributorRow?.status).toUpperCase() === "ACTIVE" ||
    distributorRow?.provisioning?.lifecycle === "activated";

  return [
    {
      id: "durable",
      label: "Saved permanently",
      pass: durable,
      tab: "launch",
    },
    {
      id: "catalog",
      label: "Catalog assigned",
      pass: catalogPass,
      tab: "catalog",
    },
    {
      id: "isolation",
      label: "Data isolation verified",
      pass: isolationPass,
      tab: "launch",
    },
    {
      id: "first_lab",
      label: "First lab added",
      pass: firstLabPass,
      tab: "labs",
    },
    {
      id: "contract",
      label: "Contract configured",
      pass: contractPass,
      tab: "contracts",
    },
    {
      id: "activated",
      label: "Distributor activated",
      pass: activatedPass,
      tab: "launch",
    },
  ];
}

export function resolveDistributorStageId(checklist = []) {
  const byId = (id) => checklist.find((c) => c.id === id)?.pass;
  const activated = byId("activated");
  const firstLab = byId("first_lab");
  const catalog = byId("catalog");
  const durable = byId("durable");

  if (activated) return "active";
  if (firstLab) return "first_lab";
  if (catalog) return "catalog";
  if (durable) return "setup";
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
    canActivate: checklist.every((c) => c.pass),
  };
}
