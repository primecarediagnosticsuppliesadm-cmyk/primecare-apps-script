/**
 * Operations Center presentation — read-only health, readiness footer, workload labels.
 * No business logic; derives display state from existing bundle integrity + KPIs.
 */

import { APP_ENV, IS_PROD, IS_QA } from "@/config/environment.js";
import { deriveCreditTierFromLabRecord } from "@/metrics/creditTier.js";
import { countUsersAwaitingProvisioning } from "@/operations/userProvisioningEngine.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function getOperationsEnvironmentLabel() {
  if (IS_QA) return "QA";
  if (IS_PROD) return "Production";
  const env = String(APP_ENV || "").trim();
  if (env) return env.toUpperCase();
  return "Development";
}

export function formatLastRefreshLabel(loadedAt) {
  if (!loadedAt) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - loadedAt) / 1000));
  if (sec < 8) return "Just now";
  if (sec < 60) return `${sec} seconds ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return min === 1 ? "1 minute ago" : `${min} minutes ago`;
  const hr = Math.floor(min / 60);
  return hr === 1 ? "1 hour ago" : `${hr} hours ago`;
}

function readinessTone(healthy) {
  return healthy ? "Healthy" : "Attention";
}

/**
 * @param {{ directoryIntegrity?: object, kpis?: object, ownershipMetrics?: object }} input
 */
export function buildOperationsHealthItems({
  directoryIntegrity = {},
  kpis = {},
  ownershipMetrics = {},
} = {}) {
  const s = directoryIntegrity.summary || {};
  const unassigned = num(kpis.unassignedLabs ?? ownershipMetrics.unassignedLabs);
  const coverage = num(ownershipMetrics.coveragePct ?? (unassigned === 0 ? 100 : 0));

  const ownershipOk =
    num(s.assignedVsOwnershipMismatch) === 0 && num(s.agentLabCountMismatch) === 0;
  const assignmentsOk = num(s.agentLabCountMismatch) === 0;
  const coverageOk = unassigned === 0;
  const probeOk = num(s.probeWithLabs) === 0;
  const duplicateOk = num(s.duplicateActiveOwnership) === 0;

  return [
    {
      id: "ownership_reconciliation",
      label: "Ownership Reconciliation",
      status: ownershipOk ? "pass" : "warn",
      detail: ownershipOk ? null : `${num(s.assignedVsOwnershipMismatch) + num(s.agentLabCountMismatch)} issue(s)`,
      navigate: "labOwnership",
    },
    {
      id: "user_assignments",
      label: "User Assignments",
      status: assignmentsOk ? "pass" : "warn",
      detail: assignmentsOk ? null : `${num(s.agentLabCountMismatch)} mismatch(es)`,
      navigate: "directory",
    },
    {
      id: "laboratory_coverage",
      label: "Laboratory Coverage",
      status: coverageOk ? "pass" : "warn",
      detail: coverageOk ? `${coverage}%` : `${unassigned} unassigned`,
      navigate: "labOwnership",
      scrollUnassigned: false,
    },
    {
      id: "probe_assignments",
      label: "Probe Users With Assignments",
      status: probeOk ? "pass" : "warn",
      detail: probeOk ? null : `(${num(s.probeWithLabs)})`,
      navigate: "directory",
      audience: "probe_debug",
    },
    {
      id: "duplicate_ownership",
      label: "Duplicate Ownership",
      status: duplicateOk ? "pass" : "warn",
      detail: duplicateOk ? null : `${num(s.duplicateActiveOwnership)} lab(s)`,
      navigate: "labOwnership",
    },
    {
      id: "unassigned_labs",
      label: "Unassigned Laboratories",
      status: coverageOk ? "pass" : "warn",
      detail: coverageOk ? null : `${unassigned}`,
      navigate: "labOwnership",
      scrollUnassigned: true,
    },
  ];
}

/**
 * Live operational readiness — no build SHA or script pass counts.
 * @param {{ directoryIntegrity?: object, kpis?: object, ownershipMetrics?: object, loadedAt?: number|null }} input
 */
export function buildOperationsReadinessFooterState({
  directoryIntegrity = {},
  kpis = {},
  ownershipMetrics = {},
  loadedAt = null,
} = {}) {
  const s = directoryIntegrity.summary || {};
  const healthItems = buildOperationsHealthItems({ directoryIntegrity, kpis, ownershipMetrics });
  const warnCount = healthItems.filter((i) => i.status === "warn").length;

  const ownershipHealthy =
    num(s.duplicateActiveOwnership) === 0 && num(s.assignedVsOwnershipMismatch) === 0;
  const assignmentHealthy = num(s.agentLabCountMismatch) === 0;
  const integrityHealthy = num(s.warningCount) === 0;

  const onlyProbeWarns =
    warnCount > 0 &&
    num(s.probeWithLabs) > 0 &&
    ownershipHealthy &&
    assignmentHealthy &&
    num(s.duplicateActiveOwnership) === 0;

  return {
    environmentLabel: getOperationsEnvironmentLabel(),
    usersCount: num(kpis.totalUsers),
    ownershipLabel: readinessTone(ownershipHealthy),
    assignmentsLabel: readinessTone(assignmentHealthy),
    integrityLabel: readinessTone(integrityHealthy),
    lastRefreshLabel: formatLastRefreshLabel(loadedAt),
    overallLabel:
      warnCount === 0 || onlyProbeWarns ? "Ready for HQ UAT" : "Review Recommended",
    ready: warnCount === 0 || onlyProbeWarns,
    /** Reserved for future build metadata — not displayed until populated. */
    buildMetadata: null,
  };
}

/** Summarize agent lab workload from already-assigned directory + lab rows (no new metrics). */
export function summarizeAgentWorkloadRow(user, assignedLabs = [], options = {}) {
  const labs = assignedLabs || [];
  const inactive = options.inactive ?? user?.active === false;
  const outstandingTotal = labs.reduce(
    (sum, lab) => sum + (Number.isFinite(Number(lab.outstanding)) ? Number(lab.outstanding) : 0),
    0
  );
  const lastVisit =
    labs
      .map((lab) => String(lab.lastVisit ?? "").trim())
      .filter((v) => v && v !== "-")
      .sort((a, b) => b.localeCompare(a))[0] || "";

  const hasOverdue = labs.some((lab) => num(lab.daysOverdue ?? lab.overdueDays) > 0);
  const hasOutstanding = outstandingTotal > 0;

  let statusLabel = "Healthy";
  let statusTone = "ok";
  if (inactive && !hasOutstanding && !hasOverdue) {
    statusLabel = "Inactive";
    statusTone = "inactive";
  } else if (hasOutstanding || hasOverdue) {
    statusLabel = "Attention";
    statusTone = "warn";
  }

  return {
    labs: labs.length,
    outstandingTotal,
    lastVisit,
    statusLabel,
    statusTone,
    showOutstanding: outstandingTotal > 0,
    showLastVisit: Boolean(lastVisit),
  };
}

/**
 * Compact HQ attention items — counts from existing bundle fields only (hidden when zero).
 * @param {{ labAssignments?: object[], kpis?: object, directoryUsers?: object[], directoryIntegrity?: object }} input
 */
export function buildOperationsAttentionItems({
  labAssignments = [],
  kpis = {},
  directoryUsers = [],
  directoryIntegrity = {},
} = {}) {
  const labs = labAssignments || [];
  const creditHoldCount = labs.filter((lab) => deriveCreditTierFromLabRecord(lab) === "HOLD").length;
  const overdueCount = labs.filter(
    (lab) => num(lab.daysOverdue ?? lab.overdueDays) > 0 && num(lab.outstanding) > 0
  ).length;
  const unassignedCount = num(kpis.unassignedLabs);
  const awaitingProvisioningCount = countUsersAwaitingProvisioning(directoryUsers);
  const ownershipWarningCount = (directoryIntegrity.warnings || []).length;

  return [
    {
      id: "credit_hold",
      label: "Credit Hold Labs",
      count: creditHoldCount,
      emoji: "🔴",
      navigate: "creditRisk",
      filter: "hold",
    },
    {
      id: "overdue_collections",
      label: "Overdue Collections",
      count: overdueCount,
      emoji: "🟠",
      navigate: "creditRisk",
      filter: "overdue",
    },
    {
      id: "unassigned_labs",
      label: "Unassigned Laboratories",
      count: unassignedCount,
      emoji: "🟡",
      navigate: "labOwnership",
      scrollUnassigned: true,
    },
    {
      id: "awaiting_provisioning",
      label: "Users Awaiting Provisioning",
      count: awaitingProvisioningCount,
      emoji: "🔵",
      navigate: "directory",
      audience: "awaiting_provisioning",
    },
    {
      id: "ownership_warnings",
      label: "Ownership Warnings",
      count: ownershipWarningCount,
      emoji: "🟢",
      navigate: "integrity",
    },
  ].filter((item) => item.count > 0);
}
