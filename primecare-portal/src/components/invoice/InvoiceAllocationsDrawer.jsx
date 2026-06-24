import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/ux";
import { getInvoiceAllocationsRead } from "@/api/invoiceSupabaseApi.js";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

function formatMoney(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatWhen(iso) {
  if (!iso) return "—";
  return String(iso).slice(0, 16).replace("T", " ");
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} [props.invoiceId]
 * @param {string} [props.invoiceNumber]
 * @param {number} [props.totalAmount]
 * @param {number} [props.allocatedAmount]
 * @param {number} [props.openBalance]
 */
export default function InvoiceAllocationsDrawer({
  open,
  onClose,
  invoiceId,
  invoiceNumber,
  totalAmount = 0,
  allocatedAmount = 0,
  openBalance = 0,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);

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
        const res = await getInvoiceAllocationsRead(invoiceId, { limit: 50 });
        if (cancelled) return;
        if (!res.success) {
          setError(res.error || "Unable to load allocations");
          setRows([]);
          return;
        }
        setRows(res.rows || []);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Unable to load allocations");
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, invoiceId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Invoice allocations">
      <button type="button" className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div
        className={cn(
          "absolute bottom-0 right-0 flex h-[min(80vh,560px)] w-full max-w-[min(100vw,480px)] flex-col",
          "rounded-t-xl border border-border bg-white shadow-2xl md:top-0 md:h-full md:rounded-none md:rounded-l-xl"
        )}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Payment Allocations</h2>
            <p className="text-xs text-slate-500">{invoiceNumber || invoiceId}</p>
          </div>
          <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2 border-b px-4 py-3 text-xs">
          <div>
            <div className="text-slate-500">Invoice Total</div>
            <div className="font-semibold tabular-nums text-slate-900">{formatMoney(totalAmount)}</div>
          </div>
          <div>
            <div className="text-slate-500">Allocated</div>
            <div className="font-semibold tabular-nums text-emerald-700">{formatMoney(allocatedAmount)}</div>
          </div>
          <div>
            <div className="text-slate-500">Open Balance</div>
            <div className="font-semibold tabular-nums text-amber-700">{formatMoney(openBalance)}</div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <ListSkeleton rows={4} />
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-4 text-sm text-red-700">
              {error}
            </div>
          ) : rows.length ? (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[360px] text-xs">
                <thead>
                  <tr className="border-b bg-slate-50 text-left text-slate-500">
                    <th className="px-2 py-1.5">Payment</th>
                    <th className="px-2 py-1.5 text-right">Amount</th>
                    <th className="px-2 py-1.5">When</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="px-2 py-1.5 font-mono text-[10px]">{row.paymentId}</td>
                      <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                        {formatMoney(row.allocatedAmount)}
                      </td>
                      <td className="px-2 py-1.5 text-slate-600">{formatWhen(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
              No payment allocations on this invoice yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
