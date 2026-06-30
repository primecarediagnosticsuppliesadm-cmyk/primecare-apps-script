/**
 * Executive Financial Intelligence — read-only data loader.
 * Reuses Founder FI portfolio bundle; adds bounded payments, order lines, shipments.
 */
import { loadFounderFinancialIntelligenceData } from "@/founder/founderFinancialIntelligenceData.js";
import { getLogisticsShipmentsRead } from "@/api/logisticsSupabaseApi.js";
import { supabase } from "@/api/supabaseClient.js";
import {
  fetchOrderLinesBoundedRows,
  fetchPaymentsBoundedRows,
} from "@/api/hqBoundedReads.js";

function str(v) {
  return String(v ?? "").trim();
}

/**
 * @param {object|null} currentUser
 * @param {{ force?: boolean }} [options]
 */
export async function loadExecutiveFinancialIntelligenceData(currentUser, options = {}) {
  const fiData = await loadFounderFinancialIntelligenceData(currentUser, options);
  const homeTenantId = str(fiData.homeTenantId);
  const tenantIds = [homeTenantId, ...(fiData.distributorIds || [])].filter(Boolean);
  const uniqueTenantIds = [...new Set(tenantIds)];

  const [paymentsRes, orderLinesRes, ...shipmentResults] = await Promise.all([
    supabase
      ? fetchPaymentsBoundedRows(supabase, { daysBack: 366 })
      : Promise.resolve({ data: [], error: null }),
    supabase
      ? fetchOrderLinesBoundedRows(supabase)
      : Promise.resolve({ data: [], error: null }),
    ...uniqueTenantIds.map((tenantId) =>
      getLogisticsShipmentsRead({ tenantId, limit: 500 }).catch(() => ({
        success: false,
        shipments: [],
      }))
    ),
  ]);

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
  };
}
