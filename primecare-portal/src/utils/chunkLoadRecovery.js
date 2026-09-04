/**
 * One-shot recovery for stale Vite/Vercel hashed chunks after a new deploy.
 * Generic render errors must not trigger reload.
 */

export const CHUNK_RELOAD_GUARD_KEY = "primecare_chunk_reload_guard";

const CHUNK_ERROR_PATTERNS = [
  /ChunkLoadError/i,
  /Loading chunk [\w./:@-]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Unable to preload CSS/i,
];

function errorText(error) {
  if (!error) return "";
  if (typeof error === "string") return error;
  return `${error.name || ""} ${error.message || ""} ${error.stack || ""}`;
}

export function isChunkLoadError(error) {
  const text = errorText(error);
  if (!text.trim()) return false;
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

function defaultStorage() {
  try {
    if (typeof sessionStorage !== "undefined") return sessionStorage;
  } catch {
    /* private mode */
  }
  return null;
}

/**
 * @param {unknown} error
 * @param {{ storage?: Storage | { getItem(k: string): string | null, setItem(k: string, v: string): void }, reload?: () => void }} [hooks]
 * @returns {boolean} true if a reload was triggered
 */
export function recoverFromChunkLoadError(error, hooks = {}) {
  if (!isChunkLoadError(error)) return false;
  const store = hooks.storage ?? defaultStorage();
  const reload =
    hooks.reload ??
    (() => {
      if (typeof window !== "undefined") window.location.reload();
    });
  if (!store || typeof reload !== "function") return false;
  try {
    if (store.getItem(CHUNK_RELOAD_GUARD_KEY) === "1") return false;
    store.setItem(CHUNK_RELOAD_GUARD_KEY, "1");
    reload();
    return true;
  } catch {
    return false;
  }
}

export function clearChunkLoadRecoveryGuard(storage) {
  const store = storage ?? defaultStorage();
  try {
    store?.removeItem?.(CHUNK_RELOAD_GUARD_KEY);
  } catch {
    /* ignore */
  }
}
