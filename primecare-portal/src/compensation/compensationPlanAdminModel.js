import {
  assignmentCountByPlan,
  commissionPctFromBps,
  compensationAdminPermissions,
  filterAssignmentsForRole,
  normalizePlanRulesJson,
} from "@/compensation/compensationPlanAdminWorkflow.js";
import { filterPlansForEmployeeRole } from "@/compensation/enterpriseCompensationRoles.js";
import { employeeDisplayName, profileDisplayName } from "@/compensation/employeeCompensationIdentity.js";

function str(value) {
  return String(value ?? "").trim();
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatInr(value) {
  return `₹${num(value).toLocaleString("en-IN")}`;
}

function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? str(value) : d.toLocaleDateString("en-IN");
}

function planById(plans, planId) {
  return (plans || []).find((plan) => plan.id === planId) || null;
}

export function buildCompensationPlanAdminModel({
  plans = [],
  assignments = [],
  profiles = [],
  promotionRows = [],
  compensationPlans,
  planAssignments,
  agentProfiles,
  actorRole = "executive",
  actorAgentId = "",
  actorProfileUserId = "",
} = {}) {
  const resolvedPlans = plans.length ? plans : compensationPlans || [];
  const resolvedAssignments = assignments.length ? assignments : planAssignments || [];
  const resolvedProfiles = profiles.length ? profiles : agentProfiles || [];
  const perms = compensationAdminPermissions(actorRole);
  const profileByUserId = new Map((resolvedProfiles || []).map((row) => [str(row.user_id), row]));
  const profileByAgentId = new Map(
    (resolvedProfiles || []).filter((row) => row.agent_id).map((row) => [str(row.agent_id), row])
  );
  const assignmentCounts = assignmentCountByPlan(resolvedAssignments);
  const visibleAssignments = filterAssignmentsForRole(resolvedAssignments, {
    role: actorRole,
    agentId: actorAgentId,
    profileUserId: actorProfileUserId,
  });

  const planRows = (resolvedPlans || [])
    .map((plan) => {
      const rules = normalizePlanRulesJson(plan.rules_json);
      return {
        id: plan.id,
        planName: rules.displayName || plan.plan_code,
        planCode: plan.plan_code,
        roleScope: plan.role_scope,
        version: plan.version,
        status: plan.status,
        salary: num(plan.base_salary),
        salaryLabel: formatInr(plan.base_salary),
        fuelAllowance: num(plan.fuel_allowance),
        fuelLabel: formatInr(plan.fuel_allowance),
        mobileAllowance: num(plan.mobile_allowance),
        mobileLabel: formatInr(plan.mobile_allowance),
        commissionPct: commissionPctFromBps(plan.commission_rate_bps),
        promotionSalary: num(plan.promotion_salary),
        promotionSalaryLabel: formatInr(plan.promotion_salary),
        promotionCommissionPct: commissionPctFromBps(plan.promotion_commission_rate_bps),
        effectiveFrom: plan.effective_from,
        effectiveFromLabel: formatDate(plan.effective_from),
        effectiveTo: plan.effective_to,
        effectiveToLabel: formatDate(plan.effective_to),
        assignedEmployees: assignmentCounts.get(plan.id) || 0,
        createdBy: plan.created_by || "—",
        createdAt: plan.created_at,
        createdAtLabel: formatDate(plan.created_at),
        updatedBy: plan.updated_by || "—",
        rules,
        raw: plan,
      };
    })
    .sort((a, b) => {
      const code = str(a.planCode).localeCompare(str(b.planCode));
      if (code !== 0) return code;
      return str(b.version).localeCompare(str(a.version));
    });

  const assignmentRows = visibleAssignments
    .map((assignment) => {
      const plan = planById(resolvedPlans, assignment.plan_id);
      const profile =
        profileByUserId.get(str(assignment.profile_user_id)) ||
        profileByAgentId.get(str(assignment.agent_id));
      return {
        id: assignment.id,
        profileUserId: assignment.profile_user_id,
        employeeName: employeeDisplayName(assignment) || profileDisplayName(profile),
        employeeId: assignment.profile_user_id || assignment.agent_id,
        agentId: assignment.agent_id || profile?.agent_id || null,
        role: assignment.employee_role || profile?.role || "agent",
        currentPlan: plan?.plan_code || "—",
        planName: normalizePlanRulesJson(plan?.rules_json).displayName || plan?.plan_code || "—",
        planVersion: plan?.version || "—",
        planId: assignment.plan_id,
        effectiveFrom: assignment.start_date,
        effectiveFromLabel: formatDate(assignment.start_date),
        effectiveTo: assignment.end_date,
        effectiveToLabel: formatDate(assignment.end_date),
        status: assignment.assignment_status,
        assignedBy: assignment.assigned_by || "—",
        assignedAtLabel: formatDate(assignment.assigned_at),
        raw: assignment,
      };
    })
    .sort((a, b) => str(b.effectiveFrom).localeCompare(str(a.effectiveFrom)));

  const promotionEligibilityRows = (promotionRows || []).map((row) => ({
    agentId: row.agentId,
    agentName: row.agentName,
    collections: row.collections,
    collectionsLabel: formatInr(row.collections),
    efficiencyPct: row.efficiencyPct,
    overdueDays: row.overdueDays,
    months: row.months,
    eligible: row.eligible,
    eligibleLabel: row.eligible ? "Yes" : "No",
    recommendedNewPlan: row.recommendedNewPlan,
    blockedReasons: row.blockedReasons || [],
  }));

  return {
    permissions: perms,
    planRows,
    assignmentRows,
    promotionEligibilityRows,
    selectablePlans: planRows.filter((row) => ["active", "draft"].includes(str(row.status))),
    selectableEmployees: (resolvedProfiles || []).map((profile) => ({
      profileUserId: profile.user_id,
      employeeName: profileDisplayName(profile),
      role: str(profile.role).toLowerCase(),
      agentId: profile.agent_id || null,
    })),
    plansByRole: (employeeRole) =>
      filterPlansForEmployeeRole(
        planRows.map((row) => ({ ...row.raw, role_scope: row.roleScope, roleScope: row.roleScope })),
        employeeRole
      ),
  };
}

