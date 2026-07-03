/**
 * Executive Financial Intelligence — read-only data loader.
 * Progressive: ops core first (KPIs), then portfolio / payments / lines / shipments.
 */
import { loadFounderFinancialIntelligenceData } from "@/founder/founderFinancialIntelligenceData.js";
import {
  loadOperationsCommandCenterCore,
  peekOperationsCommandCenterCache,
} from "@/operations/operationsCommandCenterLoader.js";
import { getLogisticsShipmentsRead } from "@/api/logisticsSupabaseApi.js";
import { supabase } from "@/api/supabaseClient.js";
import {
  fetchOrderLinesBoundedRows,
  fetchPaymentsBoundedRows,
} from "@/api/hqBoundedReads.js";
import { mergeReadHealth } from "@/observability/readHealth.js";

function str(v) {
  return String(v ?? "").trim();
}

function emptyExtendedStatus() {
  return {
    billing: { ok: true, error: null },
    commissions: { ok: false, error: null },
    contracts: { ok: false, error: null },
    collections: { ok: true, error: null },
    ops: { ok: true, error: null },
    inventory: { ok: false, error: null, skuCount: 0 },
    payments: { ok: false, error: null, count: 0 },
    shipments: { ok: false, count: 0 },
  };
}

/**
 * Fast path — dashboard, collections, orders list, stock (no line-count fan-out).
 * @param {object|null} currentUser
 * @param {{ force?: boolean }} [options]
 */
export async function loadExecutiveFinancialIntelligenceCore(currentUser, options = {}) {
  const homeTenantId = str(currentUser?.tenantId || currentUser?.tenant_id);
  const force = options.force === true;
  const cachedOps = !force ? peekOperationsCommandCenterCache(currentUser) : null;
  const opsPayload = cachedOps?.dashboard
    ? cachedOps
    : await loadOperationsCommandCenterCore(currentUser, { force });
  const readHealth = mergeReadHealth(opsPayload._dashReadResult);

  return {
    homeTenantId,
    opsPayload: { ...opsPayload, readHealth },
    portfolio: null,
    contracts: [],
    commissionRes: { ok: false, rows: [] },
    distributors: [],
    distributorIds: [],
    payments: [],
    paymentsLoadError: null,
    orderItems: [],
    orderItemsLoadError: null,
    shipments: [],
    loadStatus: emptyExtendedStatus(),
    inventoryEconomics: null,
    inventoryEconomicsBundle: null,
    catalogMirrorSummary: null,
    _dashReadResult: opsPayload._dashReadResult,
    readHealth,
    _coreOnly: true,
  };
}

/**
 * Remaining EFI sources (portfolio, economics, bounded reads, shipments).
 * @param {object|null} currentUser
 * @param {{ force?: boolean, core?: object }} [options]
 */
