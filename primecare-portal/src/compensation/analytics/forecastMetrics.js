import { calculateCompensationPreview } from "../compensationCalculationEngine.js";
import {
  FORECAST_SCENARIO_PRESETS,
} from "../compensationIntelligenceEngine.js";
import { paymentsInPeriod } from "./employeeMetrics.js";
import {
  formatInr,
  num,
  ratioPct,
  roundMoney,
  str,
} from "./analyticsFormatters.js";

function scaledPayments(payments = [], multiplier = 1) {
  return (payments || []).map((payment) => ({
    ...payment,
    amount_received: roundMoney(num(payment.amount_received) * multiplier),
  }));
}

function scaledPlans(
  plans = [],
  { salaryMultiplier = 1, fuelMultiplier = 1, mobileMultiplier = 1, commissionBpsDelta = 0 } = {}
) {
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

export function buildForecastMetrics({
  contextLines = [],
  period = null,
  payments = [],
  arRows = [],
  compensationPlans = [],
  planAssignments = [],
  ratios = {},
} = {}) {
  const baselinePayroll = roundMoney(
    contextLines.reduce((sum, line) => sum + num(line.net_payable), 0)
  );
  const baselineCommission = roundMoney(
    contextLines.reduce((sum, line) => sum + num(line.commission_amount), 0)
  );
  const baselineTotals = { payroll: baselinePayroll, commission: baselineCommission };

  const periodPayments = paymentsInPeriod(payments, period);
  const activeAssignments = (planAssignments || []).filter(
    (row) => row.assignment_status === "active"
  );
  const activePlans = (compensationPlans || []).filter((plan) =>
    ["active", "draft"].includes(str(plan.status))
  );

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

  const forecastScenarios = FORECAST_SCENARIO_PRESETS.map((preset) => {
    if (!period) {
      return {
        ...preset,
        projectedPayroll: baselineTotals.payroll,
        projectedPayrollLabel: formatInr(baselineTotals.payroll),
        projectedCommission: baselineTotals.commission,
        projectedCommissionLabel: formatInr(baselineTotals.commission),
        payrollPctRevenue: ratios.payrollPctRevenue || 0,
        payrollPctRevenueLabel: ratios.payrollPctRevenueLabel || "0%",
        payrollPctCollections: ratios.payrollPctCollections || 0,
        payrollPctCollectionsLabel: ratios.payrollPctCollectionsLabel || "0%",
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
      ? roundMoney(num(ratios.totalRevenue) * preset.collectionsMultiplier)
      : num(ratios.totalRevenue);
    const scenarioCollections = preset.collectionsMultiplier
      ? roundMoney(num(ratios.totalCollections) * preset.collectionsMultiplier)
      : num(ratios.totalCollections);

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
    previewOnly: true,
    baselinePayroll: baselineTotals.payroll,
    baselinePayrollLabel: formatInr(baselineTotals.payroll),
    baselineCommission: baselineTotals.commission,
    baselineCommissionLabel: formatInr(baselineTotals.commission),
    baselineFromPersistedRun: true,
    recalculatedPreviewTotal: baselinePreview ? previewTotals(baselinePreview).payroll : null,
    scenarios: forecastScenarios,
    newHireDefaults: {
      hireCount: 1,
      planId: activePlans[0]?.id || compensationPlans[0]?.id || "",
    },
  };
}

export { FORECAST_SCENARIO_PRESETS };
