/**
 * Maps domain-specific statuses to semantic badge variants.
 * Use with <StatusBadge variant={...} /> — avoid inline badge classes in pages.
 */

import { normalizeQualificationPipelineStage } from "@/utils/qualificationPipeline";

/** @typedef {import('@/styles/designTokens').SemanticVariant} SemanticVariant */

/**
 * Tailwind classes per semantic variant (border + background + text).
 */
export const STATUS_BADGE_CLASSES = {
  success:
    "border-[var(--pc-success-border)] bg-[var(--pc-success-bg)] text-[var(--pc-success)]",
  warning:
    "border-[var(--pc-warning-border)] bg-[var(--pc-warning-bg)] text-[var(--pc-warning)]",
  danger:
    "border-[var(--pc-danger-border)] bg-[var(--pc-danger-bg)] text-[var(--pc-danger)]",
  info: "border-[var(--pc-info-border)] bg-[var(--pc-info-bg)] text-[var(--pc-info)]",
  neutral:
    "border-[var(--pc-neutral-border)] bg-[var(--pc-neutral-bg)] text-[var(--pc-neutral)]",
};

const SEMANTIC_VARIANTS = ["success", "warning", "danger", "info", "neutral"];

/**
 * @param {string} variant
 * @returns {SemanticVariant}
 */
export function normalizeSemanticVariant(variant) {
  const v = String(variant || "").toLowerCase();
  if (SEMANTIC_VARIANTS.includes(v)) return /** @type {SemanticVariant} */ (v);
  return "neutral";
}

/** @param {string} band */
export function qualificationBandToVariant(band) {
  const b = String(band || "").toLowerCase();
  if (b === "hot") return "danger";
  if (b === "warm") return "warning";
  if (b === "cold") return "neutral";
  return "neutral";
}

/** @param {string} status */
export function orderStatusToVariant(status) {
  const s = String(status || "Placed").trim();
  if (s === "Fulfilled") return "success";
  if (s === "Processing") return "warning";
  if (s === "Cancelled") return "danger";
  const low = s.toLowerCase();
  if (low === "pending" || low === "placed") return "neutral";
  return "info";
}

/** @param {string} stage */
export function pipelineStageToVariant(stage) {
  const key = normalizeQualificationPipelineStage(stage);
  if (!key) return "neutral";
  if (key === "won") return "success";
  if (key === "lost") return "danger";
  if (key === "hold") return "neutral";
  if (key === "qualified" || key === "reagent_rental_discussion") return "info";
  if (key === "negotiation" || key === "sample_sent") return "info";
  return "warning";
}

/** @param {string} status */
export function paymentStatusToVariant(status) {
  const s = String(status || "").trim().toLowerCase();
  if (s === "paid" || s === "current") return "success";
  if (s === "partially paid" || s === "partial") return "warning";
  if (s === "pending" || s === "outstanding" || s === "open" || s === "sent" || s === "unpaid") {
    return "info";
  }
  if (s === "overdue") return "danger";
  return "neutral";
}

/** @param {string} creditStatus */
export function creditRiskToVariant(creditStatus) {
  const s = String(creditStatus || "").toUpperCase();
  if (s === "HOLD") return "danger";
  if (s === "NEAR_LIMIT") return "warning";
  return "success";
}

/** @param {string} risk */
export function collectionRiskToVariant(risk) {
  const s = String(risk || "").toLowerCase();
  if (s === "high") return "danger";
  if (s === "medium") return "warning";
  return "neutral";
}

/** @param {string} status */
export function founderReviewToVariant(status) {
  const s = String(status || "pending").toLowerCase();
  if (s === "approved") return "success";
  if (s === "rejected") return "danger";
  if (s === "needs_info") return "warning";
  return "neutral";
}

/** Low / Medium / High tiers (reagent rental, Lab OS fit, etc.) */
export function tierLevelToVariant(tier) {
  const v = String(tier || "").toLowerCase();
  if (v === "high") return "success";
  if (v === "medium") return "warning";
  if (v === "low") return "info";
  return "neutral";
}

/** AI insight severity (high / medium / low) */
export function insightSeverityToVariant(severity) {
  const v = String(severity || "").toLowerCase();
  if (v === "high") return "danger";
  if (v === "medium") return "warning";
  return "neutral";
}

/** Field visit type labels on admin dashboard activity cards */
export function visitTypeToVariant(visitType) {
  const vt = String(visitType || "").trim().toLowerCase();
  if (vt === "follow-up" || vt === "follow up") return "info";
  if (vt === "new lead") return "success";
  if (vt === "collection") return "warning";
  if (vt.includes("demo") || vt === "closing") return "info";
  if (vt.includes("complaint") || vt === "support visit") return "danger";
  return "neutral";
}
