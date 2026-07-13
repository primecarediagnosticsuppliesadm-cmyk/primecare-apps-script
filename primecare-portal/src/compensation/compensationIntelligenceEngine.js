/**
 * Phase 7 Executive Compensation intelligence — pure read-only projections.
 * No Supabase I/O. No finance/O2C writes.
 */
import { calculateCompensationPreview } from "./compensationCalculationEngine.js";

function formatInr(value) {
  return `₹${roundMoney(value).toLocaleString("en-IN")}`;
}

export const RANKING_SORT_KEYS = Object.freeze([
  "collections",
  "revenue",
  "commission",
  "collectionEfficiency",
  "payrollCost",
]);

export const FORECAST_SCENARIO_PRESETS = Object.freeze([
  { id: "collections_10", label: "+10% Collections", collectionsMultiplier: 1.1 },
  { id: "collections_20", label: "+20% Collections", collectionsMultiplier: 1.2 },
  { id: "salary_5", label: "+5% Salary", salaryMultiplier: 1.05 },
  { id: "salary_10", label: "+10% Salary", salaryMultiplier: 1.1 },
  { id: "commission_increase", label: "Commission +0.5%", commissionBpsDelta: 50 },
  { id: "fuel_increase", label: "+10% Fuel", fuelMultiplier: 1.1 },
  { id: "mobile_increase", label: "+10% Mobile", mobileMultiplier: 1.1 },
]);

function str(value) {
  return String(value ?? "").trim();
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value) {
  return Math.round(num(value) * 100) / 100;
}

function roundPct(value) {
  return Math.round(num(value) * 100) / 100;
}

function latestPeriod(periods = []) {
  return [...periods].sort((a, b) => str(a.period_ym).localeCompare(str(b.period_ym))).at(-1) || null;
}

function paymentsInPeriod(payments = [], period = null) {
  if (!period) return payments || [];
  const start = str(period.period_start);
  const end = str(period.period_end);
  return (payments || []).filter((payment) => {
    const d = str(payment.payment_date).slice(0, 10);
    if (!d) return false;
    if (start && d < start) return false;
    if (end && d > end) return false;
    return num(payment.amount_received) > 0;
  });
}

function agentTerritoryMap(labs = []) {
  const map = new Map();
  for (const lab of labs || []) {
    const agentId = str(lab.assigned_agent_id);
    if (!agentId) continue;
    const territory = str(lab.area || lab.territory) || "Unassigned";
    const existing = map.get(agentId) || new Set();
    existing.add(territory);
    map.set(agentId, existing);
  }
  return map;
}

function revenueByAgentFromAr(arRows = [], labs = []) {
  const labAgent = new Map(
    (labs || [])
      .filter((lab) => str(lab.assigned_agent_id))
      .map((lab) => [str(lab.lab_id), str(lab.assigned_agent_id)])
  );
  const totals = new Map();
  for (const row of arRows || []) {
    const labId = str(row.lab_id);
    const agentId = labAgent.get(labId);
    if (!agentId) continue;
    totals.set(agentId, roundMoney((totals.get(agentId) || 0) + num(row.total_delivered)));
  }
  return totals;
}

function collectionsByAgent(payments = []) {
  const totals = new Map();
  for (const payment of payments || []) {
    const agentId = str(payment.agent_id);
    if (!agentId) continue;
    totals.set(agentId, roundMoney((totals.get(agentId) || 0) + num(payment.amount_received)));
  }
  return totals;
}

