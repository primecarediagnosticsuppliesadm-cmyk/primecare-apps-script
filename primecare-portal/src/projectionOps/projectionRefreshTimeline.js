/**
 * (2) Projection Refresh Timeline — meta events + rebuild history.
 */
import { getRebuildHistory } from "./projectionOpsStorage.js";

export function buildProjectionRefreshTimeline(healthRecords = [], rebuildHistory = null) {
  const events = [];

  for (const record of healthRecords || []) {
    if (record.lastRebuild) {
      events.push({
        at: record.lastRebuild,
        registryId: record.registryId,
        type: "meta_refresh",
        rowCount: record.rowCount,
        durationMs: record.refreshDurationMs,
        source: "hq_projection_meta_v1",
      });
    }
    if (record.lastUpdated && record.lastUpdated !== record.lastRebuild) {
      events.push({
        at: record.lastUpdated,
        registryId: record.registryId,
        type: "meta_updated",
        rowCount: record.rowCount,
        source: "hq_projection_meta_v1",
      });
    }
  }

  for (const run of rebuildHistory || getRebuildHistory(50)) {
    events.push({
      at: run.at,
      registryId: run.registryId,
      type: "rebuild_console",
      rowCount: run.rowCount,
      durationMs: run.durationMs,
      success: run.success !== false,
      error: run.error || null,
      source: "rebuild_projection_v1",
    });
  }

  return events
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 50);
}
