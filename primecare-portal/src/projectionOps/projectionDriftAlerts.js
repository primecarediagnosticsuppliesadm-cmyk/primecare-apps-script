/**
 * (9) Projection Drift Alerts — composite freshness + parity + failure signals.
 */
import { FRESHNESS_STATUS, PARITY_STATUS } from "./projectionOpsConstants.js";

export function buildProjectionDriftAlerts(healthRecords = []) {
  const alerts = [];

  for (const record of healthRecords || []) {
    if (record.freshnessStatus === FRESHNESS_STATUS.FAIL) {
      alerts.push({
        id: `freshness-${record.registryId}`,
        severity: "high",
        registryId: record.registryId,
        type: "staleness",
        message: `${record.registryId} stale ${record.freshnessHuman} (SLA ${Math.round(record.freshnessSlaMs / 1000)}s)`,
      });
    } else if (record.freshnessStatus === FRESHNESS_STATUS.WARN) {
      alerts.push({
        id: `freshness-warn-${record.registryId}`,
        severity: "medium",
        registryId: record.registryId,
        type: "staleness",
        message: `${record.registryId} approaching SLA (${record.freshnessHuman})`,
      });
    }

    if (record.parityStatus === PARITY_STATUS.FAIL) {
      alerts.push({
        id: `parity-${record.registryId}`,
        severity: "high",
        registryId: record.registryId,
        type: "parity",
        message: `${record.registryId} parity FAIL`,
      });
    }

    if (record.lastError) {
      alerts.push({
        id: `error-${record.registryId}`,
        severity: "critical",
        registryId: record.registryId,
        type: "failure",
        message: `${record.registryId}: ${record.lastError}`,
      });
    }

    if (record.featureFlagStatus === "ON") {
      alerts.push({
        id: `flag-${record.registryId}`,
        severity: "medium",
        registryId: record.registryId,
        type: "shadow",
        message: `${record.featureFlag} is ON — adapter live for ${record.registryId}`,
      });
    }
  }

  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  alerts.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));

  return {
    alerts,
    summary: {
      total: alerts.length,
      critical: alerts.filter((a) => a.severity === "critical").length,
      high: alerts.filter((a) => a.severity === "high").length,
      medium: alerts.filter((a) => a.severity === "medium").length,
    },
  };
}
