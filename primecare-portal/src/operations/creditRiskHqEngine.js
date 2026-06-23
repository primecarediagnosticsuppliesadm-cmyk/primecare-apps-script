import { formatLastPaymentAge } from "@/collections/collectionsCockpitMetrics.js";
import { resolveLabAgent } from "@/operations/labAgentResolver.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v) {
  return String(v ?? "").trim();
}

export function formatCreditRiskCurrency(value) {
  return `₹${num(value).toLocaleString("en-IN")}`;
}

export function isCreditHoldAccount(item = {}) {
  const raw = str(item.creditHold).toLowerCase();
  return raw === "hold" || raw === "true" || raw === "y" || raw === "yes";
}

export function collectionOverdueBucket(item = {}) {
  const days = num(item.overdueDays);
  if (days <= 0) return "current";
  if (days <= 15) return "1_15";
  if (days <= 30) return "16_30";
  return "31_plus";
}

export const OVERDUE_BUCKET_ORDER = ["current", "1_15", "16_30", "31_plus"];

export const OVERDUE_BUCKET_LABELS = {
  current: "Current",
  "1_15": "1–15 days overdue",
  "16_30": "16–30 days overdue",
  "31_plus": "31+ days overdue",
};

/** Client-side exposure risk tier for HQ command center. */
export function deriveExposureRiskLevel(item = {}) {
  const outstanding = num(item.outstandingAmount);
  const overdueDays = num(item.overdueDays);
  const risk = str(item.riskStatus).toLowerCase();
  const hold = isCreditHoldAccount(item);
  const creditLimit = num(item.creditLimit);
  const utilization = creditLimit > 0 ? outstanding / creditLimit : 0;

  if (hold || risk.includes("high") || overdueDays > 30 || utilization >= 0.9) return "Critical";
  if (overdueDays > 15 || utilization >= 0.75 || risk.includes("medium")) return "High";
  if (overdueDays > 0 || utilization >= 0.5 || outstanding >= 25000) return "Medium";
  return "Low";
}

function sumOutstanding(list = []) {
  return list.reduce((sum, row) => sum + num(row.outstandingAmount), 0);
}

function isHighExposure(item = {}) {
  const outstanding = num(item.outstandingAmount);
  if (outstanding <= 0) return false;
  const creditLimit = num(item.creditLimit);
  const utilization = creditLimit > 0 ? outstanding / creditLimit : 0;
  return utilization >= 0.75 || outstanding >= 50000;
}

/** Action-first attention cards for HQ Credit & Risk. */
export function buildCreditRiskAttentionCards(collections = []) {
  const rows = collections;
  const withOutstanding = rows.filter((c) => num(c.outstandingAmount) > 0);
  const holdLabs = rows.filter(isCreditHoldAccount);
  const overdueLabs = rows.filter((c) => num(c.overdueDays) > 0 && num(c.outstandingAmount) > 0);
  const exposureLabs = rows.filter(isHighExposure);

  return [
    {
      id: "collections",
      title: "Collections Requiring Action",
      count: withOutstanding.length,
      outstanding: sumOutstanding(withOutstanding),
      severity: withOutstanding.length > 0 ? "attention" : "healthy",
      actionText:
        withOutstanding.length > 0
          ? `${formatCreditRiskCurrency(sumOutstanding(withOutstanding))} outstanding`
          : "All receivables current",
      ctaLabel: withOutstanding.length > 0 ? "Review Collections" : "View workspace",
      filter: "outstanding",
    },
    {
      id: "hold",
      title: "Credit Hold Accounts",
      count: holdLabs.length,
      outstanding: sumOutstanding(holdLabs),
      severity: holdLabs.length > 0 ? "critical" : "healthy",
      actionText:
        holdLabs.length > 0
          ? `${holdLabs.length} lab${holdLabs.length === 1 ? "" : "s"} blocked from ordering`
          : "No labs on hold",
      ctaLabel: "Review Labs",
      filter: "hold",
      page: "labs",
    },
    {
      id: "overdue",
      title: "Overdue Accounts",
      count: overdueLabs.length,
      outstanding: sumOutstanding(overdueLabs),
      severity: overdueLabs.length > 0 ? "attention" : "healthy",
      actionText:
        overdueLabs.length > 0
          ? `${formatCreditRiskCurrency(sumOutstanding(overdueLabs))} overdue`
          : "No overdue balances",
      ctaLabel: "Review Overdue",
      filter: "overdue",
    },
    {
      id: "exposure",
      title: "High Exposure Accounts",
      count: exposureLabs.length,
      outstanding: sumOutstanding(exposureLabs),
      severity: exposureLabs.length > 0 ? "monitor" : "healthy",
      actionText:
        exposureLabs.length > 0
          ? "Elevated utilization or large balances"
          : "Exposure within limits",
      ctaLabel: "View Exposure",
      filter: "exposure",
    },
  ];
}

