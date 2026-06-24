import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/ux";
import { getInvoiceDetailRead } from "@/api/invoiceSupabaseApi.js";
import { downloadInvoicePdf } from "@/utils/invoiceDownload.js";
import InvoiceStatusBadge from "@/components/invoice/InvoiceStatusBadge.jsx";
import { cn } from "@/lib/utils";
import { Download, FileText, Loader2, X } from "lucide-react";

function formatMoney(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  return raw.slice(0, 10);
}

/**
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} [props.invoiceId]
 * @param {string} [props.orderId]
 * @param {string} [props.tenantId]
 * @param {object} [props.invoicePreview] — optional header row while loading
 * @param {(phase: string, detail?: string) => void} [props.onDownloadPhase]
 */
export default function InvoiceDetailsDrawer({
  open,
  onClose,
  invoiceId,
  orderId,
  tenantId,
  invoicePreview,
  onDownloadPhase,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setDetail(null);
      setError("");
      return undefined;
    }
    const resolvedId = String(invoiceId || invoicePreview?.invoiceDbId || invoicePreview?.id || "").trim();
    if (!resolvedId) {
      setError("Invoice id is required");
      setDetail(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await getInvoiceDetailRead(resolvedId);
        if (cancelled) return;
        if (!res.success || !res.data) {
          setError(res.error || "Unable to load invoice details");
          setDetail(null);
          return;
        }
        setDetail(res.data);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Unable to load invoice details");
          setDetail(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, invoiceId, invoicePreview?.invoiceDbId, invoicePreview?.id]);

  if (!open) return null;

  const invoice = detail?.invoice || invoicePreview;
  const lines = detail?.lines || [];

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadInvoicePdf({
        invoiceId: invoice?.id || invoice?.invoiceDbId || invoiceId,
        orderId: invoice?.orderId || orderId,
        tenantId,
        onPhase: onDownloadPhase,
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Invoice details">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40"
        aria-label="Close invoice details"
        onClick={onClose}
      />
      <div
        className={cn(
          "absolute bottom-0 right-0 flex h-[min(92vh,720px)] w-full max-w-[min(100vw,520px)] flex-col",
          "rounded-t-xl border border-border bg-white shadow-2xl md:top-0 md:h-full md:rounded-none md:rounded-l-xl"
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-slate-500" />
              <h2 className="truncate text-sm font-semibold text-slate-900">
                {invoice?.invoiceNumber || invoice?.invoiceId || "Invoice"}
              </h2>
              {invoice ? (
                <InvoiceStatusBadge
                  status={invoice.status}
                  displayStatus={invoice.displayStatus}
                />
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Order {invoice?.orderId || orderId || "—"}
            </p>
          </div>
          <Button type="button" size="sm" variant="ghost" className="h-8 px-2" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <ListSkeleton rows={6} />
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-4 text-sm text-red-700">
              {error}
            </div>
          ) : (
            <div className="space-y-4">
              <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Invoice Header
                </h3>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div>
                    <dt className="text-slate-500">Invoice Number</dt>
                    <dd className="font-medium text-slate-900">
                      {invoice?.invoiceNumber || "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Invoice Date</dt>
                    <dd className="text-slate-900">{formatDate(invoice?.invoiceDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Lab</dt>
                    <dd className="text-slate-900">{invoice?.labId || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Order</dt>
                    <dd className="font-mono text-slate-900">{invoice?.orderId || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Due Date</dt>
                    <dd className="text-slate-900">{formatDate(invoice?.dueDate)}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">PDF</dt>
                    <dd className="text-slate-900">{invoice?.hasPdf ? "Ready" : "On demand"}</dd>
                  </div>
                </dl>
              </section>

              <section>
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Line Items
                </h3>
                {lines.length ? (
                  <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full min-w-[480px] text-xs">
                      <thead>
                        <tr className="border-b bg-slate-50 text-left text-slate-500">
                          <th className="px-2 py-1.5">SKU</th>
                          <th className="px-2 py-1.5">Product</th>
                          <th className="px-2 py-1.5 text-right">Qty</th>
                          <th className="px-2 py-1.5 text-right">Unit</th>
                          <th className="px-2 py-1.5 text-right">Tax</th>
                          <th className="px-2 py-1.5 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line) => (
                          <tr key={`${line.lineNumber}-${line.sku}`} className="border-b border-slate-100">
                            <td className="px-2 py-1.5 font-mono text-[10px]">{line.sku || "—"}</td>
                            <td className="px-2 py-1.5 font-medium text-slate-900">
                              {line.productName || "—"}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{line.quantity}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {formatMoney(line.unitPrice)}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {formatMoney(line.taxAmount)}
                            </td>
                            <td className="px-2 py-1.5 text-right font-medium tabular-nums text-slate-900">
                              {formatMoney(line.lineTotal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-2 rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
                    No line items on this invoice.
                  </p>
                )}
              </section>

              <section className="rounded-lg border border-slate-200 p-3">
                <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Totals
                </h3>
                <dl className="mt-2 space-y-1 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Subtotal</dt>
                    <dd className="tabular-nums text-slate-900">{formatMoney(invoice?.subtotal)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Tax</dt>
                    <dd className="tabular-nums text-slate-900">{formatMoney(invoice?.taxAmount)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-slate-200 pt-1 text-sm font-semibold">
                    <dt className="text-slate-700">Grand Total</dt>
                    <dd className="tabular-nums text-slate-900">{formatMoney(invoice?.totalAmount)}</dd>
                  </div>
                </dl>
              </section>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            type="button"
            className="h-9 w-full text-xs"
            disabled={loading || Boolean(error) || downloading}
            onClick={() => void handleDownload()}
          >
            {downloading ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-2 h-3.5 w-3.5" />
            )}
            {downloading ? "Preparing PDF…" : "Download PDF"}
          </Button>
        </div>
      </div>
    </div>
  );
}
