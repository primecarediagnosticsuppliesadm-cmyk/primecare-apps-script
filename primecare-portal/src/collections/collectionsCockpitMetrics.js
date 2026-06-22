import { computeUnallocatedArAmount, sumOpenOrderAmounts } from "@/collections/collectionsOpenOrders.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v) {
  return String(v ?? "").trim();
}

export function localDateYmd(d = new Date()) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

export function daysSinceDate(dateRaw) {
  const s = str(dateRaw).slice(0, 10);
  if (!s) return null;
  const then = new Date(`${s}T12:00:00`).getTime();
  const now = new Date(`${localDateYmd()}T12:00:00`).getTime();
  const diff = Math.floor((now - then) / 86400000);
  return Number.isFinite(diff) && diff >= 0 ? diff : null;
}

export function isFollowUpDue(nextFollowUp, today = localDateYmd()) {
  const d = str(nextFollowUp).slice(0, 10);
  if (!d) return false;
  return d <= today;
}

export function followUpOverdueDays(nextFollowUp, today = localDateYmd()) {
  const d = str(nextFollowUp).slice(0, 10);
  if (!d || d > today) return 0;
  return daysSinceDate(d) ?? 0;
}

export const HEALTH_TIER_META = {
  healthy: {
    id: "healthy",
    label: "Healthy",
    emoji: "🟢",
    rowClass: "border-l-emerald-500",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  attention: {
    id: "attention",
    label: "Attention",
    emoji: "🟡",
    rowClass: "border-l-amber-400",
    badgeClass: "bg-amber-50 text-amber-900 border-amber-200",
  },
  followup_due: {
    id: "followup_due",
    label: "Follow-up Due",
    emoji: "🟠",
    rowClass: "border-l-orange-500",
    badgeClass: "bg-orange-50 text-orange-900 border-orange-200",
  },
  critical: {
    id: "critical",
    label: "Critical",
    emoji: "🔴",
    rowClass: "border-l-red-600",
    badgeClass: "bg-red-50 text-red-900 border-red-200",
  },
};

export function deriveCollectionHealthTier(item, lastPaymentDate = "") {
  const outstanding = num(item?.outstandingAmount);
  const overdueDays = num(item?.overdueDays);
  const risk = str(item?.riskStatus).toLowerCase();
  const followUpDue = isFollowUpDue(item?.nextFollowUp);
  const lastPayDays = daysSinceDate(lastPaymentDate);

  if (outstanding <= 0) return "healthy";
  if (risk.includes("high") || overdueDays > 30) return "critical";
  if (followUpDue || overdueDays > 0) return "followup_due";
  if (risk.includes("medium") || outstanding >= 50000) return "attention";
  if (lastPayDays !== null && lastPayDays <= 14) return "healthy";
  return "attention";
}

/** AR age bucket from overdue days or days since last payment on open balance. */
export function formatArAgeBucket(item, lastPaymentDate = "") {
  const overdueDays = num(item?.overdueDays);
  const days =
    overdueDays > 0 ? overdueDays : outstandingDaysProxy(item, lastPaymentDate);

  if (days <= 7) return "0–7 days";
  if (days <= 30) return "8–30 days";
  if (days <= 60) return "31–60 days";
  return "60+";
}

function outstandingDaysProxy(item, lastPaymentDate) {
  const outstanding = num(item?.outstandingAmount);
  if (outstanding <= 0) return 0;
  const sincePay = daysSinceDate(lastPaymentDate);
  if (sincePay !== null) return sincePay;
  const sinceFollowUp = daysSinceDate(item?.lastFollowUp || item?.nextFollowUp);
  return sinceFollowUp ?? 0;
}

export function formatLastPaymentAge(lastPaymentDate) {
  const days = daysSinceDate(lastPaymentDate);
  if (days === null) return "No payment";
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export function summarizeHqCockpit(collections, summary = {}) {
  const rows = collections || [];
  const today = localDateYmd();
  const labsRequiringAction = rows.filter((c) => num(c.outstandingAmount) > 0).length;
  const totalCollected = rows.reduce((s, c) => s + num(c.totalPaid), 0);
  const followUpsDue = rows.filter(
    (c) => num(c.outstandingAmount) > 0 && isFollowUpDue(c.nextFollowUp, today)
  ).length;
  const highRiskLabs = rows.filter(
    (c) => str(c.riskStatus).toLowerCase() === "high"
  ).length;

  return {
    totalOutstanding: num(summary.totalOutstanding) || rows.reduce((s, c) => s + num(c.outstandingAmount), 0),
    labsRequiringAction,
    totalCollected,
    followUpsDue,
    highRiskLabs: highRiskLabs || num(summary.highRiskCount),
  };
}

function attentionScore(item, ctx) {
  const key = str(item.labId);
  const lastPaymentDate = ctx.lastPaymentByLabId?.[key] || "";
  const openOrders = ctx.labOrdersByLabId?.[key] || [];
  const tier = deriveCollectionHealthTier(item, lastPaymentDate);
  const outstanding = num(item.outstandingAmount);
  const unallocated = computeUnallocatedArAmount(outstanding, openOrders);
  const overdueFollowUp = followUpOverdueDays(item.nextFollowUp);
  const riskHigh = str(item.riskStatus).toLowerCase() === "high";

  let score = outstanding;
  if (overdueFollowUp > 0) score += 1_000_000 + overdueFollowUp * 1000;
  if (riskHigh || tier === "critical") score += 500_000;
  if (tier === "followup_due") score += 200_000;
  if (unallocated > 0.01) score += 100_000 + unallocated;
  return score;
}

function attentionReason(item, ctx) {
  const key = str(item.labId);
  const lastPaymentDate = ctx.lastPaymentByLabId?.[key] || "";
  const openOrders = ctx.labOrdersByLabId?.[key] || [];
  const tier = deriveCollectionHealthTier(item, lastPaymentDate);
  const unallocated = computeUnallocatedArAmount(num(item.outstandingAmount), openOrders);
  const overdueFollowUp = followUpOverdueDays(item.nextFollowUp);

  if (tier === "critical" || str(item.riskStatus).toLowerCase() === "high") {
    return { headline: "Collect now", detail: "High risk — immediate collection" };
  }
  if (overdueFollowUp > 0) {
    return {
      headline: "Follow-up due",
      detail: `${overdueFollowUp} day${overdueFollowUp === 1 ? "" : "s"} overdue`,
    };
  }
  if (unallocated > 0.01) {
    return {
      headline: "AR reconciliation",
      detail: `AR mismatch ₹${Math.round(unallocated).toLocaleString("en-IN")}`,
    };
  }
  if (tier === "followup_due") {
    return { headline: "Follow-up due", detail: "Scheduled follow-up is due" };
  }
  return { headline: "Attention", detail: "Outstanding balance needs review" };
}

export function buildNeedsAttentionQueue(collections, ctx = {}) {
  const candidates = (collections || []).filter((c) => num(c.outstandingAmount) > 0);
  return candidates
    .map((item) => {
      const key = str(item.labId);
      const lastPaymentDate = ctx.lastPaymentByLabId?.[key] || "";
      const tier = deriveCollectionHealthTier(item, lastPaymentDate);
      const reason = attentionReason(item, ctx);
      return {
        item,
        labId: key,
        labName: item.labName || item.labId,
        outstanding: num(item.outstandingAmount),
        lastPaymentAge: formatLastPaymentAge(lastPaymentDate),
        healthTier: tier,
        reason,
        score: attentionScore(item, ctx),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

export function sumCollectibleOpenOrdersTotal(collections, labOrdersByLabId = {}) {
  return (collections || []).reduce((sum, item) => {
    const orders = labOrdersByLabId[str(item.labId)] || [];
    return sum + sumOpenOrderAmounts(orders);
  }, 0);
}
