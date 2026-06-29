import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/ux";
import { getInvoiceAllocationsRead } from "@/api/invoiceSupabaseApi.js";
import { supabase } from "@/api/supabaseClient.js";
import { loadLabPaymentHistoryForDisplay } from "@/collections/collectionsPaymentHistory.js";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

function formatMoney(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatPaymentDay(value) {
  const raw = String(value || "").trim().slice(0, 10);
  if (!raw) return "—";
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (raw === todayKey) return "Today";
  const d = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function paymentMethodLabel(mode) {
  const m = String(mode || "").trim();
  if (!m) return "—";
  return m.charAt(0).toUpperCase() + m.slice(1);
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} [props.invoiceId]
 * @param {string} [props.invoiceNumber]
 * @param {string} [props.orderId]
 * @param {string} [props.labId]
 * @param {number} [props.totalAmount]
 * @param {number} [props.allocatedAmount]
 * @param {number} [props.openBalance]
 */
export default function InvoicePaymentHistoryModal({
  open,
  onClose,
  invoiceId,
  invoiceNumber,
  orderId,
  labId,
  totalAmount = 0,
  allocatedAmount = 0,
  openBalance = 0,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [paymentRows, setPaymentRows] = useState([]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !invoiceId) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [allocRes, historyRows] = await Promise.all([
          getInvoiceAllocationsRead(invoiceId, { limit: 50 }),
          labId && supabase ? loadLabPaymentHistoryForDisplay(supabase, labId) : Promise.resolve([]),
        ]);
        if (cancelled) return;
        if (!allocRes.success) {
          setError(allocRes.error || "Unable to load payment history");
          setPaymentRows([]);
          return;
        }

        const paymentsById = new Map();
        for (const row of historyRows || []) {
          if (row.paymentId) paymentsById.set(row.paymentId, row);
        }

        const orderKey = String(orderId || "").trim();
        const rows = (allocRes.rows || [])
          .map((alloc) => {
            const payment = paymentsById.get(alloc.paymentId);
            if (orderKey && payment?.orderId && payment.orderId !== orderKey) return null;
            return {
              id: alloc.id,
              date: payment?.paymentDate || payment?.sortAt || alloc.createdAt,
              method: payment?.paymentMode || "—",
              amount: alloc.allocatedAmount,
            };
          })
          .filter(Boolean)
          .sort((a, b) => String(a.date).localeCompare(String(b.date)));

        setPaymentRows(rows);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Unable to load payment history");
          setPaymentRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, invoiceId, labId, orderId]);

  const summary = useMemo(
    () => ({
      total: totalAmount,
      allocated: allocatedAmount,
      outstanding: openBalance,
    }),
    [totalAmount, allocatedAmount, openBalance]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Payment history">
      <button type="button" className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div
        className={cn(
          "absolute left-1/2 top-1/2 w-[min(100vw-2rem,420px)] -translate-x-1/2 -translate-y-1/2",
          "rounded-xl border border-border bg-white shadow-2xl"
        )}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Payment History</h2>
            <p className="text-xs text-slate-500">{invoiceNumber || invoiceId}</p>
          </div>
          <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="border-b px-4 py-3">
          <div className="text-xs text-slate-500">Invoice Total</div>
          <div className="text-lg font-semibold tabular-nums text-slate-900">
            {formatMoney(summary.total)}
          </div>
        </div>

        <div className="max-h-[min(50vh,320px)] overflow-y-auto px-4 py-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Payments
          </div>
          {loading ? (
            <ListSkeleton rows={3} />
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-4 text-sm text-red-700">
              {error}
            </div>
          ) : paymentRows.length ? (
            <ul className="space-y-3">
              {paymentRows.map((row) => (
                <li key={row.id} className="rounded-lg border border-slate-200 px-3 py-2.5">
                  <div className="text-sm font-medium text-slate-900">{formatPaymentDay(row.date)}</div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-600">{paymentMethodLabel(row.method)}</span>
                    <span className="font-semibold tabular-nums text-emerald-700">
                      {formatMoney(row.amount)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
              No payments recorded on this invoice yet.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 border-t px-4 py-3 text-xs">
          <div>
            <div className="text-slate-500">Allocated</div>
            <div className="font-semibold tabular-nums text-emerald-700">
              {formatMoney(summary.allocated)}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Outstanding</div>
            <div className="font-semibold tabular-nums text-amber-700">
              {formatMoney(summary.outstanding)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
