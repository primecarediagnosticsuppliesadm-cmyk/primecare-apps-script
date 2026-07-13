/** Payroll / compensation lifecycle status → StatusBadge variant */
export const PEOPLE_OPS_PAYROLL_STATUS_VARIANT = Object.freeze({
  draft: "neutral",
  previewed: "info",
  submitted: "warning",
  approved: "info",
  locked: "warning",
  exported: "success",
  paid: "success",
  void: "neutral",
});

export const PEOPLE_OPS_PLAN_STATUS_VARIANT = Object.freeze({
  draft: "neutral",
  active: "success",
  retired: "warning",
});
