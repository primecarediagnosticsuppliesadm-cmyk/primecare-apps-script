import { supabase } from "@/api/supabaseClient.js";
import { loadOperationsCommandCenterData } from "@/operations/operationsCommandCenterLoader.js";
import { loadTenantFoundationRegistry } from "@/tenant/tenantFoundationData.js";
import { appendOperationalEvent } from "@/operations/operationalEventBridge.js";
import { labIdKey } from "@/utils/labId.js";
import {
  CONTRACT_STATUSES,
  CONTRACT_TYPES,
  TIMELINE_EVENT_TYPES,
} from "@/labContract/labContractTypes.js";
import {
  readLabContractRegistry,
  upsertLabContract,
  getLabContractById,
} from "@/labContract/labContractStore.js";
import {
  buildLabContractModel,
  buildOpsLookups,
  nextContractNumber,
  validateContractDates,
  computeContractReadiness,
} from "@/labContract/labContractEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function addMonths(iso, months) {
  const d = new Date(str(iso).slice(0, 10) || Date.now());
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const d = new Date(str(iso).slice(0, 10) || Date.now());
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function appendTimeline(contract, type, actor, note = "") {
  const event = {
    type,
    at: new Date().toISOString(),
    actor: str(actor) || "System",
    note,
  };
  return {
    ...contract,
    timeline: [...(contract.timeline || []), event],
    updatedAt: new Date().toISOString(),
  };
}

async function emitContractEvent(tenantId, contract, type, currentUser, note) {
  void appendOperationalEvent({
    tenantId,
    eventType: "qualification_updated",
    actor: str(currentUser?.name || currentUser?.email || "Admin"),
    actorRole: currentUser?.role || "admin",
    linkedEntityType: "lab",
    linkedEntityId: contract.labId,
    linkedLabId: contract.labId,
    metadata: {
      summary: `Contract ${contract.contractNumber}: ${type}`,
      labContract: true,
      contractId: contract.id,
      contractNumber: contract.contractNumber,
      eventType: type,
      note,
    },
  });
}

let cachedBundle = null;
let cacheKey = "";

async function fetchOrderLinesRaw() {
  if (!supabase) return [];
  const { data, error } = await supabase.from("order_lines").select("*").limit(5000);
  if (error) return [];
  return Array.isArray(data) ? data : [];
}

/**
 * Single ops + registry load for contract engine (dedupe API calls).
 */
export async function loadLabContractEngineBundle(currentUser, options = {}) {
  const tenantId = str(currentUser?.tenantId || currentUser?.tenant_id);
  const key = `${tenantId}:${options.force ? Date.now() : "cached"}`;
  if (!options.force && cachedBundle && cacheKey === `${tenantId}:cached`) {
    return cachedBundle;
  }

  const [opsPayload, foundation, orderLines] = await Promise.all([
    loadOperationsCommandCenterData(currentUser, { force: options.force }),
    loadTenantFoundationRegistry(currentUser, { force: options.force }).catch(() => ({
      tenants: [],
    })),
    fetchOrderLinesRaw(),
  ]);

  if (opsPayload && orderLines?.length) {
    opsPayload.orderLines = orderLines;
  }

  const registry = readLabContractRegistry(tenantId);
  const distributors = new Set(
    (foundation?.tenants || []).map((t) => str(t.id)).filter(Boolean)
  );
  distributors.add(tenantId);

  const model = buildLabContractModel(registry.contracts, opsPayload, distributors);

  cachedBundle = {
    tenantId,
    opsPayload,
    distributors: [...distributors],
    distributorRows: foundation?.tenants || [],
    registry,
    model,
  };
  cacheKey = key.startsWith(tenantId) ? `${tenantId}:cached` : key;
  return cachedBundle;
}

export function invalidateLabContractCache() {
  cachedBundle = null;
  cacheKey = "";
}