function aggregateAgentMetrics({
  lines = [],
  periodPayments = [],
  arRows = [],
  labs = [],
  assignments = [],
} = {}) {
  const revenueByAgent = revenueByAgentFromAr(arRows, labs);
  const collectionsMap = collectionsByAgent(periodPayments);
  const territoryMap = agentTerritoryMap(labs);
  const activeAgentIds = new Set(
    (assignments || [])
      .filter((row) => row.assignment_status === "active")
      .map((row) => str(row.agent_id))
      .filter(Boolean)
  );

  const agentIds = new Set([
    ...activeAgentIds,
    ...lines.map((line) => str(line.agent_id)).filter(Boolean),
    ...collectionsMap.keys(),
    ...revenueByAgent.keys(),
  ]);

  const rows = [];
  for (const agentId of agentIds) {
    const agentLines = lines.filter((line) => str(line.agent_id) === agentId);
    const payrollCost = roundMoney(agentLines.reduce((sum, line) => sum + num(line.net_payable), 0));
    const commission = roundMoney(agentLines.reduce((sum, line) => sum + num(line.commission_amount), 0));
    const efficiencyValues = agentLines
      .map((line) => num(line.calculation_snapshot?.collection_efficiency_pct))
      .filter((value) => value > 0);
    const collectionEfficiency =
      efficiencyValues.length > 0
        ? roundPct(efficiencyValues.reduce((sum, value) => sum + value, 0) / efficiencyValues.length)
        : 0;
    const collections = collectionsMap.get(agentId) || 0;
    const revenue = revenueByAgent.get(agentId) || 0;
    const territories = [...(territoryMap.get(agentId) || new Set())];
    rows.push({
      agentId,
      agentName: agentLines[0]?.agent_name || agentId,
      territory: territories.join(", ") || "—",
      collections,
      collectionsLabel: formatInr(collections),
      revenue,
      revenueLabel: formatInr(revenue),
      commission,
      commissionLabel: formatInr(commission),
      collectionEfficiency,
      collectionEfficiencyLabel: `${collectionEfficiency}%`,
      payrollCost,
      payrollCostLabel: formatInr(payrollCost),
    });
  }
  return rows;
}

function sortRankingRows(rows = [], sortKey = "collections", direction = "desc") {
  const key = RANKING_SORT_KEYS.includes(sortKey) ? sortKey : "collections";
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = num(a[key]);
    const bv = num(b[key]);
    if (av === bv) return str(a.agentName).localeCompare(str(b.agentName)) * factor;
    return (av - bv) * factor;
  });
}

function ratioPct(numerator, denominator) {
  if (denominator <= 0) return 0;
  return roundPct((num(numerator) / num(denominator)) * 100);
}

function scaledPayments(payments = [], multiplier = 1) {
  return (payments || []).map((payment) => ({
    ...payment,
    amount_received: roundMoney(num(payment.amount_received) * multiplier),
  }));
}

function scaledPlans(plans = [], { salaryMultiplier = 1, fuelMultiplier = 1, mobileMultiplier = 1, commissionBpsDelta = 0 } = {}) {
  return (plans || []).map((plan) => ({
    ...plan,
    base_salary: roundMoney(num(plan.base_salary) * salaryMultiplier),
    fuel_allowance: roundMoney(num(plan.fuel_allowance) * fuelMultiplier),
    mobile_allowance: roundMoney(num(plan.mobile_allowance) * mobileMultiplier),
    commission_rate_bps: num(plan.commission_rate_bps) + num(commissionBpsDelta),
  }));
}

function previewTotals(preview) {
  return {
    payroll: roundMoney(preview.totals?.net_payable ?? preview.totals?.gross_pay ?? 0),
    commission: roundMoney(preview.totals?.commission_amount ?? 0),
  };
}