export function buildCreditRiskPortfolioStrip(collections = [], summary = {}) {
  const rows = collections;
  return {
    totalOutstanding:
      num(summary.totalOutstanding) || rows.reduce((s, c) => s + num(c.outstandingAmount), 0),
    labsNeedingAction: rows.filter((c) => num(c.outstandingAmount) > 0).length,
    overdueLabs: rows.filter((c) => num(c.overdueDays) > 0).length,
    onHold: rows.filter(isCreditHoldAccount).length,
  };
}

export function groupCollectionsByOverdueBucket(collections = []) {
  const buckets = {
    current: [],
    "1_15": [],
    "16_30": [],
    "31_plus": [],
  };
  for (const item of collections) {
    buckets[collectionOverdueBucket(item)].push(item);
  }
  for (const key of OVERDUE_BUCKET_ORDER) {
    buckets[key].sort((a, b) => num(b.outstandingAmount) - num(a.outstandingAmount));
  }
  return buckets;
}

export function filterCollectionsForCreditRiskView(collections = [], filter = "ALL") {
  const f = str(filter).toLowerCase();
  if (f === "all") return collections;
  if (f === "outstanding") return collections.filter((c) => num(c.outstandingAmount) > 0);
  if (f === "hold") return collections.filter(isCreditHoldAccount);
  if (f === "overdue") {
    return collections.filter((c) => num(c.overdueDays) > 0 && num(c.outstandingAmount) > 0);
  }
  if (f === "exposure") return collections.filter(isHighExposure);
  return collections;
}

export function buildTopExposureLabs(collections = [], limit = 10, directoryUsers = []) {
  return [...collections]
    .filter((c) => num(c.outstandingAmount) > 0)
    .sort((a, b) => num(b.outstandingAmount) - num(a.outstandingAmount))
    .slice(0, limit)
    .map((item) => {
      const outstanding = num(item.outstandingAmount);
      const creditLimit = num(item.creditLimit);
      const agent = resolveLabAgent(item, directoryUsers);
      return {
        labId: str(item.labId),
        labName: str(item.labName) || str(item.labId),
        assignedAgent: agent.displayLabel,
        assignedAgentId: agent.agentId,
        outstanding,
        creditLimit,
        utilizationPct: creditLimit > 0 ? Math.round((outstanding / creditLimit) * 100) : null,
        riskLevel: deriveExposureRiskLevel(item),
        overdueDays: num(item.overdueDays),
        item,
      };
    });
}

export function buildInterventionLabs(
  collections = [],
  lastPaymentByLabId = {},
  directoryUsers = []
) {
  return collections
    .filter((c) => {
      const level = deriveExposureRiskLevel(c);
      return level === "Critical" || level === "High";
    })
    .map((item) => {
      const key = str(item.labId);
      const agent = resolveLabAgent(item, directoryUsers);
      return {
        labId: key,
        labName: str(item.labName) || key,
        outstanding: num(item.outstandingAmount),
        overdueDays: num(item.overdueDays),
        agent: agent.displayLabel,
        assignedAgentId: agent.agentId,
        lastVisit: str(item.lastFollowUp).slice(0, 10) || "—",
        lastPayment: formatLastPaymentAge(lastPaymentByLabId[key] || ""),
        riskLevel: deriveExposureRiskLevel(item),
        item,
      };
    })
    .sort((a, b) => b.outstanding - a.outstanding);
}
