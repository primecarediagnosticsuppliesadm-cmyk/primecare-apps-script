/** Local persistence for rebuild runs, cert runs, failure counts. */
import { PROJECTION_OPS_STORAGE_KEY } from "./projectionOpsConstants.js";

const EMPTY = {
  rebuildRuns: [],
  certRuns: [],
  failureCounts: {},
  parityResults: {},
};

function readStore() {
  if (typeof localStorage === "undefined") return { ...EMPTY };
  try {
    const raw = localStorage.getItem(PROJECTION_OPS_STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw);
    return {
      rebuildRuns: Array.isArray(parsed.rebuildRuns) ? parsed.rebuildRuns : [],
      certRuns: Array.isArray(parsed.certRuns) ? parsed.certRuns : [],
      failureCounts:
        parsed.failureCounts && typeof parsed.failureCounts === "object"
          ? parsed.failureCounts
          : {},
      parityResults:
        parsed.parityResults && typeof parsed.parityResults === "object"
          ? parsed.parityResults
          : {},
    };
  } catch {
    return { ...EMPTY };
  }
}

function writeStore(next) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PROJECTION_OPS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
}

export function loadProjectionOpsStore() {
  return readStore();
}

export function recordRebuildRun(entry) {
  const store = readStore();
  store.rebuildRuns.unshift({
    at: new Date().toISOString(),
    ...entry,
  });
  store.rebuildRuns = store.rebuildRuns.slice(0, 100);
  writeStore(store);
  return store;
}

export function recordCertRun(entry) {
  const store = readStore();
  store.certRuns.unshift({
    at: new Date().toISOString(),
    ...entry,
  });
  store.certRuns = store.certRuns.slice(0, 50);
  writeStore(store);
  return store;
}

export function recordParityResult(registryId, status) {
  const store = readStore();
  store.parityResults[registryId] = {
    status,
    at: new Date().toISOString(),
  };
  writeStore(store);
  return store;
}

export function incrementFailureCount(registryId) {
  const store = readStore();
  const prev = Number(store.failureCounts[registryId] || 0);
  store.failureCounts[registryId] = prev + 1;
  writeStore(store);
  return store.failureCounts[registryId];
}

export function getFailureCount(registryId) {
  return Number(readStore().failureCounts[registryId] || 0);
}

export function getLastRebuildDuration(registryId) {
  const hit = readStore().rebuildRuns.find((r) => r.registryId === registryId);
  return hit?.durationMs ?? null;
}

export function getParityResult(registryId) {
  return readStore().parityResults[registryId] || null;
}

export function getLastCertRun() {
  return readStore().certRuns[0] || null;
}

export function getRebuildHistory(limit = 20) {
  return readStore().rebuildRuns.slice(0, limit);
}
