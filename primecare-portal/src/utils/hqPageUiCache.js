/**
 * Short-lived page UI snapshots for instant revisit hydration (processed view state).
 * Complements module-level API read caches in primecareSupabaseApi.js.
 */
const UI_CACHE_TTL_MS = 5 * 60 * 1000;

/** @type {Map<string, { at: number, data: unknown }>} */
const pageUiCache = new Map();

export function readPageUiCache(key) {
  const entry = pageUiCache.get(String(key || ""));
  if (!entry) return null;
  if (Date.now() - entry.at > UI_CACHE_TTL_MS) {
    pageUiCache.delete(String(key || ""));
    return null;
  }
  return entry.data;
}

export function writePageUiCache(key, data) {
  if (!key) return;
  pageUiCache.set(String(key), { at: Date.now(), data });
}

export function hasPageUiCache(key) {
  return readPageUiCache(key) != null;
}
