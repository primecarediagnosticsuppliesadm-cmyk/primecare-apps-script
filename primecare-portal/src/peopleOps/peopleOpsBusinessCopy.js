/**
 * RC5/RC6 — Founder-facing business language for People Operations (UI copy only).
 * No calculation, schema, or API changes.
 */

export const PEOPLE_OPS_PAGE_HELP = Object.freeze({
  dashboard: {
    title: "What does this page do?",
    body: "Your daily People Operations home. See what needs attention, where this month's payroll stands, and what changed today — then take the next action.",
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

export const PEOPLE_OPS_SECTION_HELP = Object.freeze({
  payrollCycle: {
    title: "Why this matters",
    body: "Payroll moves through seven business stages. Only Approved payroll can be locked. Only Locked payroll can be exported. Only Exported payroll can be marked Paid. This card tells you where the company currently is.",
  },
  needsAttention: {
    title: "Why this matters",
    body: "These items need a founder or executive decision today — missing pay plans, missing lab owners, or payroll waiting for approval.",
  },
  businessActivity: {
    title: "Why this matters",
    body: "A plain-language log of what changed in people and pay — so you can see progress without reading system event names.",
  },
  dayBoard: {
    title: "Why this matters",
    body: "Needs Attention, In Progress, and Completed answer one question: what should I focus on today?",
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

/** Payroll cycle status → founder explanation + CTA (UI only). */
export const PAYROLL_CYCLE_STATUS_COPY = Object.freeze({
  draft: {
    statusLabel: "Draft",
    explanation: "Payroll has not yet been generated.",
    actionLabel: "Generate Payroll →",
    actionScreen: "periods",
    done: false,
  },
  previewed: {
    statusLabel: "Preview",
    explanation: "Payroll preview is waiting for review.",
    actionLabel: "Review Preview →",
    actionScreen: "run-review",
    done: false,
  },
  submitted: {
    statusLabel: "Submitted",
    explanation: "Waiting for Executive approval.",
    actionLabel: "Approve Payroll →",
    actionScreen: "run-review",
    done: false,
  },
  approved: {
    statusLabel: "Approved",
    explanation: "Ready to lock payroll.",
    actionLabel: "Lock Payroll →",
    actionScreen: "run-review",
    done: false,
  },
  locked: {
    statusLabel: "Locked",
    explanation: "Payroll is locked and cannot be edited.",
    actionLabel: "Export →",
    actionScreen: "run-review",
    done: false,
  },
  exported: {
    statusLabel: "Exported",
    explanation: "Waiting for salary confirmation.",
    actionLabel: "Mark Paid →",
    actionScreen: "run-review",
    done: false,
  },
  paid: {
    statusLabel: "Paid",
    explanation: "Payroll for this period has been completed.",
    actionLabel: null,
    actionScreen: null,
    done: true,
    idleNote: "No action required.",
  },
});

/**
 * Map internal activity titles / kinds to founder-facing cards.
 * Never surface snake_case event names to users.
 */
export function mapActivityToBusinessLanguage(event = {}) {
  const raw = [
    event.title,
    event.subtitle,
    event.detail,
    event.reason,
    event.kind,
    event.category,
    event.eventType,
    event.event_type,
  ]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");

  const periodHint = String(event.periodYm || event.periodLabel || "").trim();
  const employeeHint = String(event.employeeCount || event.count || "").trim();
  const actor = String(event.actorRole || event.actor || "Team").trim() || "Team";

  const rules = [
    {
      test: /payroll_preview_regenerat|preview_regenerat|regenerat/,
      title: "Payroll Preview Updated",
      detail: periodHint
        ? `${periodHint} payroll was recalculated${employeeHint ? ` for ${employeeHint} employees` : ""}.`
        : "Payroll was recalculated for the selected period.",
      viewLabel: "View Payroll",
      route: { moduleId: "payroll", screenId: "run-review" },
    },
    {
      test: /payroll_preview_generat|preview_generat|payroll generated|payroll_run.*draft|payroll_run.*preview/,
      title: "Payroll Preview Generated",
      detail: periodHint
        ? `${periodHint} payroll preview is ready to review.`
        : "A payroll preview is ready to review.",
      viewLabel: "View Payroll",
      route: { moduleId: "payroll", screenId: "run-review" },
    },
    {
      test: /commission_calculat|commission calculated|commission_entry/,
      title: "Agent Commissions Calculated",
      detail: "Commission amounts were calculated from cash collections.",
      viewLabel: "View Payroll",
      route: { moduleId: "payroll", screenId: "commission-ledger" },
    },
    {
      test: /assignment_created|plan_assigned|plan assigned|assign/,
      title: "Employee Assigned to Compensation Plan",
      detail: "An employee was linked to a pay template.",
      viewLabel: "View Assignments",
      route: { moduleId: "compensation", screenId: "assignments" },
    },
    {
      test: /plan_created|plan created|create.*plan/,
      title: "New Compensation Plan Created",
      detail: "A new pay template is available to assign.",
      viewLabel: "View Plans",
      route: { moduleId: "compensation", screenId: "plans" },
    },
    {
      test: /plan_activat/,
      title: "Compensation Plan Activated",
      detail: "A pay template is now ready to assign to employees.",
      viewLabel: "View Plans",
      route: { moduleId: "compensation", screenId: "plans" },
    },
    {
      test: /payroll_paid|paid evidence|mark paid|paid$/,
      title: "Payroll Marked as Paid",
      detail: periodHint
        ? `${periodHint} payroll was confirmed as paid.`
        : "Payroll was confirmed as paid.",
      viewLabel: "View Payroll",
      route: { moduleId: "payroll", screenId: "run-review" },
    },
    {
      test: /payroll_lock|lock_completed|payroll locked|lock/,
      title: "Payroll Locked",
      detail: periodHint
        ? `${periodHint} payroll is locked and can no longer be edited.`
        : "Payroll is locked and can no longer be edited.",
      viewLabel: "View Payroll",
      route: { moduleId: "payroll", screenId: "run-review" },
    },
    {
      test: /export/,
      title: "Payroll Export Ready",
      detail: "Export evidence was created for the locked payroll.",
      viewLabel: "View Exports",
      route: { moduleId: "payroll", screenId: "exports" },
    },
    {
      test: /submit/,
      title: "Payroll Submitted for Approval",
      detail: periodHint
        ? `${periodHint} payroll is waiting for executive approval.`
        : "Payroll is waiting for executive approval.",
      viewLabel: "Approve Payroll",
      route: { moduleId: "payroll", screenId: "run-review" },
    },
    {
      test: /approve/,
      title: "Payroll Approved",
      detail: periodHint
        ? `${periodHint} payroll was approved and is ready to lock.`
        : "Payroll was approved and is ready to lock.",
      viewLabel: "View Payroll",
      route: { moduleId: "payroll", screenId: "run-review" },
    },
  ];

  for (const rule of rules) {
    if (rule.test.test(raw)) {
      return {
        title: rule.title,
        detail: rule.detail,
        atLabel: event.atLabel || event.timeLabel || "—",
        actorRole: actor,
        viewLabel: rule.viewLabel,
        route: {
          ...rule.route,
          periodId: event.periodId || undefined,
          runId: event.runId || undefined,
        },
      };
    }
  }

  // Fallback: humanize any leftover snake_case without showing it raw.
  const fallbackTitle = String(event.title || event.label || "People Operations Update")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim();
  const looksTechnical = /_/.test(String(event.title || "")) || /_/.test(String(event.reason || ""));
  return {
    title: looksTechnical ? "People Operations Update" : fallbackTitle || "People Operations Update",
    detail: String(event.subtitle || event.detail || "A people or payroll change was recorded.").replace(/[_-]+/g, " "),
    atLabel: event.atLabel || event.timeLabel || "—",
    actorRole: actor,
    viewLabel: "View",
    route: { moduleId: "dashboard", screenId: "home" },
  };
}

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

export function getPayrollCycleCopy(status) {
  const key = String(status || "draft").trim().toLowerCase();
  return PAYROLL_CYCLE_STATUS_COPY[key] || PAYROLL_CYCLE_STATUS_COPY.draft;
}
