const PERIOD_KEY = "primecare.peopleOps.reportingPeriodId";
const RUN_KEY = "primecare.peopleOps.reportingRunId";

function str(value) {
  return String(value ?? "").trim();
}

export function readReportingSelection() {
  try {
    return {
      periodId: str(sessionStorage.getItem(PERIOD_KEY)),
      runId: str(sessionStorage.getItem(RUN_KEY)),
    };
  } catch {
    return { periodId: "", runId: "" };
  }
}

export function writeReportingSelection({ periodId = "", runId = "" } = {}) {
  try {
    if (periodId) sessionStorage.setItem(PERIOD_KEY, str(periodId));
    else sessionStorage.removeItem(PERIOD_KEY);
    if (runId) sessionStorage.setItem(RUN_KEY, str(runId));
    else sessionStorage.removeItem(RUN_KEY);
  } catch {
    // ignore quota errors
  }
}
