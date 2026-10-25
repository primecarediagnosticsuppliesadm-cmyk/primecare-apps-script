/**
 * Fast Log Visit rules for new saves.
 * Historical rows stay readable. An update may correct other fields
 * without inventing an observation the customer never gave.
 */
import { businessYmd } from "../myBusiness/myBusinessCalendar.js";
import { displayVisitNotes } from "../myBusiness/myBusinessDisplay.js";

export const NO_DISCUSSION_REASONS = Object.freeze([
  { value: "RECEPTION_ONLY", label: "Met reception only" },
  { value: "DECISION_MAKER_UNAVAILABLE", label: "Decision-maker was unavailable" },
  { value: "NOT_DISCUSSED", label: "No discussion" },
]);

const REASON_SET = new Set(NO_DISCUSSION_REASONS.map((item) => item.value));

/** Outcomes that mean the agent still has a next step. */
export const FOLLOW_UP_OUTCOMES = new Set([
  "FOLLOW_UP",
  "REQUIREMENT",
  "QUOTE_OPPORTUNITY",
  "ORDER_OPPORTUNITY",
]);

const QUANTITY_WORDS = /^(not shared|unknown|not discussed|n\/a|na)$/i;
const MIN_OBSERVATION_LENGTH = 8;

export function isNoDiscussionReason(value) {
  return REASON_SET.has(String(value || "").trim().toUpperCase());
}

export function isMeaningfulObservation(notes) {
  const human = displayVisitNotes(notes).replace(/\s+/g, " ").trim();
  return human.length >= MIN_OBSERVATION_LENGTH;
}

/**
 * Blank and "not shared" stay null. A typed zero stays zero.
 * @param {unknown} value
 * @param {unknown} [disclosure]
 */
export function quantityOrNull(value, disclosure) {
  if (isNoDiscussionReason(disclosure) || QUANTITY_WORDS.test(String(disclosure || "").trim())) {
    return null;
  }
  if (value == null) return null;
  if (typeof value === "string") {
    const text = value.trim();
    if (!text || QUANTITY_WORDS.test(text)) return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function createClientRequestId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    cryptoApi.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isClientRequestId(value) {
  return UUID_RE.test(String(value || "").trim());
}

function text(value) {
  return String(value ?? "").trim();
}

/**
 * @param {object} form
 * @param {{ mode?: "create"|"update", storedNotes?: string, storedNextAction?: string, storedFollowUpDate?: string }} [options]
 * @returns {string[]}
 */
export function validateFastVisit(form = {}, options = {}) {
  const mode = options.mode === "update" ? "update" : "create";
  const errors = [];
  if (!text(form.labId || form.lab_id)) errors.push("Choose the laboratory.");
  if (!text(form.visitDate || form.visit_date)) errors.push("Visit date is required.");
  const outcome = text(form.commercialOutcome || form.commercial_outcome).toUpperCase();
  if (!outcome) errors.push("Choose the visit result.");

  const reason = text(form.noDiscussionReason || form.no_discussion_reason).toUpperCase();
  if (reason && !isNoDiscussionReason(reason)) {
    errors.push("Choose a listed reason for no discussion.");
  }
  const human = displayVisitNotes(form.notes);
  const storedHuman = displayVisitNotes(options.storedNotes);
  const noteUnchanged = mode === "update" && human === storedHuman;
  const hasObservation = isMeaningfulObservation(form.notes) || isNoDiscussionReason(reason);

  if (mode === "create" && !hasObservation) {
    errors.push("Write what the customer said, or choose why there was no discussion.");
  }
  if (mode === "update" && !noteUnchanged && !hasObservation) {
    errors.push(
      "Write what the customer said, or choose why there was no discussion. Leave the note unchanged when you are only correcting other fields."
    );
  }

  const nextAction = text(form.nextAction || form.next_action);
  const followUpDate = text(form.nextFollowUpDate || form.next_follow_up_date);
  const outcomeNeedsStep = FOLLOW_UP_OUTCOMES.has(outcome);
  const storedFollowUp = text(options.storedFollowUpDate);
  const storedOutcome = text(options.storedOutcome).toUpperCase();
  const followUpNewlySet = Boolean(followUpDate) && followUpDate !== storedFollowUp;
  const outcomeChangedToAction = mode === "update" && outcomeNeedsStep && outcome !== storedOutcome;

  if (mode === "create" && outcomeNeedsStep && !nextAction) {
    errors.push("Add the next action for this result.");
  }
  if (mode === "create" && outcomeNeedsStep && !followUpDate) {
    errors.push("Add the follow-up date for this result.");
  }
  if (mode === "create" && followUpDate && !nextAction && !outcomeNeedsStep) {
    errors.push("Add the next action for this follow-up.");
  }
  if (outcomeChangedToAction && !nextAction) {
    errors.push("Add the next action for this result.");
  }
  if (outcomeChangedToAction && !followUpDate) {
    errors.push("Add the follow-up date for this result.");
  }
  if (mode === "update" && followUpNewlySet && !nextAction) {
    errors.push("Add the next action for this follow-up.");
  }
  return errors;
}

/**
 * Keep the stored note, including the area stamp, when the agent did not edit it.
 */
export function notesForVisitWrite(form = {}, options = {}) {
  const stored = options.storedNotes == null ? "" : String(options.storedNotes);
  if (options.mode === "update" && displayVisitNotes(form.notes) === displayVisitNotes(stored)) {
    return stored;
  }
  return form.notes == null ? "" : String(form.notes);
}

/**
 * A duplicate insert may return the original row only after the
 * tenant-and-agent RPC has already authorized it.
 */
export function acceptDuplicateVisit(row, { tenantId = "", agentId = "", viaAuthorizedRpc = false } = {}) {
  if (!viaAuthorizedRpc || !row || typeof row !== "object") return false;
  const rowTenant = text(row.tenant_id || row.tenantId);
  const rowAgent = text(row.agent_id || row.agentId).toUpperCase();
  if (!text(row.id) || !rowTenant || !rowAgent) return false;
  const requestedTenant = text(tenantId);
  if (requestedTenant && requestedTenant !== rowTenant) return false;
  const requestedAgent = text(agentId).toUpperCase();
  if (requestedAgent && requestedAgent !== rowAgent) return false;
  return true;
}

export function visitEnteredLate(visit = {}) {
  const visitDay = businessYmd(visit.visitDate || visit.visit_date);
  const savedDay = businessYmd(visit.createdAt || visit.created_at);
  if (!visitDay || !savedDay) return false;
  return savedDay > visitDay;
}

export function visitRecordIncomplete(visit = {}) {
  return !isMeaningfulObservation(visit.notes) && !isNoDiscussionReason(visit.noDiscussionReason || visit.no_discussion_reason);
}
