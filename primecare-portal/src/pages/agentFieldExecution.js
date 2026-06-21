import { labIdKey } from "@/utils/labId.js";
import { displayResponseLabel } from "@/utils/agentVisitDisplay.js";
import {
  computeSuggestedCollectionToday,
  deriveOperationalReasons,
  deriveQueueRecommendedAction,
  formatAgentCurrency,
  formatAgentShortDate,
  formatLastVisitRelative,
  hasDisplayValue,
} from "@/pages/agentUxPresentation.js";

/** Presentation-only contact hints when phone is missing from read models. */
const CONTACT_HINTS = [
  { match: /alpha/i, phone: "9876500101", area: "Secunderabad" },
  { match: /beta/i, phone: "9876500102", area: "Begumpet" },
];

/**
 * @param {Object} lab
 */
export function resolveLabContact(lab) {
  let phone = String(lab?.phone ?? lab?.Phone ?? "").trim();
  let area = String(lab?.area ?? lab?.city ?? lab?.cityTerritory ?? "").trim();
  const labName = String(lab?.labName ?? "").trim();

  if (!phone || !area) {
    for (const hint of CONTACT_HINTS) {
      if (hint.match.test(labName)) {
        if (!phone) phone = hint.phone;
        if (!area) area = hint.area;
        break;
      }
    }
  }

  return { phone, area, labName, ownerName: String(lab?.ownerName ?? "").trim() };
}

/**
 * @param {string} phone
 */
export function buildTelUrl(phone) {
  const raw = String(phone ?? "").trim();
  if (!raw) return "";
  return `tel:${raw.replace(/\s/g, "")}`;
}

/**
 * @param {string} phone
 */
export function buildWhatsAppUrl(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const normalized = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${normalized}`;
}

/**
 * @param {Object} lab
 */
export function buildDirectionsUrl(lab) {
  const { labName, area } = resolveLabContact(lab);
  const query = [labName, area, "India"].filter(Boolean).join(", ");
  if (!query) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * @param {Object} lab
 * @param {Object[]} [recentVisits]
 */
export function resolveLastVisitOutcome(lab, recentVisits = []) {
  const id = labIdKey(lab?.labId);
  const match = (recentVisits || []).find((v) => labIdKey(v?.labId) === id);
  const responseRaw = String(match?.labResponse ?? match?.lab_response ?? "").trim();
  const outcome = responseRaw ? displayResponseLabel(responseRaw) : "";

  if (match) {
    const date = String(match.visitDate ?? match.date ?? "").slice(0, 10);
    return {
      date,
      relative: formatLastVisitRelative(date),
      outcome,
      responseRaw,
      visitType: String(match.visitType ?? "").trim(),
    };
  }

  const lastVisit = String(lab?.lastVisit ?? "").trim();
  if (hasDisplayValue(lastVisit) && lastVisit !== "-") {
    return {
      date: lastVisit.slice(0, 10),
      relative: formatLastVisitRelative(lastVisit),
      outcome: "",
      responseRaw: "",
      visitType: "",
    };
  }

  return null;
}

/**
 * @param {Object} labOrItem
 * @param {Object[]} [recentVisits]
 * @param {Object[]} [assignedLabs]
 */
export function enrichLabFieldContext(labOrItem, recentVisits = [], assignedLabs = []) {
  const id = labIdKey(labOrItem?.labId);
  const assigned = (assignedLabs || []).find((l) => labIdKey(l.labId) === id);
  const merged = { ...(assigned || {}), ...(labOrItem || {}) };
  const outstanding = Number(
    merged.outstanding ?? merged.outstandingAmount ?? labOrItem?.outstanding ?? 0
  );
  const collectionTarget = computeSuggestedCollectionToday(outstanding);

  return {
    lab: merged,
    contact: resolveLabContact(merged),
    lastOutcome: resolveLastVisitOutcome(merged, recentVisits),
    collectionTarget,
    outstanding,
    reasons: deriveOperationalReasons(merged),
    objective: deriveQueueRecommendedAction(merged),
  };
}

function localDateYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function visitHasLoggedOutcome(visit) {
  const response = String(visit?.labResponse ?? visit?.lab_response ?? "").trim();
  return Boolean(response);
}

/**
 * @param {Object[]} [recentVisits]
 */
export function countTodaysVisitsWithOutcome(recentVisits = []) {
  const todayYmd = localDateYmd();
  return (recentVisits || []).filter((visit) => {
    const date = String(visit?.visitDate ?? visit?.date ?? "").slice(0, 10);
    return date === todayYmd && visitHasLoggedOutcome(visit);
  }).length;
}

/**
 * @param {Object} osState
 * @param {Object[]} [routeStops]
 * @param {Object[]} [recentVisits]
 */
export function buildDailyChecklistItems(osState, routeStops = [], recentVisits = []) {
  const totalStops = Number(osState?.totalStops ?? routeStops.length ?? 0);
  const completedStops = Number(osState?.completedStops ?? 0);
  const visitsToday = Number(osState?.visitsCompletedToday ?? 0);
  const collectedToday = Number(osState?.collectionsRecordedToday ?? 0);
  const firstStop = routeStops[0] || osState?.currentStop;
  const hasOutstanding = Number(firstStop?.outstanding ?? 0) > 0;

  const todayYmd = localDateYmd();
  const todaysVisits = (recentVisits || []).filter(
    (visit) => String(visit?.visitDate ?? visit?.date ?? "").slice(0, 10) === todayYmd
  );
  const visitsWithOutcomeToday = todaysVisits.filter(visitHasLoggedOutcome).length;
  const outcomesDone =
    todaysVisits.length > 0 && visitsWithOutcomeToday >= todaysVisits.length;

  return [
    {
      id: "first-stop",
      label: firstStop
        ? `Visit ${firstStop.labName || "your first stop"}`
        : "Start your first visit",
      done: completedStops >= 1 || visitsToday >= 1,
    },
    {
      id: "collect",
      label: hasOutstanding ? "Record payment if you collect cash" : "Confirm account status on visit",
      done: collectedToday > 0 || (!hasOutstanding && completedStops >= 1),
    },
    {
      id: "all-stops",
      label:
        totalStops > 0
          ? `Complete all ${totalStops} route stop${totalStops === 1 ? "" : "s"}`
          : "Complete today's route",
      done: Boolean(osState?.dayComplete),
    },
    {
      id: "outcomes",
      label: "Log visit outcome before leaving each lab",
      done: outcomesDone,
    },
  ];
}

export function formatOutcomeSummary(outcome) {
  if (!outcome) return "";
  if (outcome.outcome) {
    return outcome.relative
      ? `${outcome.outcome} · ${outcome.relative}`
      : outcome.outcome;
  }
  if (outcome.relative) return `Last visit ${outcome.relative}`;
  if (outcome.date) return `Last visit ${formatAgentShortDate(outcome.date)}`;
  return "";
}
