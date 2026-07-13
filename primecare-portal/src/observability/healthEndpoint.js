/**
 * Client health endpoint — consumed by verify-observability.mjs and ops probes.
 */
import { buildHealthSnapshot, getCorrelationId, getMonitoringConfig } from "./monitoring.js";

/** @returns {object} */
export function getHealthEndpointPayload() {
  return buildHealthSnapshot();
}

export { getCorrelationId, getMonitoringConfig, buildHealthSnapshot };
