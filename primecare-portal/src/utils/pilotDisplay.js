/**
 * Pilot-ready display helpers — avoid fake zeros and placeholder dashes when data is absent.
 */

export const PILOT_EMPTY_LABEL = "—";

export function isEmptyCollection(value) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** @param {number|null|undefined} n */
export function hasNumericSignal(n) {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/**
 * KPI value for executive surfaces: show em-dash when no underlying activity.
 */
export function formatPilotKpi(formattedValue, rawValue, hasActivity) {
  if (hasActivity) return formattedValue;
  if (hasNumericSignal(rawValue)) return formattedValue;
  return PILOT_EMPTY_LABEL;
}

export function formatPilotCount(count, hasSource = true) {
  if (!hasSource) return PILOT_EMPTY_LABEL;
  const n = Number(count);
  if (!Number.isFinite(n)) return PILOT_EMPTY_LABEL;
  return String(n);
}

export function pilotField(value, fallback = PILOT_EMPTY_LABEL) {
  const s = String(value ?? "").trim();
  return s || fallback;
}
