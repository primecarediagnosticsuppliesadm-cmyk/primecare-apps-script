import { loadInterventionRecords } from "@/operations/executiveInterventionStateStore.js";
import {
  ingestCommissionQueueItems,
  ingestContractRenewalQueueItems,
  ingestOwnershipRisk,
  ingestQualificationQueueItems,
} from "@/operations/executiveActionQueueIngest.js";
import { hydrateInterventionIssue } from "@/operations/executiveInterventionWorkflow.js";

function str(v) {
  return String(v ?? "").trim();
}

/**
 * @param {import('@/operations/executiveActionQueueTypes.js').ExecutiveActionQueueItem[]} items
 */
export function filterOpenExecutiveActionQueueItems(items = []) {
  return items.filter((item) => {
    if (item.snoozed) return false;
    const state = str(item.workflowState || "NEW").toUpperCase();
    return state !== "RESOLVED";
  });
}

/**
 * @param {import('@/operations/executiveActionQueueTypes.js').ExecutiveActionQueueItem[]} items
 */
export function countOpenExecutiveActionQueueItems(items = []) {
  return filterOpenExecutiveActionQueueItems(items).length;
}

function buildCounts(items = []) {
  const openItems = filterOpenExecutiveActionQueueItems(items);
  const bySource = {};
  const bySeverity = {};

  for (const item of openItems) {
    bySource[item.sourceModule] = (bySource[item.sourceModule] || 0) + 1;
    bySeverity[item.severity] = (bySeverity[item.severity] || 0) + 1;
  }

  return {
    total: items.length,
    open: openItems.length,
    bySource,
    bySeverity,
  };
}

/**
 * Compose revenue queue from qualification, contract renewal, and commission signals.
 *
 * @param {{
 *   payload?: object,
 *   contracts?: object[],
 *   pendingCommissions?: object[],
 *   tenantId?: string,
 *   ownershipMetrics?: object,
 *   directoryUsers?: object[],
 *   options?: { qualificationLimit?: number, commissionLimit?: number },
 * }} input
 */
export function buildExecutiveActionQueue(input = {}) {
  const payload = input.payload || {};
  const contracts = input.contracts || [];
  const pendingCommissions = input.pendingCommissions || [];
  const tenantId = str(input.tenantId);
  const ownershipMetrics = input.ownershipMetrics || null;
  const directoryUsers = input.directoryUsers || [];
  const opts = input.options || {};

  const qualifications = Array.isArray(payload.qualifications) ? payload.qualifications : [];

  const rawItems = [
    ...ingestQualificationQueueItems(qualifications, opts.qualificationLimit ?? 12),
    ...ingestContractRenewalQueueItems(contracts, payload),
    ...ingestCommissionQueueItems(pendingCommissions, opts.commissionLimit ?? 15),
    ...(ownershipMetrics
      ? ingestOwnershipRisk(ownershipMetrics, directoryUsers)
      : []),
  ];

  const records = tenantId ? loadInterventionRecords(tenantId) : {};
  const hydrated = rawItems.map((item) => hydrateInterventionIssue(item, tenantId, records));

  const sorted = [...hydrated].sort((a, b) => {
    const impact = num(b.impactScore) - num(a.impactScore);
    if (impact !== 0) return impact;
    const sev =
      severityRank(a.severity) - severityRank(b.severity);
    if (sev !== 0) return sev;
    return str(a.title).localeCompare(str(b.title), undefined, { sensitivity: "base" });
  });

  return {
    items: sorted,
    counts: buildCounts(sorted),
    generatedAt: new Date().toISOString(),
  };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function severityRank(severity) {
  switch (str(severity).toUpperCase()) {
    case "CRITICAL":
      return 0;
    case "ATTENTION":
      return 1;
    default:
      return 2;
  }
}
