/**
 * AE-1C visit handoff contract. Ownership workflow only — not quotes, tickets, or orders.
 */

export const HANDOFF_TRIGGER_OUTCOMES = Object.freeze(["REQUIREMENT", "QUOTE_OPPORTUNITY"]);

export const HANDOFF_STATUSES = Object.freeze(["OPEN_HQ", "HQ_RESPONDED", "CLOSED"]);

export const HANDOFF_OWNERS = Object.freeze(["HQ", "AGENT"]);

export const HANDOFF_ACTIONS = Object.freeze(["FOLLOWED_UP", "CONVERTED", "NOT_PROCEEDING"]);

export const HANDOFF_LOSS_REASONS = Object.freeze([
  "PRICE",
  "AVAILABILITY",
  "CREDIT",
  "COMPETITOR_RELATIONSHIP",
  "SPEC_MISMATCH",
  "RESPONSE_DELAY",
  "NO_LONGER_REQUIRED",
  "OTHER",
]);

export const HANDOFF_CLOSE_REASONS = Object.freeze(["CONVERTED", ...HANDOFF_LOSS_REASONS]);

const TRIGGER = new Set(HANDOFF_TRIGGER_OUTCOMES);
const LOSS = new Set(HANDOFF_LOSS_REASONS);

function str(v) {
  return String(v ?? "").trim();
}

export function isHandoffTriggerOutcome(value) {
  return TRIGGER.has(str(value).toUpperCase());
}

export function handoffHumanStatus(row = {}) {
  const status = str(row.status || row.handoffStatus).toUpperCase();
  const reason = str(row.closeReason || row.close_reason).toUpperCase();
  if (status === "OPEN_HQ") return "Waiting on PrimeCare";
  if (status === "HQ_RESPONDED") return "PrimeCare Responded — Your Action";
  if (status === "CLOSED" && reason === "CONVERTED") return "Converted";
  if (status === "CLOSED") return "Not Proceeding";
  return "";
}

export function mapVisitHandoffRow(row = {}) {
  return {
    id: str(row.id),
    tenantId: str(row.tenant_id ?? row.tenantId),
    visitUuid: str(row.visit_uuid ?? row.visitUuid),
    labId: str(row.lab_id ?? row.labId),
    agentId: str(row.agent_id ?? row.agentId),
    triggerOutcome: str(row.trigger_outcome ?? row.triggerOutcome).toUpperCase(),
    status: str(row.status).toUpperCase(),
    owner: str(row.owner).toUpperCase(),
    requirementSummary: str(row.requirement_summary ?? row.requirementSummary),
    neededBy: str(row.needed_by ?? row.neededBy).slice(0, 10),
    hqResponse: str(row.hq_response ?? row.hqResponse),
    hqRespondedAt: str(row.hq_responded_at ?? row.hqRespondedAt),
    hqRespondedBy: str(row.hq_responded_by ?? row.hqRespondedBy),
    closeReason: str(row.close_reason ?? row.closeReason).toUpperCase(),
    closeNote: str(row.close_note ?? row.closeNote),
    closedAt: str(row.closed_at ?? row.closedAt),
    closedBy: str(row.closed_by ?? row.closedBy),
    orderId: str(row.order_id ?? row.orderId),
    createdAt: str(row.created_at ?? row.createdAt),
    createdBy: str(row.created_by ?? row.createdBy),
    updatedAt: str(row.updated_at ?? row.updatedAt),
    humanStatus: "",
  };
}

export function withHumanStatus(row) {
  const mapped = row && row.humanStatus !== undefined ? { ...row } : mapVisitHandoffRow(row);
  mapped.humanStatus = handoffHumanStatus(mapped);
  return mapped;
}

export function prefillRequirementSummary({ notes = "", nextAction = "", discoveryLines = [] } = {}) {
  const note = str(notes);
  if (note) return note.slice(0, 500);
  const action = str(nextAction);
  if (action) return action.slice(0, 500);
  const bits = [];
  for (const line of discoveryLines || []) {
    const kind = str(line.lineKind || line.line_kind);
    const name =
      str(line.brand) || str(line.model) || str(line.description) || str(line.notes);
    const bit = [kind, name].filter(Boolean).join(": ");
    if (bit) bits.push(bit);
    if (bits.join("; ").length > 240) break;
  }
  return bits.join("; ").slice(0, 500);
}

export function parseHandoffRpcPayload(data) {
  if (data == null) return { success: false, code: "empty", handoff: null };
  const payload = typeof data === "string" ? JSON.parse(data) : data;
  const handoff = payload.handoff ? withHumanStatus(mapVisitHandoffRow(payload.handoff)) : null;
  return {
    success: payload.success === true,
    code: str(payload.code),
    handoff,
  };
}

export function isValidLossReason(value) {
  return LOSS.has(str(value).toUpperCase());
}

export const LOSS_REASON_OPTIONS = Object.freeze([
  { value: "PRICE", label: "Price" },
  { value: "AVAILABILITY", label: "Availability" },
  { value: "CREDIT", label: "Credit" },
  { value: "COMPETITOR_RELATIONSHIP", label: "Competitor relationship" },
  { value: "SPEC_MISMATCH", label: "Spec mismatch" },
  { value: "RESPONSE_DELAY", label: "Response delay" },
  { value: "NO_LONGER_REQUIRED", label: "No longer required" },
  { value: "OTHER", label: "Other" },
]);
