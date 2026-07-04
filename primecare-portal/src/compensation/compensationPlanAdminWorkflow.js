/**
 * Phase 5A compensation plan administration workflow.
 * Pure domain helpers — no Supabase I/O, no finance mutation.
 */

export const COMPENSATION_PLAN_STATUSES = Object.freeze({
  DRAFT: "draft",
  ACTIVE: "active",
  RETIRED: "retired",
});

export const COMPENSATION_ASSIGNMENT_STATUSES = Object.freeze({
  ACTIVE: "active",
  ENDED: "ended",
  SUSPENDED: "suspended",
});

export const COMPENSATION_ADMIN_ACTIONS = Object.freeze({
  VIEW: "view",
  CREATE: "create",
  EDIT: "edit",
  DUPLICATE: "duplicate",
  DEACTIVATE: "deactivate",
  CREATE_VERSION: "create_version",
  ASSIGN: "assign",
  CHANGE_PLAN: "change_plan",
  END_ASSIGNMENT: "end_assignment",
  SIMULATE: "simulate",
});

function str(value) {
  return String(value ?? "").trim();
}

function roleKey(role) {
  return str(role).toLowerCase();
}

export function compensationAdminPermissions(role) {
  const key = roleKey(role);
  return {
    role: key,
    canViewPlans: ["executive", "hr", "admin"].includes(key),
    canCreatePlan: key === "executive",
    canEditDraftPlan: key === "executive",
    canEditActivePlanViaVersion: key === "executive",
    canDuplicatePlan: key === "executive",
    canDeactivatePlan: key === "executive",
    canCreatePlanVersion: key === "executive",
    canAssignPlan: ["executive", "hr"].includes(key),
    canChangePlan: ["executive", "hr"].includes(key),
    canEndAssignment: ["executive", "hr"].includes(key),
    canSimulate: ["executive", "hr", "admin"].includes(key),
    canViewPromotionEligibility: ["executive", "hr", "admin"].includes(key),
    agentOwnPlanOnly: key === "agent",
    hrCannotEditCommissionRules: key === "hr",
    adminReadOnly: key === "admin",
  };
}

export function assertCompensationAdminAction(role, action) {
  const perms = compensationAdminPermissions(role);
  const map = {
    [COMPENSATION_ADMIN_ACTIONS.CREATE]: perms.canCreatePlan,
    [COMPENSATION_ADMIN_ACTIONS.EDIT]: perms.canEditDraftPlan || perms.canEditActivePlanViaVersion,
    [COMPENSATION_ADMIN_ACTIONS.DUPLICATE]: perms.canDuplicatePlan,
    [COMPENSATION_ADMIN_ACTIONS.DEACTIVATE]: perms.canDeactivatePlan,
    [COMPENSATION_ADMIN_ACTIONS.CREATE_VERSION]: perms.canCreatePlanVersion,
    [COMPENSATION_ADMIN_ACTIONS.ASSIGN]: perms.canAssignPlan,
    [COMPENSATION_ADMIN_ACTIONS.CHANGE_PLAN]: perms.canChangePlan,
    [COMPENSATION_ADMIN_ACTIONS.END_ASSIGNMENT]: perms.canEndAssignment,
    [COMPENSATION_ADMIN_ACTIONS.SIMULATE]: perms.canSimulate,
    [COMPENSATION_ADMIN_ACTIONS.VIEW]: perms.canViewPlans || perms.agentOwnPlanOnly,
  };
  if (!map[action]) {
    throw new Error(`compensation_admin_forbidden:${action}:${roleKey(role)}`);
  }
  return true;
}

export function parsePlanVersionNumber(version = "v1") {
  const match = str(version).match(/^v(\d+)$/i);
  return match ? Number(match[1]) : 1;
}

export function formatPlanVersionNumber(number) {
  return `v${Math.max(1, Number(number) || 1)}`;
}

export function nextPlanVersionLabel(currentVersion = "v1") {
  return formatPlanVersionNumber(parsePlanVersionNumber(currentVersion) + 1);
}

export function commissionPctFromBps(bps) {
  return Math.round((Number(bps) / 100) * 100) / 100;
}

export function commissionBpsFromPct(pct) {
  return Math.round(Number(pct) * 100);
}

export function normalizePlanRulesJson(rules = {}) {
  const src = rules && typeof rules === "object" ? rules : {};
  return {
    displayName: str(src.displayName || src.display_name) || "",
    ruleVersion: str(src.ruleVersion || src.rule_version) || "",
    quarterlyBonusMin: Number(src.quarterlyBonusMin ?? src.quarterly_bonus_min ?? 0),
    quarterlyBonusMax: Number(src.quarterlyBonusMax ?? src.quarterly_bonus_max ?? 0),
    annualBonusMin: Number(src.annualBonusMin ?? src.annual_bonus_min ?? 0),
    annualBonusMax: Number(src.annualBonusMax ?? src.annual_bonus_max ?? 0),
    manualAdjustmentAllowed: Boolean(
      src.manualAdjustmentAllowed ?? src.manual_adjustment_allowed ?? false
    ),
    penaltiesAllowed: Boolean(src.penaltiesAllowed ?? src.penalties_allowed ?? false),
    promotionMinimumMonths: Number(src.promotionMinimumMonths ?? src.promotion_minimum_months ?? 3),
    versionHistory: Array.isArray(src.versionHistory) ? src.versionHistory : [],
  };
}

export function buildVersionHistoryEntry({ version, actorUserId, note = "version_created" }) {
  return {
    version: str(version),
    created_at: new Date().toISOString(),
    created_by: actorUserId || null,
    note: str(note),
  };
}

export function shouldVersionOnEdit(plan = {}) {
  return str(plan.status).toLowerCase() === COMPENSATION_PLAN_STATUSES.ACTIVE;
}

export function buildRetiredPlanPatch({ actorUserId, reason = "superseded_by_new_version" } = {}) {
  return {
    status: COMPENSATION_PLAN_STATUSES.RETIRED,
    updated_by: actorUserId || null,
    rules_json_patch: {
      retired_at: new Date().toISOString(),
      retired_reason: reason,
    },
  };
}

export function mergePlanRulesJson(existing = {}, patch = {}) {
  const base = normalizePlanRulesJson(existing);
  const next = normalizePlanRulesJson({ ...base, ...patch });
  next.versionHistory = [...base.versionHistory, ...(patch.versionHistory || [])];
  return next;
}

export function assignmentCountByPlan(assignments = []) {
  const counts = new Map();
  for (const row of assignments) {
    if (str(row.assignment_status) !== COMPENSATION_ASSIGNMENT_STATUSES.ACTIVE) continue;
    const planId = str(row.plan_id);
    counts.set(planId, (counts.get(planId) || 0) + 1);
  }
  return counts;
}

export function latestActivePlanVersion(plans = [], planCode) {
  const code = str(planCode);
  return [...plans]
    .filter((plan) => str(plan.plan_code) === code)
    .sort((a, b) => parsePlanVersionNumber(b.version) - parsePlanVersionNumber(a.version))[0];
}

export function filterAssignmentsForRole(assignments = [], { role, agentId, profileUserId } = {}) {
  const perms = compensationAdminPermissions(role);
  if (perms.agentOwnPlanOnly) {
    return assignments.filter(
      (row) =>
        str(row.agent_id) === str(agentId) ||
        (profileUserId && str(row.profile_user_id) === str(profileUserId))
    );
  }
  return assignments;
}
