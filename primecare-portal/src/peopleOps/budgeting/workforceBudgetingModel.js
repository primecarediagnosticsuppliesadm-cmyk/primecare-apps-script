/**
 * Phase 8.3 — Workforce planning & budgeting derivations (UI only, no API/schema mutations).
 * Reuses executiveCompensationModel, reportingContext, forecastMetrics, employee directory.
 */
import { formatInr, num, ratioPct, roundMoney } from "@/compensation/analytics/analyticsFormatters.js";
import { FORECAST_SCENARIO_PRESETS } from "@/compensation/analytics/forecastMetrics.js";

const PLANNING_HEADROOM_PCT = 0.25;

const HEADCOUNT_SCENARIO_TEMPLATES = Object.freeze([
  { id: "hire_agent_1", label: "+1 Sales Agent", role: "agent", headcountDelta: 1 },
  { id: "hire_hr_2", label: "+2 HR", role: "hr", headcountDelta: 2 },
  { id: "hire_warehouse_5", label: "+5 Warehouse", role: "agent", headcountDelta: 5, department: "Warehouse" },
  { id: "salary_10", label: "10% salary increase", forecastPresetId: "salary_10" },
  { id: "fuel_5", label: "5% fuel increase", forecastPresetId: "fuel_increase", fuelScale: 1.05 },
  { id: "territory_expansion", label: "New territory", forecastPresetId: "collections_20" },
]);

function str(value) {
  return String(value ?? "").trim();
}

function roleLabel(role) {
  const key = str(role).toLowerCase();
  if (key === "agent") return "Sales Agent";
  if (key === "hr") return "HR";
  if (key === "executive") return "Executive";
  if (key === "admin") return "Admin";
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : "Other";
}

