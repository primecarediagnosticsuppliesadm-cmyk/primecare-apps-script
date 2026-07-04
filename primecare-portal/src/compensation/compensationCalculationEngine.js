/**
 * PrimeCare compensation preview calculation engine.
 *
 * Pure calculation module only. It does not read Supabase, approve payroll,
 * lock runs, export payroll, create payouts, or mutate finance/O2C records.
 */

export const COMPENSATION_RULE_VERSION = "PC_COMP_YEAR1_2026_PHASE4B";

export const YEAR1_BASELINE_PLAN = Object.freeze({
  planCode: "AGENT_YEAR1_BASELINE",
  version: "v1",
  ruleVersion: COMPENSATION_RULE_VERSION,
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

const DRAFT_STATUS = "draft";

function str(value) {
  return String(value ?? "").trim();
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value) {
  return Math.round((num(value) + Number.EPSILON) * 100) / 100;
}

function bpsAmount(amount, bps) {
  return roundMoney((num(amount) * num(bps)) / 10_000);
}

function ymd(value) {
  const s = str(value);
  if (!s) return "";
  return s.slice(0, 10);
}

function isWithinPeriod(dateValue, period = {}) {
  const d = ymd(dateValue);
  if (!d) return false;
  const start = ymd(period.period_start ?? period.periodStart);
  const end = ymd(period.period_end ?? period.periodEnd);
  if (start && d < start) return false;
  if (end && d > end) return false;
  return true;
}

function planValue(plan = {}, key, fallbackKey) {
  const value = plan[key] ?? (fallbackKey ? plan[fallbackKey] : undefined);
  return value === undefined || value === null || value === "" ? undefined : value;
}

function normalizePlan(plan = {}) {
  return {
    id: str(plan.id ?? plan.plan_id),
    planCode: str(plan.plan_code ?? plan.planCode) || YEAR1_BASELINE_PLAN.planCode,
    version: str(plan.version ?? plan.plan_version ?? plan.planVersion) || YEAR1_BASELINE_PLAN.version,
    ruleVersion:
      str(plan.rule_version ?? plan.ruleVersion ?? plan.rules_json?.ruleVersion) ||
      YEAR1_BASELINE_PLAN.ruleVersion,
    baseSalary: num(planValue(plan, "base_salary", "baseSalary") ?? YEAR1_BASELINE_PLAN.baseSalary),
    fuelAllowance: num(
      planValue(plan, "fuel_allowance", "fuelAllowance") ?? YEAR1_BASELINE_PLAN.fuelAllowance
    ),
    mobileAllowance: num(
      planValue(plan, "mobile_allowance", "mobileAllowance") ?? YEAR1_BASELINE_PLAN.mobileAllowance
    ),
    commissionRateBps: num(
      planValue(plan, "commission_rate_bps", "commissionRateBps") ??
        YEAR1_BASELINE_PLAN.commissionRateBps
    ),
    promotionSalary: num(
      planValue(plan, "promotion_salary", "promotionSalary") ?? YEAR1_BASELINE_PLAN.promotionSalary
    ),
    promotionCommissionRateBps: num(
      planValue(plan, "promotion_commission_rate_bps", "promotionCommissionRateBps") ??
        YEAR1_BASELINE_PLAN.promotionCommissionRateBps
    ),
    promotionCollectionThreshold: num(
      planValue(plan, "promotion_collection_threshold", "promotionCollectionThreshold") ??
        YEAR1_BASELINE_PLAN.promotionCollectionThreshold
    ),
    promotionMinEfficiencyPct: num(
      planValue(plan, "promotion_min_efficiency_pct", "promotionMinEfficiencyPct") ??
        YEAR1_BASELINE_PLAN.promotionMinEfficiencyPct
    ),
    promotionMaxOverdueDays: num(
      planValue(plan, "promotion_max_overdue_days", "promotionMaxOverdueDays") ??
        YEAR1_BASELINE_PLAN.promotionMaxOverdueDays
    ),
    rulesJson: plan.rules_json ?? plan.rulesJson ?? {},
  };
}

function normalizeAssignment(assignment = {}) {
  return {
    id: str(assignment.id ?? assignment.assignment_id),
    tenantId: str(assignment.tenant_id ?? assignment.tenantId),
    planId: str(assignment.plan_id ?? assignment.planId),
    agentId: str(assignment.agent_id ?? assignment.agentId),
    agentName: str(assignment.agent_name ?? assignment.agentName),
    profileUserId: str(assignment.profile_user_id ?? assignment.profileUserId),
    startDate: ymd(assignment.start_date ?? assignment.startDate),
    endDate: ymd(assignment.end_date ?? assignment.endDate),
    status: str(assignment.assignment_status ?? assignment.assignmentStatus ?? "active").toLowerCase(),
  };
}

function normalizePayment(payment = {}) {
  return {
    paymentId: str(payment.payment_id ?? payment.paymentId ?? payment.id),
    tenantId: str(payment.tenant_id ?? payment.tenantId),
    labId: str(payment.lab_id ?? payment.labId),
    amountReceived: roundMoney(payment.amount_received ?? payment.amountReceived),
    paymentDate: ymd(payment.payment_date ?? payment.paymentDate ?? payment.created_at),
    createdAt: payment.created_at ?? payment.createdAt ?? null,
    agentId: str(payment.agent_id ?? payment.agentId),
  };
}

function normalizeSnapshot(snapshot = {}) {
  return {
    id: str(snapshot.id),
    tenantId: str(snapshot.tenant_id ?? snapshot.tenantId),
    periodId: str(snapshot.period_id ?? snapshot.periodId),
    paymentId: str(snapshot.payment_id ?? snapshot.paymentId),
    paymentRef: str(snapshot.payment_ref ?? snapshot.paymentRef),
    paymentDate: ymd(snapshot.payment_date ?? snapshot.paymentDate),
    labId: str(snapshot.lab_id ?? snapshot.labId),
    labName: str(snapshot.lab_name ?? snapshot.labName),
    agentId: str(snapshot.agent_id ?? snapshot.agentId),
    agentName: str(snapshot.agent_name ?? snapshot.agentName),
    profileUserId: str(snapshot.profile_user_id ?? snapshot.profileUserId),
    attributionMethod: str(snapshot.attribution_method ?? snapshot.attributionMethod),
    ownershipSnapshot: snapshot.ownership_snapshot ?? snapshot.ownershipSnapshot ?? {},
    paymentSnapshot: snapshot.payment_snapshot ?? snapshot.paymentSnapshot ?? {},
    ruleVersion: str(snapshot.rule_version ?? snapshot.ruleVersion),
    sourceHash: str(snapshot.source_hash ?? snapshot.sourceHash),
    calculatedAt: snapshot.calculated_at ?? snapshot.calculatedAt ?? null,
  };
}

function normalizeArRow(row = {}) {
  return {
    tenantId: str(row.tenant_id ?? row.tenantId),
    labId: str(row.lab_id ?? row.labId),
    labName: str(row.lab_name ?? row.labName),
    outstanding: roundMoney(row.outstanding),
    totalPaid: roundMoney(row.total_paid ?? row.totalPaid),
    totalDelivered: roundMoney(row.total_delivered ?? row.totalDelivered),
    daysOverdue: num(row.days_overdue ?? row.daysOverdue),
  };
}

function normalizePeriod(period = {}) {
  return {
    id: str(period.id ?? period.period_id ?? period.periodId),
    tenantId: str(period.tenant_id ?? period.tenantId),
    periodYm: str(period.period_ym ?? period.periodYm),
    periodStart: ymd(period.period_start ?? period.periodStart),
    periodEnd: ymd(period.period_end ?? period.periodEnd),
  };
}

function sourceHash(parts) {
  return parts.map((p) => str(p)).filter(Boolean).sort().join("|");
}

function findSnapshotForPayment(payment, snapshots = []) {
  return snapshots.find((snapshot) => {
    if (snapshot.paymentId && payment.paymentId && snapshot.paymentId === payment.paymentId) return true;
    if (snapshot.paymentRef && payment.paymentId && snapshot.paymentRef === payment.paymentId) return true;
    return snapshot.labId && snapshot.labId === payment.labId && snapshot.paymentDate === payment.paymentDate;
  });
}

function attributionForPayment(payment, snapshots = [], warnings = []) {
  if (payment.agentId) {
    return {
      ok: true,
      agentId: payment.agentId,
      agentName: "",
      profileUserId: "",
      method: "payment_agent_id",
      snapshotId: null,
      snapshot: null,
    };
  }

  const snapshot = findSnapshotForPayment(payment, snapshots);
  if (snapshot?.agentId) {
    return {
      ok: true,
      agentId: snapshot.agentId,
      agentName: snapshot.agentName,
      profileUserId: snapshot.profileUserId,
      method: "lab_ownership_snapshot",
      snapshotId: snapshot.id || null,
      snapshot,
    };
  }

  warnings.push({
    code: "missing_attribution_snapshot",
    paymentId: payment.paymentId,
    labId: payment.labId,
  });
  return { ok: false, agentId: "", method: "missing_attribution_snapshot" };
}

function assignmentForAgent(agentId, assignments = [], period = {}) {
  const periodStart = ymd(period.periodStart ?? period.period_start);
  const periodEnd = ymd(period.periodEnd ?? period.period_end);
  return assignments.find((assignment) => {
    if (assignment.agentId !== agentId) return false;
    if (assignment.status && assignment.status !== "active") return false;
    if (assignment.startDate && periodEnd && assignment.startDate > periodEnd) return false;
    if (assignment.endDate && periodStart && assignment.endDate < periodStart) return false;
    return true;
  });
}

function planForAssignment(assignment = {}, plans = []) {
  return plans.find((plan) => plan.id && plan.id === assignment.planId) || plans[0] || normalizePlan();
}

function monthsBetween(startDate, endDate) {
  const start = ymd(startDate);
  const end = ymd(endDate);
  if (!start || !end) return 0;
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
  return (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + (e.getUTCMonth() - s.getUTCMonth()) + 1;
}

/**
 * Collection efficiency is paid cash divided by delivered/collectible value.
 * It is used only for promotion eligibility, never as commissionable cash.
 */
export function calculateCollectionEfficiency({
  collectedCash = 0,
  collectibleAmount = 0,
} = {}) {
  const denominator = num(collectibleAmount);
  if (denominator <= 0) {
    return {
      collectionEfficiencyPct: num(collectedCash) > 0 ? 100 : 0,
      collectedCash: roundMoney(collectedCash),
      collectibleAmount: roundMoney(collectibleAmount),
    };
  }
  return {
    collectionEfficiencyPct: Math.round((num(collectedCash) / denominator) * 10_000) / 100,
    collectedCash: roundMoney(collectedCash),
    collectibleAmount: roundMoney(collectibleAmount),
  };
}

export function calculatePromotionEligibility({
  cumulativeCollectedCash = 0,
  collectionEfficiencyPct = 0,
  maxOverdueDays = 0,
  monthsInPlan = 0,
  plan = {},
} = {}) {
  const normalizedPlan = normalizePlan(plan);
  const checks = {
    collectedCash:
      num(cumulativeCollectedCash) >= normalizedPlan.promotionCollectionThreshold,
    collectionEfficiency:
      num(collectionEfficiencyPct) >= normalizedPlan.promotionMinEfficiencyPct,
    overdue: num(maxOverdueDays) <= normalizedPlan.promotionMaxOverdueDays,
    baselineMonthsComplete: num(monthsInPlan) >= 3,
  };
  const eligible = Object.values(checks).every(Boolean);
  const blockedReasons = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([key]) => key);

  return {
    eligible,
    status: eligible ? "promoted" : "baseline",
    blockedReasons,
    checks,
    thresholds: {
      collectionThreshold: normalizedPlan.promotionCollectionThreshold,
      minEfficiencyPct: normalizedPlan.promotionMinEfficiencyPct,
      maxOverdueDays: normalizedPlan.promotionMaxOverdueDays,
      minBaselineMonths: 3,
    },
  };
}

export function calculateCommissionEntries({
  period = {},
  payments = [],
  attributionSnapshots = [],
  planAssignments = [],
  compensationPlans = [],
  calculatedAt = new Date().toISOString(),
} = {}) {
  const normalizedPeriod = normalizePeriod(period);
  const snapshots = attributionSnapshots.map(normalizeSnapshot);
  const assignments = planAssignments.map(normalizeAssignment);
  const plans = compensationPlans.map(normalizePlan);
  const warnings = [];
  const byAgent = new Map();

  for (const rawPayment of payments.map(normalizePayment)) {
    if (!isWithinPeriod(rawPayment.paymentDate || rawPayment.createdAt, normalizedPeriod)) continue;
    if (rawPayment.amountReceived <= 0) continue;
    const attribution = attributionForPayment(rawPayment, snapshots, warnings);
    if (!attribution.ok) continue;

    const assignment = assignmentForAgent(attribution.agentId, assignments, normalizedPeriod);
    if (!assignment) {
      warnings.push({
        code: "missing_plan_assignment",
        paymentId: rawPayment.paymentId,
        agentId: attribution.agentId,
      });
    }
    const plan = planForAssignment(assignment, plans);
    const key = attribution.agentId;
    const existing =
      byAgent.get(key) ||
      {
        tenant_id: normalizedPeriod.tenantId || rawPayment.tenantId,
        period_id: normalizedPeriod.id,
        attribution_snapshot_id: attribution.snapshotId,
        agent_id: attribution.agentId,
        agent_name: attribution.agentName || assignment?.agentName || attribution.agentId,
        profile_user_id: attribution.profileUserId || assignment?.profileUserId || null,
        attribution_method: attribution.method,
        attributable_cash_collected: 0,
        commission_rate_bps: plan.commissionRateBps,
        commission_amount: 0,
        eligibility_status: assignment ? "eligible" : "manual_review",
        blocked_reason: assignment ? null : "missing_plan_assignment",
        source_payment_refs: [],
        source_hash: "",
        rule_version: plan.ruleVersion,
        status: DRAFT_STATUS,
        metadata: {
          plan_id: plan.id,
          plan_code: plan.planCode,
          plan_version: plan.version,
          calculated_at: calculatedAt,
          calculation_phase: "preview_only",
          payment_count: 0,
          source_lab_ids: [],
        },
      };

    existing.attributable_cash_collected = roundMoney(
      existing.attributable_cash_collected + rawPayment.amountReceived
    );
    existing.source_payment_refs.push(rawPayment.paymentId);
    existing.metadata.payment_count += 1;
    if (rawPayment.labId && !existing.metadata.source_lab_ids.includes(rawPayment.labId)) {
      existing.metadata.source_lab_ids.push(rawPayment.labId);
    }
    byAgent.set(key, existing);
  }

  const entries = [...byAgent.values()].map((entry) => ({
    ...entry,
    commission_amount: bpsAmount(entry.attributable_cash_collected, entry.commission_rate_bps),
    source_hash: sourceHash(entry.source_payment_refs),
  }));

  return { entries, warnings };
}

export function calculateAgentCompensation({
  period = {},
  agentId,
  agentName,
  profileUserId,
  plan = {},
  planAssignment = {},
  commissionEntry = {},
  arRows = [],
  cumulativeCollectedCash,
  calculatedAt = new Date().toISOString(),
} = {}) {
  const normalizedPeriod = normalizePeriod(period);
  const normalizedPlan = normalizePlan(plan);
  const assignment = normalizeAssignment(planAssignment);
  const agentArRows = arRows.map(normalizeArRow);
  const collectedCash = roundMoney(
    cumulativeCollectedCash ?? commissionEntry.attributable_cash_collected ?? 0
  );
  const collectibleAmount = roundMoney(
    agentArRows.reduce((sum, row) => sum + num(row.totalDelivered), 0)
  );
  const { collectionEfficiencyPct } = calculateCollectionEfficiency({
    collectedCash,
    collectibleAmount,
  });
  const maxOverdueDays = Math.max(0, ...agentArRows.map((row) => num(row.daysOverdue)));
  const monthsInPlan = monthsBetween(assignment.startDate, normalizedPeriod.periodEnd);
  const promotion = calculatePromotionEligibility({
    cumulativeCollectedCash: collectedCash,
    collectionEfficiencyPct,
    maxOverdueDays,
    monthsInPlan,
    plan: normalizedPlan,
  });

  const salaryAmount = promotion.eligible
    ? normalizedPlan.promotionSalary
    : normalizedPlan.baseSalary;
  const commissionRateBps = promotion.eligible
    ? normalizedPlan.promotionCommissionRateBps
    : normalizedPlan.commissionRateBps;
  const commissionAmount = bpsAmount(
    commissionEntry.attributable_cash_collected,
    commissionRateBps
  );
  const grossPay = roundMoney(
    salaryAmount +
      normalizedPlan.fuelAllowance +
      normalizedPlan.mobileAllowance +
      commissionAmount
  );

  return {
    tenant_id: normalizedPeriod.tenantId || commissionEntry.tenant_id,
    period_id: normalizedPeriod.id,
    plan_assignment_id: assignment.id || null,
    commission_entry_id: commissionEntry.id || null,
    agent_id: str(agentId ?? commissionEntry.agent_id),
    agent_name: str(agentName ?? commissionEntry.agent_name ?? agentId),
    profile_user_id: str(profileUserId ?? commissionEntry.profile_user_id) || null,
    salary_amount: roundMoney(salaryAmount),
    fuel_allowance: roundMoney(normalizedPlan.fuelAllowance),
    mobile_allowance: roundMoney(normalizedPlan.mobileAllowance),
    commission_amount: commissionAmount,
    collection_incentive: 0,
    delivery_incentive: 0,
    qualification_incentive: 0,
    attendance_incentive: 0,
    quarterly_bonus: 0,
    annual_bonus: 0,
    manual_adjustments_total: 0,
    penalties_total: 0,
    recoveries_total: 0,
    gross_pay: grossPay,
    deductions_total: 0,
    net_payable: grossPay,
    line_status: DRAFT_STATUS,
    calculation_snapshot: {
      plan_id: normalizedPlan.id,
      plan_code: normalizedPlan.planCode,
      plan_version: normalizedPlan.version,
      rule_version: normalizedPlan.ruleVersion,
      calculated_at: calculatedAt,
      collected_cash: roundMoney(commissionEntry.attributable_cash_collected),
      cumulative_collected_cash: collectedCash,
      commission_rate_bps: commissionRateBps,
      collection_efficiency_pct: collectionEfficiencyPct,
      promotion_status: promotion.status,
      promotion_eligible: promotion.eligible,
      promotion_blocked_reasons: promotion.blockedReasons,
      bonuses_placeholder: 0,
      incentives_placeholder: 0,
      penalties_placeholder: 0,
      recoveries_placeholder: 0,
    },
    metadata: {
      calculation_phase: "preview_only",
      status_guard: DRAFT_STATUS,
    },
  };
}

export function calculatePayrollPreview({
  period = {},
  commissionEntries = [],
  planAssignments = [],
  compensationPlans = [],
  arRows = [],
  cumulativeCommissionEntries = [],
  calculatedAt = new Date().toISOString(),
} = {}) {
  const normalizedPeriod = normalizePeriod(period);
  const assignments = planAssignments.map(normalizeAssignment);
  const plans = compensationPlans.map(normalizePlan);
  const normalizedArRows = arRows.map(normalizeArRow);
  const cumulativeCashByAgent = new Map(
    cumulativeCommissionEntries.map((entry) => [
      str(entry.agent_id),
      roundMoney(entry.attributable_cash_collected),
    ])
  );
  const lines = [];
  const warnings = [];

  for (const commissionEntry of commissionEntries) {
    const assignment = assignmentForAgent(commissionEntry.agent_id, assignments, normalizedPeriod);
    if (!assignment) {
      warnings.push({ code: "missing_plan_assignment", agentId: commissionEntry.agent_id });
    }
    const plan = planForAssignment(assignment, plans);
    const sourceLabIds = new Set(commissionEntry.metadata?.source_lab_ids || []);
    const agentArRows = normalizedArRows.filter(
      (row) => row.tenantId === normalizedPeriod.tenantId && sourceLabIds.has(row.labId)
    );
    lines.push(
      calculateAgentCompensation({
        period: normalizedPeriod,
        agentId: commissionEntry.agent_id,
        agentName: commissionEntry.agent_name,
        profileUserId: commissionEntry.profile_user_id,
        plan,
        planAssignment: assignment,
        commissionEntry,
        arRows: agentArRows,
        cumulativeCollectedCash: cumulativeCashByAgent.get(str(commissionEntry.agent_id)),
        calculatedAt,
      })
    );
  }

  const totals = lines.reduce(
    (acc, line) => {
      acc.salary_amount = roundMoney(acc.salary_amount + line.salary_amount);
      acc.fuel_allowance = roundMoney(acc.fuel_allowance + line.fuel_allowance);
      acc.mobile_allowance = roundMoney(acc.mobile_allowance + line.mobile_allowance);
      acc.commission_amount = roundMoney(acc.commission_amount + line.commission_amount);
      acc.gross_pay = roundMoney(acc.gross_pay + line.gross_pay);
      acc.net_payable = roundMoney(acc.net_payable + line.net_payable);
      acc.records_calculated += 1;
      return acc;
    },
    {
      salary_amount: 0,
      fuel_allowance: 0,
      mobile_allowance: 0,
      commission_amount: 0,
      gross_pay: 0,
      net_payable: 0,
      records_calculated: 0,
    }
  );

  return {
    payrollRun: {
      tenant_id: normalizedPeriod.tenantId,
      period_id: normalizedPeriod.id,
      run_number: 1,
      status: DRAFT_STATUS,
      generated_at: calculatedAt,
      totals_json: {
        ...totals,
        calculated_at: calculatedAt,
        rule_version: COMPENSATION_RULE_VERSION,
        calculation_phase: "preview_only",
      },
      metadata: {
        preview_only: true,
        no_approval: true,
        no_lock: true,
        no_export: true,
      },
    },
    lines,
    totals,
    warnings,
  };
}

export function calculateCompensationPreview({
  period = {},
  payments = [],
  attributionSnapshots = [],
  planAssignments = [],
  compensationPlans = [],
  arRows = [],
  cumulativePayments = [],
  calculatedAt = new Date().toISOString(),
} = {}) {
  const commission = calculateCommissionEntries({
    period,
    payments,
    attributionSnapshots,
    planAssignments,
    compensationPlans,
    calculatedAt,
  });
  const cumulativeCommission = calculateCommissionEntries({
    period: {
      ...period,
      period_start: "1900-01-01",
      periodStart: "1900-01-01",
    },
    payments: cumulativePayments.length ? cumulativePayments : payments,
    attributionSnapshots,
    planAssignments,
    compensationPlans,
    calculatedAt,
  });
  const payroll = calculatePayrollPreview({
    period,
    commissionEntries: commission.entries,
    planAssignments,
    compensationPlans,
    arRows,
    cumulativeCommissionEntries: cumulativeCommission.entries,
    calculatedAt,
  });
  return {
    commissionEntries: commission.entries,
    payrollRun: payroll.payrollRun,
    payrollRunLines: payroll.lines,
    totals: payroll.totals,
    warnings: [...commission.warnings, ...cumulativeCommission.warnings, ...payroll.warnings],
    calculatedAt,
    ruleVersion: COMPENSATION_RULE_VERSION,
    status: DRAFT_STATUS,
  };
}

