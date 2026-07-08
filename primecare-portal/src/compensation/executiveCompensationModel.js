import { buildCollectionCompensationDashboard } from "./collectionCompensationModel.js";
import { buildExecutivePerformanceModel } from "./executivePerformanceModel.js";
import { buildEmployeeMetrics } from "./analytics/employeeMetrics.js";
import { buildForecastMetrics } from "./analytics/forecastMetrics.js";
import { buildContextPayrollKpis, buildPayrollTrendSeries, buildPromotionPipeline, buildTopPerformers } from "./analytics/payrollMetrics.js";
import { buildRankingMetrics } from "./analytics/rankingMetrics.js";
import { buildRatioMetrics } from "./analytics/ratioMetrics.js";
import { buildTerritoryMetrics } from "./analytics/territoryMetrics.js";
import {
  formatDate,
  formatDateTime,
  formatInr,
  num,
  roundMoney,
  snapshotField,
  str,
} from "./analytics/analyticsFormatters.js";
import {
  latestRunForPeriod,
  linesForReportingContext,
  resolveReportingContext,
} from "./reportingContext.js";

const PENDING_PERIOD_STATUSES = new Set(["draft", "previewed", "submitted"]);

function planById(plans, planId) {
  return (plans || []).find((plan) => plan.id === planId);
}

function assignmentForAgent(assignments, agentId) {
  return (assignments || []).find(
    (row) => str(row.agent_id) === str(agentId) && row.assignment_status === "active"
  );
}

function paidEvidenceAt(run) {
  return run?.metadata?.paid_evidence?.paid_at || null;
}

function buildExecutiveIntelligence({
  context,
  contextLines,
  profiles,
  assignments,
  plans,
  payments,
  arRows,
  labs,
}) {
  const employeeRows = buildEmployeeMetrics({
    contextLines,
    profiles,
    assignments,
    labs,
    payments,
    arRows,
    period: context.period,
  });
  const contextKpis = buildContextPayrollKpis(contextLines);
  const ratios = buildRatioMetrics({
    payrollLiability: contextKpis.currentPayrollLiability,
    employeeRows,
    payments,
    arRows,
    labs,
    period: context.period,
  });
  const rankings = buildRankingMetrics(employeeRows);
  const territoryRows = buildTerritoryMetrics(employeeRows);
  const forecast = buildForecastMetrics({
    contextLines,
    period: context.period,
    payments,
    arRows,
    compensationPlans: plans,
    planAssignments: assignments,
    ratios,
  });

  return {
    reportingContext: context,
    ratios,
    rankings,
    territoryRows,
    forecast,
    employeeRows,
    newHireDefaults: forecast.newHireDefaults,
  };
}