function averagePayrollForRole(employeeList = [], previewRows = [], role, fallback = 0) {
  const previewByProfile = new Map(
    (previewRows || []).filter((row) => row.inReportingContext).map((row) => [str(row.profileUserId), row])
  );
  const profiles = (employeeList || []).filter(
    (employee) => str(employee.role).toLowerCase() === str(role).toLowerCase()
  );
  if (!profiles.length) return fallback;
  const values = profiles
    .map((employee) => num(previewByProfile.get(str(employee.profileUserId))?.netPreview))
    .filter((value) => value > 0);
  if (!values.length) return fallback;
  return roundMoney(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function buildPlanningEnvelope(currentPayroll) {
  const payroll = roundMoney(currentPayroll);
  const approvedBudget = roundMoney(payroll * (1 + PLANNING_HEADROOM_PCT));
  return {
    currentPayroll: payroll,
    currentPayrollLabel: formatInr(payroll),
    approvedBudget,
    approvedBudgetLabel: formatInr(approvedBudget),
    headroomPct: PLANNING_HEADROOM_PCT * 100,
    derived: true,
  };
}

export function buildBudgetOverviewKpis({ model, planningState = {} } = {}) {
  const kpis = model?.kpis || {};
  const forecast = model?.intelligence?.forecast || {};
  const ratios = model?.intelligence?.ratios || {};
  const envelope = buildPlanningEnvelope(kpis.currentPayrollLiability || 0);
  const headcountPositions = planningState.headcountPositions || [];
  const openPositions = headcountPositions.filter((row) => !row.archived).reduce((sum, row) => sum + num(row.openCount), 0);

  const projectedPayroll = roundMoney(
    Math.max(
      num(forecast.baselinePayroll),
      ...(forecast.scenarios || []).map((row) => num(row.projectedPayroll))
    )
  );
  const remainingBudget = roundMoney(envelope.approvedBudget - projectedPayroll);
  const variance = roundMoney(envelope.approvedBudget - envelope.currentPayroll);
  const payrollPct = ratioPct(envelope.currentPayroll, envelope.approvedBudget);

  return {
    approvedBudget: envelope.approvedBudget,
    approvedBudgetLabel: envelope.approvedBudgetLabel,
    currentPayroll: envelope.currentPayroll,
    currentPayrollLabel: envelope.currentPayrollLabel,
    projectedPayroll,
    projectedPayrollLabel: formatInr(projectedPayroll),
    remainingBudget,
    remainingBudgetLabel: formatInr(remainingBudget),
    payrollPct,
    payrollPctLabel: `${payrollPct}%`,
    headcount: kpis.employeeCount || 0,
    openPositions,
    variance,
    varianceLabel: formatInr(variance),
    periodLabel: model?.reportingContext?.periodLabel || "—",
    payrollPctRevenue: ratios.payrollPctRevenue,
    payrollPctRevenueLabel: ratios.payrollPctRevenueLabel || "—",
    previewOnly: true,
  };
}

export function buildBudgetChartSeries(model) {
  const payrollTrend = model?.charts?.payrollTrend || [];
  const envelope = buildPlanningEnvelope(model?.kpis?.currentPayrollLiability || 0);

  const monthlyPayroll = payrollTrend.map((row) => ({
    label: row.label || row.periodYm,
    value: num(row.netPayroll),
    valueLabel: row.netPayrollLabel || formatInr(row.netPayroll),
  }));

  const budgetVsActual = payrollTrend.map((row) => ({
    label: row.label || row.periodYm,
    budget: envelope.approvedBudget,
    budgetLabel: envelope.approvedBudgetLabel,
    actual: num(row.netPayroll),
    actualLabel: row.netPayrollLabel || formatInr(row.netPayroll),
  }));

  const headcountTrend = payrollTrend.map((row, index) => ({
    label: row.label || row.periodYm,
    value: Math.max(1, (model?.kpis?.employeeCount || 1) - (payrollTrend.length - index - 1)),
  }));

  return { monthlyPayroll, budgetVsActual, headcountTrend };
}

export function buildDepartmentBudgetRows({ employeeList = [], previewRows = [], envelope }) {
  const byDepartment = new Map();

  for (const employee of employeeList) {
    const department = str(employee.department || "HQ") || "HQ";
    if (!byDepartment.has(department)) {
      byDepartment.set(department, { department, employees: [], payroll: 0 });
    }
    const bucket = byDepartment.get(department);
    bucket.employees.push(employee);
    const line = (previewRows || []).find(
      (row) => row.inReportingContext && str(row.profileUserId) === str(employee.profileUserId)
    );
    bucket.payroll = roundMoney(bucket.payroll + num(line?.netPreview));
  }

  return [...byDepartment.values()].map((bucket) => {
    const count = bucket.employees.length;
    const currentPayroll = roundMoney(bucket.payroll);
    const budget = roundMoney((envelope?.approvedBudget || 0) * (count / Math.max(employeeList.length, 1)));
    const forecastPayroll = roundMoney(currentPayroll * 1.05);
    const variance = roundMoney(budget - currentPayroll);
    return {
      id: bucket.department,
      department: bucket.department,
      employees: count,
      employeeRows: bucket.employees,
      budget,
      budgetLabel: formatInr(budget),
      currentPayroll,
      currentPayrollLabel: formatInr(currentPayroll),
      forecastPayroll,
      forecastPayrollLabel: formatInr(forecastPayroll),
      variance,
      varianceLabel: formatInr(variance),
      status: variance >= 0 ? "on_track" : "over_budget",
      statusLabel: variance >= 0 ? "On track" : "Over budget",
    };
  });
}

export function buildHeadcountPlanningRows({ employeeList = [], previewRows = [], planningState = {}, kpis = {} } = {}) {
  const positions = planningState.headcountPositions || [];
  const byRole = new Map();

  for (const employee of employeeList) {
    const role = str(employee.role || "other").toLowerCase();
    byRole.set(role, (byRole.get(role) || 0) + 1);
  }

  const roleRows = [...byRole.entries()].map(([role, current]) => {
    const sessionOpen = positions
      .filter((row) => !row.archived && str(row.role).toLowerCase() === role)
      .reduce((sum, row) => sum + num(row.openCount), 0);
    const monthlyCost = averagePayrollForRole(employeeList, previewRows, role, kpis.averagePayroll || 0);
    const open = sessionOpen;
    const target = current + open;
    return {
      id: `role-${role}`,
      role,
      roleLabel: roleLabel(role),
      current,
      target,
      open,
      monthlyCost,
      monthlyCostLabel: formatInr(monthlyCost),
      annualCost: roundMoney(monthlyCost * 12),
      annualCostLabel: formatInr(monthlyCost * 12),
      hiringCost: roundMoney(monthlyCost * 2),
      hiringCostLabel: formatInr(monthlyCost * 2),
      source: "directory",
    };
  });

  const customRows = positions
    .filter((row) => !row.archived && !byRole.has(str(row.role).toLowerCase()))
    .map((row) => {
      const monthlyCost = roundMoney(num(row.monthlyCost) || kpis.averagePayroll || 0);
      return {
        id: row.id,
        role: row.role,
        roleLabel: row.title || roleLabel(row.role),
        current: 0,
        target: num(row.openCount),
        open: num(row.openCount),
        monthlyCost,
        monthlyCostLabel: formatInr(monthlyCost),
        annualCost: roundMoney(monthlyCost * 12),
        annualCostLabel: formatInr(monthlyCost * 12),
        hiringCost: roundMoney(monthlyCost * 2),
        hiringCostLabel: formatInr(monthlyCost * 2),
        source: "session",
      };
    });

  return [...roleRows, ...customRows];
}

export function buildPlanningScenarios({ model, employeeList = [], planningState = {} } = {}) {
  const forecast = model?.intelligence?.forecast || {};
  const kpis = model?.kpis || {};
  const envelope = buildPlanningEnvelope(kpis.currentPayrollLiability || 0);
  const baseline = num(forecast.baselinePayroll || kpis.currentPayrollLiability);
  const avgPayroll = num(kpis.averagePayroll) || (kpis.employeeCount ? baseline / kpis.employeeCount : 0);
  const forecastById = new Map((forecast.scenarios || []).map((row) => [row.id, row]));

  const builtIn = HEADCOUNT_SCENARIO_TEMPLATES.map((template) => {
    let monthlyPayroll = baseline;
    let headcount = kpis.employeeCount || 0;

    if (template.forecastPresetId) {
      const preset = forecastById.get(template.forecastPresetId);
      monthlyPayroll = num(preset?.projectedPayroll || baseline);
    } else if (template.headcountDelta) {
      const roleAvg = averagePayrollForRole(employeeList, model?.previewRows, template.role, avgPayroll);
      monthlyPayroll = roundMoney(baseline + roleAvg * template.headcountDelta);
      headcount += template.headcountDelta;
    }

    const annualPayroll = roundMoney(monthlyPayroll * 12);
    const budgetRemaining = roundMoney(envelope.approvedBudget - monthlyPayroll);
    const variance = roundMoney(envelope.approvedBudget - monthlyPayroll);

    return {
      id: template.id,
      label: template.label,
      monthlyPayroll,
      monthlyPayrollLabel: formatInr(monthlyPayroll),
      annualPayroll,
      annualPayrollLabel: formatInr(annualPayroll),
      budgetRemaining,
      budgetRemainingLabel: formatInr(budgetRemaining),
      headcount,
      variance,
      varianceLabel: formatInr(variance),
      previewOnly: true,
      source: "template",
    };
  });

  const custom = (planningState.customScenarios || []).map((row) => {
    const monthlyPayroll = roundMoney(num(row.monthlyPayroll) || baseline);
    return {
      ...row,
      monthlyPayrollLabel: formatInr(monthlyPayroll),
      annualPayroll: roundMoney(monthlyPayroll * 12),
      annualPayrollLabel: formatInr(monthlyPayroll * 12),
      budgetRemaining: roundMoney(envelope.approvedBudget - monthlyPayroll),
      budgetRemainingLabel: formatInr(envelope.approvedBudget - monthlyPayroll),
      variance: roundMoney(envelope.approvedBudget - monthlyPayroll),
      varianceLabel: formatInr(envelope.approvedBudget - monthlyPayroll),
      previewOnly: true,
      source: "custom",
    };
  });

  const forecastRows = (forecast.scenarios || []).map((row) => ({
    id: `forecast-${row.id}`,
    label: row.label,
    monthlyPayroll: num(row.projectedPayroll),
    monthlyPayrollLabel: row.projectedPayrollLabel,
    annualPayroll: roundMoney(num(row.projectedPayroll) * 12),
    annualPayrollLabel: formatInr(num(row.projectedPayroll) * 12),
    budgetRemaining: roundMoney(envelope.approvedBudget - num(row.projectedPayroll)),
    budgetRemainingLabel: formatInr(envelope.approvedBudget - num(row.projectedPayroll)),
    headcount: kpis.employeeCount || 0,
    variance: roundMoney(envelope.approvedBudget - num(row.projectedPayroll)),
    varianceLabel: formatInr(envelope.approvedBudget - num(row.projectedPayroll)),
    previewOnly: true,
    source: "forecast",
  }));

  return [...builtIn, ...custom, ...forecastRows];
}

export function buildDepartmentAllocation(model, employeeList) {
  const envelope = buildPlanningEnvelope(model?.kpis?.currentPayrollLiability || 0);
  const rows = buildDepartmentBudgetRows({
    employeeList,
    previewRows: model?.previewRows,
    envelope,
  });
  const total = rows.reduce((sum, row) => sum + row.currentPayroll, 0) || 1;
  return rows.map((row) => ({
    label: row.department,
    value: row.currentPayroll,
    valueLabel: row.currentPayrollLabel,
    pct: ratioPct(row.currentPayroll, total),
  }));
}

export function buildBudgetHistoryEntries(planningState = {}) {
  return [...(planningState.history || [])].sort((a, b) => str(b.createdAt).localeCompare(str(a.createdAt)));
}

export function buildWorkforceBudgetWorkspace({ model, employeeList = [], planningState = {} } = {}) {
  if (!model) return null;
  const envelope = buildPlanningEnvelope(model.kpis?.currentPayrollLiability || 0);
  const overview = buildBudgetOverviewKpis({ model, planningState });
  const charts = buildBudgetChartSeries(model);
  const departments = buildDepartmentBudgetRows({
    employeeList,
    previewRows: model.previewRows,
    envelope,
  });
  const headcount = buildHeadcountPlanningRows({
    employeeList,
    previewRows: model.previewRows,
    planningState,
    kpis: model.kpis,
  });
  const scenarios = buildPlanningScenarios({ model, employeeList, planningState });
  const history = buildBudgetHistoryEntries(planningState);
  const departmentAllocation = buildDepartmentAllocation(model, employeeList);

  return {
    previewOnly: true,
    envelope,
    overview,
    charts: { ...charts, departmentAllocation },
    departments,
    headcount,
    scenarios,
    history,
    scenarioTemplates: HEADCOUNT_SCENARIO_TEMPLATES,
    forecastPresets: FORECAST_SCENARIO_PRESETS,
  };
}

export { HEADCOUNT_SCENARIO_TEMPLATES, PLANNING_HEADROOM_PCT };
