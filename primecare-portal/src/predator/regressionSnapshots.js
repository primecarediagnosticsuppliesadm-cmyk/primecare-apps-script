import { isPredatorEnabled } from "@/predator/predatorGuards.js";

const STORAGE_PREFIX = "primecare_predator_regression_v1";

function storageKey(tenantId, userId, module) {
  return `${STORAGE_PREFIX}::${tenantId || "_"}::${userId || "_"}::${module}`;
}

/**
 * @param {import('@/predator/predatorDiagnosisSchema.js').PredatorTenantContext} ctx
 * @param {string} module
 * @param {Object} snapshot
 */
export function saveRegressionSnapshot(ctx, module, snapshot) {
  if (!isPredatorEnabled() || typeof localStorage === "undefined") return;
  try {
    const payload = {
      savedAt: new Date().toISOString(),
      status: snapshot.status || "PASS",
      metrics: snapshot.metrics || [],
      summary: snapshot.summary || null,
    };
    localStorage.setItem(
      storageKey(ctx?.tenantId, ctx?.userId, module),
      JSON.stringify(payload)
    );
  } catch {
    /* quota — diagnosis only */
  }
}

/**
 * @param {import('@/predator/predatorDiagnosisSchema.js').PredatorTenantContext} ctx
 * @param {string} module
 */
export function loadRegressionSnapshot(ctx, module) {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(ctx?.tenantId, ctx?.userId, module));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * @param {Object} current
 * @param {Object|null} previous
 */
export function compareRegressionSnapshots(current, previous) {
  if (!previous) {
    return {
      hasPrevious: false,
      changes: [],
      message: "No previous successful snapshot — baseline will be stored on PASS",
    };
  }

  const changes = [];
  const prevMetrics = new Map((previous.metrics || []).map((m) => [m.metricId, m]));

  for (const m of current.metrics || []) {
    const prev = prevMetrics.get(m.metricId);
    if (!prev) {
      changes.push({ metricId: m.metricId, type: "new_metric", current: m.status, previous: null });
      continue;
    }
    if (prev.status === "PASS" && m.status !== "PASS") {
      changes.push({
        metricId: m.metricId,
        type: "regression",
        current: m.status,
        previous: prev.status,
        message: `Was PASS, now ${m.status}`,
      });
    }
    if (prev.probableRootCause !== m.probableRootCause && m.status !== "PASS") {
      changes.push({
        metricId: m.metricId,
        type: "root_cause_changed",
        current: m.probableRootCause,
        previous: prev.probableRootCause,
      });
    }
  }

  return {
    hasPrevious: true,
    previousSavedAt: previous.savedAt,
    changes,
    message: changes.length ? `${changes.length} behavior change(s) vs last PASS` : "No regression vs last PASS",
  };
}
