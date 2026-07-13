/**
 * (1) Projection Health Registry — merge catalog + meta into health records.
 */
import {
  FLAG_READERS,
  computeFreshnessStatus,
  formatFreshnessMs,
  getCatalogProjections,
  PARITY_STATUS,
} from "./projectionOpsConstants.js";
import {
  getFailureCount,
  getLastRebuildDuration,
  getParityResult,
} from "./projectionOpsStorage.js";

function str(v) {
  return String(v ?? "").trim();
}

function resolveFeatureFlagStatus(flagName) {
  if (!flagName) return { featureFlag: null, featureFlagStatus: "N/A" };
  const reader = FLAG_READERS[flagName];
  const on = reader ? reader() : false;
  return {
    featureFlag: flagName,
    featureFlagStatus: on ? "ON" : "OFF",
  };
}

function resolveShadowStatus(status, featureFlagStatus) {
  const s = str(status).toLowerCase();
  const flagOff = featureFlagStatus === "OFF" || featureFlagStatus === "N/A";
  if (s === "planned") return "planned";
  if (s === "design") return flagOff ? "design-off" : "design-on";
  if (s === "shadow") return flagOff ? "shadow-off" : "shadow-on";
  if (s === "active") return flagOff ? "active-off" : "active-on";
  return s || "unknown";
}

function resolveParityStatus(registryId, metaRow, catalogEntry) {
  const stored = getParityResult(registryId);
  if (stored?.status) return stored.status;
  if (metaRow?.last_error) return PARITY_STATUS.FAIL;
  if (metaRow?.as_of && Number(metaRow.row_count) > 0) return PARITY_STATUS.UNKNOWN;
  if (catalogEntry?.rebuildable) return PARITY_STATUS.SKIP;
  return PARITY_STATUS.UNKNOWN;
}

/**
 * @param {string} tenantId
 * @param {Array<object>} metaRows
 */
export function buildProjectionHealthRecords(tenantId, metaRows = []) {
  const metaByRegistry = new Map(
    (metaRows || []).map((row) => [str(row.registry_id), row])
  );
  const now = Date.now();

  return getCatalogProjections().map((entry) => {
    const meta = metaByRegistry.get(entry.registryId) || null;
    const asOf = meta?.as_of ? new Date(meta.as_of).getTime() : NaN;
    const freshnessMs = Number.isFinite(asOf) ? Math.max(0, now - asOf) : null;
    const { featureFlag, featureFlagStatus } = resolveFeatureFlagStatus(entry.featureFlag);

    const failureCount =
      getFailureCount(entry.registryId) + (meta?.last_error ? 1 : 0);

    return {
      registryId: entry.registryId,
      table: entry.table,
      class: entry.class,
      status: entry.status,
      tenantId: str(tenantId),
      rowCount: Number(meta?.row_count ?? 0),
      freshnessMs,
      freshnessHuman: freshnessMs == null ? "—" : formatFreshnessMs(freshnessMs),
      freshnessSlaMs: entry.stalenessSlaMs,
      freshnessStatus: computeFreshnessStatus(freshnessMs, entry.stalenessSlaMs),
      lastRebuild: meta?.as_of ?? null,
      lastUpdated: meta?.updated_at ?? null,
      refreshDurationMs: getLastRebuildDuration(entry.registryId),
      parityStatus: resolveParityStatus(entry.registryId, meta, entry),
      parityScript: entry.parityScript,
      failureCount,
      lastError: meta?.last_error ?? null,
      shadowStatus: resolveShadowStatus(entry.status, featureFlagStatus),
      featureFlag,
      featureFlagStatus,
      adapterRpc: entry.adapterRpc,
      rebuildable: entry.rebuildable === true,
    };
  });
}

export function summarizeHealthRegistry(records = []) {
  const list = records || [];
  return {
    total: list.length,
    freshPass: list.filter((r) => r.freshnessStatus === "PASS").length,
    freshFail: list.filter((r) => r.freshnessStatus === "FAIL").length,
    activeFailures: list.filter((r) => r.lastError).length,
    shadowOff: list.filter((r) => String(r.shadowStatus).endsWith("-off")).length,
    flagsOn: list.filter((r) => r.featureFlagStatus === "ON").length,
    totalRows: list.reduce((s, r) => s + Number(r.rowCount || 0), 0),
  };
}
