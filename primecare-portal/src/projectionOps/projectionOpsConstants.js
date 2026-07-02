/** Projection Operations Center — shared constants. */
import catalog from "./projectionOpsCatalog.json";
import {
  isReadAdapterOrdersV1Enabled,
  isReadAdapterReceivablesV1Enabled,
  isReadAdapterDashboardV1Enabled,
  isReadAdapterExecutiveV1Enabled,
} from "@/config/readProjectionFlags.js";

export const PROJECTION_OPS_STORAGE_KEY = "primecare_projection_ops_v1";

export const FRESHNESS_STATUS = {
  PASS: "PASS",
  WARN: "WARN",
  FAIL: "FAIL",
  UNKNOWN: "UNKNOWN",
};

export const PARITY_STATUS = {
  PASS: "PASS",
  WARN: "WARN",
  FAIL: "FAIL",
  SKIP: "SKIP",
  UNKNOWN: "UNKNOWN",
};

export const OPS_CATALOG = catalog;

export const FLAG_READERS = {
  VITE_READ_ADAPTER_ORDERS_V1: isReadAdapterOrdersV1Enabled,
  VITE_READ_ADAPTER_RECEIVABLES_V1: isReadAdapterReceivablesV1Enabled,
  VITE_READ_ADAPTER_DASHBOARD_V1: isReadAdapterDashboardV1Enabled,
  VITE_READ_ADAPTER_EXECUTIVE_V1: isReadAdapterExecutiveV1Enabled,
};

export function getCatalogProjections() {
  return OPS_CATALOG.projections || [];
}

export function getCatalogProjection(registryId) {
  return getCatalogProjections().find((p) => p.registryId === registryId) || null;
}

export function getRebuildCascade() {
  return OPS_CATALOG.rebuild_cascade || [];
}

export function formatFreshnessMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1000) return `${Math.round(n)}ms`;
  if (n < 60_000) return `${Math.round(n / 1000)}s`;
  if (n < 3_600_000) return `${Math.round(n / 60_000)}m`;
  return `${(n / 3_600_000).toFixed(1)}h`;
}

export function computeFreshnessStatus(freshnessMs, slaMs) {
  const age = Number(freshnessMs);
  const sla = Number(slaMs);
  if (!Number.isFinite(age) || age < 0 || !Number.isFinite(sla) || sla <= 0) {
    return FRESHNESS_STATUS.UNKNOWN;
  }
  if (age <= sla) return FRESHNESS_STATUS.PASS;
  if (age <= sla * 1.25) return FRESHNESS_STATUS.WARN;
  return FRESHNESS_STATUS.FAIL;
}
