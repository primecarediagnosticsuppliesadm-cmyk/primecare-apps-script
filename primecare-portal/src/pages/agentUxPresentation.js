const STALE_VISIT_DAYS = 14;

export function formatAgentCurrency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

export function hasDisplayValue(value) {
  if (value == null || value === false) return false;
  const raw = String(value).trim();
  if (!raw || raw === "-" || raw.toLowerCase() === "false" || raw === "0") return false;
  return true;
}

export function formatAgentShortDate(value) {
  if (!hasDisplayValue(value)) return "";
  const s = String(value).slice(0, 10);
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function daysSinceVisit(lastVisit) {
  if (!hasDisplayValue(lastVisit)) return null;
  const d = new Date(String(lastVisit).slice(0, 10));
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
}

export function formatLastVisitRelative(lastVisit) {
  const days = daysSinceVisit(lastVisit);
  if (days == null) return "";
  if (days === 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function isStaleVisit(lastVisit) {
  const days = daysSinceVisit(lastVisit);
  return days == null || days >= STALE_VISIT_DAYS;
}

/**
 * @param {number} outstanding
 * @param {number} totalPaid
 */
export function computeCollectionProgressPct(outstanding, totalPaid) {
  const out = Number(outstanding || 0);
  const paid = Number(totalPaid || 0);
  const exposure = out + paid;
  if (exposure <= 0) return 0;
  return Math.min(100, Math.round((paid / exposure) * 100));
}

/**
 * Specific operational reasons for priority cards (max 3).
 * @param {Object} item
 */
export function deriveOperationalReasons(item) {
  const reasons = [];
  const outstanding = Number(item?.outstanding ?? item?.outstandingAmount ?? 0);
  const overdueDays = Number(item?.overdueDays ?? item?.daysOverdue ?? 0);
  const visitDays = daysSinceVisit(item?.lastVisit);
  const queueType = String(item?.queueType || "").toUpperCase();
  const suggested = computeSuggestedCollectionToday(outstanding);

  if (outstanding > 0 && suggested > 0) {
    reasons.push(`Collect ${formatAgentCurrency(suggested)} today`);
  }

  if (visitDays != null && visitDays >= 1) {
    reasons.push(`No visit in ${visitDays} day${visitDays === 1 ? "" : "s"}`);
  } else if (isStaleVisit(item?.lastVisit) && visitDays == null) {
    reasons.push("No recent visit");
  }

  if (outstanding > 0) {
    reasons.push(`Outstanding balance ${formatAgentCurrency(outstanding)}`);
  }

  if (overdueDays > 0) {
    reasons.push("Collection overdue");
  } else if (
    (queueType === "COLLECTION_DUE" || queueType === "OVERDUE_ACCOUNT") &&
    outstanding > 0 &&
    !reasons.includes("Collection overdue")
  ) {
    reasons.push("Collection overdue");
  }

  if (queueType === "FOLLOW_UP_DUE" && reasons.length < 3) {
    reasons.push("Follow-up due today");
  }

  const custom = String(item?.reason || "").trim();
  if (
    custom &&
    custom !== "-" &&
    !custom.toLowerCase().includes("visit and collect") &&
    !reasons.includes(custom)
  ) {
    reasons.unshift(custom);
  }

  return [...new Set(reasons)].slice(0, 3);
}

/**
 * @param {Object} item Action queue or collection row
 */
export function deriveAttentionReasons(item) {
  return deriveOperationalReasons(item);
}

/**
 * Queue card recommended action label (visit-first).
 * @param {Object} item
 */
export function deriveQueueRecommendedAction(item) {
  const outstanding = Number(item?.outstanding ?? item?.outstandingAmount ?? 0);
  const visitDays = daysSinceVisit(item?.lastVisit);
  const queueType = String(item?.queueType || "").toUpperCase();

  if (outstanding > 0 && (visitDays == null || visitDays >= 20)) {
    return "Visit and collect payment";
  }
  if (outstanding > 3000) {
    return "High recovery opportunity";
  }
  if (visitDays != null && visitDays >= 20) {
    return "Visit overdue";
  }
  if (outstanding > 0) {
    return "Record payment on outstanding balance";
  }
  if (queueType === "FOLLOW_UP_DUE") {
    return "Complete scheduled follow-up";
  }
  if (queueType === "VISIT_DUE" || queueType === "NO_VISIT") {
    return "Log a field visit";
  }
  return "Start Visit";
}

const GENERIC_LAB_NAMES = new Set(["lab", "unnamed lab", "selected lab"]);

export function isUsableLabName(name) {
  const raw = String(name ?? "").trim();
  if (!raw || !hasDisplayValue(raw)) return false;
  return !GENERIC_LAB_NAMES.has(raw.toLowerCase());
}

/**
 * Suggested amount to collect today (presentation only).
 * @param {number} outstanding
 */
export function computeSuggestedCollectionToday(outstanding) {
  const out = Number(outstanding || 0);
  if (out <= 0) return 0;
  if (out > 3000) return Math.max(500, Math.round(out * 0.45));
  if (out > 1000) return Math.max(300, Math.round(out * 0.6));
  return out;
}

/**
 * Priority queue headline for agents, e.g. "Visit and collect from QA Alpha".
 * @param {number} index 0-based
 * @param {Object} item
 */
export function deriveQueuePriorityLabel(index, item) {
  const labName = isUsableLabName(item?.labName) ? String(item.labName).trim() : "this lab";
  const outstanding = Number(item?.outstanding ?? item?.outstandingAmount ?? 0);
  const prefix = `${Number(index) + 1}. `;
  if (outstanding > 0) {
    return `${prefix}Visit and collect from ${labName}`;
  }
  return `${prefix}Visit ${labName}`;
}

/**
 * @param {Object} item Collection row
 */
export function deriveCollectionRecommendedAction(item) {
  const outstanding = Number(item?.outstandingAmount || 0);
  const overdueDays = Number(item?.overdueDays || 0);
  const visitDays = daysSinceVisit(item?.lastVisit);
  const risk = String(item?.riskStatus || "").toLowerCase();

  if (outstanding > 3000) {
    const target = Math.max(500, Math.round(outstanding * 0.45));
    return `Collect at least ${formatAgentCurrency(target)} today`;
  }
  if (outstanding > 0 && visitDays != null && visitDays >= 20) {
    return "Visit and collect payment";
  }
  if (visitDays != null && visitDays >= 20) {
    return "Visit overdue";
  }
  if (outstanding > 0 && overdueDays > 0) {
    return "Collect overdue balance and confirm next visit";
  }
  if (outstanding > 0 && risk.includes("high")) {
    return "High recovery opportunity";
  }
  if (outstanding > 0) {
    return "Collection pending";
  }
  return "Check account status and schedule visit";
}

/**
 * @param {Object} lab
 */
export function deriveLabRecommendedAction(lab) {
  const outstanding = Number(lab?.outstandingAmount ?? lab?.outstanding ?? 0);
  const visitDays = daysSinceVisit(lab?.lastVisit);

  if (outstanding > 0 && (visitDays == null || visitDays >= 14)) {
    return "Visit and collect payment";
  }
  if (outstanding > 0) {
    return "Collection pending";
  }
  if (visitDays != null && visitDays >= 20) {
    return "Visit overdue";
  }
  if (isStaleVisit(lab?.lastVisit)) {
    return "Routine check-in visit";
  }
  return "Routine check-in visit";
}

/**
 * @param {Object[]} collections
 */
export function countMediumHighRisk(collections) {
  return (collections || []).filter((c) => {
    const risk = String(c?.riskStatus || "").toLowerCase();
    return risk.includes("high") || risk.includes("medium");
  }).length;
}

/**
 * @param {Object} visit
 */
export function formatAgentActivityVisit(visit) {
  const labName = isUsableLabName(visit?.labName) ? String(visit.labName).trim() : "";
  const type = String(visit?.visitType || "visit").toLowerCase();

  if (type.includes("follow")) {
    return labName ? `Follow-up scheduled with ${labName}` : "";
  }
  if (type.includes("collection") || type.includes("payment")) {
    const amt = Number(visit?.amountCollected ?? visit?.collectionAmount ?? 0);
    if (labName && amt > 0) {
      return `Collected ${formatAgentCurrency(amt)} from ${labName}`;
    }
    if (labName && amt <= 0) return "";
    if (amt > 0) return `Collected ${formatAgentCurrency(amt)}`;
    return "";
  }
  return labName ? `Visited ${labName}` : "";
}

const GENERIC_ACTIVITY_PHRASES = [
  "field visit logged",
  "activity recorded",
  "collection updated",
  "payment recorded",
  "account update",
  "order update",
  "visit logged for lab",
];

export function isUsableAgentActivityLabel(label) {
  const raw = String(label ?? "").trim();
  if (!raw || raw === "—") return false;
  const lower = raw.toLowerCase();
  if (lower.includes(" for lab") || lower.endsWith(" for lab")) return false;
  if (GENERIC_ACTIVITY_PHRASES.some((phrase) => lower === phrase)) return false;
  return true;
}

/**
 * @param {Object} row Notification event
 */
export function formatAgentActivityNotification(row) {
  const payload = row?.payload;
  if (payload && typeof payload.message === "string" && payload.message.trim()) {
    const msg = payload.message.trim();
    if (isUsableAgentActivityLabel(msg)) return msg;
  }

  const eventType = String(row?.event_type || row?.eventType || "").toLowerCase();
  const labNameRaw =
    payload?.lab_name ||
    payload?.labName ||
    row?.lab_name ||
    row?.labName ||
    "";
  const labName = isUsableLabName(labNameRaw) ? String(labNameRaw).trim() : "";

  if (eventType.includes("follow")) {
    return labName ? `Follow-up scheduled with ${labName}` : "";
  }
  if (eventType.includes("payment") || eventType.includes("collection")) {
    const amt = Number(payload?.amount ?? payload?.amount_received ?? 0);
    if (labName && amt > 0) {
      return `Collected ${formatAgentCurrency(amt)} from ${labName}`;
    }
    if (labName) return "";
    if (amt > 0) return `Collected ${formatAgentCurrency(amt)}`;
    return "";
  }
  if (eventType.includes("visit")) {
    return labName ? `Visited ${labName}` : "";
  }
  if (eventType.includes("order") && eventType.includes("fulfill")) {
    return labName ? `Order fulfilled for ${labName}` : "";
  }
  if (eventType.includes("order")) {
    return labName ? `Order update for ${labName}` : "";
  }

  return "";
}