export function buildCompensationPlanDetailModel(planRow = {}, versionHistory = []) {
  const plan = planRow.raw || planRow;
  const rules = normalizePlanRulesJson(plan.rules_json);
  return {
    general: {
      role: plan.role_scope,
      planCode: plan.plan_code,
      version: plan.version,
      status: plan.status,
      effectiveFrom: plan.effective_from,
      effectiveTo: plan.effective_to,
      displayName: rules.displayName || plan.plan_code,
    },
    fixedCompensation: {
      salary: num(plan.base_salary),
      fuel: num(plan.fuel_allowance),
      mobile: num(plan.mobile_allowance),
    },
    variableCompensation: {
      commissionPct: commissionPctFromBps(plan.commission_rate_bps),
      collectionThreshold: num(plan.promotion_collection_threshold),
      collectionEfficiencyPct: num(plan.promotion_min_efficiency_pct),
      maxOverdueDays: num(plan.promotion_max_overdue_days),
    },
    promotionRules: {
      promotionSalary: num(plan.promotion_salary),
      promotionCommissionPct: commissionPctFromBps(plan.promotion_commission_rate_bps),
      minimumMonths: rules.promotionMinimumMonths,
    },
    bonuses: {
      quarterlyBonusMin: rules.quarterlyBonusMin,
      quarterlyBonusMax: rules.quarterlyBonusMax,
      annualBonusMin: rules.annualBonusMin,
      annualBonusMax: rules.annualBonusMax,
    },
    incentives: {
      manualAdjustmentAllowed: rules.manualAdjustmentAllowed,
      penaltiesAllowed: rules.penaltiesAllowed,
    },
    audit: {
      createdBy: plan.created_by || "—",
      updatedBy: plan.updated_by || "—",
      createdAt: plan.created_at,
      updatedAt: plan.updated_at,
    },
    versionHistory: versionHistory.length ? versionHistory : rules.versionHistory,
    raw: plan,
  };
}
