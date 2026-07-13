/**
 * Phase 7.1 — Enterprise compensation role scopes, defaults, and validation.
 * Pure domain — no Supabase I/O, no finance mutation.
 */

export const COMPENSATION_ROLE_SCOPES = Object.freeze([
  "agent",
  "admin",
  "executive",
  "hr",
  "warehouse",
  "delivery",
  "operations",
  "support",
  "future",
]);

/** Profile roles eligible for enterprise compensation directory and assignments. */
export const COMPENSATION_EMPLOYEE_PROFILE_ROLES = Object.freeze([
  "agent",
  "admin",
  "executive",
  "hr",
  "warehouse",
  "delivery",
  "operations",
  "support",
]);

function str(value) {
  return String(value ?? "").trim();
}

function roleKey(role) {
  return str(role).toLowerCase();
}

export function normalizeCompensationRoleScope(roleScope) {
  const key = roleKey(roleScope);
  return COMPENSATION_ROLE_SCOPES.includes(key) ? key : "future";
}

export function profileRoleToPlanScope(profileRole) {
  const key = roleKey(profileRole);
  if (COMPENSATION_ROLE_SCOPES.includes(key)) return key;
  return "future";
}

export function commissionEligibleRoleScope(roleScope) {
  return roleKey(roleScope) === "agent";
}

export function planScopeMatchesEmployeeRole(planRoleScope, employeeRole) {
  const planScope = normalizeCompensationRoleScope(planRoleScope);
  const employee = roleKey(employeeRole);
  if (planScope === "future") return true;
  return planScope === employee;
}

export function assertPlanScopeMatchesEmployee(planRoleScope, employeeRole) {
  if (!planScopeMatchesEmployeeRole(planRoleScope, employeeRole)) {
    throw new Error(
      `compensation_plan_role_mismatch:${normalizeCompensationRoleScope(planRoleScope)}:${roleKey(employeeRole)}`
    );
  }
  return true;
}

export function agentIdRequiredForRole(employeeRole) {
  return roleKey(employeeRole) === "agent";
}

const BASE_SALARY_ONLY = {
  baseSalary: 25_000,
  fuelAllowance: 3_000,
  mobileAllowance: 500,
  commissionRateBps: 0,
  promotionSalary: 0,
  promotionCommissionRateBps: 0,
  promotionCollectionThreshold: 0,
  promotionMinEfficiencyPct: 0,
  promotionMaxOverdueDays: 90,
  promotionEnabled: false,
  quarterlyBonusMin: 0,
  quarterlyBonusMax: 0,
  annualBonusMin: 0,
  annualBonusMax: 0,
  manualAdjustmentAllowed: true,
  penaltiesAllowed: false,
};

const AGENT_YEAR1_DEFAULTS = Object.freeze({
  baseSalary: 20_000,
  fuelAllowance: 5_000,
  mobileAllowance: 500,
  commissionRateBps: 300,
  promotionSalary: 25_000,
  promotionCommissionRateBps: 350,
  promotionCollectionThreshold: 500_000,
  promotionMinEfficiencyPct: 80,
  promotionMaxOverdueDays: 90,
});

