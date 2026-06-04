import { mapPaymentHistoryRow } from "@/api/primecareSupabaseApi.js";
import {
  resolveOrderAmount,
  buildLineTotalByOrderId,
  orderCountsTowardDashboardRevenue,
  orderOperationalExcludedFromIndices,
} from "@/metrics/computeRevenueMetrics.js";
import { getCommissionRule, COMMISSION_RULE_VERSION, DEFAULT_COMMISSION_PHASE_ID } from "@/commission/commissionRules.js";
import { labIdKey } from "@/utils/labId.js";

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

export function currentPeriodYmd(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function agentKeyFromName(name) {
  const n = str(name).toLowerCase();
  if (!n || n === "-" || n === "null") return "";
  return n.replace(/\s+/g, "_").slice(0, 48);
}

function paymentInPeriod(paymentDate, periodYmd) {
  const d = str(paymentDate).slice(0, 7);
  return d === periodYmd;
}

function orderInPeriod(orderDate, periodYmd) {
  return str(orderDate).slice(0, 7) === periodYmd;
}

/**
 * Build lab → agent map from collections + recent visits.
 */
function buildLabAgentMaps(collections, visits) {
  const byLab = new Map();
  for (const c of collections || []) {
    const lid = labIdKey(c.labId);
    const agent = str(c.assignedAgent);
    if (lid && agent) byLab.set(lid, agent);
  }
  for (const v of visits || []) {
    const lid = labIdKey(v.labId || v.lab_id);
    const agent = str(v.agentName || v.agent_name || v.agent);
    if (lid && agent) byLab.set(lid, agent);
  }
  return byLab;
}

/**
 * Attribute collections and revenue per agent for period.
 */
export function computeAgentAttribution({ collections, visits, orders, orderLines, payments, periodYmd }) {
  const labAgents = buildLabAgentMaps(collections, visits);
  const lineTotals = buildLineTotalByOrderId(orderLines);
  const agents = new Map();

  function ensureAgent(name) {
    const key = agentKeyFromName(name);
    if (!key) return null;
    if (!agents.has(key)) {
      agents.set(key, {
        agentKey: key,
        agentName: str(name),
        collectedAmount: 0,
        revenueAttributed: 0,
        outstandingOnLabs: 0,
        labsTouched: new Set(),
        paymentCount: 0,
      });
    }
    return agents.get(key);
  }

  for (const p of payments || []) {
    const mapped = mapPaymentHistoryRow(p);
    if (!paymentInPeriod(mapped.paymentDate, periodYmd)) continue;
    const lid = labIdKey(p.lab_id ?? p.labId);
    const agentName = labAgents.get(lid) || str(p.collected_by) || "Unassigned";
    const row = ensureAgent(agentName);
    if (!row) continue;
    const amt = num(mapped.amountCollected);
    row.collectedAmount += amt;
    row.paymentCount += 1;
    if (lid) row.labsTouched.add(lid);
  }

  for (const c of collections || []) {
    const lid = labIdKey(c.labId);
    const agentName = str(c.assignedAgent) || labAgents.get(lid);
    const row = agentName ? ensureAgent(agentName) : null;
    if (row && lid) {
      row.labsTouched.add(lid);
      row.outstandingOnLabs += num(c.outstandingAmount);
    }
  }

  for (const o of orders || []) {
    if (orderOperationalExcludedFromIndices(o)) continue;
    if (!orderInPeriod(o.order_date || o.orderDate || o.created_at, periodYmd)) continue;
    if (!orderCountsTowardDashboardRevenue(o)) continue;
    const lid = labIdKey(o.lab_id ?? o.labId);
    const agentName = labAgents.get(lid) || str(o.agent_name);
    const row = ensureAgent(agentName || "Unassigned");
    if (!row) continue;
    row.revenueAttributed += resolveOrderAmount(o, lineTotals);
    if (lid) row.labsTouched.add(lid);
  }

  return [...agents.values()].map((a) => ({
    ...a,
    labsTouched: a.labsTouched.size,
    efficiencyPct:
      a.collectedAmount + a.outstandingOnLabs > 0
        ? clamp((a.collectedAmount / (a.collectedAmount + a.outstandingOnLabs)) * 100)
        : a.collectedAmount > 0
          ? 100
          : 0,
  }));
}

export function calculateAgentCommission(agentRow, rule, phaseId) {
  const thresholdMet =
    agentRow.collectedAmount >= rule.minMonthlyCollection &&
    agentRow.efficiencyPct >= rule.minEfficiencyPct;

  const collectionCommission = agentRow.collectedAmount * rule.collectionRate;
  const revenueCommission = agentRow.revenueAttributed * rule.revenueShare;
  let commissionAmount = Math.round(collectionCommission + revenueCommission);

  if (!thresholdMet) commissionAmount = 0;

  return {
    ...agentRow,
    phaseId,
    ruleVersion: COMMISSION_RULE_VERSION,
    thresholdMet,
    collectionCommission: Math.round(collectionCommission),
    revenueCommission: Math.round(revenueCommission),
    commissionAmount,
    eligible: thresholdMet && commissionAmount > 0,
  };
}

/**
 * Build computed commission entries for period (merge with store in data layer).
 */
export function buildCommissionEntries({
  attribution,
  phaseId = DEFAULT_COMMISSION_PHASE_ID,
  periodYmd = currentPeriodYmd(),
  tenantId = "",
}) {
  const rule = getCommissionRule(phaseId);
  const now = new Date().toISOString();

  return attribution.map((agent) => {
    const calc = calculateAgentCommission(agent, rule, phaseId);
    return {
      id: `comm-${periodYmd}-${calc.agentKey}`,
      tenantId,
      periodYmd,
      agentKey: calc.agentKey,
      agentName: calc.agentName,
      collectedAmount: calc.collectedAmount,
      revenueAttributed: calc.revenueAttributed,
      commissionAmount: calc.commissionAmount,
      collectionCommission: calc.collectionCommission,
      revenueCommission: calc.revenueCommission,
      efficiencyPct: calc.efficiencyPct,
      labsTouched: calc.labsTouched,
      paymentCount: calc.paymentCount,
      thresholdMet: calc.thresholdMet,
      phaseId: calc.phaseId,
      ruleVersion: calc.ruleVersion,
      status: "pending",
      eligible: calc.eligible,
      createdAt: now,
      updatedAt: now,
    };
  });
}

export function buildCommissionSummary(entries, rule) {
  const pending = entries.filter((e) => e.status === "pending");
  const approved = entries.filter((e) => e.status === "approved");
  const paid = entries.filter((e) => e.status === "paid");

  const sum = (list, field) => list.reduce((s, e) => s + num(e[field]), 0);

  return {
    agentCount: entries.length,
    pendingCount: pending.length,
    approvedCount: approved.length,
    paidCount: paid.length,
    pendingTotal: sum(pending, "commissionAmount"),
    approvedTotal: sum(approved, "commissionAmount"),
    paidTotal: sum(paid, "commissionAmount"),
    collectedTotal: sum(entries, "collectedAmount"),
    revenueTotal: sum(entries, "revenueAttributed"),
    rule,
    belowThreshold: entries.filter((e) => !e.thresholdMet).length,
  };
}

export function buildCommissionModel({
  entries,
  payouts,
  phaseId,
  periodYmd,
  rule,
}) {
  const summary = buildCommissionSummary(entries, rule);
  const agents = entries
    .map((e) => ({
      agentKey: e.agentKey,
      agentName: e.agentName,
      collectedAmount: e.collectedAmount,
      revenueAttributed: e.revenueAttributed,
      commissionAmount: e.commissionAmount,
      efficiencyPct: e.efficiencyPct,
      labsTouched: e.labsTouched,
      status: e.status,
      thresholdMet: e.thresholdMet,
    }))
    .sort((a, b) => b.commissionAmount - a.commissionAmount);

  return {
    version: COMMISSION_RULE_VERSION,
    periodYmd,
    phaseId,
    rule,
    summary,
    entries,
    agents,
    payouts: payouts || [],
    pending: entries.filter((e) => e.status === "pending"),
    approved: entries.filter((e) => e.status === "approved"),
  };
}
