/**
 * Canonical operating tenant for Master Catalog, procurement, inventory, and ledger.
 * All reads/writes for a signed-in operator must resolve through these helpers.
 */

export function str(v) {
  return String(v ?? "").trim();
}

/**
 * @param {object|null|undefined} currentUser
 * @param {{ homeTenantId?: string, viewTenantId?: string }} [tenantView]
 * @returns {string|null}
 */
export function resolveOperatingTenantId(currentUser, tenantView = {}) {
  const fromProfile = str(currentUser?.tenantId ?? currentUser?.tenant_id);
  const homeTenantId = str(tenantView?.homeTenantId ?? fromProfile);
  const viewTenantId = str(tenantView?.viewTenantId ?? homeTenantId);
  const role = str(currentUser?.role).toLowerCase();

  // Admin, lab, and agent always operate on their profile home tenant.
  if (role !== "executive") {
    return homeTenantId || fromProfile || null;
  }

  // Executive may switch distributor view; otherwise home tenant.
  return viewTenantId || homeTenantId || fromProfile || null;
}

/**
 * Payload tenant wins for writes; an existing row tenant must match when both are present.
 * @returns {{ tenantId: string|null, error: string|null }}
 */
export function coalesceOperatingTenantId(payload = {}, recordTenantId = null, context = "operation") {
  const operating = str(payload?.tenantId ?? payload?.tenant_id);
  const record = str(recordTenantId);

  if (!operating) {
    if (record) return { tenantId: record, error: null };
    return { tenantId: null, error: `tenant_id is required for ${context}` };
  }

  if (record && record !== operating) {
    return {
      tenantId: null,
      error: `Tenant mismatch for ${context}: operating tenant ${operating} does not match record tenant ${record}.`,
    };
  }

  return { tenantId: operating, error: null };
}

/**
 * Ensure every ledger row uses the same tenant_id.
 * @returns {string|null} error message
 */
export function validateInventoryLedgerTenantScope(ledgerRows, expectedTenantId) {
  const expected = str(expectedTenantId);
  if (!expected) return "tenant_id is required for inventory ledger write";

  for (const row of ledgerRows || []) {
    const rowTenant = str(row?.tenant_id ?? row?.tenantId);
    if (!rowTenant) return "inventory_ledger row missing tenant_id";
    if (rowTenant !== expected) {
      return `inventory_ledger tenant mismatch: row tenant ${rowTenant} does not match operating tenant ${expected}`;
    }
  }

  return null;
}
