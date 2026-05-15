/**
 * Canonical lab identifier for Supabase joins and writes.
 * Matches SQL: upper(btrim(lab_id)) — see supabase/sql/lab_id_normalization_migration.sql
 */
export function normalizeLabIdKey(labId) {
  const s = String(labId ?? "").trim();
  return s ? s.toUpperCase() : "";
}

/** Alias used in mappers and UI (same as normalizeLabIdKey). */
export function labIdKey(labId) {
  return normalizeLabIdKey(labId);
}
