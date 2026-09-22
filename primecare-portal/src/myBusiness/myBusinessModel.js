import { labIdKey, normalizeAgentIdKey } from "@/utils/labId.js";
import { ymdInInclusiveRange } from "@/myBusiness/myBusinessCalendar.js";

export const MY_BUSINESS_LEDGER_CAP = 200;
export const STALE_VISIT_DAYS = 14;

export const MY_BUSINESS_KPI_SOURCES = Object.freeze({
  prospectsAdded: "labs.sourced_by_agent_id + labs.created_at",
  visitsLogged: "agent_visits.visit_date",
  requirements: "agent_visits.commercial_outcome = REQUIREMENT",
  quoteOpportunities: "agent_visits.commercial_outcome = QUOTE_OPPORTUNITY",
  followUpsDue: "agent_visits.next_follow_up_date (latest visit per lab)",
  ordersFromMyLabs: "orders for assigned/sourced/owned labs",
  rupeesOrdered: "orders.total_amount",
  rupeesCollected: "payments.amount_received",
});

function str(v) {
  return String(v ?? "").trim();
}

function ymd(v) {
  return str(v).slice(0, 10);
}

function numAmount(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function lifecycle(status) {
  const s = str(status).toUpperCase();
  if (s === "PROSPECT") return "Prospect";
  if (s === "ACTIVE") return "Active";
  if (s === "INACTIVE") return "Inactive";
  return s || "—";
}

function isProspect(status) {
  return str(status).toUpperCase() === "PROSPECT";
}

function isOperational(status) {
  const s = str(status).toUpperCase();
  return s && s !== "PROSPECT";
}

function daysBetweenYmd(fromYmd, toYmd) {
  if (!fromYmd || !toYmd) return null;
  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.floor((b - a) / 86400000);
}

function discoveryLabel(lines = []) {
  const parts = [];
  for (const line of lines) {
    const kind = str(line.lineKind || line.line_kind);
    const name =
      str(line.brand) ||
      str(line.model) ||
      str(line.description) ||
      str(line.notes);
    const bit = [kind, name].filter(Boolean).join(": ");
    if (bit) parts.push(bit);
    if (parts.join(" · ").length > 80) break;
  }
  const text = parts.join(" · ");
  return text.length > 90 ? `${text.slice(0, 87)}…` : text;
}

/**
 * Latest visit per lab owns the follow-up clock.
 * Later visit (newer visit_date) clears an older follow-up.
 *
 * @param {string} followUpYmd
 * @param {string} todayYmd
 * @param {boolean} clearedByLaterVisit
 */
export function deriveFollowUpStatus(followUpYmd, todayYmd, clearedByLaterVisit = false) {
  const due = ymd(followUpYmd);
  if (!due) return "NONE";
  if (clearedByLaterVisit) return "NONE";
  if (!todayYmd) return "NONE";
  if (due === todayYmd) return "DUE";
  if (due < todayYmd) return "OVERDUE";
  return "FUTURE";
}

function labBelongsToSubject(lab, subjectAgentId, ownedLabIds) {
  const subject = normalizeAgentIdKey(subjectAgentId);
  if (!subject) return false;
  const assigned = normalizeAgentIdKey(lab.assignedAgentId || lab.assigned_agent_id);
  const sourced = normalizeAgentIdKey(lab.sourcedByAgentId || lab.sourced_by_agent_id);
  const lid = labIdKey(lab.labId || lab.lab_id);
  if (assigned === subject) return true;
  if (sourced === subject) return true;
  if (lid && ownedLabIds.has(lid)) return true;
  return false;
}

function visitBelongsToSubject(visit, subjectAgentId) {
  return normalizeAgentIdKey(visit.agentId || visit.agent_id) === normalizeAgentIdKey(subjectAgentId);
}

/**
 * Pure My Business compose. Callers must already restrict rows to the
 * authorized subject. This function still re-filters so HQ-wide arrays
 * cannot leak into KPIs if a caller forgets.
 */
export function buildMyBusinessModel({
  range,
  subjectAgentId,
  actor = {},
  labs = [],
  visits = [],
  orders = [],
  payments = [],
  qualifications = [],
  discoveryLines = [],
  ownershipLabIds = [],
  ledgerCap = MY_BUSINESS_LEDGER_CAP,
} = {}) {
  const subject = normalizeAgentIdKey(subjectAgentId);
  const from = ymd(range?.from);
  const to = ymd(range?.to);
  const todayYmd = ymd(range?.todayYmd) || to;
  const owned = new Set(
    (ownershipLabIds || []).map((id) => labIdKey(id)).filter(Boolean)
  );

  const scopedLabs = (labs || []).filter((lab) => labBelongsToSubject(lab, subject, owned));
  const labById = new Map();
  for (const lab of scopedLabs) {
    const id = labIdKey(lab.labId || lab.lab_id);
    if (id) labById.set(id, lab);
  }
  const inScopeLabIds = new Set(labById.keys());

  const scopedVisits = (visits || []).filter((visit) => visitBelongsToSubject(visit, subject));
  const periodVisits = scopedVisits.filter((visit) =>
    ymdInInclusiveRange(ymd(visit.visitDate || visit.visit_date), from, to)
  );

  const linesByVisit = new Map();
  for (const line of discoveryLines || []) {
    const visitUuid = str(line.visitUuid || line.visit_uuid || line.visitId);
    if (!visitUuid) continue;
    if (!linesByVisit.has(visitUuid)) linesByVisit.set(visitUuid, []);
    linesByVisit.get(visitUuid).push({
      lineKind: str(line.lineKind || line.line_kind),
      brand: str(line.brand),
      model: str(line.model),
      description: str(line.description),
      notes: str(line.notes),
    });
  }

  const bandByLab = new Map();
  for (const q of qualifications || []) {
    const lid = labIdKey(q.labId || q.lab_id);
    if (!lid || !inScopeLabIds.has(lid)) continue;
    if (!bandByLab.has(lid)) {
      bandByLab.set(lid, str(q.qualificationBand || q.qualification_band));
    }
  }

  const visitsByLab = new Map();
  for (const visit of scopedVisits) {
    const lid = labIdKey(visit.labId || visit.lab_id);
    if (!lid) continue;
    if (!visitsByLab.has(lid)) visitsByLab.set(lid, []);
    visitsByLab.get(lid).push(visit);
  }
  for (const list of visitsByLab.values()) {
    list.sort((a, b) => ymd(b.visitDate || b.visit_date).localeCompare(ymd(a.visitDate || a.visit_date)));
  }

  const followUpDueLabIds = [];
  const followUpOverdueLabIds = [];
  const latestByLab = [];
  for (const [lid, list] of visitsByLab.entries()) {
    const latest = list[0];
    if (!latest) continue;
    latestByLab.push(latest);
    const due = ymd(latest.nextFollowUpDate || latest.next_follow_up_date);
    const status = deriveFollowUpStatus(due, todayYmd, false);
    if (status === "DUE") followUpDueLabIds.push(lid);
    if (status === "OVERDUE") followUpOverdueLabIds.push(lid);
  }

  const assignedOperational = scopedLabs.filter(
    (lab) =>
      isOperational(lab.status) &&
      normalizeAgentIdKey(lab.assignedAgentId || lab.assigned_agent_id) === subject
  );
  const staleLabs = [];
  for (const lab of assignedOperational) {
    const lid = labIdKey(lab.labId);
    const last = visitsByLab.get(lid)?.[0];
    const lastYmd = ymd(last?.visitDate || last?.visit_date);
    const age = lastYmd ? daysBetweenYmd(lastYmd, todayYmd) : STALE_VISIT_DAYS + 1;
    if (age == null || age >= STALE_VISIT_DAYS) {
      staleLabs.push({
        labId: lid,
        labName: str(lab.labName),
        lastVisitDate: lastYmd || "",
        daysSinceVisit: age,
      });
    }
  }

  const collectionDue = scopedLabs.filter((lab) => {
    if (!isOperational(lab.status)) return false;
    const outstanding = numAmount(lab.outstanding);
    const daysOverdue = Number(lab.daysOverdue ?? lab.days_overdue ?? 0);
    return outstanding > 0 && (daysOverdue > 0 || str(lab.creditStatus).toUpperCase() === "HOLD");
  });

  const requirementFollowUp = [];
  for (const visit of latestByLab) {
    const outcome = str(visit.commercialOutcome || visit.commercial_outcome).toUpperCase();
    if (outcome !== "REQUIREMENT" && outcome !== "QUOTE_OPPORTUNITY") continue;
    const lid = labIdKey(visit.labId);
    const due = ymd(visit.nextFollowUpDate || visit.next_follow_up_date);
    const status = deriveFollowUpStatus(due, todayYmd, false);
    if (status === "DUE" || status === "OVERDUE") {
      requirementFollowUp.push({
        labId: lid,
        labName: str(labById.get(lid)?.labName || visit.labName),
        outcome,
        followUpStatus: status,
        followUpDate: due,
      });
    }
  }

  const prospectsAdded = scopedLabs.filter((lab) => {
    const sourced = normalizeAgentIdKey(lab.sourcedByAgentId || lab.sourced_by_agent_id) === subject;
    if (!sourced) return false;
    const created = ymd(lab.createdAt || lab.created_at);
    return ymdInInclusiveRange(created, from, to);
  });

  const requirements = periodVisits.filter(
    (v) => str(v.commercialOutcome || v.commercial_outcome).toUpperCase() === "REQUIREMENT"
  );
  const quoteOpportunities = periodVisits.filter(
    (v) => str(v.commercialOutcome || v.commercial_outcome).toUpperCase() === "QUOTE_OPPORTUNITY"
  );

  const scopedOrders = (orders || []).filter((order) => {
    const lid = labIdKey(order.labId || order.lab_id);
    if (!inScopeLabIds.has(lid)) return false;
    return ymdInInclusiveRange(ymd(order.orderDate || order.order_date || order.createdAt), from, to);
  });
  const rupeesOrdered = scopedOrders.reduce(
    (sum, order) => sum + numAmount(order.totalAmount ?? order.total_amount),
    0
  );

  const scopedPayments = (payments || []).filter((pay) => {
    const lid = labIdKey(pay.labId || pay.lab_id);
    if (!inScopeLabIds.has(lid)) return false;
    return ymdInInclusiveRange(ymd(pay.paymentDate || pay.payment_date), from, to);
  });
  const rupeesCollected = scopedPayments.reduce(
    (sum, pay) => sum + numAmount(pay.amountReceived ?? pay.amount_received),
    0
  );

  const ledger = [];

  for (const lab of prospectsAdded) {
    const lid = labIdKey(lab.labId);
    ledger.push({
      id: `prospect:${lid}:${ymd(lab.createdAt)}`,
      date: ymd(lab.createdAt),
      labId: lid,
      labName: str(lab.labName),
      lifecycle: lifecycle(lab.status),
      activity: "PROSPECT_CREATED",
      commercialOutcome: "",
      discovery: "",
      qualification: bandByLab.get(lid) || "",
      notes: "",
      nextAction: "",
      followUpDate: "",
      followUpStatus: "NONE",
      orderAmount: null,
      collectionAmount: null,
    });
  }

  for (const visit of periodVisits) {
    const lid = labIdKey(visit.labId);
    const lab = labById.get(lid);
    const visitUuid = str(visit.id || visit.visitUuid);
    const latest = visitsByLab.get(lid)?.[0];
    const isLatest = latest && str(latest.id || latest.visitUuid) === visitUuid;
    const due = ymd(visit.nextFollowUpDate || visit.next_follow_up_date);
    const followUpStatus = isLatest
      ? deriveFollowUpStatus(due, todayYmd, false)
      : due
        ? "NONE"
        : "NONE";
    ledger.push({
      id: `visit:${visitUuid || `${lid}:${ymd(visit.visitDate)}`}`,
      date: ymd(visit.visitDate || visit.visit_date),
      labId: lid,
      labName: str(lab?.labName || visit.labName),
      lifecycle: lifecycle(lab?.status),
      activity: "VISIT",
      commercialOutcome: str(visit.commercialOutcome || visit.commercial_outcome),
      discovery: discoveryLabel(linesByVisit.get(visitUuid) || []),
      qualification: bandByLab.get(lid) || "",
      notes: str(visit.notes),
      nextAction: str(visit.nextAction || visit.next_action),
      followUpDate: isLatest ? due : due,
      followUpStatus: isLatest ? followUpStatus : deriveFollowUpStatus(due, todayYmd, !isLatest),
      orderAmount: null,
      collectionAmount: null,
    });
  }

  for (const order of scopedOrders) {
    const lid = labIdKey(order.labId);
    const lab = labById.get(lid);
    ledger.push({
      id: `order:${str(order.orderId || order.order_id)}`,
      date: ymd(order.orderDate || order.order_date || order.createdAt),
      labId: lid,
      labName: str(lab?.labName || order.labName),
      lifecycle: lifecycle(lab?.status),
      activity: "ORDER",
      commercialOutcome: "",
      discovery: "",
      qualification: bandByLab.get(lid) || "",
      notes: "",
      nextAction: "",
      followUpDate: "",
      followUpStatus: "NONE",
      orderAmount: numAmount(order.totalAmount ?? order.total_amount),
      collectionAmount: null,
    });
  }

  for (const pay of scopedPayments) {
    const lid = labIdKey(pay.labId);
    const lab = labById.get(lid);
    ledger.push({
      id: `collection:${str(pay.paymentId || pay.payment_id)}`,
      date: ymd(pay.paymentDate || pay.payment_date),
      labId: lid,
      labName: str(lab?.labName || pay.labName),
      lifecycle: lifecycle(lab?.status),
      activity: "COLLECTION",
      commercialOutcome: "",
      discovery: "",
      qualification: bandByLab.get(lid) || "",
      notes: "",
      nextAction: "",
      followUpDate: "",
      followUpStatus: "NONE",
      orderAmount: null,
      collectionAmount: numAmount(pay.amountReceived ?? pay.amount_received),
    });
  }

  ledger.sort((a, b) => {
    const byDate = str(b.date).localeCompare(str(a.date));
    if (byDate) return byDate;
    return str(a.activity).localeCompare(str(b.activity));
  });

  const truncated = ledger.length > ledgerCap;
  const ledgerRows = truncated ? ledger.slice(0, ledgerCap) : ledger;

  const attention = [];
  const pushAttn = (type, title, items) => {
    if (!items.length) return;
    attention.push({ type, title, count: items.length, items });
  };
  pushAttn(
    "FOLLOW_UP_DUE",
    "Follow-up due today",
    followUpDueLabIds.map((lid) => ({
      labId: lid,
      labName: str(labById.get(lid)?.labName),
      dueDate: todayYmd,
    }))
  );
  pushAttn(
    "FOLLOW_UP_OVERDUE",
    "Overdue follow-up",
    followUpOverdueLabIds.map((lid) => {
      const latest = visitsByLab.get(lid)?.[0];
      return {
        labId: lid,
        labName: str(labById.get(lid)?.labName),
        dueDate: ymd(latest?.nextFollowUpDate || latest?.next_follow_up_date),
      };
    })
  );
  pushAttn(
    "COLLECTION_DUE",
    "Collection due",
    collectionDue.map((lab) => ({
      labId: labIdKey(lab.labId),
      labName: str(lab.labName),
      outstanding: numAmount(lab.outstanding),
    }))
  );
  pushAttn("REVISIT", "Labs needing revisit", staleLabs);
  pushAttn(
    "REQUIREMENT_FOLLOW_UP",
    "Requirement / quote follow-up",
    requirementFollowUp
  );

  const formatInr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

  return {
    subjectAgentId: subject,
    actorRole: str(actor.role).toLowerCase(),
    range: { ...range, from, to, todayYmd },
    kpis: {
      prospectsAdded: prospectsAdded.length,
      visitsLogged: periodVisits.length,
      requirements: requirements.length,
      quoteOpportunities: quoteOpportunities.length,
      followUpsDue: followUpDueLabIds.length,
      ordersFromMyLabs: scopedOrders.length,
      rupeesOrdered,
      rupeesCollected,
    },
    kpiMeta: MY_BUSINESS_KPI_SOURCES,
    kpiLabels: {
      prospectsAdded: "Prospects added",
      visitsLogged: "Visits logged",
      requirements: "Requirements",
      quoteOpportunities: "Quote opportunities",
      followUpsDue: "Follow-ups due",
      ordersFromMyLabs: "Orders from my labs",
      rupeesOrdered: "₹ ordered by my labs",
      rupeesCollected: "₹ collected from my labs",
    },
    kpiDisplay: {
      rupeesOrdered: formatInr(rupeesOrdered),
      rupeesCollected: formatInr(rupeesCollected),
    },
    attention,
    ledger: ledgerRows,
    ledgerTruncated: truncated,
    ledgerTotal: ledger.length,
    ledgerCap,
  };
}
