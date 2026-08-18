/** Step-specific subtitle shown under progress header. */
export const AGENT_VISIT_STEP_SUBTITLES = {
  basics: "Select your lab and visit date",
  outcome: "Capture visit outcome",
  products: "What does this lab already buy?",
  followup: "Plan the next follow-up",
  qualification: "Help PrimeCare understand this lab better",
  review: "Attach proof and review before submitting",
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
    if (canSaveVisit && missingCount === 0) return "Attach visit proof and review before saving";
    return missingCount > 0 ? "Almost ready — add proof when you can" : "Attach visit proof before saving";
  }
  if (stepIndex === 0) {
    return labSelected ? "Nice — lab selected" : "Good start";
  }
  if (stepIndex >= total - 2) return "Almost ready to save";
  if (stepIndex >= Math.floor(total / 2)) return "Halfway done";
  if (stepIndex === 1) return "Good start — capture the outcome";
  if (stepIndex === 2) return "Good start — capture what they buy";
  return "Good start";
}

const BUSINESS_YMD_RE = /^(\d{4}-\d{2}-\d{2})/;

/** Local calendar YYYY-MM-DD (not UTC). */
export function formatLocalYmd(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Canonical visit/business date. Date-only values (PostgreSQL DATE) are used as-is
 * so UTC midnight parsing cannot shift the calendar day.
 * @param {string|undefined} dateStr
 */
export function visitBusinessYmd(dateStr) {
  const raw = String(dateStr || "").trim();
  if (!raw) return "";
  const prefixed = raw.match(BUSINESS_YMD_RE);
  if (prefixed) return prefixed[1];
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) return "";
  return formatLocalYmd(new Date(parsed));
}

function calendarDayDiff(fromYmd, toYmd) {
  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

/**
 * Relative label for Agent Portal Recent Visits.
 * Compares canonical visit/business YYYY-MM-DD to the local calendar day.
 * Do not pass created_at / updated_at.
 *
 * @param {string|undefined} dateStr
 * @param {Date} [now]
 */
export function formatRelativeVisitTime(dateStr, now = new Date()) {
  const raw = String(dateStr || "").trim();
  if (!raw) return "Recently";
  const visitYmd = visitBusinessYmd(raw);
  if (!visitYmd) return raw;

  const todayYmd = formatLocalYmd(now);
  const diffDays = calendarDayDiff(visitYmd, todayYmd);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return visitYmd;
}