export function buildCompensationIntelligence({
  payrollPeriods = [],
  payrollRuns = [],
  payrollRunLines = [],
  commissionEntries = [],
  compensationPlans = [],
  planAssignments = [],
  payments = [],
  arRows = [],
  labs = [],
  currentPayrollLiability = 0,
  commissionPayable = 0,
} = {}) {
  const period = latestPeriod(payrollPeriods);
  const periodPayments = paymentsInPeriod(payments, period);
  const totalCollections = roundMoney(periodPayments.reduce((sum, p) => sum + num(p.amount_received), 0));
  const totalRevenue = roundMoney((arRows || []).reduce((sum, row) => sum + num(row.total_delivered), 0));

  const liabilityLines = (payrollRunLines || []).filter((line) => {
    const run = payrollRuns.find((row) => row.id === line.payroll_run_id);
    return run && ["draft", "previewed", "submitted", "approved"].includes(str(run.status));
  });
  const latestPeriodLines = period
    ? liabilityLines.filter((line) => line.period_id === period.id)
    : liabilityLines;

  const agentRows = aggregateAgentMetrics({
    lines: latestPeriodLines.length ? latestPeriodLines : payrollRunLines,
    periodPayments,
    arRows,
    labs,
    assignments: planAssignments,
  });

  const agentCount = Math.max(1, agentRows.length);
  const totalAgentCollections = roundMoney(agentRows.reduce((sum, row) => sum + row.collections, 0));
  const totalAgentRevenue = roundMoney(agentRows.reduce((sum, row) => sum + row.revenue, 0));
  const totalAgentCommission = roundMoney(agentRows.reduce((sum, row) => sum + row.commission, 0));
  const totalAgentPayroll = roundMoney(agentRows.reduce((sum, row) => sum + row.payrollCost, 0));

  const ratios = {
    payrollPctRevenue: ratioPct(currentPayrollLiability, totalRevenue),
    payrollPctRevenueLabel: `${ratioPct(currentPayrollLiability, totalRevenue)}%`,
    payrollPctCollections: ratioPct(currentPayrollLiability, totalCollections),
    payrollPctCollectionsLabel: `${ratioPct(currentPayrollLiability, totalCollections)}%`,
    revenuePerAgent: roundMoney(totalAgentRevenue / agentCount),
    revenuePerAgentLabel: formatInr(totalAgentRevenue / agentCount),
    collectionsPerAgent: roundMoney(totalAgentCollections / agentCount),
    collectionsPerAgentLabel: formatInr(totalAgentCollections / agentCount),
    commissionPerAgent: roundMoney(totalAgentCommission / agentCount),
    commissionPerAgentLabel: formatInr(totalAgentCommission / agentCount),
    periodYm: period?.period_ym || "—",
    totalRevenue,
    totalRevenueLabel: formatInr(totalRevenue),
    totalCollections,
    totalCollectionsLabel: formatInr(totalCollections),
  };

  const rankings = {
    sortKeys: RANKING_SORT_KEYS,
    agentRows,
    topPerformers: sortRankingRows(agentRows, "payrollCost", "desc").slice(0, 8),
    bottomPerformers: sortRankingRows(agentRows, "payrollCost", "asc").slice(0, 8),
  };

  const territoryMap = new Map();
  for (const row of agentRows) {
    const territories = str(row.territory).split(",").map((t) => t.trim()).filter(Boolean);
    const keys = territories.length ? territories : ["Unassigned"];
    for (const territory of keys) {
      const existing = territoryMap.get(territory) || {
        territory,
        agentCount: 0,
        collections: 0,
        revenue: 0,
        commission: 0,
        payrollCost: 0,
        efficiencyTotal: 0,
        efficiencyCount: 0,
      };
      existing.agentCount += 1;
      existing.collections = roundMoney(existing.collections + row.collections);
      existing.revenue = roundMoney(existing.revenue + row.revenue);
      existing.commission = roundMoney(existing.commission + row.commission);
      existing.payrollCost = roundMoney(existing.payrollCost + row.payrollCost);
      if (row.collectionEfficiency > 0) {
        existing.efficiencyTotal += row.collectionEfficiency;
        existing.efficiencyCount += 1;
      }
      territoryMap.set(territory, existing);
    }
  }

  const territoryRows = [...territoryMap.values()]
    .map((row) => {
      const efficiency =
        row.efficiencyCount > 0 ? roundPct(row.efficiencyTotal / row.efficiencyCount) : 0;
      return {
        ...row,
        collectionsLabel: formatInr(row.collections),
        revenueLabel: formatInr(row.revenue),
        commissionLabel: formatInr(row.commission),
        payrollCostLabel: formatInr(row.payrollCost),
        collectionEfficiency: efficiency,
        collectionEfficiencyLabel: `${efficiency}%`,
        payrollPctRevenue: ratioPct(row.payrollCost, row.revenue),
        payrollPctRevenueLabel: `${ratioPct(row.payrollCost, row.revenue)}%`,
        payrollPctCollections: ratioPct(row.payrollCost, row.collections),
        payrollPctCollectionsLabel: `${ratioPct(row.payrollCost, row.collections)}%`,
      };
    })
    .sort((a, b) => b.payrollCost - a.payrollCost);

  const activeAssignments = (planAssignments || []).filter((row) => row.assignment_status === "active");
  const activePlans = (compensationPlans || []).filter((plan) => ["active", "draft"].includes(str(plan.status)));
  const baselinePreview = period
    ? calculateCompensationPreview({
        period,
        payments: periodPayments,
        planAssignments: activeAssignments,
        compensationPlans: activePlans,
        arRows,
        cumulativePayments: payments,
      })
    : null;
  const baselineTotals = baselinePreview ? previewTotals(baselinePreview) : { payroll: currentPayrollLiability, commission: commissionPayable };

  const forecastScenarios = FORECAST_SCENARIO_PRESETS.map((preset) => {
    if (!period || !baselinePreview) {
      return {
        ...preset,
        projectedPayroll: baselineTotals.payroll,
        projectedPayrollLabel: formatInr(baselineTotals.payroll),
        projectedCommission: baselineTotals.commission,
        projectedCommissionLabel: formatInr(baselineTotals.commission),
        payrollPctRevenue: ratios.payrollPctRevenue,
        payrollPctRevenueLabel: ratios.payrollPctRevenueLabel,
        payrollPctCollections: ratios.payrollPctCollections,
        payrollPctCollectionsLabel: ratios.payrollPctCollectionsLabel,
        incrementalCost: 0,
        incrementalCostLabel: formatInr(0),
        previewOnly: true,
      };
    }

    const scenarioPayments = preset.collectionsMultiplier
      ? scaledPayments(periodPayments, preset.collectionsMultiplier)
      : periodPayments;
    const scenarioPlans = scaledPlans(activePlans, preset);
    const scenarioPreview = calculateCompensationPreview({
      period,
      payments: scenarioPayments,
      planAssignments: activeAssignments,
      compensationPlans: scenarioPlans,
      arRows,
      cumulativePayments: payments,
    });
    const scenarioTotals = previewTotals(scenarioPreview);
    const scenarioRevenue = preset.collectionsMultiplier
      ? roundMoney(totalRevenue * preset.collectionsMultiplier)
      : totalRevenue;
    const scenarioCollections = preset.collectionsMultiplier
      ? roundMoney(totalCollections * preset.collectionsMultiplier)
      : totalCollections;

    return {
      ...preset,
      projectedPayroll: scenarioTotals.payroll,
      projectedPayrollLabel: formatInr(scenarioTotals.payroll),
      projectedCommission: scenarioTotals.commission,
      projectedCommissionLabel: formatInr(scenarioTotals.commission),
      payrollPctRevenue: ratioPct(scenarioTotals.payroll, scenarioRevenue),
      payrollPctRevenueLabel: `${ratioPct(scenarioTotals.payroll, scenarioRevenue)}%`,
      payrollPctCollections: ratioPct(scenarioTotals.payroll, scenarioCollections),
      payrollPctCollectionsLabel: `${ratioPct(scenarioTotals.payroll, scenarioCollections)}%`,
      incrementalCost: roundMoney(scenarioTotals.payroll - baselineTotals.payroll),
      incrementalCostLabel: formatInr(scenarioTotals.payroll - baselineTotals.payroll),
      previewOnly: true,
    };
  });

  return {
    ratios,
    rankings,
    territoryRows,
    forecast: {
      previewOnly: true,
      baselinePayroll: baselineTotals.payroll,
      baselinePayrollLabel: formatInr(baselineTotals.payroll),
      baselineCommission: baselineTotals.commission,
      baselineCommissionLabel: formatInr(baselineTotals.commission),
      scenarios: forecastScenarios,
    },
    newHireDefaults: {
      hireCount: 1,
      planId: activePlans[0]?.id || compensationPlans[0]?.id || "",
    },
  };
}

