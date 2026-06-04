const REGISTRY_KEY = "primecare_tenant_registry_v1";
const VIEW_KEY = "primecare_tenant_view_v1";

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function readTenantRegistry() {
  if (typeof window === "undefined") return [];
  return safeParse(window.localStorage.getItem(REGISTRY_KEY), []);
}

export function writeTenantRegistry(rows) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REGISTRY_KEY, JSON.stringify(rows.slice(0, 50)));
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
