import { formatDateTime, str, num } from "./analytics/analyticsFormatters.js";

function latestRunForPeriod(runs, periodId) {
  return (runs || [])
    .filter((run) => run.period_id === periodId)
    .sort((a, b) => num(b.run_number) - num(a.run_number))[0];
}

function latestPeriod(periods = []) {
  return [...periods].sort((a, b) => str(a.period_ym).localeCompare(str(b.period_ym))).at(-1) || null;
}

function resolveGeneratedBy(run, profileById = new Map()) {
  const userId = str(run?.generated_by);
  if (!userId) return "—";
  const profile = profileById.get(userId);
  if (!profile) return userId;
  return (
    str(profile.display_name) ||
    str(profile.agent_name) ||
    str(profile.username) ||
    str(profile.email) ||
    userId
  );
}

function formatPeriodLabel(periodYm) {
  const ym = str(periodYm);
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym || "—";
  const [year, month] = ym.split("-").map(Number);
  const d = new Date(year, month - 1, 1);
  return Number.isNaN(d.getTime()) ? ym : d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function formatRunVersionLabel(status, runNumber) {
  const version = runNumber == null ? "—" : `V${runNumber}`;
  const lifecycle = str(status || "draft");
  const label = lifecycle.charAt(0).toUpperCase() + lifecycle.slice(1);
  return `${label} ${version}`;
}

/**
 * Resolve canonical executive reporting context.
 */
export function resolveReportingContext({
  payrollPeriods = [],
  payrollRuns = [],
  periodId = null,
  payrollRunId = null,
  profiles = [],
} = {}) {
  const periods = payrollPeriods || [];
  const runs = payrollRuns || [];
  const profileById = new Map((profiles || []).map((row) => [str(row.user_id), row]));

  let period = null;
  let run = null;
  let source = "latest_default";

  if (periodId && payrollRunId) {
    period = periods.find((row) => row.id === periodId) || null;
    run =
      runs.find((row) => row.id === payrollRunId && (!period || row.period_id === period.id)) || null;
    if (run && !period) {
      period = periods.find((row) => row.id === run.period_id) || null;
    }
    source = "selection";
  } else if (periodId) {
    period = periods.find((row) => row.id === periodId) || null;
    run = period ? latestRunForPeriod(runs, period.id) : null;
    source = "period_default";
  } else {
    period = latestPeriod(periods);
    run = period ? latestRunForPeriod(runs, period.id) : null;
    source = "latest_default";
  }

  const status = str(run?.status || period?.status || "—");
  const runNumber = run?.run_number ?? null;

  return {
    periodId: period?.id || null,
    periodYm: period?.period_ym || "—",
    periodStart: period?.period_start || null,
    periodEnd: period?.period_end || null,
    payrollRunId: run?.id || null,
    runNumber,
    status,
    generatedAt: run?.generated_at || null,
    generatedBy: resolveGeneratedBy(run, profileById),
    source,
    periodLabel: formatPeriodLabel(period?.period_ym),
    runVersionLabel: formatRunVersionLabel(status, runNumber),
    generatedAtLabel: formatDateTime(run?.generated_at),
    statusLabel: status === "—" ? "—" : status.charAt(0).toUpperCase() + status.slice(1),
    period,
    run,
  };
}

export function linesForReportingContext(lines = [], context = {}) {
  const runId = str(context.payrollRunId);
  if (!runId) return [];
  return (lines || []).filter((line) => str(line.payroll_run_id) === runId);
}

export function latestRunByPeriodMap(periods = [], runs = []) {
  return new Map(periods.map((period) => [period.id, latestRunForPeriod(runs, period.id)]));
}

export { latestRunForPeriod, latestPeriod };