export function roleScopePlanDefaults(roleScope) {
  const scope = normalizeCompensationRoleScope(roleScope);
  switch (scope) {
    case "agent":
      return {
        planCode: "AGENT_YEAR1_BASELINE",
        displayName: "Year 1 Agent Baseline",
        baseSalary: AGENT_YEAR1_DEFAULTS.baseSalary,
        fuelAllowance: AGENT_YEAR1_DEFAULTS.fuelAllowance,
        mobileAllowance: AGENT_YEAR1_DEFAULTS.mobileAllowance,
        commissionRateBps: AGENT_YEAR1_DEFAULTS.commissionRateBps,
        promotionSalary: AGENT_YEAR1_DEFAULTS.promotionSalary,
        promotionCommissionRateBps: AGENT_YEAR1_DEFAULTS.promotionCommissionRateBps,
        promotionCollectionThreshold: AGENT_YEAR1_DEFAULTS.promotionCollectionThreshold,
        promotionMinEfficiencyPct: AGENT_YEAR1_DEFAULTS.promotionMinEfficiencyPct,
        promotionMaxOverdueDays: AGENT_YEAR1_DEFAULTS.promotionMaxOverdueDays,
        promotionEnabled: true,
        quarterlyBonusMin: 0,
        quarterlyBonusMax: 0,
        annualBonusMin: 0,
        annualBonusMax: 0,
        manualAdjustmentAllowed: true,
        penaltiesAllowed: true,
      };
    case "admin":
      return {
        planCode: "ADMIN_SALARY_BASELINE",
        displayName: "Admin Salary Baseline",
        ...BASE_SALARY_ONLY,
        baseSalary: 30_000,
      };
    case "executive":
      return {
        planCode: "EXECUTIVE_SALARY_BASELINE",
        displayName: "Executive Salary Baseline",
        ...BASE_SALARY_ONLY,
        baseSalary: 75_000,
        quarterlyBonusMin: 25_000,
        quarterlyBonusMax: 100_000,
        annualBonusMin: 100_000,
        annualBonusMax: 250_000,
      };
    case "hr":
      return {
        planCode: "HR_SALARY_BASELINE",
        displayName: "HR Salary Baseline",
        ...BASE_SALARY_ONLY,
        baseSalary: 28_000,
      };
    case "warehouse":
      return {
        planCode: "WAREHOUSE_SALARY_BASELINE",
        displayName: "Warehouse Salary Baseline",
        ...BASE_SALARY_ONLY,
        baseSalary: 18_000,
        fuelAllowance: 0,
      };
    case "delivery":
      return {
        planCode: "DELIVERY_SALARY_BASELINE",
        displayName: "Delivery Salary Baseline",
        ...BASE_SALARY_ONLY,
        baseSalary: 16_000,
        fuelAllowance: 4_000,
        deliveryIncentiveEnabled: true,
      };
    case "operations":
      return {
        planCode: "OPERATIONS_SALARY_BASELINE",
        displayName: "Operations Salary Baseline",
        ...BASE_SALARY_ONLY,
        baseSalary: 32_000,
      };
    case "support":
      return {
        planCode: "SUPPORT_SALARY_BASELINE",
        displayName: "Support Salary Baseline",
        ...BASE_SALARY_ONLY,
        baseSalary: 22_000,
        quarterlyBonusMin: 5_000,
        quarterlyBonusMax: 15_000,
        performanceBonusEnabled: true,
      };
    default:
      return {
        planCode: "HQ_CUSTOM_BASELINE",
        displayName: "HQ Custom Baseline",
        ...BASE_SALARY_ONLY,
      };
  }
}

export function buildNewPlanInputFromRoleScope(roleScope) {
  const scope = normalizeCompensationRoleScope(roleScope);
  const defaults = roleScopePlanDefaults(scope);
  return {
    plan_code: defaults.planCode,
    displayName: defaults.displayName,
    role_scope: scope,
    base_salary: defaults.baseSalary,
    fuel_allowance: defaults.fuelAllowance,
    mobile_allowance: defaults.mobileAllowance,
    commission_rate_bps: defaults.commissionRateBps,
    promotion_salary: defaults.promotionSalary,
    promotion_commission_rate_bps: defaults.promotionCommissionRateBps,
    promotion_collection_threshold: defaults.promotionCollectionThreshold,
    promotion_min_efficiency_pct: defaults.promotionMinEfficiencyPct,
    promotion_max_overdue_days: defaults.promotionMaxOverdueDays,
    quarterlyBonusMin: defaults.quarterlyBonusMin,
    quarterlyBonusMax: defaults.quarterlyBonusMax,
    annualBonusMin: defaults.annualBonusMin,
    annualBonusMax: defaults.annualBonusMax,
    manualAdjustmentAllowed: defaults.manualAdjustmentAllowed,
    penaltiesAllowed: defaults.penaltiesAllowed,
    promotionEnabled: defaults.promotionEnabled,
    deliveryIncentiveEnabled: Boolean(defaults.deliveryIncentiveEnabled),
    performanceBonusEnabled: Boolean(defaults.performanceBonusEnabled),
    status: "draft",
  };
}

export function filterPlansForEmployeeRole(plans = [], employeeRole) {
  const employee = roleKey(employeeRole);
  return (plans || []).filter((plan) => {
    const scope = normalizeCompensationRoleScope(plan.role_scope ?? plan.roleScope);
    return scope === "future" || scope === employee;
  });
}
