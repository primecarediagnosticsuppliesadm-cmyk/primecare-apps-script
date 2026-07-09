/**
 * RC5 — Founder-facing business language for People Operations (UI copy only).
 * No calculation, schema, or API changes.
 */

export const PEOPLE_OPS_PAGE_HELP = Object.freeze({
  dashboard: {
    title: "What does this page do?",
    body: "Your daily People Operations home. See payroll blockers, work that needs attention, and where the current payroll cycle stands — then jump to the right action.",
  },
  employees: {
    title: "What does this page do?",
    body: "Your HQ workforce directory. Open any employee to see who they are, which laboratories they cover, how they are paid, and recent payroll history.",
  },
  compensation: {
    title: "What does this page do?",
    body: "Compensation Plans are pay templates (salary, allowances, commission). Assign a plan to each employee before payroll can include them.",
  },
  ownership: {
    title: "What does this page do?",
    body: "Business Ownership shows who covers each laboratory: Executive → Reporting Admin → Agent → Laboratory. Ownership drives commission, reporting, and payroll attribution.",
  },
  payroll: {
    title: "What does this page do?",
    body: "Generate and review payroll for a reporting period. Check each employee’s salary, allowances, and commission from collections, then approve and lock the payroll run.",
  },
  reports: {
    title: "What does this page do?",
    body: "Business performance for people and pay — top agents, territories needing attention, payroll and collections highlights. Charts appear below the summary.",
  },
  budgeting: {
    title: "What does this page do?",
    body: "Plan your workforce cost envelope around payroll. This is planning only — it does not change accounting or send payments.",
  },
  settings: {
    title: "What does this page do?",
    body: "See which payroll settings are active today versus roadmap items (bank files, leave, and similar future capabilities).",
  },
});

export const PEOPLE_OPS_ONBOARDING_STEPS = Object.freeze([
  {
    id: "employees",
    title: "Employees",
    detail: "Confirm who is on the HQ team.",
    route: { moduleId: "employees", screenId: "directory" },
  },
  {
    id: "compensation",
    title: "Compensation",
    detail: "Create pay templates and assign them.",
    route: { moduleId: "compensation", screenId: "plans" },
  },
  {
    id: "ownership",
    title: "Business Ownership",
    detail: "Confirm each laboratory has an Agent and Reporting Admin.",
    route: { moduleId: "ownership", screenId: "explorer" },
  },
  {
    id: "payroll",
    title: "Payroll",
    detail: "Generate a payroll preview and review pay lines.",
    route: { moduleId: "payroll", screenId: "periods" },
  },
  {
    id: "reports",
    title: "Reports",
    detail: "Check performance before founder approval.",
    route: { moduleId: "reports", screenId: "analytics" },
  },
]);

export const PEOPLE_OPS_ONBOARDING_STORAGE_KEY = "pc.peopleOps.rc5.onboarding.dismissed";

export function buildPayrollEmptyGuidance({
  hasEmployees = true,
  hasAssignments = true,
  hasRun = false,
  hasCollectionsHint = true,
} = {}) {
  return {
    title: "Payroll cannot be generated yet.",
    reasons: [
      { id: "employees", label: "No employees in the directory", ok: hasEmployees },
      { id: "plans", label: "Compensation plans missing for employees", ok: hasAssignments },
      { id: "preview", label: "Payroll preview not generated for this period", ok: hasRun },
      { id: "collections", label: "No collections available for commission (optional for salary-only)", ok: hasCollectionsHint },
    ],
  };
}
