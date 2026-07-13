/**
 * In-memory QA diagnostics — API/RPC/render timings and web vitals (QA/dev only).
 */
import { getAppBuildStamp } from "@/utils/buildStamp.js";

const MAX_ENTRIES = 80;

const state = {
  apiTimings: [],
  rpcTimings: [],
  renderTimings: [],
  webVitals: {},
  listeners: new Set(),
};

function trim(list) {
  while (list.length > MAX_ENTRIES) list.shift();
}

function emit() {
  for (const fn of state.listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

function record(list, entry) {
  list.push({ ...entry, at: Date.now() });
  trim(list);
  emit();
}

export const qaDiagnosticsStore = {
  recordApi(label, ms, meta = {}) {
    record(state.apiTimings, { label, ms: Math.round(ms), ...meta });
  },
  recordRpc(label, ms, meta = {}) {
    record(state.rpcTimings, { label, ms: Math.round(ms), ...meta });
  },
  recordRender(label, ms, meta = {}) {
    record(state.renderTimings, { label, ms: Math.round(ms), ...meta });
  },
  recordWebVital(name, value, meta = {}) {
    state.webVitals[name] = { value: Math.round(value), ...meta, at: Date.now() };
    emit();
  },
  getSnapshot(context = {}) {
    const build = getAppBuildStamp();
    const slowest = [...state.apiTimings, ...state.rpcTimings, ...state.renderTimings]
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 10);
    return {
      build,
      environment: build.env,
      branch: build.branch,
      commit: build.commit,
      stamp: build.stamp,
      ...context,
      webVitals: { ...state.webVitals },
      apiTimings: [...state.apiTimings].slice(-20).reverse(),
      rpcTimings: [...state.rpcTimings].slice(-20).reverse(),
      renderTimings: [...state.renderTimings].slice(-20).reverse(),
      slowestOperations: slowest,
    };
  },
  subscribe(fn) {
    state.listeners.add(fn);
    return () => state.listeners.delete(fn);
  },
  clear() {
    state.apiTimings.length = 0;
    state.rpcTimings.length = 0;
    state.renderTimings.length = 0;
    state.webVitals = {};
    emit();
  },
};
