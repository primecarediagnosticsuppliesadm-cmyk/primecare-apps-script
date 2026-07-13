/**
 * Production observability abstraction (Sprint 3A WS4).
 * Vendor-neutral placeholders — wire external APM via env when ready.
 */

function str(v) {
  return String(v ?? "").trim();
}

let sessionCorrelationId = null;

/**
 * Stable correlation ID per browser session for log correlation.
 */
export function getCorrelationId() {
  if (sessionCorrelationId) return sessionCorrelationId;
  sessionCorrelationId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `pc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  return sessionCorrelationId;
}

/**
 * @returns {{ sentryDsn: string|null, logLevel: string, healthProbeEnabled: boolean }}
 */
export function getMonitoringConfig() {
  return {
    sentryDsn: str(import.meta.env.VITE_SENTRY_DSN) || null,
    logLevel: str(import.meta.env.VITE_MONITORING_LOG_LEVEL) || "info",
    healthProbeEnabled: str(import.meta.env.VITE_HEALTH_PROBE_ENABLED).toLowerCase() !== "false",
    uptimeProbeUrl: str(import.meta.env.VITE_UPTIME_PROBE_URL) || null,
    alertWebhookUrl: str(import.meta.env.VITE_ALERT_WEBHOOK_URL) || null,
  };
}

/**
 * Structured log envelope for client-side observability.
 * @param {string} level
 * @param {string} event
 * @param {Record<string, unknown>} [context]
 */
export function logStructured(level, event, context = {}) {
  const envelope = {
    ts: new Date().toISOString(),
    level,
    event,
    correlationId: getCorrelationId(),
    env: str(import.meta.env.VITE_APP_ENV) || (import.meta.env.PROD ? "prod" : "dev"),
    ...context,
  };

  const cfg = getMonitoringConfig();
  if (cfg.logLevel === "silent") return envelope;

  const line = `[PrimeCare:${level}] ${event}`;
  if (level === "error") console.error(line, envelope);
  else if (level === "warn") console.warn(line, envelope);
  else if (cfg.logLevel === "debug") console.debug(line, envelope);
  else console.info(line, envelope);

  return envelope;
}

/**
 * In-app health snapshot for monitoring probes and Projection Ops wiring.
 * @param {object} [projectionOps]
 */
export function buildHealthSnapshot(projectionOps = null) {
  const cfg = getMonitoringConfig();
  return {
    ok: true,
    correlationId: getCorrelationId(),
    timestamp: new Date().toISOString(),
    build: {
      env: str(import.meta.env.VITE_APP_ENV) || null,
      stamp: str(import.meta.env.VITE_APP_BUILD_STAMP) || null,
      commit: str(import.meta.env.VITE_APP_COMMIT_HASH) || null,
    },
    monitoring: {
      sentryConfigured: Boolean(cfg.sentryDsn),
      healthProbeEnabled: cfg.healthProbeEnabled,
      uptimeProbeConfigured: Boolean(cfg.uptimeProbeUrl),
      alertWebhookConfigured: Boolean(cfg.alertWebhookUrl),
    },
    projectionOps: projectionOps || null,
  };
}

/**
 * @returns {Promise<object>}
 */
export async function probeClientHealth(projectionOpsLoader) {
  let projectionOps = null;
  if (typeof projectionOpsLoader === "function") {
    try {
      projectionOps = await projectionOpsLoader();
    } catch (err) {
      projectionOps = { ok: false, error: err?.message || String(err) };
    }
  }
  return buildHealthSnapshot(projectionOps);
}
