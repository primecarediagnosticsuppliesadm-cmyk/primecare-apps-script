import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListSkeleton, PageSkeleton, PageHeader, DataFetchError } from "@/components/ux";
import { usePortalToast } from "@/components/ux";
import InvoiceDetailsDrawer from "@/components/invoice/InvoiceDetailsDrawer.jsx";
import InvoiceStatusBadge from "@/components/invoice/InvoiceStatusBadge.jsx";
import { getInvoicesForLabRead } from "@/api/invoiceSupabaseApi.js";
import { downloadInvoicePdf } from "@/utils/invoiceDownload.js";
import { HQ_INVOICE_LIST_DEFAULT_LIMIT } from "@/api/hqReadBounds.js";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Download, Eye, FileText, Loader2, Search } from "lucide-react";

const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "sent", label: "Sent" },
  { id: "partially_paid", label: "Partial" },
  { id: "paid", label: "Paid" },
  { id: "overdue", label: "Overdue" },
];

function formatMoney(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  return raw.slice(0, 10);
}

export default function LabInvoiceCenterPage({ currentUser }) {
  const { showToast } = usePortalToast();
  const tenantId = currentUser?.tenantId || currentUser?.tenant_id || "";
  const labId = currentUser?.labId || currentUser?.lab_id || "";

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(HQ_INVOICE_LIST_DEFAULT_LIMIT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [downloadKey, setDownloadKey] = useState("");

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadInvoices = useCallback(async () => {
    if (!labId) {
      setError("Lab profile is missing. Contact your administrator.");
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    const hadRows = rows.length > 0;
    setLoading(true);
    setError("");
    try {
      const res = await getInvoicesForLabRead(labId, {
        tenantId,
        page,
        pageSize,
        search,
        status: statusFilter,
        dateFrom,
        dateTo,
      });
      if (!res.success) {
        setError(res.error || "Unable to load invoices");
        if (!hadRows) {
          setRows([]);
          setTotal(0);
        }
        return;
      }
      setRows(res.rows || []);
      setTotal(res.total || 0);
    } catch (err) {
      setError(err?.message || "Unable to load invoices");
      if (!hadRows) {
        setRows([]);
        setTotal(0);
      }
    } finally {
      setLoading(false);
    }
  }, [labId, tenantId, page, pageSize, search, statusFilter, dateFrom, dateTo, rows.length]);

  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, dateFrom, dateTo]);

  const summaryLabel = useMemo(() => {
    if (loading) return "Loading invoices…";
    if (error) return "Invoice list unavailable";
    if (!total) return "No invoices found";
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);
    return `Showing ${start}–${end} of ${total}`;
  }, [loading, error, total, page, pageSize]);

  function openDrawer(invoice) {
    setSelectedInvoice(invoice);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setSelectedInvoice(null);
  }

  async function handleDownload(invoice) {
    const key = invoice?.id || invoice?.orderId || "invoice";
    setDownloadKey(key);
    try {
      await downloadInvoicePdf({
        invoiceId: invoice?.id,
        orderId: invoice?.orderId,
        tenantId,
        onPhase: (phase, detail) => {
          if (phase === "error") showToast("error", detail || "Unable to download invoice PDF.");
          if (phase === "success") showToast("success", "Invoice download started.");
        },
      });
    } finally {
      setDownloadKey("");
    }
  }

  if (!labId && !loading) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
        Your lab profile is not linked. Contact PrimeCare support to access invoices.
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      <PageHeader
        title="Invoice Center"
        subtitle="Search, review, and download invoices for your laboratory."
        icon={FileText}
        secondaryActions={
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            <div className="font-medium text-slate-900">{labId}</div>
            <div>{summaryLabel}</div>
          </div>
        }
      />

      <section className="rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Search
            </label>
            <div className="flex gap-2">
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Invoice number or order number"
                className="h-9 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") setSearch(searchInput.trim());
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="h-9 shrink-0 px-3"
                onClick={() => setSearch(searchInput.trim())}
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Status
            </label>
            <div className="flex flex-wrap gap-1">
              {STATUS_FILTERS.map((filter) => (
                <Button
                  key={filter.id}
                  type="button"
                  size="sm"
                  variant={statusFilter === filter.id ? "default" : "outline"}
                  className="h-8 text-xs"
                  onClick={() => setStatusFilter(filter.id)}
                >
                  {filter.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                From
              </label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 w-[9.5rem] text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                To
              </label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 w-[9.5rem] text-xs"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        {loading && !rows.length ? (
          <div className="p-3">
            <PageSkeleton kpiCount={0} showList listRows={8} />
          </div>
        ) : error && !rows.length ? (
          <div className="p-4">
            <DataFetchError message={error} onRetry={() => void loadInvoices()} retrying={loading} />
          </div>
        ) : !rows.length ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
            <FileText className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-900">No invoices yet</p>
            <p className="max-w-sm text-xs text-slate-500">
              Invoices appear here after your fulfilled orders are invoiced.
            </p>
          </div>
        ) : (
          <>
            {error ? (
              <div className="border-b border-border p-3">
                <DataFetchError
                  message={error}
                  onRetry={() => void loadInvoices()}
                  retrying={loading}
                  staleDataNote="Showing the last invoice list loaded successfully."
                />
              </div>
            ) : null}
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[920px] text-xs">
                <thead>
                  <tr className="border-b bg-slate-50 text-left text-slate-500">
                    <th className="px-3 py-2 font-medium">Invoice Number</th>
                    <th className="px-3 py-2 font-medium">Invoice Date</th>
                    <th className="px-3 py-2 font-medium">Order Number</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium text-right">Subtotal</th>
                    <th className="px-3 py-2 font-medium text-right">Tax</th>
                    <th className="px-3 py-2 font-medium text-right">Total</th>
                    <th className="px-3 py-2 font-medium text-right">Allocated</th>
                    <th className="px-3 py-2 font-medium text-right">Open</th>
                    <th className="px-3 py-2 font-medium">PDF</th>
                    <th className="px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((invoice) => {
                    const busy = downloadKey === (invoice.id || invoice.orderId);
                    return (
                      <tr
                        key={invoice.id}
                        className="border-b border-slate-100 transition hover:bg-slate-50/80"
                      >
                        <td className="px-3 py-2 font-medium text-slate-900">
                          {invoice.invoiceNumber || invoice.id}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{formatDate(invoice.invoiceDate)}</td>
                        <td className="px-3 py-2 font-mono text-slate-700">{invoice.orderId || "—"}</td>
                        <td className="px-3 py-2">
                          <InvoiceStatusBadge
                            status={invoice.status}
                            displayStatus={invoice.displayStatus}
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                          {formatMoney(invoice.subtotal)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                          {formatMoney(invoice.taxAmount)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-900">
                          {formatMoney(invoice.totalAmount)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                          {formatMoney(invoice.allocatedAmount)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-amber-700">
                          {formatMoney(invoice.openBalance)}
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {invoice.hasPdf ? "Ready" : "On demand"}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[10px]"
                              onClick={() => openDrawer(invoice)}
                            >
                              <Eye className="mr-1 h-3 w-3" />
                              View
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[10px]"
                              disabled={busy}
                              onClick={() => void handleDownload(invoice)}
                            >
                              {busy ? (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              ) : (
                                <Download className="mr-1 h-3 w-3" />
                              )}
                              Download
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-2 p-2 xl:hidden">
              {rows.map((invoice) => {
                const busy = downloadKey === (invoice.id || invoice.orderId);
                return (
                  <div
                    key={invoice.id}
                    className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">
                          {invoice.invoiceNumber || invoice.id}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatDate(invoice.invoiceDate)} · {invoice.orderId || "—"}
                        </p>
                        <p className="mt-1 text-base font-bold tabular-nums">
                          {formatMoney(invoice.totalAmount)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Open {formatMoney(invoice.openBalance)}
                        </p>
                      </div>
                      <InvoiceStatusBadge
                        status={invoice.status}
                        displayStatus={invoice.displayStatus}
                      />
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 flex-1 rounded-lg text-xs"
                        onClick={() => openDrawer(invoice)}
                      >
                        View
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 flex-1 rounded-lg text-xs"
                        disabled={busy}
                        onClick={() => void handleDownload(invoice)}
                      >
                        Download
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between border-t px-3 py-2">
              <span className="text-xs text-slate-500">{summaryLabel}</span>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="min-w-[4.5rem] text-center text-xs text-slate-600">
                  {page} / {totalPages}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 p-0"
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
        {loading && rows.length ? (
          <div className="border-t px-3 py-2">
            <ListSkeleton rows={2} />
          </div>
        ) : null}
      </section>

      <InvoiceDetailsDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        invoiceId={selectedInvoice?.id}
        orderId={selectedInvoice?.orderId}
        tenantId={tenantId}
        invoicePreview={selectedInvoice}
        onDownloadPhase={(phase, detail) => {
          if (phase === "error") showToast("error", detail || "Unable to download invoice PDF.");
          if (phase === "success") showToast("success", "Invoice download started.");
        }}
      />
    </div>
  );
}
