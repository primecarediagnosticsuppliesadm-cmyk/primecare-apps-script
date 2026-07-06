import { buildCompensationIntelligence } from "./compensationIntelligenceEngine.js";

const PENDING_PERIOD_STATUSES = new Set(["draft", "previewed", "submitted"]);
const LIABILITY_RUN_STATUSES = new Set(["draft", "previewed", "submitted", "approved"]);

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

function formatInr(value) {
  return `₹${roundMoney(value).toLocaleString("en-IN")}`;
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

function snapshotField(line, key, fallback = 0) {
  return line?.calculation_snapshot?.[key] ?? fallback;
}

function latestRunForPeriod(runs, periodId) {
  return (runs || [])
    .filter((run) => run.period_id === periodId)
    .sort((a, b) => num(b.run_number) - num(a.run_number))[0];
}

function linesForRun(lines, runId) {
  return (lines || []).filter((line) => line.payroll_run_id === runId);
}

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

export function buildExecutiveCompensationModel(payload = {}) {
  const periods = payload.payrollPeriods || [];
  const runs = payload.payrollRuns || [];
  const lines = payload.payrollRunLines || [];
  const commissionEntries = payload.commissionEntries || [];
  const plans = payload.compensationPlans || [];
  const assignments = payload.planAssignments || [];
  const auditEvents = payload.auditEvents || [];
  const payrollExports = payload.payrollExports || [];

  const latestRunsByPeriod = new Map(
    periods.map((period) => [period.id, latestRunForPeriod(runs, period.id)])
  );

  const liabilityLines = lines.filter((line) => {
    const run = runs.find((row) => row.id === line.payroll_run_id);
    return run && LIABILITY_RUN_STATUSES.has(str(run.status));
  });

  const currentPayrollLiability = roundMoney(
    liabilityLines.reduce((sum, line) => sum + num(line.net_payable), 0)
  );
  const commissionPayable = roundMoney(
    liabilityLines.reduce((sum, line) => sum + num(line.commission_amount), 0)
  );
  const pendingPayrollPeriods = periods.filter((period) =>
    PENDING_PERIOD_STATUSES.has(str(period.status))
  ).length;
  const lockedPayrollRuns = runs.filter((run) => str(run.status) === "locked").length;
  const exportedPayrollRuns = runs.filter((run) => str(run.status) === "exported").length;
  const paidEvidenceRuns = runs.filter((run) => str(run.status) === "paid").length;

  const efficiencyValues = lines
    .map((line) => num(snapshotField(line, "collection_efficiency_pct")))
    .filter((value) => value > 0);
  const collectionEfficiency =
    efficiencyValues.length > 0
      ? roundMoney(
          efficiencyValues.reduce((sum, value) => sum + value, 0) / efficiencyValues.length
        )
      : 0;

  const promotionEligibleAgents = new Set(
    lines.filter((line) => snapshotField(line, "promotion_eligible", false) === true).map(
      (line) => str(line.agent_id)
    )
  ).size;

  const averageCommission =
    lines.length > 0
      ? roundMoney(lines.reduce((sum, line) => sum + num(line.commission_amount), 0) / lines.length)
      : 0;
  const averagePayroll =
    lines.length > 0
      ? roundMoney(lines.reduce((sum, line) => sum + num(line.net_payable), 0) / lines.length)
      : 0;

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

  const topPerformers = [...lines]
    .reduce((map, line) => {
      const key = str(line.agent_id);
      if (!key) return map;
      const existing = map.get(key) || {
        agentId: key,
        agentName: line.agent_name || key,
        netPayable: 0,
        commissionAmount: 0,
      };
      existing.netPayable = roundMoney(existing.netPayable + num(line.net_payable));
      existing.commissionAmount = roundMoney(
        existing.commissionAmount + num(line.commission_amount)
      );
      map.set(key, existing);
      return map;
    }, new Map())
    .values();

  const topAgents = [...topPerformers]
    .sort((a, b) => b.netPayable - a.netPayable)
    .slice(0, 8)
    .map((row) => ({
      ...row,
      netPayableLabel: formatInr(row.netPayable),
      commissionLabel: formatInr(row.commissionAmount),
    }));

  const promotionPipeline = [...lines]
    .reduce((map, line) => {
      const key = str(line.agent_id);
      if (!key) return map;
      const eligible = snapshotField(line, "promotion_eligible", false) === true;
      const status = str(snapshotField(line, "promotion_status", "unknown"));
      const existing = map.get(key) || {
        agentId: key,
        agentName: line.agent_name || key,
        eligible,
        status,
        efficiencyPct: num(snapshotField(line, "collection_efficiency_pct")),
      };
      existing.eligible = existing.eligible || eligible;
      existing.status = eligible ? "eligible" : status || existing.status;
      existing.efficiencyPct = Math.max(existing.efficiencyPct, num(snapshotField(line, "collection_efficiency_pct")));
      map.set(key, existing);
      return map;
    }, new Map())
    .values();

  const promotionPipelineRows = [...promotionPipeline]
    .sort((a, b) => Number(b.eligible) - Number(a.eligible))
    .slice(0, 10);

  const periodRows = periods.map((period) => {
    const run = latestRunsByPeriod.get(period.id);
    const runLines = run ? linesForRun(lines, run.id) : [];
    const netPayroll = roundMoney(runLines.reduce((sum, line) => sum + num(line.net_payable), 0));
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
      employeeCount: new Set(runLines.map((line) => str(line.agent_id)).filter(Boolean)).size,
      netPayroll,
      netPayrollLabel: formatInr(netPayroll),
    };
  });

  const previewRows = lines.map((line) => {
    const run = runs.find((row) => row.id === line.payroll_run_id);
    const period = periods.find((row) => row.id === line.period_id);
    const assignment = assignmentForAgent(assignments, line.agent_id);
    const plan = planById(plans, assignment?.plan_id) || planById(plans, snapshotField(line, "plan_id", null));
    const bonuses = roundMoney(
      num(line.quarterly_bonus) + num(line.annual_bonus) + num(line.collection_incentive) +
        num(line.delivery_incentive) + num(line.qualification_incentive) + num(line.attendance_incentive)
    );
    const adjustments = roundMoney(num(line.manual_adjustments_total));
    const recoveries = roundMoney(num(line.recoveries_total) + num(line.penalties_total));
    return {
      lineId: line.id,
      runId: line.payroll_run_id,
      periodId: line.period_id,
      periodYm: period?.period_ym || "—",
      agentId: line.agent_id,
      agentName: line.agent_name || line.agent_id,
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
    };
  });

  const agentProfiles = [...previewRows].reduce((map, row) => {
    const key = str(row.agentId);
    if (!key || map.has(key)) return map;
    const assignment = assignmentForAgent(assignments, key);
    const plan = planById(plans, assignment?.plan_id);
    const agentCommissions = commissionEntries.filter((entry) => str(entry.agent_id) === key);
    const agentLines = lines.filter((line) => str(line.agent_id) === key);
    map.set(key, {
      agentId: key,
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

  const intelligence = buildCompensationIntelligence({
    payrollPeriods: periods,
    payrollRuns: runs,
    payrollRunLines: lines,
    commissionEntries,
    compensationPlans: plans,
    planAssignments: assignments,
    payments: payload.payments || [],
    arRows: payload.arRows || [],
    labs: payload.labs || [],
    currentPayrollLiability,
    commissionPayable,
  });

  return {
    kpis: {
      currentPayrollLiability,
      currentPayrollLiabilityLabel: formatInr(currentPayrollLiability),
      commissionPayable,
      commissionPayableLabel: formatInr(commissionPayable),
      pendingPayrollPeriods,
      lockedPayrollRuns,
      exportedPayrollRuns,
      paidEvidenceRuns,
      collectionEfficiency,
      collectionEfficiencyLabel: `${collectionEfficiency}%`,
      promotionEligibleAgents,
      averageCommission,
      averageCommissionLabel: formatInr(averageCommission),
      averagePayroll,
      averagePayrollLabel: formatInr(averagePayroll),
    },
    charts: {
      payrollTrend,
      commissionTrend,
      collectionTrend,
      liabilityTrend,
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
    compensationPlans: plans,
    readHealth: payload.readHealth || null,
  };
}

export { formatInr, formatDate, formatDateTime };
