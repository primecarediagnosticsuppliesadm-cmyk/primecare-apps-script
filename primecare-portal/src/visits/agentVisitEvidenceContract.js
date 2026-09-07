/**
 * VE-2 Agent Visit Evidence application contract helpers.
 * Schema/RLS remain VE-1. No financial writes. No snapshot dual-write.
 */
export const VISIT_EVIDENCE_COMMERCIAL_OUTCOMES = Object.freeze([
  "REQUIREMENT",
  "QUOTE_OPPORTUNITY",
  "FOLLOW_UP",
  "ORDER_OPPORTUNITY",
  "NO_OPPORTUNITY",
  "UNKNOWN",
]);

export const VISIT_EVIDENCE_LAB_SIZE_BANDS = Object.freeze([
  "SMALL",
  "MEDIUM",
  "LARGE",
  "CHAIN_HOSPITAL",
  "UNKNOWN",
]);

export const VISIT_EVIDENCE_CONFIDENCE = Object.freeze([
  "ESTIMATED",
  "CUSTOMER_STATED",
  "DOCUMENT_CONFIRMED",
  "UNKNOWN",
]);

export const VISIT_EVIDENCE_COMPLAINTS = Object.freeze([
  "PRICE",
  "AVAILABILITY",
  "DELIVERY",
  "STOCKOUT",
  "SHORT_EXPIRY",
  "CREDIT",
  "QUALITY",
  "SERVICE",
  "ANALYZER_SUPPORT",
  "SOFTWARE",
  "OTHER",
  "UNKNOWN",
]);

export const VISIT_EVIDENCE_LINE_KINDS = Object.freeze(["ANALYZER", "REAGENT", "CONSUMABLE"]);

const COMMERCIAL = new Set(VISIT_EVIDENCE_COMMERCIAL_OUTCOMES);
const SIZE = new Set(VISIT_EVIDENCE_LAB_SIZE_BANDS);
const CONFIDENCE = new Set(VISIT_EVIDENCE_CONFIDENCE);
const COMPLAINT = new Set(VISIT_EVIDENCE_COMPLAINTS);
const LINE_KIND = new Set(VISIT_EVIDENCE_LINE_KINDS);

function str(v) {
  return String(v ?? "").trim();
}

function optionalText(v) {
  const s = str(v);
  return s ? s : null;
}

function optionalEnum(value, allowed, field) {
  const s = str(value).toUpperCase();
  if (!s) return { value: null };
  if (!allowed.has(s)) {
    return { error: `invalid ${field}: ${s}` };
  }
  return { value: s };
}

function optionalBool(v) {
  if (v === true || v === false) return v;
  if (v == null || v === "") return null;
  if (v === "true" || v === "TRUE" || v === 1 || v === "1") return true;
  if (v === "false" || v === "FALSE" || v === 0 || v === "0") return false;
  return null;
}

