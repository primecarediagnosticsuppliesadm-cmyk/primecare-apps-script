import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ListSkeleton, PageSkeleton, PageHeader, DataFetchError } from "@/components/ux";
import { usePortalToast } from "@/components/ux";
import InvoiceDetailsDrawer from "@/components/invoice/InvoiceDetailsDrawer.jsx";
import InvoiceStatusBadge from "@/components/invoice/InvoiceStatusBadge.jsx";
import { getInvoicesForLabRead } from "@/api/invoiceSupabaseApi.js";
import { downloadInvoicePdf } from "@/utils/invoiceDownload.js";
import { HQ_INVOICE_LIST_DEFAULT_LIMIT } from "@/api/hqReadBounds.js";
import { LAB_INVOICE_CENTER_GRID } from "@/collections/invoiceAccountStatus.js";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Loader2,
  MoreHorizontal,
  Search,
  X,
} from "lucide-react";

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

function InvoiceCenterRow({ invoice, busy, onView, onDownload }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const label = invoice.invoiceNumber || invoice.id;

  return (
    <div className="rounded-md border border-border/70 px-2 py-1.5 transition hover:border-slate-300">
      <div className={cn("hidden xl:grid", LAB_INVOICE_CENTER_GRID)}>
        <span className="truncate font-mono text-[10px] font-semibold text-slate-900" title={label}>
          {label}
        </span>
        <span className="text-[10px] text-slate-600">{formatDate(invoice.invoiceDate)}</span>
        <span className="truncate font-mono text-[10px] text-slate-600" title={invoice.orderId || "—"}>
          {invoice.orderId || "—"}
        </span>
        <span>
          <InvoiceStatusBadge status={invoice.status} displayStatus={invoice.displayStatus} />
        </span>
        <span className="text-right text-[10px] font-semibold tabular-nums">{formatMoney(invoice.totalAmount)}</span>
        <span className="text-right text-[10px] tabular-nums text-emerald-700">
          {formatMoney(invoice.allocatedAmount)}
        </span>
        <span className="text-right text-[10px] tabular-nums text-amber-700">
          {formatMoney(invoice.openBalance)}
        </span>
        <span className="text-[10px] text-slate-600">{invoice.hasPdf ? "Ready" : "On demand"}</span>
        <div className="flex items-center justify-end gap-0.5">
          <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => onView(invoice)}>
            View
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[10px]"
            disabled={busy}
            onClick={() => void onDownload(invoice)}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "PDF"}
          </Button>
          <div className="relative">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              aria-label="More"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
            {menuOpen ? (
              <div className="absolute right-0 top-full z-20 mt-0.5 min-w-[8rem] rounded-md border border-border bg-card py-1 shadow-md">
                <button
                  type="button"
                  className="block w-full px-2.5 py-1.5 text-left text-[10px] text-slate-700 hover:bg-muted"
                  onClick={() => {
                    setMenuOpen(false);
                    onView(invoice);
                  }}
                >
                  Invoice details
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-2 xl:hidden">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-mono text-sm font-semibold text-slate-900">{label}</p>
            <p className="truncate font-mono text-xs text-slate-600">{invoice.orderId || "—"}</p>
            <p className="text-[10px] text-muted-foreground">{formatDate(invoice.invoiceDate)}</p>
          </div>
          <InvoiceStatusBadge status={invoice.status} displayStatus={invoice.displayStatus} />
        </div>
        <dl className="grid grid-cols-3 gap-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Total</dt>
            <dd className="text-right font-semibold tabular-nums">{formatMoney(invoice.totalAmount)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Open</dt>
            <dd className="text-right font-semibold tabular-nums text-amber-700">{formatMoney(invoice.openBalance)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">PDF</dt>
            <dd className="text-right text-slate-600">{invoice.hasPdf ? "Ready" : "On demand"}</dd>
          </div>
        </dl>
        <div className="flex gap-1.5">
          <Button type="button" size="sm" variant="outline" className="h-8 flex-1 text-xs" onClick={() => onView(invoice)}>
            View
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 flex-1 text-xs"
            disabled={busy}
            onClick={() => void onDownload(invoice)}
          >
            PDF
          </Button>
        </div>
      </div>
    </div>
  );
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
  const hadRowsRef = useRef(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const loadInvoices = useCallback(async () => {
    if (!labId) {
      setError("Lab profile is missing. Contact your administrator.");
      setRows([]);
      setTotal(0);
      setLoading(false);
      return;
    }
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
        if (!hadRowsRef.current) {
          setRows([]);
          setTotal(0);
        }
        return;
      }
      const nextRows = res.rows || [];
      hadRowsRef.current = nextRows.length > 0;
      setRows(nextRows);
      setTotal(res.total || 0);
    } catch (err) {
      setError(err?.message || "Unable to load invoices");
      if (!hadRowsRef.current) {
        setRows([]);
        setTotal(0);
      }
    } finally {
      setLoading(false);
    }
  }, [labId, tenantId, page, pageSize, search, statusFilter, dateFrom, dateTo]);

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
    return `${total} invoice${total === 1 ? "" : "s"} · Showing ${start}–${end}`;
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
      <div className="mx-auto max-w-7xl rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
        Your lab profile is not linked. Contact PrimeCare support to access invoices.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-6">
      <PageHeader
        title="Invoice Center"
        subtitle="Search, review, and download invoice documents for your laboratory."
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
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Invoice number or order number"
                className="h-9 pl-9 pr-9 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") setSearch(searchInput.trim());
                }}
              />
              {searchInput ? (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearchInput("");
                    setSearch("");
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
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
              Invoices appear here after your fulfilled orders are invoiced. Use Payments &amp; Account for balances and
              activity.
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
            <div className="hidden border-b border-border/60 px-2 py-2 xl:block">
              <div className={cn("text-[10px] font-medium uppercase tracking-wide text-slate-500", LAB_INVOICE_CENTER_GRID)}>
                <span>Invoice</span>
                <span>Date</span>
                <span>Order</span>
                <span>Status</span>
                <span className="text-right">Total</span>
                <span className="text-right">Allocated</span>
                <span className="text-right">Open</span>
                <span>PDF</span>
                <span className="text-right">Actions</span>
              </div>
            </div>
            <div className="space-y-1.5 p-2">
              {rows.map((invoice) => (
                <InvoiceCenterRow
                  key={invoice.id}
                  invoice={invoice}
                  busy={downloadKey === (invoice.id || invoice.orderId)}
                  onView={openDrawer}
                  onDownload={handleDownload}
                />
              ))}
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
