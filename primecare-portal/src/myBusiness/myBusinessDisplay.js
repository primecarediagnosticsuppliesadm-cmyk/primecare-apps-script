/**
 * My Business display-only labels. Stored enums and API contracts stay unchanged.
 */

const EXACT_LABELS = Object.freeze({
  QUOTE_OPPORTUNITY: "Quote Opportunity",
  NO_OPPORTUNITY: "No Opportunity",
  ORDER_OPPORTUNITY: "Order Opportunity",
  FOLLOW_UP: "Follow-up",
  REQUIREMENT: "Requirement",
  UNKNOWN: "Not specified",
  ACTIVE: "Active",
  PROSPECT: "Prospect",
  INACTIVE: "Inactive",
  DUE: "Due today",
  OVERDUE: "Overdue",
  FUTURE: "Upcoming",
  NONE: "",
  PROSPECT_CREATED: "Prospect created",
  VISIT: "Visit",
  ORDER: "Order",
  COLLECTION: "Collection",
  HOLD: "Hold",
});

export const ATTENTION_PRIMARY_LABELS = Object.freeze({
  FOLLOW_UP_OVERDUE: "Overdue follow-up",
  FOLLOW_UP_DUE: "Follow-up due today",
  REQUIREMENT_FOLLOW_UP: "Requirement / quote follow-up",
  COLLECTION_DUE: "Collection due",
  REVISIT: "Needs revisit",
});

export const ATTENTION_PRIORITY = Object.freeze([
  "FOLLOW_UP_OVERDUE",
  "FOLLOW_UP_DUE",
  "REQUIREMENT_FOLLOW_UP",
  "COLLECTION_DUE",
  "REVISIT",
]);

const SNAKE_ENUM_RE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/;
const SINGLE_ENUM_RE = /^[A-Z][A-Z0-9]{1,24}$/;

function titleWords(value) {
  return String(value)
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Deterministic display label for My Business UI.
 * Human-entered text (notes, next action) is returned unchanged.
 * @param {unknown} value
 */
export function formatMyBusinessDisplayLabel(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "—") return raw;
  const key = raw.toUpperCase().replace(/[\s-]+/g, "_");
  if (Object.prototype.hasOwnProperty.call(EXACT_LABELS, key)) return EXACT_LABELS[key];
  if (SNAKE_ENUM_RE.test(raw) || SINGLE_ENUM_RE.test(raw)) return titleWords(raw);
  return raw;
}

/**
 * Strip composed `[Visit] Area: … · Lab: …` metadata from visible notes.
 * Does not rewrite stored notes.
 * @param {unknown} raw
 */
export function displayVisitNotes(raw) {
  const text = String(raw ?? "");
  if (!text.trim()) return "";
  const idx = text.indexOf("[Visit]");
  const human = (idx === -1 ? text : text.slice(0, idx)).trim();
  return human;
}

export function attentionPrimaryLabel(primaryType) {
  return ATTENTION_PRIMARY_LABELS[primaryType] || formatMyBusinessDisplayLabel(primaryType);
}

/**
 * Secondary reasons as short context, preserving quote/requirement outcome.
 * @param {{ reasons?: string[], outcome?: string, primaryType?: string }} item
 */
export function attentionContextLabels(item = {}) {
  const primary = item.primaryType;
  const reasons = Array.isArray(item.reasons) ? item.reasons : [];
  const labels = [];
  for (const reason of reasons) {
    if (reason === primary) continue;
    if (reason === "REQUIREMENT_FOLLOW_UP") {
      const outcome = formatMyBusinessDisplayLabel(item.outcome);
      labels.push(outcome || ATTENTION_PRIMARY_LABELS.REQUIREMENT_FOLLOW_UP);
      continue;
    }
    labels.push(ATTENTION_PRIMARY_LABELS[reason] || formatMyBusinessDisplayLabel(reason));
  }
  if (
    primary &&
    primary !== "REQUIREMENT_FOLLOW_UP" &&
    reasons.includes("REQUIREMENT_FOLLOW_UP") === false &&
    item.outcome
  ) {
    const outcome = formatMyBusinessDisplayLabel(item.outcome);
    if (outcome && !labels.includes(outcome)) labels.push(outcome);
  }
  return labels.filter(Boolean);
}

export function attentionHasCollection(item = {}) {
  return Array.isArray(item.reasons) && item.reasons.includes("COLLECTION_DUE");
}

export function attentionHasVisitWork(item = {}) {
  const reasons = Array.isArray(item.reasons) ? item.reasons : [];
  return reasons.some((reason) => reason !== "COLLECTION_DUE");
}
