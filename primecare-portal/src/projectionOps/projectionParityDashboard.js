/**
 * (4) Projection Parity Dashboard.
 */
import { PARITY_STATUS } from "./projectionOpsConstants.js";

export function buildParityDashboard(healthRecords = []) {
  const items = (healthRecords || []).map((r) => ({
    registryId: r.registryId,
    table: r.table,
    parityStatus: r.parityStatus,
    parityScript: r.parityScript,
    rowCount: r.rowCount,
    lastError: r.lastError,
  }));

  const pass = items.filter((i) => i.parityStatus === PARITY_STATUS.PASS).length;
  const warn = items.filter((i) => i.parityStatus === PARITY_STATUS.WARN).length;
  const fail = items.filter((i) => i.parityStatus === PARITY_STATUS.FAIL).length;
  const skip = items.filter((i) => i.parityStatus === PARITY_STATUS.SKIP).length;
  const unknown = items.filter((i) => i.parityStatus === PARITY_STATUS.UNKNOWN).length;

  return {
    items,
    summary: {
      pass,
      warn,
      fail,
      skip,
      unknown,
      total: items.length,
      overallStatus:
        fail > 0
          ? PARITY_STATUS.FAIL
          : warn > 0
            ? PARITY_STATUS.WARN
            : unknown > 0
              ? PARITY_STATUS.UNKNOWN
              : PARITY_STATUS.PASS,
    },
    note: "Full parity requires CLI cert scripts. Run Run Certification from ops center stores last probe results.",
  };
}
