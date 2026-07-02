/**
 * (8) Projection Certification Report — aggregate ops + stored cert runs.
 */
import { FRESHNESS_STATUS, PARITY_STATUS } from "./projectionOpsConstants.js";
import { getLastCertRun } from "./projectionOpsStorage.js";

export function buildProjectionCertificationReport({
  healthRecords = [],
  freshnessDashboard = null,
  parityDashboard = null,
  failureDashboard = null,
  shadowMonitoring = null,
  driftAlerts = null,
} = {}) {
  const freshness = freshnessDashboard?.summary?.overallStatus || FRESHNESS_STATUS.UNKNOWN;
  const parity = parityDashboard?.summary?.overallStatus || PARITY_STATUS.UNKNOWN;
  const failures = failureDashboard?.summary?.activeErrors ?? 0;
  const shadowOk = shadowMonitoring?.summary?.shadowMode !== false;
  const driftCount = driftAlerts?.alerts?.length ?? 0;
  const lastCert = getLastCertRun();

  let overall = "GO";
  if (freshness === FRESHNESS_STATUS.FAIL || parity === PARITY_STATUS.FAIL || failures > 0) {
    overall = "NO-GO";
  } else if (
    freshness === FRESHNESS_STATUS.WARN ||
    parity === PARITY_STATUS.WARN ||
    !shadowOk ||
    driftCount > 0
  ) {
    overall = "WARN";
  }

  return {
    generatedAt: new Date().toISOString(),
    overall,
    gates: {
      freshness: { status: freshness, label: "Freshness SLA" },
      parity: { status: parity, label: "Parity probes" },
      failures: {
        status: failures > 0 ? "FAIL" : "PASS",
        label: "Active projection errors",
        count: failures,
      },
      shadow: {
        status: shadowOk ? "PASS" : "WARN",
        label: "Shadow mode (flags OFF)",
      },
      drift: {
        status: driftCount > 0 ? "WARN" : "PASS",
        label: "Drift alerts",
        count: driftCount,
      },
    },
    projectionCount: healthRecords.length,
    lastCertRun: lastCert,
    cliScripts: [
      "verify-projection-parity.mjs",
      "verify-projection-staleness.mjs",
      "verify-dashboard-projection-parity.mjs",
      "verify-executive-projection-parity.mjs",
      "verify-projection-ops-center.mjs",
      "run-projection-ops-certification.mjs",
    ],
  };
}
