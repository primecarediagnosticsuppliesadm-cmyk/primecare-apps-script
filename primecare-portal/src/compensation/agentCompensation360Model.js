import { commissionPctFromBps } from "./compensationPlanAdminWorkflow.js";

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

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? str(value) : d.toLocaleString("en-IN");
}

function currentPeriodYm(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function planById(plans, planId) {
  return (plans || []).find((plan) => plan.id === planId) || null;
}

export function buildAgentCompensation360Model({
  agentId,
  profile = {},
  labs = [],
  assignments = [],
  plans = [],
  payrollLines = [],
  payrollRuns = [],
  payrollPeriods = [],
  commissionEntries = [],
  adjustments = [],
  auditEvents = [],
  promotionRow = null,
  payments = [],
} = {}) {
  const activeAssignment =
    assignments.find((row) => row.assignment_status === "active") ||
    assignments[0] ||
    null;
  const activePlan = planById(plans, activeAssignment?.plan_id);
  const agentLabs = (labs || []).filter((lab) => str(lab.assigned_agent_id || lab.agent_id) === str(agentId));
  const territories = [...new Set(agentLabs.map((lab) => str(lab.area || lab.territory)).filter(Boolean))];

  const periodYm = currentPeriodYm();
  const currentMonthPayments = (payments || []).filter((payment) => {
    const d = str(payment.payment_date).slice(0, 7);
    return d === periodYm && str(payment.agent_id) === str(agentId);
  });
  const currentMonthCollections = currentMonthPayments.reduce(
    (sum, payment) => sum + num(payment.amount_received),
    0
  );
  const currentMonthCommissionEntries = (commissionEntries || []).filter((entry) => {
    const period = payrollPeriods.find((row) => row.id === entry.period_id);
    return period?.period_ym === periodYm;
  });
  const currentMonthCommission = currentMonthCommissionEntries.reduce(
    (sum, entry) => sum + num(entry.commission_amount),
    0
  );

  const lineRows = (payrollLines || []).map((line) => {
    const run = payrollRuns.find((row) => row.id === line.payroll_run_id);
    const period = payrollPeriods.find((row) => row.id === line.period_id);
    const allowances = roundMoney(
      num(line.fuel_allowance) + num(line.mobile_allowance) + num(line.collection_incentive) +
        num(line.delivery_incentive) + num(line.qualification_incentive) + num(line.attendance_incentive)
    );
    const adjustmentsTotal = roundMoney(
      num(line.manual_adjustments_total) + num(line.penalties_total) + num(line.recoveries_total)
    );
    return {
      id: line.id,
      periodYm: period?.period_ym || "—",
      salary: num(line.salary_amount),
      salaryLabel: formatInr(line.salary_amount),
      commission: num(line.commission_amount),
      commissionLabel: formatInr(line.commission_amount),
      allowances,
      allowancesLabel: formatInr(allowances),
      adjustments: adjustmentsTotal,
      adjustmentsLabel: formatInr(adjustmentsTotal),
      netPay: num(line.net_payable),
      netPayLabel: formatInr(line.net_payable),
      status: line.line_status || run?.status || "—",
      runNumber: run?.run_number || "—",
    };
  });

  const commissionRows = (commissionEntries || []).map((entry) => {
    const period = payrollPeriods.find((row) => row.id === entry.period_id);
    const sourcePayments = entry.metadata?.source_payment_refs || entry.metadata?.payment_count
      ? `${entry.metadata?.payment_count || 0} payment(s)`
      : entry.source_hash || "—";
    return {
      id: entry.id,
      periodYm: period?.period_ym || "—",
      collectedCash: num(entry.attributable_cash_collected),
      collectedCashLabel: formatInr(entry.attributable_cash_collected),
      commissionPct: commissionPctFromBps(entry.commission_rate_bps),
      commissionEarned: num(entry.commission_amount),
      commissionEarnedLabel: formatInr(entry.commission_amount),
      sourcePayments,
      calculationVersion: entry.rule_version || entry.metadata?.calculation_version || "—",
      status: entry.status,
    };
  });

  const planHistoryRows = (assignments || [])
    .map((assignment) => {
      const plan = planById(plans, assignment.plan_id);
      return {
        id: assignment.id,
        planCode: plan?.plan_code || "—",
        planName: plan?.rules_json?.displayName || plan?.plan_code || "—",
        version: plan?.version || "—",
        effectiveFrom: assignment.start_date,
        effectiveFromLabel: formatDate(assignment.start_date),
        effectiveTo: assignment.end_date,
        effectiveToLabel: formatDate(assignment.end_date),
        status: assignment.assignment_status,
        assignedBy: assignment.assigned_by || "—",
        isActive: assignment.assignment_status === "active",
      };
    })
    .sort((a, b) => str(b.effectiveFrom).localeCompare(str(a.effectiveFrom)));

  const adjustmentRows = (adjustments || []).map((row) => ({
    id: row.id,
    category:
      row.adjustment_type === "penalty"
        ? "Penalty"
        : row.adjustment_type === "recovery"
          ? "Recovery"
          : row.component?.toLowerCase().includes("bonus")
            ? "Bonus"
            : "Manual Adjustment",
    component: row.component,
    amount: num(row.amount),
    amountLabel: formatInr(row.amount),
    reason: row.reason,
    approvedBy: row.approved_by || "—",
    status: row.status,
    atLabel: formatDateTime(row.approved_at || row.created_at),
  }));

  const promotion = promotionRow || {
    collections: 0,
    efficiencyPct: 0,
    overdueDays: 0,
    months: 0,
    eligible: false,
    recommendedNewPlan: activePlan?.plan_code || "—",
    blockedReasons: [],
  };

  const auditTimeline = (auditEvents || [])
    .map((event) => ({
      id: event.id,
      category: event.event_type,
      title: `${event.event_type} · ${event.entity_type}`,
      subtitle: event.reason || str(event.entity_id),
      actorRole: event.actor_role || "—",
      at: event.created_at,
      atLabel: formatDateTime(event.created_at),
    }))
    .sort((a, b) => str(b.at).localeCompare(str(a.at)));

  const latestLine = lineRows[0];
  const efficiency =
    latestLine?.id != null
      ? num(
          payrollLines[0]?.calculation_snapshot?.collection_efficiency_pct ??
            payrollLines[0]?.calculation_snapshot?.collectionEfficiencyPct
        )
      : promotion.efficiencyPct;

  return {
    agentId: str(agentId),
    overview: {
      name: profile.agent_name || activeAssignment?.agent_name || agentId,
      employeeId: str(agentId),
      role: profile.role || "agent",
      status: profile.active === false ? "inactive" : "active",
      territory: territories.join(", ") || "—",
      manager: "HQ Operations",
      joinDate: profile.created_at,
      joinDateLabel: formatDate(profile.created_at),
      compensationPlan: activePlan?.plan_code || "—",
      planVersion: activePlan?.version || "—",
      salary: num(activePlan?.base_salary),
      salaryLabel: formatInr(activePlan?.base_salary),
      fuel: num(activePlan?.fuel_allowance),
      fuelLabel: formatInr(activePlan?.fuel_allowance),
      mobile: num(activePlan?.mobile_allowance),
      mobileLabel: formatInr(activePlan?.mobile_allowance),
      commissionPct: commissionPctFromBps(activePlan?.commission_rate_bps),
      promotionStatus: promotion.eligible ? "Eligible" : "Baseline",
      collectionEfficiency: efficiency,
      collectionEfficiencyLabel: `${efficiency}%`,
      currentMonthCollections,
      currentMonthCollectionsLabel: formatInr(currentMonthCollections),
      currentMonthCommission,
      currentMonthCommissionLabel: formatInr(currentMonthCommission),
    },
    payrollHistory: lineRows.sort((a, b) => str(b.periodYm).localeCompare(str(a.periodYm))),
    commissionHistory: commissionRows.sort((a, b) => str(b.periodYm).localeCompare(str(a.periodYm))),
    planHistory: planHistoryRows,
    activeAssignment,
    activePlan,
    selectablePlans: (plans || []).filter((plan) => ["active", "draft"].includes(str(plan.status))),
    adjustments: adjustmentRows,
    promotion: {
      collections: promotion.collections,
      collectionsLabel: formatInr(promotion.collections),
      efficiencyPct: promotion.efficiencyPct,
      overdueDays: promotion.overdueDays,
      months: promotion.months,
      eligible: promotion.eligible,
      eligibleLabel: promotion.eligible ? "Yes" : "No",
      recommendedPlan: promotion.recommendedNewPlan,
      blockedReasons: promotion.blockedReasons || [],
    },
    auditTimeline,
  };
}

function roundMoney(value) {
  return Math.round((num(value) + Number.EPSILON) * 100) / 100;
}