function optionalNumber(v) {
  if (v == null) return null;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed === "") return null;
    v = trimmed;
  } else if (v === "") {
    return null;
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function optionalInt(v) {
  const n = optionalNumber(v);
  if (n == null) return null;
  return Math.trunc(n);
}

function newUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Optional VE-1 header fields from a Visit write payload.
 * Invalid enums fail closed (builder error) instead of sending empty strings.
 */
export function pickVisitEvidenceHeaderFields(payload = {}) {
  const commercial = optionalEnum(
    payload.commercialOutcome ?? payload.commercial_outcome,
    COMMERCIAL,
    "commercial_outcome"
  );
  if (commercial.error) return { error: commercial.error, fields: {} };
  const size = optionalEnum(payload.labSizeBand ?? payload.lab_size_band, SIZE, "lab_size_band");
  if (size.error) return { error: size.error, fields: {} };
  const walletConf = optionalEnum(
    payload.walletConfidence ?? payload.wallet_confidence,
    CONFIDENCE,
    "wallet_confidence"
  );
  if (walletConf.error) return { error: walletConf.error, fields: {} };
  const evidenceConf = optionalEnum(
    payload.evidenceConfidence ?? payload.evidence_confidence,
    CONFIDENCE,
    "evidence_confidence"
  );
  if (evidenceConf.error) return { error: evidenceConf.error, fields: {} };
  const complaint = optionalEnum(
    payload.topComplaint ?? payload.top_complaint,
    COMPLAINT,
    "top_complaint"
  );
  if (complaint.error) return { error: complaint.error, fields: {} };

  return {
    error: null,
    fields: {
      visited_at: optionalText(payload.visitedAt ?? payload.visited_at),
      decision_maker_met: optionalBool(payload.decisionMakerMet ?? payload.decision_maker_met),
      decision_maker_name: optionalText(payload.decisionMakerName ?? payload.decision_maker_name),
      decision_maker_role: optionalText(payload.decisionMakerRole ?? payload.decision_maker_role),
      commercial_outcome: commercial.value,
      lab_size_band: size.value,
      estimated_monthly_wallet_inr: optionalNumber(
        payload.estimatedMonthlyWalletInr ?? payload.estimated_monthly_wallet_inr
      ),
      wallet_range_band: optionalText(payload.walletRangeBand ?? payload.wallet_range_band),
      wallet_confidence: walletConf.value,
      evidence_confidence: evidenceConf.value,
      reorder_interval: optionalText(payload.reorderInterval ?? payload.reorder_interval),
      payment_method_or_terms: optionalText(
        payload.paymentMethodOrTerms ?? payload.payment_method_or_terms
      ),
      approx_credit_days: optionalInt(payload.approxCreditDays ?? payload.approx_credit_days),
      top_complaint: complaint.value,
      top_complaint_notes: optionalText(payload.topComplaintNotes ?? payload.top_complaint_notes),
    },
  };
}

/**
 * Follow-up write contract:
 * - no date → date NULL, type NULL, follow_up_required false (unless Need Follow-up lab_response)
 * - date present → follow_up_required true; V1 default type Call only with a date
 */
export function resolveAgentVisitFollowUpWriteFields(payload = {}) {
  const next_follow_up_date =
    str(payload.nextFollowUpDate ?? payload.next_follow_up_date ?? "").slice(0, 10) || null;
  const requestedType = str(payload.nextFollowUpType ?? payload.next_follow_up_type ?? "");
  const labResponse = str(payload.labResponse ?? payload.lab_response);
  return {
    follow_up_required: Boolean(next_follow_up_date) || labResponse === "Need Follow-up",
    next_follow_up_date,
    next_follow_up_type: next_follow_up_date ? requestedType || "Call" : null,
    next_action: str(payload.nextAction ?? payload.next_action ?? "") || null,
  };
}

const DISCOVERY_EVIDENCE_KEYS = [
  "confidence",
  "manufacturer",
  "model",
  "notes",
  "description",
  "brand",
  "monthly_spend_inr",
  "monthly_quantity",
  "supplier",
  "product_category",
  "approx_volume",
  "approx_price_pack",
];

export function discoveryLineHasMeaningfulEvidence(row = {}) {
  return DISCOVERY_EVIDENCE_KEYS.some((key) => {
    const value = row[key];
    return value != null && value !== "";
  });
}

export function normalizeDiscoveryLinesInput(payload = {}) {
  const raw = payload.discoveryLines ?? payload.discovery_lines;
  if (raw == null) return [];
  if (!Array.isArray(raw)) return { error: "discoveryLines must be an array" };
  return raw;
}

/**
 * Build insert rows for agent_visit_discovery_lines.
 * Child relationship is visit_uuid → agent_visits.id. Never visit_id text.
 */
export function buildAgentVisitDiscoveryLineInsertRows(visitUuid, lines = [], extras = {}) {
  const visit_uuid = str(visitUuid);
  if (!visit_uuid) {
    return { rows: [], error: "visit_uuid is required" };
  }
  if (!Array.isArray(lines)) {
    return { rows: [], error: "discoveryLines must be an array" };
  }

  const rows = [];
  for (const line of lines) {
    if (!line || typeof line !== "object") {
      return { rows: [], error: "discovery line must be an object" };
    }
    const kind = optionalEnum(line.lineKind ?? line.line_kind, LINE_KIND, "line_kind");
    if (kind.error) return { rows: [], error: kind.error };
    if (!kind.value) return { rows: [], error: "line_kind is required" };
    const confidence = optionalEnum(line.confidence, CONFIDENCE, "confidence");
    if (confidence.error) return { rows: [], error: confidence.error };

    const forbiddenVisitId = str(line.visit_id ?? line.visitId);
    if (forbiddenVisitId && !str(line.visit_uuid ?? line.visitUuid)) {
      return { rows: [], error: "discovery lines must use visit_uuid, not visit_id text" };
    }

    const row = {
      id: optionalText(line.id) || newUuid(),
      visit_uuid,
      tenant_id: optionalText(extras.tenant_id ?? line.tenant_id) || null,
      lab_id: optionalText(extras.lab_id ?? line.lab_id) || null,
      line_kind: kind.value,
      confidence: confidence.value,
      manufacturer: optionalText(line.manufacturer),
      model: optionalText(line.model),
      notes: optionalText(line.notes),
      description: optionalText(line.description ?? line.family),
      brand: optionalText(line.brand),
      monthly_spend_inr: optionalNumber(line.monthlySpendInr ?? line.monthly_spend_inr),
      monthly_quantity: optionalNumber(line.monthlyQuantity ?? line.monthly_quantity),
      supplier: optionalText(line.supplier),
      product_category: optionalText(line.productCategory ?? line.product_category),
      approx_volume: optionalNumber(line.approxVolume ?? line.approx_volume),
      approx_price_pack: optionalNumber(line.approxPricePack ?? line.approx_price_pack),
    };
    if (!discoveryLineHasMeaningfulEvidence(row)) {
      continue;
    }
    rows.push(row);
  }
  return { rows, error: null };
}

export function mapVisitEvidenceHeaderRow(row = {}) {
  return {
    id: str(row.id),
    visitId: str(row.visit_id ?? row.visitId),
    tenantId: str(row.tenant_id ?? row.tenantId),
    labId: str(row.lab_id ?? row.labId),
    agentId: str(row.agent_id ?? row.agentId),
    agentName: str(row.agent_name ?? row.agentName),
    visitDate: str(row.visit_date ?? row.visitDate).slice(0, 10),
    visitType: str(row.visit_type ?? row.visitType),
    notes: str(row.notes),
    visitedAt: row.visited_at ?? row.visitedAt ?? null,
    decisionMakerMet: row.decision_maker_met ?? row.decisionMakerMet ?? null,
    decisionMakerName: str(row.decision_maker_name ?? row.decisionMakerName),
    decisionMakerRole: str(row.decision_maker_role ?? row.decisionMakerRole),
    commercialOutcome: str(row.commercial_outcome ?? row.commercialOutcome),
    labSizeBand: str(row.lab_size_band ?? row.labSizeBand),
    estimatedMonthlyWalletInr: optionalNumber(
      row.estimated_monthly_wallet_inr ?? row.estimatedMonthlyWalletInr
    ),
    walletRangeBand: str(row.wallet_range_band ?? row.walletRangeBand),
    walletConfidence: str(row.wallet_confidence ?? row.walletConfidence),
    evidenceConfidence: str(row.evidence_confidence ?? row.evidenceConfidence),
    reorderInterval: str(row.reorder_interval ?? row.reorderInterval),
    paymentMethodOrTerms: str(row.payment_method_or_terms ?? row.paymentMethodOrTerms),
    approxCreditDays: optionalInt(row.approx_credit_days ?? row.approxCreditDays),
    topComplaint: str(row.top_complaint ?? row.topComplaint),
    topComplaintNotes: str(row.top_complaint_notes ?? row.topComplaintNotes),
    followUpRequired: Boolean(row.follow_up_required ?? row.followUpRequired),
    nextFollowUpDate: str(row.next_follow_up_date ?? row.nextFollowUpDate).slice(0, 10),
    nextFollowUpType: str(row.next_follow_up_type ?? row.nextFollowUpType),
    nextAction: str(row.next_action ?? row.nextAction),
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

export function mapVisitDiscoveryLineRow(row = {}) {
  return {
    id: str(row.id),
    tenantId: str(row.tenant_id ?? row.tenantId),
    labId: str(row.lab_id ?? row.labId),
    visitUuid: str(row.visit_uuid ?? row.visitUuid),
    lineKind: str(row.line_kind ?? row.lineKind),
    confidence: str(row.confidence),
    manufacturer: str(row.manufacturer),
    model: str(row.model),
    notes: str(row.notes),
    description: str(row.description),
    brand: str(row.brand),
    monthlySpendInr: optionalNumber(row.monthly_spend_inr ?? row.monthlySpendInr),
    monthlyQuantity: optionalNumber(row.monthly_quantity ?? row.monthlyQuantity),
    supplier: str(row.supplier),
    productCategory: str(row.product_category ?? row.productCategory),
    approxVolume: optionalNumber(row.approx_volume ?? row.approxVolume),
    approxPricePack: optionalNumber(row.approx_price_pack ?? row.approxPricePack),
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}
