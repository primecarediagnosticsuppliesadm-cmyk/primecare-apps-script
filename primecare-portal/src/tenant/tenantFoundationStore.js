/** Distributor / tenant registry (all tenants, including HQ). */
export const TENANT_REGISTRY_STORAGE_KEY = "primecare_tenant_registry_v1";
/** Executive read-only view context (no impersonation). */
export const TENANT_VIEW_STORAGE_KEY = "primecare_tenant_view_v1";

const REGISTRY_KEY = TENANT_REGISTRY_STORAGE_KEY;
const VIEW_KEY = TENANT_VIEW_STORAGE_KEY;
const MAX_REGISTRY_ROWS = 50;

/** Older builds did not use a separate key; kept for one-time migration if added later. */
const LEGACY_REGISTRY_KEYS = [];

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function registrySortKey(row) {
  return String(row?.updatedAt || row?.createdAt || "");
}

function migrateLegacyTenantRegistryIfNeeded() {
  if (typeof window === "undefined") return [];
  const current = safeParse(window.localStorage.getItem(REGISTRY_KEY), []);
  if (Array.isArray(current) && current.length > 0) return current;

  for (const legacyKey of LEGACY_REGISTRY_KEYS) {
    const legacy = safeParse(window.localStorage.getItem(legacyKey), []);
    if (Array.isArray(legacy) && legacy.length > 0) {
      writeTenantRegistry(legacy);
      return readTenantRegistry();
    }
  }
  return Array.isArray(current) ? current : [];
}

export function readTenantRegistry() {
  if (typeof window === "undefined") return [];
  return migrateLegacyTenantRegistryIfNeeded();
}

/**
 * Persist registry; keeps the most recently updated rows when over the cap.
 * @returns {{ truncated: boolean, total: number, kept: number }|undefined}
 */
export function writeTenantRegistry(rows) {
  if (typeof window === "undefined") return;
  const list = Array.isArray(rows) ? rows : [];
  const sorted = [...list].sort((a, b) => registrySortKey(b).localeCompare(registrySortKey(a)));
  const kept = sorted.slice(0, MAX_REGISTRY_ROWS);
  window.localStorage.setItem(REGISTRY_KEY, JSON.stringify(kept));
  return { truncated: list.length > MAX_REGISTRY_ROWS, total: list.length, kept: kept.length };
}

/** Debug snapshot for provisioning / tenant management. */
export function getTenantRegistryStorageDebug() {
  if (typeof window === "undefined") {
    return {
      storageKey: REGISTRY_KEY,
      viewStorageKey: VIEW_KEY,
      rawDistributorCount: 0,
      rawRows: [],
    };
  }
  const raw = migrateLegacyTenantRegistryIfNeeded();
  return {
    storageKey: REGISTRY_KEY,
    viewStorageKey: VIEW_KEY,
    rawDistributorCount: raw.length,
    rawRows: raw.map((r) => ({
      id: r.id,
      name: r.name || r.config?.companyName || r.config?.displayName || "—",
      status: r.status,
      isHome: Boolean(r.isHome),
      updatedAt: r.updatedAt || r.createdAt || null,
    })),
  };
}

export function upsertRegistryTenant(entry) {
  const list = readTenantRegistry();
  const idx = list.findIndex((t) => t.id === entry.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...entry, updatedAt: new Date().toISOString() };
  else list.push({ ...entry, createdAt: entry.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
  writeTenantRegistry(list);
  return entry;
}

export function getRegistryTenant(tenantId) {
  return readTenantRegistry().find((t) => t.id === tenantId) || null;
}

/**
 * Executive read-only view context (no impersonation).
 * @returns {{ viewTenantId: string|null, homeTenantId: string|null, readOnly: boolean }}
 */
export function readTenantViewContext(homeTenantId) {
  if (typeof window === "undefined") {
    return { viewTenantId: homeTenantId || null, homeTenantId: homeTenantId || null, readOnly: false };
  }
  const raw = safeParse(window.localStorage.getItem(VIEW_KEY), {});
  const viewTenantId = raw.viewTenantId || homeTenantId || null;
  const readOnly = Boolean(viewTenantId && homeTenantId && viewTenantId !== homeTenantId);
  return { viewTenantId, homeTenantId: homeTenantId || null, readOnly };
}

export function setTenantViewContext(viewTenantId, homeTenantId) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    VIEW_KEY,
    JSON.stringify({
      viewTenantId: viewTenantId || homeTenantId,
      homeTenantId,
      updatedAt: new Date().toISOString(),
    })
  );
}

export function clearTenantViewToHome(homeTenantId) {
  setTenantViewContext(homeTenantId, homeTenantId);
}
