import {
  buildPaymentsByNormalizedLabId,
  mapPaymentHistoryRow,
} from "@/api/primecareSupabaseApi.js";
import { fetchPaymentsForLabBoundedRows } from "@/api/hqBoundedReads.js";
import { normalizeLabIdKey } from "@/utils/labId.js";

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function paymentTimestamp(entry) {
  const raw = str(entry.sortAt ?? entry.paymentDate ?? entry.payment_date ?? entry.created_at ?? "");
  const iso = raw.includes("T") ? raw.slice(0, 19) : `${raw.slice(0, 10)}T12:00:00`;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Map raw `payments` rows for a lab (newest first, includes order reference). */
export function mapLabPaymentHistoryRows(rawPayments, labId) {
  const labKey = normalizeLabIdKey(labId);
  if (!labKey) return [];

  const { byLab } = buildPaymentsByNormalizedLabId(rawPayments);
  const matched = byLab.get(labKey) || [];

  return matched
    .map((raw) => {
      const mapped = mapPaymentHistoryRow(raw);
      return {
        ...mapped,
        orderId: str(raw.order_id ?? raw.orderId ?? raw.Order_ID ?? ""),
        sortAt: str(raw.payment_date ?? raw.paymentDate ?? raw.created_at ?? mapped.paymentDate),
      };
    })
    .filter((row) => num(row.amountCollected) > 0)
    .sort((a, b) => paymentTimestamp(b) - paymentTimestamp(a));
}

/**
 * Load payment history rows for a lab (bounded: lab_id + date window + row limit).
 */
export async function loadLabPaymentHistoryForDisplay(supabase, labId) {
  if (!supabase || !labId) return [];
  const { data, error } = await fetchPaymentsForLabBoundedRows(supabase, labId);
  if (error) {
    console.warn("[loadLabPaymentHistoryForDisplay] payments:", error.message);
    return [];
  }
  return mapLabPaymentHistoryRows(data || [], labId);
}

export function sumPaymentHistoryTotal(history) {
  return (history || []).reduce((sum, row) => sum + num(row.amountCollected), 0);
}

export function paymentHistoryReconciles(history, arTotalPaid, tolerance = 0.01) {
  const activityTotal = sumPaymentHistoryTotal(history);
  const arPaid = num(arTotalPaid);
  if (arPaid <= 0 && activityTotal <= 0) return true;
  return Math.abs(activityTotal - arPaid) <= tolerance;
}
