const DRAFT_VERSION = 1;
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * @param {object|null} user
 */
export function buildAgentVisitDraftKey(user) {
  const tenant = String(user?.tenantId ?? user?.tenant_id ?? "unknown").trim();
  const uid = String(user?.id ?? user?.userId ?? "anon").trim();
  const role = String(user?.role ?? "unknown").trim().toLowerCase();
  return `primecare_agent_visit_draft_v${DRAFT_VERSION}:${tenant}:${uid}:${role}`;
}

/**
 * @param {object|null} draft
 */
function isDraftExpired(draft) {
  if (!draft?.savedAt) return true;
  const savedAt = Date.parse(draft.savedAt);
  if (!Number.isFinite(savedAt)) return true;
  return Date.now() - savedAt > DRAFT_TTL_MS;
}

/**
 * @param {object} draft
 * @param {object[]} visibleLabs
 */
function isDraftLabAllowed(draft, visibleLabs) {
  const labId = String(draft?.form?.labId ?? "").trim();
  if (!labId) return true;
  return visibleLabs.some((lab) => String(lab.labId ?? "").trim() === labId);
}

/**
 * @param {object} params
 * @param {object|null} params.user
 * @param {number} params.currentStepIndex
 * @param {object} params.form
 * @param {object} params.qualificationForm
 * @param {boolean} params.qualificationEditing
 */
export function saveAgentVisitDraft({
  user,
  currentStepIndex,
  form,
  qualificationForm,
  qualificationEditing,
}) {
  if (typeof window === "undefined") return;
  try {
    const payload = {
      version: DRAFT_VERSION,
      savedAt: new Date().toISOString(),
      currentStepIndex,
      form,
      qualificationForm,
      qualificationEditing: Boolean(qualificationEditing),
    };
    window.localStorage.setItem(buildAgentVisitDraftKey(user), JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * @param {object|null} user
 * @param {object[]} visibleLabs
 * @returns {{ restored: boolean, draft: object|null, reason?: string }}
 */
export function loadAgentVisitDraft(user, visibleLabs = []) {
  if (typeof window === "undefined") return { restored: false, draft: null };
  try {
    const raw = window.localStorage.getItem(buildAgentVisitDraftKey(user));
    if (!raw) return { restored: false, draft: null };

    const draft = JSON.parse(raw);
    if (!draft || draft.version !== DRAFT_VERSION) {
      clearAgentVisitDraft(user);
      return { restored: false, draft: null, reason: "invalid_version" };
    }
    if (isDraftExpired(draft)) {
      clearAgentVisitDraft(user);
      return { restored: false, draft: null, reason: "expired" };
    }
    if (!isDraftLabAllowed(draft, visibleLabs)) {
      clearAgentVisitDraft(user);
      return { restored: false, draft: null, reason: "lab_not_visible" };
    }
    return { restored: true, draft };
  } catch {
    clearAgentVisitDraft(user);
    return { restored: false, draft: null, reason: "parse_error" };
  }
}

/** @param {object|null} user */
export function clearAgentVisitDraft(user) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(buildAgentVisitDraftKey(user));
  } catch {
    /* ignore */
  }
}
