import {
  formatInr,
  num,
  roundMoney,
  snapshotField,
  str,
} from "./analyticsFormatters.js";
import { latestRunByPeriodMap } from "../reportingContext.js";

function linesForRun(lines, runId) {
  return (lines || []).filter((line) => str(line.payroll_run_id) === runId);
}

export function buildContextPayrollKpis(contextLines = []) {
  const currentPayrollLiability = roundMoney(
    contextLines.reduce((sum, line) => sum + num(line.net_payable), 0)
  );
  const commissionPayable = roundMoney(
    contextLines.reduce((sum, line) => sum + num(line.commission_amount), 0)
  );

  const efficiencyValues = contextLines
    .map((line) => num(snapshotField(line, "collection_efficiency_pct")))
    .filter((value) => value > 0);
  const collectionEfficiency =
    efficiencyValues.length > 0
      ? roundMoney(efficiencyValues.reduce((sum, value) => sum + value, 0) / efficiencyValues.length)
      : 0;

  const promotionEligibleAgents = new Set(
    contextLines
      .filter((line) => snapshotField(line, "promotion_eligible", false) === true)
      .map((line) => str(line.profile_user_id || line.agent_id))
      .filter(Boolean)
  ).size;

  const employeeCount = Math.max(1, contextLines.length);
  const averageCommission =
    contextLines.length > 0
      ? roundMoney(
          contextLines.reduce((sum, line) => sum + num(line.commission_amount), 0) / employeeCount
        )
      : 0;
  const averagePayroll =
    contextLines.length > 0
      ? roundMoney(contextLines.reduce((sum, line) => sum + num(line.net_payable), 0) / employeeCount)
      : 0;

  return {
    currentPayrollLiability,
    currentPayrollLiabilityLabel: formatInr(currentPayrollLiability),
    commissionPayable,
    commissionPayableLabel: formatInr(commissionPayable),
    collectionEfficiency,
    collectionEfficiencyLabel: `${collectionEfficiency}%`,
    promotionEligibleAgents,
    averageCommission,
    averageCommissionLabel: formatInr(averageCommission),
    averagePayroll,
    averagePayrollLabel: formatInr(averagePayroll),
    employeeCount: contextLines.length,
  };
}

export function buildPayrollTrendSeries({ periods = [], runs = [], lines = [] } = {}) {
  const latestRunsByPeriod = latestRunByPeriodMap(periods, runs);

  const payrollTrend = [...periods]
    .sort((a, b) => str(a.period_ym).localeCompare(str(b.period_ym)))
    .slice(-12)
    .map((period) => {
      const run = latestRunsByPeriod.get(period.id);
      const runLines = run ? linesForRun(lines, run.id) : [];
      const netPayroll = roundMoney(runLines.reduce((sum, line) => sum + num(line.net_payable), 0));
      return {
        periodYm: period.period_ym,
        label: period.period_ym,
        netPayroll,
        netPayrollLabel: formatInr(netPayroll),
        status: period.status,
        runNumber: run?.run_number ?? null,
      };
    });

  const commissionTrend = payrollTrend.map((point) => {
    const period = periods.find((row) => row.period_ym === point.periodYm);
    const run = period ? latestRunsByPeriod.get(period.id) : null;
    const runLines = run ? linesForRun(lines, run.id) : [];
    const commission = roundMoney(
      runLines.reduce((sum, line) => sum + num(line.commission_amount), 0)
    );
    return { ...point, commission, commissionLabel: formatInr(commission) };
  });

  const collectionTrend = payrollTrend.map((point) => {
    const period = periods.find((row) => row.period_ym === point.periodYm);
    const run = period ? latestRunsByPeriod.get(period.id) : null;
    const runLines = run ? linesForRun(lines, run.id) : [];
    const values = runLines
      .map((line) => num(snapshotField(line, "collection_efficiency_pct")))
      .filter((value) => value > 0);
    const efficiency =
      values.length > 0
        ? roundMoney(values.reduce((sum, value) => sum + value, 0) / values.length)
        : 0;
    return { ...point, efficiency, efficiencyLabel: `${efficiency}%` };
  });

  const liabilityTrend = payrollTrend.map((point) => ({
    ...point,
    liability: point.netPayroll,
    liabilityLabel: point.netPayrollLabel,
  }));

  return { payrollTrend, commissionTrend, collectionTrend, liabilityTrend };
}

export function buildPromotionPipeline(contextLines = []) {
  const rows = [...contextLines]
    .reduce((map, line) => {
      const key = str(line.profile_user_id || line.agent_id);
      if (!key) return map;
      const eligible = snapshotField(line, "promotion_eligible", false) === true;
      const status = str(snapshotField(line, "promotion_status", "unknown"));
      const existing = map.get(key) || {
        profileUserId: line.profile_user_id || null,
        agentId: line.agent_id || key,
        agentName: line.employee_name || line.agent_name || key,
        eligible,
        status,
        efficiencyPct: num(snapshotField(line, "collection_efficiency_pct")),
      };
      existing.eligible = existing.eligible || eligible;
      existing.status = eligible ? "eligible" : status || existing.status;
      existing.efficiencyPct = Math.max(
        existing.efficiencyPct,
        num(snapshotField(line, "collection_efficiency_pct"))
      );
      map.set(key, existing);
      return map;
    }, new Map())
    .values();

  return [...rows].sort((a, b) => Number(b.eligible) - Number(a.eligible)).slice(0, 10);
}

export function buildTopPerformers(contextLines = []) {
  return [...contextLines]
    .reduce((map, line) => {
      const key = str(line.profile_user_id || line.agent_id);
      if (!key) return map;
      const existing = map.get(key) || {
        profileUserId: line.profile_user_id || null,
        agentId: line.agent_id || key,
        agentName: line.employee_name || line.agent_name || key,
        netPayable: 0,
        commissionAmount: 0,
      };
      existing.netPayable = roundMoney(existing.netPayable + num(line.net_payable));
      existing.commissionAmount = roundMoney(existing.commissionAmount + num(line.commission_amount));
      map.set(key, existing);
      return map;
    }, new Map())
    .values();
}
