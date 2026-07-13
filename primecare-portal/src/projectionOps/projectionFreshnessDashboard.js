/**
 * (3) Projection Freshness Dashboard.
 */
import { FRESHNESS_STATUS } from "./projectionOpsConstants.js";

export function buildFreshnessDashboard(healthRecords = []) {
  const records = healthRecords || [];
  const tiles = records.map((r) => ({
    registryId: r.registryId,
    table: r.table,
    freshnessMs: r.freshnessMs,
    freshnessHuman: r.freshnessHuman,
    freshnessSlaMs: r.freshnessSlaMs,
    freshnessStatus: r.freshnessStatus,
    lastRebuild: r.lastRebuild,
    rowCount: r.rowCount,
  }));

  const pass = tiles.filter((t) => t.freshnessStatus === FRESHNESS_STATUS.PASS).length;
  const warn = tiles.filter((t) => t.freshnessStatus === FRESHNESS_STATUS.WARN).length;
  const fail = tiles.filter((t) => t.freshnessStatus === FRESHNESS_STATUS.FAIL).length;
  const unknown = tiles.filter((t) => t.freshnessStatus === FRESHNESS_STATUS.UNKNOWN).length;

  return {
    tiles,
    summary: {
      pass,
      warn,
      fail,
      unknown,
      total: tiles.length,
      overallStatus:
        fail > 0 ? FRESHNESS_STATUS.FAIL : warn > 0 ? FRESHNESS_STATUS.WARN : FRESHNESS_STATUS.PASS,
    },
  };
}