export function buildNewHireForecast({
  hireCount = 1,
  plan = null,
  averageCommissionPerAgent = 0,
} = {}) {
  const count = Math.max(0, Math.floor(num(hireCount)));
  const salary = num(plan?.base_salary);
  const fuel = num(plan?.fuel_allowance);
  const mobile = num(plan?.mobile_allowance);
  const fixedPerHire = roundMoney(salary + fuel + mobile);
  const commissionPerHire = roundMoney(num(averageCommissionPerAgent));
  const projectedMonthlyIncrease = roundMoney(count * (fixedPerHire + commissionPerHire));
  const projectedFixedIncrease = roundMoney(count * fixedPerHire);
  const projectedCommissionIncrease = roundMoney(count * commissionPerHire);

  return {
    previewOnly: true,
    hireCount: count,
    planCode: plan?.plan_code || "—",
    planVersion: plan?.version || "—",
    fixedPerHire,
    fixedPerHireLabel: formatInr(fixedPerHire),
    commissionPerHire,
    commissionPerHireLabel: formatInr(commissionPerHire),
    projectedFixedIncrease,
    projectedFixedIncreaseLabel: formatInr(projectedFixedIncrease),
    projectedCommissionIncrease,
    projectedCommissionIncreaseLabel: formatInr(projectedCommissionIncrease),
    projectedMonthlyIncrease,
    projectedMonthlyIncreaseLabel: formatInr(projectedMonthlyIncrease),
  };
}

export { sortRankingRows };