export function buildExecutiveCompensationModel(payload = {}) {
  const periods = payload.payrollPeriods || [];
  const runs = payload.payrollRuns || [];
  const lines = payload.payrollRunLines || [];
  const commissionEntries = payload.commissionEntries || [];
  const plans = payload.compensationPlans || [];
  const assignments = payload.planAssignments || [];
  const auditEvents = payload.auditEvents || [];
  const payrollExports = payload.payrollExports || [];
  const profiles = payload.profiles || [];
  const selection = payload.reportingSelection || {};

  const reportingContext = resolveReportingContext({
    payrollPeriods: periods,
    payrollRuns: runs,
    periodId: selection.periodId || null,
    payrollRunId: selection.payrollRunId || null,
    profiles,
  });

  const rawContextLines = linesForReportingContext(lines, reportingContext);
  const contextLines = filterAnalyticsLines(rawContextLines, { profiles });

  const latestRunsByPeriod = new Map(
    periods.map((period) => [period.id, latestRunForPeriod(runs, period.id)])
  );

  const pendingPayrollPeriods = periods.filter((period) =>
    PENDING_PERIOD_STATUSES.has(str(period.status))
  ).length;
  const lockedPayrollRuns = runs.filter((run) => str(run.status) === "locked").length;
  const exportedPayrollRuns = runs.filter((run) => str(run.status) === "exported").length;
  const paidEvidenceRuns = runs.filter((run) => str(run.status) === "paid").length;

  const contextKpis = buildContextPayrollKpis(contextLines);
  const trendSeries = buildPayrollTrendSeries({ periods, runs, lines });
  const topPerformers = buildTopPerformers(contextLines);
  const topAgents = [...topPerformers]
    .sort((a, b) => b.netPayable - a.netPayable)
    .slice(0, 8)
    .map((row) => ({
      ...row,
      netPayableLabel: formatInr(row.netPayable),
      commissionLabel: formatInr(row.commissionAmount),
    }));

  const promotionPipelineRows = buildPromotionPipeline(contextLines);

  const periodRows = periods.map((period) => {
    const run = latestRunsByPeriod.get(period.id);
    const runLines = run ? linesForReportingContext(lines, { payrollRunId: run.id }) : [];
    const includedLines = filterAnalyticsLines(runLines, { profiles });
    const netPayroll = roundMoney(includedLines.reduce((sum, line) => sum + num(line.net_payable), 0));
    return {
      periodId: period.id,
      periodYm: period.period_ym,
      status: period.status,
      generatedAt: run?.generated_at || null,
      submittedAt: period.submitted_at || run?.submitted_at || null,
      approvedAt: period.approved_at || run?.approved_at || null,
      lockedAt: period.locked_at || run?.locked_at || null,
      exportedAt: period.exported_at || run?.exported_at || null,
      paidAt: paidEvidenceAt(run),
      runVersion: run?.run_number || null,
      runId: run?.id || null,
      employeeCount: new Set(
        includedLines.map((line) => str(line.profile_user_id || line.agent_id)).filter(Boolean)
      ).size,
      netPayroll,
      netPayrollLabel: formatInr(netPayroll),
    };
  });

  const previewRows = lines.map((line) => {
    const run = runs.find((row) => row.id === line.payroll_run_id);
    const period = periods.find((row) => row.id === line.period_id);
    const assignment =
      assignments.find((row) => str(row.profile_user_id) === str(line.profile_user_id)) ||
      assignmentForAgent(assignments, line.agent_id);
    const plan = planById(plans, assignment?.plan_id) || planById(plans, snapshotField(line, "plan_id", null));
    const bonuses = roundMoney(
      num(line.quarterly_bonus) +
        num(line.annual_bonus) +
        num(line.collection_incentive) +
        num(line.delivery_incentive) +
        num(line.qualification_incentive) +
        num(line.attendance_incentive)
    );
    const adjustments = roundMoney(num(line.manual_adjustments_total));
    const recoveries = roundMoney(num(line.recoveries_total) + num(line.penalties_total));
    return {
      lineId: line.id,
      runId: line.payroll_run_id,
      periodId: line.period_id,
      periodYm: period?.period_ym || "—",
      agentId: line.agent_id,
      profileUserId: line.profile_user_id,
      agentName: line.employee_name || line.agent_name || line.profile_user_id || line.agent_id || "—",
      employeeName: line.employee_name || line.agent_name || line.profile_user_id || "—",
      planCode: plan?.plan_code || snapshotField(line, "plan_code", "—"),
      planVersion: plan?.version || snapshotField(line, "plan_version", "—"),
      salaryAmount: num(line.salary_amount),
      fuelAllowance: num(line.fuel_allowance),
      mobileAllowance: num(line.mobile_allowance),
      collectedCash: num(snapshotField(line, "collected_cash")),
      commissionAmount: num(line.commission_amount),
      bonuses,
      adjustments,
      recoveries,
      netPreview: num(line.net_payable),
      lifecycleStatus: line.line_status || run?.status || "—",
      ruleVersion: snapshotField(line, "rule_version", line.metadata?.rule_version || "—"),
      calculatedAt: snapshotField(line, "calculated_at", line.updated_at),
      salaryLabel: formatInr(line.salary_amount),
      fuelLabel: formatInr(line.fuel_allowance),
      mobileLabel: formatInr(line.mobile_allowance),
      collectedCashLabel: formatInr(snapshotField(line, "collected_cash")),
      commissionLabel: formatInr(line.commission_amount),
      bonusesLabel: formatInr(bonuses),
      adjustmentsLabel: formatInr(adjustments),
      recoveriesLabel: formatInr(recoveries),
      netPreviewLabel: formatInr(line.net_payable),
      calculatedAtLabel: formatDateTime(snapshotField(line, "calculated_at", line.updated_at)),
      inReportingContext: str(line.payroll_run_id) === str(reportingContext.payrollRunId),
    };
  });

  const contextPreviewTotal = roundMoney(
    contextLines.reduce((sum, line) => sum + num(line.net_payable), 0)
  );

  const agentProfiles = [...previewRows].reduce((map, row) => {
    const key = str(row.profileUserId || row.agentId);
    if (!key || map.has(key)) return map;
    const assignment = assignmentForAgent(assignments, row.agentId);
    const plan = planById(plans, assignment?.plan_id);
    const agentCommissions = commissionEntries.filter((entry) => str(entry.agent_id) === str(row.agentId));
    const agentLines = lines.filter(
      (line) =>
        str(line.profile_user_id) === str(row.profileUserId) ||
        (row.agentId && str(line.agent_id) === str(row.agentId))
    );
    map.set(key, {
      profileUserId: row.profileUserId,
      agentId: row.agentId,
      agentName: row.agentName,
      planCode: plan?.plan_code || row.planCode,
      planVersion: plan?.version || row.planVersion,
      currentSalary: plan?.base_salary ?? row.salaryAmount,
      fuelAllowance: plan?.fuel_allowance ?? row.fuelAllowance,
      mobileAllowance: plan?.mobile_allowance ?? row.mobileAllowance,
      commissionRateBps: plan?.commission_rate_bps ?? 0,
      collectionEfficiency: Math.max(
        ...agentLines.map((line) => num(snapshotField(line, "collection_efficiency_pct"))),
        0
      ),
      promotionEligible: agentLines.some(
        (line) => snapshotField(line, "promotion_eligible", false) === true
      ),
      payrollHistory: agentLines
        .map((line) => {
          const run = runs.find((item) => item.id === line.payroll_run_id);
          const period = periods.find((item) => item.id === line.period_id);
          return {
            periodYm: period?.period_ym || "—",
            runNumber: run?.run_number || "—",
            status: line.line_status || run?.status || "—",
            netPayable: num(line.net_payable),
            netPayableLabel: formatInr(line.net_payable),
            lockedAt: run?.locked_at || null,
          };
        })
        .sort((a, b) => str(b.periodYm).localeCompare(str(a.periodYm))),
      commissionHistory: agentCommissions
        .map((entry) => ({
          periodId: entry.period_id,
          attributableCash: num(entry.attributable_cash_collected),
          commissionAmount: num(entry.commission_amount),
          status: entry.status,
          ruleVersion: entry.rule_version || "—",
          attributableCashLabel: formatInr(entry.attributable_cash_collected),
          commissionLabel: formatInr(entry.commission_amount),
        }))
        .slice(0, 24),
      attributionSummary: agentCommissions.slice(0, 12).map((entry) => ({
        status: entry.eligibility_status,
        blockedReason: entry.blocked_reason || "—",
        cashCollected: num(entry.attributable_cash_collected),
        cashCollectedLabel: formatInr(entry.attributable_cash_collected),
      })),
    });
    return map;
  }, new Map());

  const historyEvents = [
    ...auditEvents.map((event) => ({
      id: event.id,
      kind: "audit",
      category: event.event_type,
      title: `${event.event_type} · ${event.entity_type}`,
      subtitle: event.reason || event.entity_id || "—",
      actorRole: event.actor_role || "—",
      at: event.created_at,
      atLabel: formatDateTime(event.created_at),
    })),
    ...runs.map((run) => {
      const period = periods.find((row) => row.id === run.period_id);
      return {
        id: `run-${run.id}`,
        kind: "payroll_run",
        category: run.status,
        title: `Payroll run v${run.run_number} · ${period?.period_ym || "—"}`,
        subtitle: `Status ${run.status}`,
        actorRole: "system",
        at: run.updated_at || run.created_at,
        atLabel: formatDateTime(run.updated_at || run.created_at),
      };
    }),
    ...commissionEntries.slice(0, 100).map((entry) => ({
      id: `commission-${entry.id}`,
      kind: "commission_entry",
      category: entry.status,
      title: `Commission · ${entry.agent_name || entry.agent_id}`,
      subtitle: formatInr(entry.commission_amount),
      actorRole: "calculation",
      at: entry.created_at,
      atLabel: formatDateTime(entry.created_at),
    })),
    ...assignments.slice(0, 100).map((assignment) => ({
      id: `plan-${assignment.id}`,
      kind: "plan_change",
      category: assignment.assignment_status,
      title: `Plan assignment · ${assignment.agent_name || assignment.agent_id}`,
      subtitle: `Plan ${assignment.plan_id}`,
      actorRole: "hr",
      at: assignment.start_date,
      atLabel: formatDate(assignment.start_date),
    })),
    ...payrollExports.map((entry) => ({
      id: `export-${entry.id}`,
      kind: "export_event",
      category: entry.export_format,
      title: `Export · ${entry.export_format}`,
      subtitle: entry.checksum || entry.storage_path || "metadata only",
      actorRole: "executive",
      at: entry.created_at,
      atLabel: formatDateTime(entry.created_at),
    })),
  ]
    .sort((a, b) => str(b.at).localeCompare(str(a.at)))
    .slice(0, 200);

  const commissionHistoryRows = commissionEntries
    .map((entry) => {
      const period = periods.find((row) => row.id === entry.period_id);
      return {
        id: entry.id,
        periodYm: period?.period_ym || "—",
        agentId: entry.agent_id,
        agentName: entry.agent_name || entry.agent_id,
        attributableCash: num(entry.attributable_cash_collected),
        commissionAmount: num(entry.commission_amount),
        status: entry.status,
        ruleVersion: entry.rule_version || "—",
        eligibilityStatus: entry.eligibility_status,
        atLabel: formatDateTime(entry.created_at),
        attributableCashLabel: formatInr(entry.attributable_cash_collected),
        commissionLabel: formatInr(entry.commission_amount),
      };
    })
    .sort((a, b) => str(b.atLabel).localeCompare(str(a.atLabel)));

  const auditTimeline = historyEvents.filter((event) => event.kind === "audit");
  const exportRows = payrollExports
    .map((entry) => {
      const run = runs.find((row) => row.id === entry.payroll_run_id);
      const period = periods.find((row) => row.id === entry.period_id);
      return {
        id: entry.id,
        periodYm: period?.period_ym || "—",
        runNumber: run?.run_number || "—",
        exportFormat: entry.export_format,
        checksum: entry.checksum || "—",
        storagePath: entry.storage_path || "metadata only",
        atLabel: formatDateTime(entry.created_at),
      };
    })
    .sort((a, b) => str(b.atLabel).localeCompare(str(a.atLabel)));

  const intelligence = buildExecutiveIntelligence({
    context: reportingContext,
    contextLines,
    profiles,
    assignments,
    plans,
    payments: payload.payments || [],
    arRows: payload.arRows || [],
    labs: payload.labs || [],
  });

  const partialModel = {
    reportingContext,
    previewRows,
    intelligence,
    kpis: contextKpis,
  };
  const collectionCompensation = buildCollectionCompensationDashboard(partialModel);
  const executivePerformance = buildExecutivePerformanceModel({ intelligence, model: partialModel });

  return {
    reportingContext,
    contextPreviewTotal,
    contextPreviewTotalLabel: formatInr(contextPreviewTotal),
    kpis: {
      ...contextKpis,
      pendingPayrollPeriods,
      lockedPayrollRuns,
      exportedPayrollRuns,
      paidEvidenceRuns,
    },
    charts: {
      payrollTrend: trendSeries.payrollTrend,
      commissionTrend: trendSeries.commissionTrend,
      collectionTrend: trendSeries.collectionTrend,
      liabilityTrend: trendSeries.liabilityTrend,
      topAgents,
      promotionPipeline: promotionPipelineRows,
    },
    periodRows,
    previewRows,
    agentProfiles: Object.fromEntries(agentProfiles),
    historyEvents,
    commissionHistoryRows,
    auditTimeline,
    exportRows,
    intelligence,
    executivePerformance,
    collectionCompensation,
    compensationPlans: plans,
    readHealth: payload.readHealth || null,
  };
}

export { formatInr, formatDate, formatDateTime };
