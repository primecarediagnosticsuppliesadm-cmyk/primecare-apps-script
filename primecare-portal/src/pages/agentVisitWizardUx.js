/** Step-specific subtitle shown under progress header. */
export const AGENT_VISIT_STEP_SUBTITLES = {
  basics: "Select your lab and visit date",
  outcome: "Capture visit outcome",
  stock: "Record stock feedback",
  followup: "Plan the next follow-up",
  qualification: "Help PrimeCare understand this lab better",
  review: "Review before submitting",
};

/**
 * @param {number} stepIndex
 * @param {number} total
 * @param {boolean} labSelected
 * @param {boolean} canSaveVisit
 * @param {number} missingCount
 */
export function getWizardMotivationMessage(stepIndex, total, labSelected, canSaveVisit, missingCount) {
  const isReview = stepIndex >= total - 1;
  if (isReview) {
    if (canSaveVisit && missingCount === 0) return "Review before submitting";
    return missingCount > 0 ? "Almost ready to save" : "Review before submitting";
  }
  if (stepIndex === 0) {
    return labSelected ? "Nice — lab selected" : "Good start";
  }
  if (stepIndex >= total - 2) return "Almost ready to save";
  if (stepIndex >= Math.floor(total / 2)) return "Halfway done";
  if (stepIndex === 1) return "Good start — capture the outcome";
  if (stepIndex === 2) return "Good start — quick stock check";
  return "Good start";
}

/**
 * @param {string|undefined} dateStr
 */
export function formatRelativeVisitTime(dateStr) {
  const raw = String(dateStr || "").trim();
  if (!raw) return "Recently";
  const parsed = Date.parse(raw.length <= 10 ? `${raw}T12:00:00` : raw);
  if (!Number.isFinite(parsed)) return raw;

  const diffMs = Date.now() - parsed;
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return raw.slice(0, 10);
}
