/** Distributor / tenant registry (all tenants, including HQ). */
export const TENANT_REGISTRY_STORAGE_KEY = "primecare_tenant_registry_v1";
/** Executive read-only view context (no impersonation). */
export const TENANT_VIEW_STORAGE_KEY = "primecare_tenant_view_v1";
/** Distributor-scoped Add Lab flow (Launch / Management / Workspace). */
export const DISTRIBUTOR_LAB_CONTEXT_KEY = "primecare_distributor_lab_context_v1";
/** Distributor OS shell — selected distributor tenant for all OS tabs. */
export const DISTRIBUTOR_OS_CONTEXT_KEY = "primecare_distributor_os_context_v1";
/** Pending OS tab when navigating from HQ before a distributor is selected. */
export const DISTRIBUTOR_OS_TAB_PRESET_KEY = "primecare_distributor_os_tab_preset_v1";

const REGISTRY_KEY = TENANT_REGISTRY_STORAGE_KEY;
const VIEW_KEY = TENANT_VIEW_STORAGE_KEY;
const LAB_CONTEXT_KEY = DISTRIBUTOR_LAB_CONTEXT_KEY;
const OS_CONTEXT_KEY = DISTRIBUTOR_OS_CONTEXT_KEY;
const OS_TAB_PRESET_KEY = DISTRIBUTOR_OS_TAB_PRESET_KEY;
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

/**
 * @typedef {Object} DistributorLabContext
 * @property {string} tenantId - Selected distributor tenant (not HQ).
 * @property {string} [tenantName]
 * @property {string} [homeTenantId]
 * @property {boolean} [locked]
 * @property {boolean} [openAddLab]
 * @property {string} [source]
 */

/**
 * @returns {DistributorLabContext|null}
 */
export function readDistributorLabContext() {
  if (typeof window === "undefined") return null;
  const raw = safeParse(window.localStorage.getItem(LAB_CONTEXT_KEY), null);
  if (!raw?.tenantId) return null;
  return raw;
}

/** @param {DistributorLabContext} ctx */
export function setDistributorLabContext(ctx) {
  if (typeof window === "undefined" || !ctx?.tenantId) return;
  const existing = readDistributorLabContext();
  window.localStorage.setItem(
    LAB_CONTEXT_KEY,
    JSON.stringify({
      tenantId: ctx.tenantId,
      tenantName: ctx.tenantName || existing?.tenantName || "",
      homeTenantId: ctx.homeTenantId || existing?.homeTenantId || "",
      locked: ctx.locked !== false,
      openAddLab: Boolean(ctx.openAddLab),
      source: ctx.source || existing?.source || "distributor",
      updatedAt: new Date().toISOString(),
    })
  );
}

export function clearDistributorLabContext() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LAB_CONTEXT_KEY);
}

/**
 * Open Distributor OS for a distributor tenant (does not switch global HQ header/view).
 * @returns {{ tenantId: string, tab: string, openAddLab: boolean }|null}
 */
export function openDistributorOsTab({
  tenantId,
  tenantName = "",
  homeTenantId = "",
  tab = "labs",
  openAddLab = false,
}) {
  const id = String(tenantId || "").trim();
  const home = String(homeTenantId || "").trim();
  if (!id || !home || id === home) return null;
  enterDistributorOs({ tenantId: id, tenantName, homeTenantId: home, tab });
  if (openAddLab) {
    setDistributorLabContext({
      tenantId: id,
      tenantName,
      homeTenantId: home,
      locked: true,
      openAddLab: true,
      source: "distributor_os",
    });
  }
  return { tenantId: id, tab, openAddLab };
}

/** @deprecated Use openDistributorOsTab + navigate to distributorOs */
export function openLabsForDistributor({
  tenantId,
  tenantName = "",
  homeTenantId = "",
  openAddLab = false,
  tab = "labs",
}) {
  return openDistributorOsTab({
    tenantId,
    tenantName,
    homeTenantId,
    tab,
    openAddLab,
  });
}

/** Clear Distributor OS context when leaving the module. */
export function leaveDistributorOs() {
  clearDistributorOsContext();
  const labCtx = readDistributorLabContext();
  if (labCtx?.source === "distributor_os") {
    clearDistributorLabContext();
  }
}

/**
 * @typedef {Object} DistributorOsContext
 * @property {string} tenantId
 * @property {string} [tenantName]
 * @property {string} [homeTenantId]
 * @property {string} [tab]
 */

/** @returns {DistributorOsContext|null} */
export function readDistributorOsContext() {
  if (typeof window === "undefined") return null;
  const raw = safeParse(window.localStorage.getItem(OS_CONTEXT_KEY), null);
  if (!raw?.tenantId) return null;
  return raw;
}

/** @param {DistributorOsContext} ctx */
export function setDistributorOsContext(ctx) {
  if (typeof window === "undefined" || !ctx?.tenantId) return;
  const existing = readDistributorOsContext();
  window.localStorage.setItem(
    OS_CONTEXT_KEY,
    JSON.stringify({
      tenantId: ctx.tenantId,
      tenantName: ctx.tenantName || existing?.tenantName || "",
      homeTenantId: ctx.homeTenantId || existing?.homeTenantId || "",
      tab: ctx.tab || existing?.tab || "dashboard",
      updatedAt: new Date().toISOString(),
    })
  );
}

export function clearDistributorOsContext() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(OS_CONTEXT_KEY);
}

/** Remember a Distributor OS tab for the next navigation (no tenant required). */
export function presetDistributorOsTab(tab = "dashboard") {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(OS_TAB_PRESET_KEY, String(tab || "dashboard"));
}

/** @returns {string|null} */
export function consumeDistributorOsTabPreset() {
  if (typeof window === "undefined") return null;
  const tab = window.sessionStorage.getItem(OS_TAB_PRESET_KEY);
  window.sessionStorage.removeItem(OS_TAB_PRESET_KEY);
  return tab || null;
}

/**
 * Enter Distributor OS for a distributor tenant (never HQ).
 */
export function enterDistributorOs({
  tenantId,
  tenantName = "",
  homeTenantId = "",
  tab = "dashboard",
}) {
  const id = String(tenantId || "").trim();
  const home = String(homeTenantId || "").trim();
  if (!id || !home || id === home) return false;
  setDistributorOsContext({ tenantId: id, tenantName, homeTenantId: home, tab });
  setDistributorLabContext({
    tenantId: id,
    tenantName,
    homeTenantId: home,
    locked: true,
    openAddLab: false,
    source: "distributor_os",
  });
  return true;
}
