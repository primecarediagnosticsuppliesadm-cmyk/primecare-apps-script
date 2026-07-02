/**
 * Read health extraction for HQ surfaces (Sprint 3A REL-03).
 * Preserves existing API contracts — surfaces optional readFailed/degraded/stalenessMs.
 */

function str(v) {
  return String(v ?? "").trim();
}

/**
 * @param {object|null|undefined} result
 * @returns {{
 *   readFailed: boolean,
 *   degraded: boolean,
 *   stale: boolean,
 *   stalenessMs: number|null,
 *   error: string|null,
 *   projection: boolean,
 * }}
 */
export function extractReadHealth(result) {
  if (!result || typeof result !== "object") {
    return {
      readFailed: true,
      degraded: true,
      stale: false,
      stalenessMs: null,
      error: "No read result",
      projection: false,
    };
  }

  const readFailed = result.readFailed === true || result.success === false;
  const degraded =
    result.degraded === true ||
    readFailed ||
    (Array.isArray(result.queryErrors) && result.queryErrors.length > 0);
  const stalenessMs =
    Number.isFinite(Number(result.stalenessMs)) ? Number(result.stalenessMs) : null;
  const stale = Number.isFinite(stalenessMs) && stalenessMs > 60_000;

  return {
    readFailed,
    degraded: degraded || stale,
    stale,
    stalenessMs,
    error: str(result.error) || null,
    projection: result.projection === true,
  };
}

/**
 * @param {ReturnType<typeof extractReadHealth>} health
 */
export function readHealthBannerVariant(health) {
  if (health.readFailed) return "error";
  if (health.degraded || health.stale) return "warning";
  return null;
}

/**
 * @param {ReturnType<typeof extractReadHealth>} health
 */
export function readHealthBannerMessage(health) {
  if (health.readFailed) {
    return health.error
      ? `Dashboard data unavailable: ${health.error}`
      : "Dashboard data unavailable. KPIs may be incomplete — refresh or contact support.";
  }
  if (health.stale && health.stalenessMs != null) {
    const sec = Math.round(health.stalenessMs / 1000);
    return `Projection data is stale (${sec}s old). Metrics may not reflect recent writes.`;
  }
  if (health.degraded) {
    return "Some dashboard sources failed or returned partial data. Verify KPIs before acting.";
  }
  return null;
}

/**
 * Merge multiple read results into a single operator-facing health state.
 * @param {...object|null} results
 */
export function mergeReadHealth(...results) {
  const parts = results.filter(Boolean).map((r) => extractReadHealth(r));
  if (!parts.length) {
    return extractReadHealth(null);
  }
  const readFailed = parts.some((p) => p.readFailed);
  const degraded = parts.some((p) => p.degraded);
  const stale = parts.some((p) => p.stale);
  const stalenessMs = parts.reduce(
    (max, p) => (p.stalenessMs != null ? Math.max(max, p.stalenessMs) : max),
    0
  );
  const error = parts.find((p) => p.error)?.error || null;
  const projection = parts.some((p) => p.projection);
  return {
    readFailed,
    degraded: degraded || stale,
    stale,
    stalenessMs: stalenessMs > 0 ? stalenessMs : null,
    error,
    projection,
  };
}
