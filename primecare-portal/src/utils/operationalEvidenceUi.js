import { labIdKey } from "@/utils/labId.js";

function str(v) {
  return String(v ?? "").trim();
}

export const EVIDENCE_KIND_LABELS = {
  visit_photo: "Visit proof",
  collection_proof: "Collection proof",
  collection_receipt: "Payment receipt",
};

export function getEvidenceKindLabel(kind) {
  return EVIDENCE_KIND_LABELS[str(kind)] || "Evidence";
}

/**
 * Primary record anchor for drawer metadata (Visit, Payment, Lab).
 */
export function getEvidenceRecordTypeLabel(record) {
  if (!record) return "Evidence";
  if (str(record.paymentId)) return "Payment";
  if (str(record.visitId)) return "Visit";
  if (str(record.labId)) return "Lab";
  return "Evidence";
}

/**
 * Human-readable link target for drawer metadata.
 */
export function getEvidenceLinkLabel(record) {
  if (!record) return "Evidence";
  const kindLabel = getEvidenceKindLabel(record.kind);
  const recordType = getEvidenceRecordTypeLabel(record);
  const refId =
    str(record.paymentId) ||
    str(record.visitId) ||
    str(record.labId) ||
    "";
  return refId ? `${kindLabel} · ${recordType} ${refId}` : kindLabel;
}

/** Payment history line suffix when proof exists. */
export function formatPaymentProofHistoryNote(records) {
  if (!records?.length) return "";
  if (records.length === 1) return getEvidenceKindLabel(records[0].kind);
  const receipt = records.find((r) => str(r.kind) === "collection_receipt");
  const label = getEvidenceKindLabel((receipt || records[0]).kind);
  return `${label} (${records.length})`;
}

export function isCollectionEvidenceKind(kind) {
  const k = str(kind);
  return k === "collection_proof" || k === "collection_receipt";
}

export function isVisitPhotoKind(kind) {
  return str(kind) === "visit_photo";
}

/**
 * Visit card: visit_photo only (by visit_id).
 */
export function filterVisitProofEvidence(rows, visitId) {
  const vid = str(visitId);
  if (!vid) return [];
  return (rows || []).filter(
    (r) => isVisitPhotoKind(r.kind) && str(r.visitId) === vid
  );
}

/**
 * Collection proof tied to visit session (no payment_id yet).
 */
export function filterVisitSessionCollectionEvidence(rows, visitId) {
  const vid = str(visitId);
  if (!vid) return [];
  return (rows || []).filter(
    (r) =>
      isCollectionEvidenceKind(r.kind) &&
      str(r.visitId) === vid &&
      !str(r.paymentId)
  );
}

/**
 * Payment history: collection evidence by payment_id.
 */
export function filterPaymentEvidence(rows, paymentId) {
  const pid = str(paymentId);
  if (!pid) return [];
  return (rows || []).filter(
    (r) => isCollectionEvidenceKind(r.kind) && str(r.paymentId) === pid
  );
}

/**
 * @param {object[]} rows
 * @param {string} visitId
 */
export function partitionEvidenceForVisitCard(rows, visitId) {
  return {
    visitProof: filterVisitProofEvidence(rows, visitId),
    collectionOnVisit: filterVisitSessionCollectionEvidence(rows, visitId),
  };
}
