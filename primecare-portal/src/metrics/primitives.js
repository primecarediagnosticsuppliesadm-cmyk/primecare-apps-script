/**
 * Shared numeric/string coercion for business metrics (single source of truth).
 * Keeps metric engines free of API-layer imports.
 */
export function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function str(v) {
  return String(v ?? "").trim();
}
