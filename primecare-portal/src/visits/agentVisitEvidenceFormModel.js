/**
 * Fast Log Visit form model — maps UI labels to certified VE-2 enums.
 * No wallet ₹ thresholds. No snapshot/finance writes.
 */
import {
  VISIT_EVIDENCE_COMMERCIAL_OUTCOMES,
  VISIT_EVIDENCE_COMPLAINTS,
  VISIT_EVIDENCE_CONFIDENCE,
  VISIT_EVIDENCE_LAB_SIZE_BANDS,
  VISIT_EVIDENCE_LINE_KINDS,
} from "./agentVisitEvidenceContract.js";

function newId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ve3-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const VISIT_OUTCOME_OPTIONS = [
  { value: "UNKNOWN", label: "Not sure yet" },
  { value: "REQUIREMENT", label: "Requirement" },
  { value: "QUOTE_OPPORTUNITY", label: "Quote opportunity" },
  { value: "FOLLOW_UP", label: "Follow-up" },
  { value: "ORDER_OPPORTUNITY", label: "Order opportunity" },
  { value: "NO_OPPORTUNITY", label: "No opportunity" },
];

export const VISIT_SIZE_OPTIONS = [
  { value: "", label: "Skip" },
  { value: "SMALL", label: "Small" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LARGE", label: "Large" },
  { value: "CHAIN_HOSPITAL", label: "Chain / hospital" },
  { value: "UNKNOWN", label: "Unknown" },
];

export const VISIT_CONFIDENCE_OPTIONS = [
  { value: "", label: "Skip" },
  { value: "ESTIMATED", label: "Estimated" },
  { value: "CUSTOMER_STATED", label: "Customer stated" },
  { value: "DOCUMENT_CONFIRMED", label: "Document confirmed" },
  { value: "UNKNOWN", label: "Unknown" },
];

export const VISIT_COMPLAINT_OPTIONS = [
  { value: "", label: "Skip" },
  { value: "PRICE", label: "Price" },
  { value: "AVAILABILITY", label: "Availability" },
  { value: "DELIVERY", label: "Delivery" },
  { value: "STOCKOUT", label: "Stock-out" },
  { value: "SHORT_EXPIRY", label: "Short expiry" },
  { value: "CREDIT", label: "Credit" },
  { value: "QUALITY", label: "Quality" },
  { value: "SERVICE", label: "Service" },
  { value: "ANALYZER_SUPPORT", label: "Analyzer support" },
  { value: "SOFTWARE", label: "Software" },
  { value: "OTHER", label: "Other" },
  { value: "UNKNOWN", label: "Unknown" },
];

export const VISIT_LINE_KIND_LABELS = {
  ANALYZER: "Analyzer",
  REAGENT: "Reagent",
  CONSUMABLE: "Consumable",
};

const OUTCOME_SET = new Set(VISIT_EVIDENCE_COMMERCIAL_OUTCOMES);
const SIZE_SET = new Set(VISIT_EVIDENCE_LAB_SIZE_BANDS);
const CONF_SET = new Set(VISIT_EVIDENCE_CONFIDENCE);
const COMPLAINT_SET = new Set(VISIT_EVIDENCE_COMPLAINTS);
const KIND_SET = new Set(VISIT_EVIDENCE_LINE_KINDS);

export function createEmptyDiscoveryLine(kind) {
  const lineKind = KIND_SET.has(String(kind || "").toUpperCase())
    ? String(kind).toUpperCase()
    : "ANALYZER";
  return {
    id: newId(),
    lineKind,
    confidence: "",
    manufacturer: "",
    model: "",
    notes: "",
    description: "",
    brand: "",
    monthlySpendInr: "",
    monthlyQuantity: "",
    supplier: "",
    productCategory: "",
    approxVolume: "",
    approxPricePack: "",
  };
}

export function createEmptyVisitEvidenceForm() {
  const now = new Date();
  const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
  return {
    labId: "",
    visitDate: ymd,
    commercialOutcome: "UNKNOWN",
    notes: "",
    nextAction: "",
    nextFollowUpDate: "",
    nextFollowUpType: "Call",
    labSizeBand: "",
    estimatedMonthlyWalletInr: "",
    walletRangeBand: "",
    walletConfidence: "",
    evidenceConfidence: "",
    decisionMakerMet: "",
    decisionMakerName: "",
    decisionMakerRole: "",
    reorderInterval: "",
    paymentMethodOrTerms: "",
    approxCreditDays: "",
    topComplaint: "",
    topComplaintNotes: "",
    discoveryLines: [],
  };
}

function compactLine(line) {
  const row = {
    id: line.id,
    line_kind: line.lineKind,
    confidence: line.confidence || null,
    manufacturer: line.manufacturer || null,
    model: line.model || null,
    notes: line.notes || null,
    description: line.description || null,
    brand: line.brand || null,
    monthly_spend_inr: line.monthlySpendInr === "" ? null : line.monthlySpendInr,
    monthly_quantity: line.monthlyQuantity === "" ? null : line.monthlyQuantity,
    supplier: line.supplier || null,
    product_category: line.productCategory || null,
    approx_volume: line.approxVolume === "" ? null : line.approxVolume,
    approx_price_pack: line.approxPricePack === "" ? null : line.approxPricePack,
  };
  const meaningful = Object.entries(row).some(([key, value]) => {
    if (key === "id" || key === "line_kind") return false;
    return value != null && value !== "";
  });
  return meaningful ? row : null;
}

export function buildVisitEvidenceWritePayload(form, extras = {}) {
  const lines = (form.discoveryLines || [])
    .map(compactLine)
    .filter(Boolean);
  return {
    labId: form.labId,
    visitDate: form.visitDate,
    visitType: extras.visitType || "Follow-up",
    notes: form.notes,
    nextAction: form.nextAction,
    nextFollowUpDate: form.nextFollowUpDate,
    nextFollowUpType: form.nextFollowUpType,
    commercialOutcome: OUTCOME_SET.has(form.commercialOutcome) ? form.commercialOutcome : "UNKNOWN",
    labSizeBand: SIZE_SET.has(form.labSizeBand) ? form.labSizeBand : "",
    estimatedMonthlyWalletInr: form.estimatedMonthlyWalletInr,
    walletRangeBand: form.walletRangeBand,
    walletConfidence: CONF_SET.has(form.walletConfidence) ? form.walletConfidence : "",
    evidenceConfidence: CONF_SET.has(form.evidenceConfidence) ? form.evidenceConfidence : "",
    decisionMakerMet:
      form.decisionMakerMet === "true" ? true : form.decisionMakerMet === "false" ? false : "",
    decisionMakerName: form.decisionMakerMet === "false" ? "" : form.decisionMakerName,
    decisionMakerRole: form.decisionMakerMet === "false" ? "" : form.decisionMakerRole,
    reorderInterval: form.reorderInterval,
    paymentMethodOrTerms: form.paymentMethodOrTerms,
    approxCreditDays: form.approxCreditDays,
    topComplaint: COMPLAINT_SET.has(form.topComplaint) ? form.topComplaint : "",
    topComplaintNotes: form.topComplaintNotes,
    discoveryLines: lines,
    labName: extras.labName,
    area: extras.area,
    agentName: extras.agentName,
    userId: extras.userId,
  };
}

export function optionsMatchCertifiedEnums() {
  return (
    VISIT_OUTCOME_OPTIONS.every((o) => o.value === "" || OUTCOME_SET.has(o.value)) &&
    VISIT_SIZE_OPTIONS.every((o) => o.value === "" || SIZE_SET.has(o.value)) &&
    VISIT_CONFIDENCE_OPTIONS.every((o) => o.value === "" || CONF_SET.has(o.value)) &&
    VISIT_COMPLAINT_OPTIONS.every((o) => o.value === "" || COMPLAINT_SET.has(o.value))
  );
}
