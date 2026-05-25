import { isPredatorEnabled } from "@/predator/predatorGuards.js";
import { predatorStore } from "@/predator/predatorStore.js";

/**
 * @param {Object} params
 * @param {string} params.module
 * @param {string} params.apiName
 * @param {number} params.durationMs
 * @param {number} [params.rowsReturned]
 * @param {number} [params.payloadBytes]
 * @param {number} [params.transformMs]
 * @param {number} [params.normalizeMs]
 * @param {Record<string, unknown>} [params.detail]
 */
export function recordPredatorApiExecution({
  module,
  apiName,
  durationMs,
  rowsReturned,
  payloadBytes,
  transformMs,
  normalizeMs,
  detail,
}) {
  if (!isPredatorEnabled()) return;
  predatorStore.recordApiExecution({
    module,
    apiName,
    durationMs,
    rowsReturned: rowsReturned ?? null,
    payloadBytes: payloadBytes ?? null,
    transformMs: transformMs ?? null,
    normalizeMs: normalizeMs ?? null,
    detail: detail ?? null,
    timestamp: new Date().toISOString(),
  });
}

/**
 * @param {unknown} payload
 */
export function estimatePayloadBytes(payload) {
  try {
    return new Blob([JSON.stringify(payload ?? null)]).size;
  } catch {
    return null;
  }
}