export async function loadExecutiveFinancialIntelligenceExtended(currentUser, options = {}) {
  const homeTenantId = str(currentUser?.tenantId || currentUser?.tenant_id);
  const boundedScope = homeTenantId ? { tenantId: homeTenantId } : {};
  const core = options.core || null;

  const [fiData, paymentsRes, orderLinesRes] = await Promise.all([
    loadFounderFinancialIntelligenceData(currentUser, {
      force: options.force,
      opsPayload: core?.opsPayload,
      skipOpsLoad: Boolean(core?.opsPayload),
    }),
    supabase
      ? fetchPaymentsBoundedRows(supabase, { daysBack: 366, ...boundedScope })
      : Promise.resolve({ data: [], error: null }),
    supabase
      ? fetchOrderLinesBoundedRows(supabase, boundedScope)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const tenantIds = [homeTenantId, ...(fiData.distributorIds || [])].filter(Boolean);
  const uniqueTenantIds = [...new Set(tenantIds)];

  const shipmentResults = await Promise.all(
    uniqueTenantIds.map((tenantId) =>
      getLogisticsShipmentsRead({ tenantId, limit: 500 }).catch(() => ({
        success: false,
        shipments: [],
      }))
    )
  );

  const shipments = [];
  for (const res of shipmentResults) {
    if (res?.success && Array.isArray(res.shipments)) {
      shipments.push(...res.shipments);
    }
  }

  return {
    ...fiData,
    opsPayload: fiData.opsPayload || core?.opsPayload || null,
    payments: Array.isArray(paymentsRes?.data) ? paymentsRes.data : [],
    paymentsLoadError: paymentsRes?.error?.message || null,
    orderItems: Array.isArray(orderLinesRes?.data) ? orderLinesRes.data : [],
    orderItemsLoadError: orderLinesRes?.error?.message || null,
    shipments,
    loadStatus: {
      ...fiData.loadStatus,
      payments: {
        ok: !paymentsRes?.error,
        error: paymentsRes?.error?.message || null,
        count: Array.isArray(paymentsRes?.data) ? paymentsRes.data.length : 0,
      },
      shipments: {
        ok: shipments.length > 0 || shipmentResults.some((r) => r?.success),
        count: shipments.length,
      },
    },
    readHealth: mergeReadHealth(
      fiData.opsPayload?._dashReadResult || core?._dashReadResult
    ),
    _coreOnly: false,
  };
}

/**
 * @param {object|null} currentUser
 * @param {{ force?: boolean, progressive?: boolean, onCoreReady?: (data: object) => void }} [options]
 */
export async function loadExecutiveFinancialIntelligenceData(currentUser, options = {}) {
  const { progressive = false, onCoreReady, force = false } = options;

  if (progressive && typeof onCoreReady === "function") {
    const core = await loadExecutiveFinancialIntelligenceCore(currentUser, { force });
    onCoreReady(core);
    const extended = await loadExecutiveFinancialIntelligenceExtended(currentUser, {
      force,
      core,
    });
    return extended;
  }

  const homeTenantId = str(currentUser?.tenantId || currentUser?.tenant_id);
  const boundedScope = homeTenantId ? { tenantId: homeTenantId } : {};

  const [fiData, paymentsRes, orderLinesRes] = await Promise.all([
    loadFounderFinancialIntelligenceData(currentUser, options),
    supabase
      ? fetchPaymentsBoundedRows(supabase, { daysBack: 366, ...boundedScope })
      : Promise.resolve({ data: [], error: null }),
    supabase
      ? fetchOrderLinesBoundedRows(supabase, boundedScope)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const tenantIds = [homeTenantId, ...(fiData.distributorIds || [])].filter(Boolean);
  const uniqueTenantIds = [...new Set(tenantIds)];

  const shipmentResults = await Promise.all(
    uniqueTenantIds.map((tenantId) =>
      getLogisticsShipmentsRead({ tenantId, limit: 500 }).catch(() => ({
        success: false,
        shipments: [],
      }))
    )
  );

  const shipments = [];
  for (const res of shipmentResults) {
    if (res?.success && Array.isArray(res.shipments)) {
      shipments.push(...res.shipments);
    }
  }

  return {
    ...fiData,
    payments: Array.isArray(paymentsRes?.data) ? paymentsRes.data : [],
    paymentsLoadError: paymentsRes?.error?.message || null,
    orderItems: Array.isArray(orderLinesRes?.data) ? orderLinesRes.data : [],
    orderItemsLoadError: orderLinesRes?.error?.message || null,
    shipments,
    loadStatus: {
      ...fiData.loadStatus,
      payments: {
        ok: !paymentsRes?.error,
        error: paymentsRes?.error?.message || null,
        count: Array.isArray(paymentsRes?.data) ? paymentsRes.data.length : 0,
      },
      shipments: {
        ok: shipments.length > 0 || shipmentResults.some((r) => r?.success),
        count: shipments.length,
      },
    },
    readHealth: mergeReadHealth(fiData.opsPayload?._dashReadResult),
    _coreOnly: false,
  };
}