export function createLabContractDraft(tenantId, draft, actor) {
  const registry = readLabContractRegistry(tenantId);
  const now = new Date().toISOString();
  const start = str(draft.startDate) || now.slice(0, 10);
  const contract = {
    id: `contract-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    contractNumber: nextContractNumber(tenantId, draft.labId, registry.contracts),
    tenantId,
    distributorId: str(draft.distributorId) || tenantId,
    distributorName: str(draft.distributorName),
    labId: labIdKey(draft.labId),
    labName: str(draft.labName),
    contractType: draft.contractType || CONTRACT_TYPES.L1A_CONSUMABLES,
    status: CONTRACT_STATUSES.DRAFT,
    startDate: start,
    endDate: str(draft.endDate) || addMonths(start, 12),
    autoRenewal: Boolean(draft.autoRenewal),
    owner: str(draft.owner),
    notes: str(draft.notes),
    commercial: {
      monthlyCommitment: Number(draft.monthlyCommitment) || 0,
      creditLimit: Number(draft.creditLimit) || 0,
      paymentTerms: str(draft.paymentTerms) || "30 Days",
      collectionTargetPct: Number(draft.collectionTargetPct) || 85,
      distributorMarginPct: Number(draft.distributorMarginPct) || 0,
      primecareMarginPct: Number(draft.primecareMarginPct) || 0,
    },
    l1b:
      draft.contractType === CONTRACT_TYPES.L1B_REAGENT_RENTAL ||
      draft.contractType === CONTRACT_TYPES.HYBRID
        ? {
            instrumentName: str(draft.instrumentName),
            instrumentValue: Number(draft.instrumentValue) || 0,
            monthlyCommitment: Number(draft.monthlyCommitment) || 0,
            lockInMonths: Number(draft.lockInMonths) || 12,
            lockInMonthsRemaining: Number(draft.lockInMonths) || 12,
          }
        : null,
    timeline: [],
    createdAt: now,
    updatedAt: now,
  };
  const withTimeline = appendTimeline(contract, "created", actor, "Contract created");
  upsertLabContract(tenantId, withTimeline);
  invalidateLabContractCache();
  return withTimeline;
}

export function transitionLabContract(tenantId, contractId, nextStatus, currentUser, note = "") {
  const contract = getLabContractById(tenantId, contractId);
  if (!contract) return null;

  if (!validateContractDates(contract)) return null;

  const actor = str(currentUser?.name || currentUser?.email);
  let updated = { ...contract, status: nextStatus };

  const eventMap = {
    [CONTRACT_STATUSES.UNDER_REVIEW]: "submitted",
    [CONTRACT_STATUSES.ACTIVE]: "activated",
    [CONTRACT_STATUSES.SUSPENDED]: "suspended",
    [CONTRACT_STATUSES.EXPIRED]: "expired",
    [CONTRACT_STATUSES.TERMINATED]: "terminated",
  };
  const eventType = eventMap[nextStatus];
  if (eventType && TIMELINE_EVENT_TYPES.includes(eventType)) {
    updated = appendTimeline(updated, eventType, actor, note);
  }

  upsertLabContract(tenantId, updated);
  invalidateLabContractCache();
  void emitContractEvent(tenantId, updated, eventType || nextStatus, currentUser, note);
  return updated;
}

export function submitLabContractForReview(tenantId, contractId, currentUser) {
  const contract = getLabContractById(tenantId, contractId);
  if (!contract || contract.status !== CONTRACT_STATUSES.DRAFT) return null;
  const actor = str(currentUser?.name || currentUser?.email);
  const updated = appendTimeline(
    { ...contract, status: CONTRACT_STATUSES.UNDER_REVIEW },
    "submitted",
    actor,
    "Submitted for review"
  );
  upsertLabContract(tenantId, updated);
  invalidateLabContractCache();
  void emitContractEvent(tenantId, updated, "submitted", currentUser, "Submitted");
  return updated;
}

export function approveLabContract(tenantId, contractId, currentUser) {
  const contract = getLabContractById(tenantId, contractId);
  if (!contract || contract.status !== CONTRACT_STATUSES.UNDER_REVIEW) return null;
  const actor = str(currentUser?.name || currentUser?.email);
  const updated = appendTimeline(contract, "approved", actor, "Executive approval");
  upsertLabContract(tenantId, updated);
  invalidateLabContractCache();
  void emitContractEvent(tenantId, updated, "approved", currentUser, "Approved for activation");
  return updated;
}

export function activateLabContract(tenantId, contractId, currentUser) {
  const contract = getLabContractById(tenantId, contractId);
  if (!contract) return null;
  const bundle = cachedBundle;
  const lookups = bundle?.model?.lookups || buildOpsLookups(bundle?.opsPayload || {});
  const distributors = new Set(bundle?.distributors || [tenantId]);
  const readiness = computeContractReadiness(contract, {
    labs: lookups.labs,
    distributors,
  });
  if (!readiness.canActivate) return null;
  return transitionLabContract(
    tenantId,
    contractId,
    CONTRACT_STATUSES.ACTIVE,
    currentUser,
    "Contract activated"
  );
}

export function renewLabContract(tenantId, contractId, currentUser) {
  const contract = getLabContractById(tenantId, contractId);
  if (!contract) return null;
  const actor = str(currentUser?.name || currentUser?.email);
  const newEnd = addMonths(contract.endDate || contract.startDate, 12);
  let updated = {
    ...contract,
    status: CONTRACT_STATUSES.ACTIVE,
    endDate: newEnd,
    autoRenewal: true,
  };
  updated = appendTimeline(updated, "renewed", actor, `Renewed through ${newEnd}`);
  upsertLabContract(tenantId, updated);
  invalidateLabContractCache();
  void emitContractEvent(tenantId, updated, "renewed", currentUser, newEnd);
  return updated;
}

export function extendLabContract(tenantId, contractId, days, currentUser) {
  const contract = getLabContractById(tenantId, contractId);
  if (!contract) return null;
  const actor = str(currentUser?.name || currentUser?.email);
  const newEnd = addDays(contract.endDate, days || 90);
  const updated = appendTimeline(
    { ...contract, endDate: newEnd },
    "renewed",
    actor,
    `Extended ${days || 90} days`
  );
  upsertLabContract(tenantId, updated);
  invalidateLabContractCache();
  void emitContractEvent(tenantId, updated, "renewed", currentUser, `Extended to ${newEnd}`);
  return updated;
}

export function terminateLabContract(tenantId, contractId, currentUser, reason = "") {
  return transitionLabContract(
    tenantId,
    contractId,
    CONTRACT_STATUSES.TERMINATED,
    currentUser,
    reason || "Terminated"
  );
}

/**
 * Suggest draft contracts from qualifications / labs (no active duplicate per lab).
 */
export function suggestDraftContractsFromOps(tenantId, opsPayload, distributorName) {
  const registry = readLabContractRegistry(tenantId);
  const existingLabs = new Set(registry.contracts.map((c) => labIdKey(c.labId)));
  const lookups = buildOpsLookups(opsPayload);
  const drafts = [];

  for (const q of opsPayload?.qualifications || []) {
    const lid = labIdKey(q.labId);
    if (!lid || existingLabs.has(lid)) continue;
    const stage = str(q.pipelineStage || q.pipeline_stage).toLowerCase();
    if (!stage.includes("rental") && !stage.includes("won") && !stage.includes("negotiation")) {
      continue;
    }
    const type = stage.includes("rental")
      ? CONTRACT_TYPES.L1B_REAGENT_RENTAL
      : CONTRACT_TYPES.L1A_CONSUMABLES;
    drafts.push(
      createLabContractDraft(
        tenantId,
        {
          labId: lid,
          labName: str(q.labName) || lookups.labs.get(lid)?.labName,
          distributorId: tenantId,
          distributorName,
          contractType: type,
          paymentTerms: str(q.paymentTerms) || "30 Days",
          monthlyCommitment: num(q.reagentRentalPotential),
          owner: str(q.agentName) || "",
          notes: "Auto-suggested from qualification pipeline",
        },
        "System"
      )
    );
    existingLabs.add(lid);
    if (drafts.length >= 20) break;
  }
  return drafts;
}
