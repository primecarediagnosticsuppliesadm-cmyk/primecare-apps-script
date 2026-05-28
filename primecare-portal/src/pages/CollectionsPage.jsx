import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  getCollectionDetails,
  getCollectionHistory,
  updateCollection,
  completeAgentTask,
} from "@/api/primecareApi";
import {
  createPaymentWrite,
  getCollectionDetailRead,
  getCollectionHistoryRead,
  getCollectionsRead,
  updateCollectionNotesWrite,
} from "@/api/primecareSupabaseApi";
import { supabase } from "@/api/supabaseClient.js";
import {
  logAppsScriptFallbackUsed,
  logSupabaseFeatureSource,
} from "@/utils/migrationTrace.js";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  StatusBadge,
  KpiCard,
  KpiCardGrid,
  PageSkeleton,
  ListSkeleton,
  EmptyState,
  usePortalToast,
} from "@/components/ux";
import { typography } from "@/styles/designTokens";
import {
  collectionRiskToVariant,
  paymentStatusToVariant,
} from "@/utils/statusTokens";
import { cn } from "@/lib/utils";
import { labIdKey } from "@/utils/labId.js";
import {
  AGENT_TASK_COMPLETION_ENABLED,
  ALLOW_LEGACY_APPS_SCRIPT,
} from "@/config/environment";
import { ROLES } from "@/config/roles";
import { filterCollectionsForUser } from "@/utils/accessFilters.js";
import { notifyAgentWorkspaceRefresh } from "@/pages/agentVisitContext.js";
import EvidenceUploadField, {
  EvidenceUploadProgress,
} from "@/components/evidence/EvidenceUploadField.jsx";
import EvidenceContextActions from "@/components/evidence/EvidenceContextActions.jsx";
import { uploadOperationalEvidence, listOperationalEvidence } from "@/api/operationalEvidenceApi.js";

function str(v) {
  return String(v ?? "").trim();
}
import { summarizeCollectionsList } from "@/metrics/computeReceivableMetrics.js";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import { recordCollectionsRenderedSnapshot } from "@/predator/moduleUiSnapshot.js";
import { usePredatorRenderTrace } from "@/predator/renderTrace.js";
import { usePredatorUiSyncTrace } from "@/predator/usePredatorUiSyncTrace.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import {
  Loader2,
  IndianRupee,
  CheckCircle2,
  ClipboardCheck,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Search,
  AlertTriangle,
  ShieldAlert,
  Wallet,
  FileText,
  Download,
  LifeBuoy,
  ArrowRight,
} from "lucide-react";

function findCollectionByLabId(list, labId) {
  const target = labIdKey(labId);
  if (!target) return null;
  for (const row of list) {
    if (labIdKey(row?.labId) === target) return row;
  }
  return null;
}

function displayAgentName(agent) {
  const s = String(agent ?? "").trim();
  if (!s || s === "-" || s === "—" || s.toLowerCase() === "null") return "";
  return s;
}

function displayPaymentStatus(item) {
  const status = String(item?.paymentStatus || "").trim();
  const paid = Number(item?.totalPaid || 0);
  const outstanding = Number(item?.outstandingAmount || 0);
  if (status === "Paid" && paid <= 0 && outstanding <= 0) return "Current";
  if (status === "Paid" && paid <= 0) return outstanding > 0 ? "Pending" : "Current";
  return status || (outstanding > 0 ? "Pending" : "Current");
}

function shouldShowPaidLabel(item) {
  return Number(item?.totalPaid || 0) > 0;
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `₹${n.toLocaleString("en-IN")}`;
}

function formatShortDate(value) {
  if (!value) return "—";
  const s = String(value).slice(0, 10);
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function isLabAccountViewMode(viewMode, role) {
  return viewMode === "labAccount" || String(role || "").toLowerCase() === ROLES.LAB;
}

function accountCopy(isLabAccount, management, account) {
  return isLabAccount ? account : management;
}

function SummaryMetric({ label, children }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="truncate text-sm font-medium text-slate-800">{children}</div>
    </div>
  );
}

function CompactAccountKpi({ title, value, icon: Icon }) {
  return (
    <div className="rounded-lg border border-border bg-card px-2.5 py-2 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </div>
          <div className="truncate text-sm font-semibold tabular-nums text-foreground">{value}</div>
        </div>
        {Icon ? (
          <div className="shrink-0 rounded-md bg-muted p-1.5">
            <Icon className="h-3.5 w-3.5 text-[var(--pc-brand-primary)]" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function financialStatusSummary(item) {
  const risk = String(item?.riskStatus || "").toLowerCase();
  const overdueDays = Number(item?.overdueDays || 0);
  const outstanding = Number(item?.outstandingAmount || 0);
  if (overdueDays > 0) return { label: "Overdue", tone: "text-red-700 bg-red-50 border-red-200" };
  if (risk.includes("high")) return { label: "Medium Risk", tone: "text-amber-700 bg-amber-50 border-amber-200" };
  if (outstanding <= 0) return { label: "Good Standing", tone: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  return { label: "Partially Paid", tone: "text-blue-700 bg-blue-50 border-blue-200" };
}

function buildInvoiceRows(item, history) {
  const rows = [];
  const seen = new Set();
  const pushRow = (row) => {
    const key = `${row.invoiceId}|${row.orderId}|${row.amount}|${row.dueDate}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };

  const primaryInvoice = String(item?.invoiceId || item?.invoice_id || "").trim();
  const primaryOrder = String(item?.orderId || item?.order_id || "").trim();
  const outstanding = Number(item?.outstandingAmount || 0);
  if (primaryInvoice || primaryOrder || outstanding > 0) {
    pushRow({
      invoiceId: primaryInvoice || "Pending invoice",
      orderId: primaryOrder || "—",
      amount: outstanding > 0 ? outstanding : Number(item?.lastInvoiceAmount || 0),
      dueDate: item?.nextFollowUp || item?.dueDate || "",
      status: outstanding > 0 ? "Pending" : "Paid",
      overdueDays: Number(item?.overdueDays || 0),
    });
  }

  for (const entry of history || []) {
    const invoiceId = String(entry.invoiceId || entry.invoice_id || "").trim();
    const orderId = String(entry.orderId || entry.order_id || "").trim();
    const amount = Number(
      entry.invoiceAmount || entry.amountDue || entry.amountCollected || entry.amount || 0
    );
    if (!invoiceId && !orderId && !(amount > 0)) continue;
    const outstandingAfter = Number(entry.outstandingAfter || entry.outstanding_after || NaN);
    pushRow({
      invoiceId: invoiceId || "Invoice update",
      orderId: orderId || "—",
      amount: amount > 0 ? amount : Number.isFinite(outstandingAfter) ? outstandingAfter : 0,
      dueDate: entry.dueDate || entry.paymentDate || "",
      status:
        Number.isFinite(outstandingAfter) && outstandingAfter > 0
          ? "Pending"
          : entry.status || "Updated",
      overdueDays: Number(entry.overdueDays || 0),
    });
  }

  return rows.slice(0, 8);
}

function buildFinancialTimeline(item, history) {
  const outstandingNow = Number(item?.outstandingAmount || 0);
  return (history || []).map((entry) => {
    const amount = Number(entry.amountCollected || entry.amount || 0);
    const invoiceId = String(entry.invoiceId || entry.invoice_id || "").trim();
    const paymentDate = entry.paymentDate || entry.updatedAt || "";
    const mode = entry.paymentMode || entry.mode || "";
    const outstandingAfter = Number(entry.outstandingAfter || entry.outstanding_after || NaN);
    const reducedTo = Number.isFinite(outstandingAfter) ? outstandingAfter : outstandingNow;
    return {
      id: entry.paymentId || `${paymentDate}-${amount}-${invoiceId}`,
      title: amount > 0 ? `${formatMoney(amount)} payment received` : "Account update",
      subline: `Applied to ${invoiceId || "latest invoice"}${mode ? ` · ${mode}` : ""}`,
      trailing: `Outstanding ${formatMoney(reducedTo)}`,
      date: paymentDate,
      kind: amount > 0 ? "payment" : "update",
    };
  });
}

function groupTimelineByDate(events) {
  const buckets = [];
  const byLabel = new Map();
  for (const event of events || []) {
    const label = formatShortDate(event.date || "");
    if (!byLabel.has(label)) {
      const next = { label, items: [] };
      byLabel.set(label, buckets.length);
      buckets.push(next);
    }
    buckets[byLabel.get(label)].items.push(event);
  }
  return buckets;
}

function LabAccountTimeline({
  item,
  history,
  detailsLoading,
  copy,
  collectionDetails,
  onWorkspaceAction,
}) {
  const outstanding = Number(item.outstandingAmount || 0);
  const totalPaid = Number(item.totalPaid || 0);
  const overdueDays = Number(item.overdueDays || 0);
  const paymentLabel = displayPaymentStatus(item);
  const riskLabel = item.riskStatus || "Low";
  const health = financialStatusSummary(item);
  const dueDate = item.nextFollowUp || item.dueDate || "";
  const creditLimit = Number(
    item.creditLimit || item.credit_limit || item.creditApproved || item.credit_limit_amount || 0
  );
  const creditUsed = Math.max(0, outstanding);
  const utilizationPct = creditLimit > 0 ? Math.min(100, Math.round((creditUsed / creditLimit) * 100)) : null;
  const [expandedInvoiceId, setExpandedInvoiceId] = useState("");
  const [invoiceDrawerId, setInvoiceDrawerId] = useState("");
  const [activeFinanceTab, setActiveFinanceTab] = useState("activity");
  const invoices = useMemo(
    () => buildInvoiceRows(collectionDetails || item, history),
    [collectionDetails, item, history]
  );
  const financialTimeline = useMemo(
    () => buildFinancialTimeline(collectionDetails || item, history),
    [collectionDetails, item, history]
  );
  const timelineGroups = useMemo(() => groupTimelineByDate(financialTimeline), [financialTimeline]);
  const accountStandingSummary =
    overdueDays > 0
      ? `Attention needed: ${overdueDays} day overdue balance.`
      : outstanding <= 0
        ? "Account is in good standing with no pending balance."
        : "Account is active with pending balance under monitoring.";
  const availableCredit = creditLimit > 0 ? Math.max(0, creditLimit - creditUsed) : null;
  const topInvoices = invoices.slice(0, 12);
  const statementRows = useMemo(
    () =>
      topInvoices.map((invoice, idx) => ({
        id: `${invoice.invoiceId}-${idx}`,
        title: `${invoice.invoiceId}`,
        detail: `Order ${invoice.orderId || "—"} · ${formatMoney(invoice.amount)}`,
        date: invoice.dueDate,
      })),
    [topInvoices]
  );
  const creditHistoryRows = useMemo(
    () => [
      {
        id: "credit-used",
        title: "Credit used",
        detail: `${formatMoney(creditUsed)} used${creditLimit > 0 ? ` of ${formatMoney(creditLimit)}` : ""}`,
        date: dueDate,
      },
      {
        id: "credit-available",
        title: "Credit available",
        detail: availableCredit == null ? "Not configured" : formatMoney(availableCredit),
        date: dueDate,
      },
    ],
    [creditUsed, creditLimit, availableCredit, dueDate]
  );
  const notesRows = useMemo(
    () =>
      (history || [])
        .filter((entry) => String(entry.note || "").trim())
        .slice(0, 10)
        .map((entry, idx) => ({
          id: entry.paymentId || `note-${idx}`,
          title: entry.note,
          detail: `${entry.paymentMode || "Update"} · ${formatMoney(entry.amountCollected || 0)}`,
          date: entry.paymentDate,
        })),
    [history]
  );
  const tabRows =
    activeFinanceTab === "activity"
      ? financialTimeline.map((entry) => ({
          id: entry.id,
          title: entry.title,
          detail: `${entry.subline} · ${entry.trailing}`,
          date: entry.date,
          kind: entry.kind,
        }))
      : activeFinanceTab === "statements"
        ? statementRows
        : activeFinanceTab === "credit"
          ? creditHistoryRows
          : notesRows;
  const groupedTabRows = groupTimelineByDate(tabRows);

  return (
    <div className="space-y-2">
      <div className="grid gap-2 lg:grid-cols-[1.35fr_0.9fr]">
        <section className="min-w-0 rounded-lg border border-border bg-card p-2 shadow-sm">
          <div className="mb-1.5 flex items-center justify-between">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Outstanding Invoices
            </h3>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-slate-600">
              {topInvoices.length}
            </span>
          </div>
          {topInvoices.length ? (
            <>
              <div className="hidden text-[10px] font-medium uppercase tracking-wide text-slate-500 md:grid md:grid-cols-[1fr_1fr_0.9fr_0.8fr_0.8fr_1fr] md:gap-2 md:px-2 md:py-1">
                <span>Invoice</span>
                <span>Order</span>
                <span>Amount</span>
                <span>Due</span>
                <span>Status</span>
                <span>Actions</span>
              </div>
              <div className="space-y-1">
                {topInvoices.map((invoice, idx) => {
                  const id = `${invoice.invoiceId}-${idx}`;
                  return (
                    <div
                      key={id}
                      className="rounded-md border border-border/70 px-2 py-1.5 transition hover:border-slate-300"
                    >
                      <div className="grid items-center gap-1 md:grid-cols-[1fr_1fr_0.9fr_0.8fr_0.8fr_1fr] md:gap-2">
                        <div className="min-w-0 text-[11px] font-semibold text-slate-900">{invoice.invoiceId}</div>
                        <div className="min-w-0 text-[10px] text-slate-600">{invoice.orderId || "—"}</div>
                        <div className="text-[11px] font-semibold tabular-nums text-slate-900">{formatMoney(invoice.amount)}</div>
                        <div className="text-[10px] text-slate-600">{formatShortDate(invoice.dueDate)}</div>
                        <div className="text-[10px]">
                          <span
                            className={cn(
                              "rounded px-1 py-0.5",
                              Number(invoice.overdueDays || 0) > 0
                                ? "bg-red-50 text-red-700"
                                : invoice.status === "Paid"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-amber-50 text-amber-700"
                            )}
                          >
                            {invoice.status}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 px-1.5 text-[10px]"
                            onClick={() => setExpandedInvoiceId((prev) => (prev === id ? "" : id))}
                          >
                            View
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 px-1.5 text-[10px]"
                            onClick={() => setInvoiceDrawerId(id)}
                          >
                            Download
                          </Button>
                        </div>
                      </div>
                      {expandedInvoiceId === id ? (
                        <div className="mt-1.5 rounded border border-dashed border-border px-2 py-1 text-[10px] text-slate-600">
                          <div>Order {invoice.orderId || "—"} <ArrowRight className="mx-0.5 inline h-2.5 w-2.5" /> {invoice.invoiceId}</div>
                          <div>Due {formatShortDate(invoice.dueDate)} · {invoice.status}</div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="rounded-md border border-dashed px-2 py-2 text-[11px] text-muted-foreground">
              No outstanding invoices right now.
            </p>
          )}
        </section>

        <aside className="rounded-lg border border-border bg-card p-2.5 shadow-sm">
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Account Health
          </h3>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[10px] text-slate-500">Outstanding</p>
              <p className="text-lg font-bold tabular-nums text-foreground">{formatMoney(outstanding)}</p>
              <p className="text-[10px] text-muted-foreground">Paid {formatMoney(totalPaid)}</p>
            </div>
            <div className="text-right">
              <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-medium", health.tone)}>
                {health.label}
              </span>
              <p className="mt-1 text-[10px] text-muted-foreground">Risk: {riskLabel}</p>
            </div>
          </div>
          <div className="mt-2 text-[10px] text-slate-600">
            <div>Behavior: {overdueDays > 0 ? `Delayed by ${overdueDays}d` : "On track"}</div>
            <div>Next payment: {formatShortDate(dueDate)}</div>
          </div>
          {utilizationPct != null ? (
            <div className="mt-2">
              <div className="mb-1 flex items-center justify-between text-[10px] text-slate-600">
                <span>Credit used</span>
                <span className="tabular-nums">
                  {formatMoney(creditUsed)} / {formatMoney(creditLimit)}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn(
                    "h-full rounded-full",
                    utilizationPct >= 85
                      ? "bg-red-500"
                      : utilizationPct >= 65
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                  )}
                  style={{ width: `${utilizationPct}%` }}
                />
              </div>
            </div>
          ) : null}
          <p className="mt-2 text-[10px] text-muted-foreground">{accountStandingSummary}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => onWorkspaceAction?.("view_orders")}>
              <FileText className="mr-1 h-3 w-3" />
              Orders
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => onWorkspaceAction?.("download_statement")}>
              <Download className="mr-1 h-3 w-3" />
              Statement
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => onWorkspaceAction?.("repeat_last_order")}>
              Repeat
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => onWorkspaceAction?.("contact_support")}>
              <LifeBuoy className="mr-1 h-3 w-3" />
              Support
            </Button>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Online payments coming soon.</p>
        </aside>
      </div>

      <section className="rounded-lg border border-border bg-card p-2.5 shadow-sm">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {[
            { id: "activity", label: "Payment Activity" },
            { id: "statements", label: "Statements" },
            { id: "credit", label: "Credit History" },
            { id: "notes", label: "Notes" },
          ].map((tab) => (
            <Button
              key={tab.id}
              type="button"
              size="sm"
              variant={activeFinanceTab === tab.id ? "default" : "outline"}
              className="h-7 rounded-md px-2 text-[10px]"
              onClick={() => setActiveFinanceTab(tab.id)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
        {detailsLoading ? (
          <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading activity…
          </div>
        ) : tabRows.length ? (
          <div className="space-y-2">
            {groupedTabRows.map((group) => (
              <div key={group.label}>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {group.label}
                </div>
                <ul className="relative space-y-0 pl-2.5">
                  <div className="absolute bottom-1 left-[4px] top-1 w-px bg-border" aria-hidden />
                  {group.items.map((entry) => (
                    <li key={entry.id} className="relative border-b border-border/50 py-1.5 pl-3 last:border-b-0">
                      <span
                        className={cn(
                          "absolute left-0 top-2.5 h-1.5 w-1.5 rounded-full border border-background",
                          entry.kind === "payment" ? "bg-emerald-500" : "bg-blue-500"
                        )}
                        aria-hidden
                      />
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium text-slate-900">{entry.title}</p>
                          <p className="text-[10px] text-slate-600">{entry.detail}</p>
                        </div>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {formatShortDate(entry.date)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-dashed px-2 py-2 text-[11px] text-muted-foreground">
            No entries in this tab yet.
          </p>
        )}
      </section>

      {invoiceDrawerId ? (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Invoice details">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/30"
            onClick={() => setInvoiceDrawerId("")}
          />
          <div className="absolute bottom-0 right-0 h-[70vh] w-full max-w-[min(100vw,460px)] rounded-t-xl border border-border bg-white p-3 shadow-xl md:top-0 md:h-full md:rounded-none md:rounded-l-xl">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900">Invoice Details</h4>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setInvoiceDrawerId("")}>
                Close
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              Detailed invoice preview and download actions will be available here.
            </p>
            <div className="mt-3 flex gap-2">
              <Button type="button" size="sm" variant="outline" className="h-8 text-xs">
                View Invoice
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-8 text-xs">
                <Download className="mr-1 h-3 w-3" />
                Download Statement
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CollectionsLoading() {
  return (
    <div className="space-y-3 pb-6">
      <PageSkeleton kpiCount={4} kpiColumns={4} showList={false} />
      <div className="animate-pulse rounded-lg border border-border bg-card p-3 shadow-sm">
        <div className="mb-2 h-9 w-full rounded-lg bg-muted" />
        <ListSkeleton rows={6} />
      </div>
    </div>
  );
}

function CollectionSummaryRow({ item, expanded, onToggleExpand, readOnly = false, copy }) {
  const labels = copy || {
    expandDetails: "Expand collection details",
    collapseDetails: "Collapse collection details",
    viewHistory: "View payment history",
    recordPayment: "Record payment / notes",
  };
  const outstanding = Number(item.outstandingAmount || 0);
  const overdueDays = Number(item.overdueDays || 0);
  const agent = displayAgentName(item.assignedAgent);
  const paymentLabel = displayPaymentStatus(item);
  const lastFollowUp = item.lastFollowUp || item.nextFollowUp;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 p-2.5 sm:p-3",
        expanded ? "bg-slate-50" : "bg-white"
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onToggleExpand}
          className="mt-0.5 shrink-0 rounded-md p-1 text-slate-500 hover:bg-slate-100"
          aria-expanded={expanded}
          aria-controls={`collection-detail-${labIdKey(item.labId)}`}
          aria-label={expanded ? labels.collapseDetails : labels.expandDetails}
        >
          {expanded ? (
            <ChevronUp className="h-5 w-5" />
          ) : (
            <ChevronDown className="h-5 w-5" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="truncate text-sm font-semibold text-slate-900">
              {item.labName || item.labId}
            </span>
            {item.area ? (
              <span className="text-[11px] text-slate-400">{item.area}</span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <StatusBadge variant={collectionRiskToVariant(item.riskStatus)} compact>
              {item.riskStatus || "Low"}
            </StatusBadge>
            <StatusBadge variant={paymentStatusToVariant(paymentLabel)} compact>
              {paymentLabel}
            </StatusBadge>
            {item.creditHold ? (
              <StatusBadge variant="danger" compact>
                {String(item.creditHold).toUpperCase() === "HOLD" ? "Credit hold" : item.creditHold}
              </StatusBadge>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Outstanding
          </div>
          <div className="text-base font-semibold tabular-nums text-slate-900">
            {formatMoney(outstanding)}
          </div>
        </div>
      </div>

      <div className={cn("grid gap-x-3 gap-y-2", readOnly ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-4")}>
        <SummaryMetric label="Overdue days">
          {overdueDays > 0 ? <span className="text-[var(--pc-danger)]">{overdueDays}d</span> : "—"}
        </SummaryMetric>
        {readOnly ? (
          <>
            <SummaryMetric label="Status">{paymentLabel}</SummaryMetric>
            {shouldShowPaidLabel(item) ? (
              <SummaryMetric label="Total paid">{formatMoney(item.totalPaid)}</SummaryMetric>
            ) : null}
          </>
        ) : (
          <>
            <SummaryMetric label="Last follow-up">{formatShortDate(lastFollowUp)}</SummaryMetric>
            <SummaryMetric label="Next follow-up">{formatShortDate(item.nextFollowUp)}</SummaryMetric>
            <SummaryMetric label="Agent">{agent || "—"}</SummaryMetric>
            {shouldShowPaidLabel(item) ? (
              <SummaryMetric label="Total paid">{formatMoney(item.totalPaid)}</SummaryMetric>
            ) : null}
          </>
        )}
      </div>

      <div className="flex justify-end sm:hidden">
        <Button
          type="button"
          variant={expanded ? "secondary" : "outline"}
          size="sm"
          className="h-10 w-full rounded-lg"
          onClick={onToggleExpand}
        >
          {expanded ? "Close details" : readOnly ? labels.viewHistory : labels.recordPayment}
        </Button>
      </div>
    </div>
  );
}

function CollectionExpandedPanel({
  collection,
  history,
  detailsLoading,
  copy,
  amountCollected,
  setAmountCollected,
  paymentMode,
  setPaymentMode,
  note,
  setNote,
  nextFollowUp,
  setNextFollowUp,
  nextAction,
  setNextAction,
  saving,
  completingTask,
  pendingTaskContext,
  onSave,
  onCompleteTask,
  readOnly = false,
  collectionProofFile,
  setCollectionProofFile,
  proofRemarks,
  setProofRemarks,
  evidenceUploading,
  currentUser,
  tenantId,
  collectionEvidence = [],
}) {
  if (detailsLoading) {
    return (
      <div className="border-t border-slate-200 bg-slate-50/80 px-3 py-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {copy?.loadingDetails || "Loading collection details…"}
        </div>
      </div>
    );
  }

  if (!collection) {
    return (
      <div className="border-t border-slate-200 bg-slate-50/80 px-3 py-6">
        <p className="text-sm text-muted-foreground">
          {copy?.noDetails || "No collection details found."}
        </p>
      </div>
    );
  }

  return (
    <div
      id={`collection-detail-${labIdKey(collection.labId)}`}
      className="border-t border-slate-200 bg-slate-50/80 px-2.5 py-3 sm:px-3"
    >
      <div className="space-y-4">
        <section className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Outstanding
            </div>
            <div className="font-semibold">{formatMoney(collection.outstandingAmount)}</div>
          </div>
          {shouldShowPaidLabel(collection) ? (
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                Total paid
              </div>
              <div className="font-semibold">{formatMoney(collection.totalPaid)}</div>
            </div>
          ) : null}
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Risk
            </div>
            <StatusBadge variant={collectionRiskToVariant(collection.riskStatus)} compact>
              {collection.riskStatus || "Low"}
            </StatusBadge>
          </div>
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
              Status
            </div>
            <StatusBadge
              variant={paymentStatusToVariant(displayPaymentStatus(collection))}
              compact
            >
              {displayPaymentStatus(collection)}
            </StatusBadge>
          </div>
        </section>

        {!readOnly ? (
          <section className="space-y-3 rounded-lg border border-border bg-card p-3">
            <h3 className="text-xs font-semibold text-slate-700">Record payment & follow-up</h3>

            <div className="space-y-2">
              <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Amount collected
              </label>
              <Input
                type="number"
                value={amountCollected}
                onChange={(e) => setAmountCollected(e.target.value)}
                placeholder="Enter collected amount"
                className="h-11 rounded-lg"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Payment mode
              </label>
              <select
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
              >
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  Next follow-up date
                </label>
                <Input
                  type="date"
                  value={nextFollowUp}
                  onChange={(e) => setNextFollowUp(e.target.value)}
                  className="h-11 rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  Next action
                </label>
                <Input
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                  placeholder="Call, revisit, send reminder…"
                  className="h-11 rounded-lg"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Note
              </label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Collection note…"
                className="min-h-[88px] rounded-lg"
              />
            </div>

            <EvidenceUploadField
              file={collectionProofFile}
              onFileChange={setCollectionProofFile}
              label="Payment / receipt proof (optional)"
              disabled={saving || evidenceUploading}
              hint="Receipt, UPI screenshot, or signed slip"
            />
            <div className="space-y-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Proof remarks
              </label>
              <Textarea
                value={proofRemarks}
                onChange={(e) => setProofRemarks(e.target.value)}
                placeholder="Optional audit note"
                className="min-h-[64px] rounded-lg text-sm"
                disabled={saving || evidenceUploading}
              />
            </div>
            <EvidenceUploadProgress uploading={evidenceUploading} />

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                className="h-11 flex-1 rounded-lg"
                onClick={onSave}
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <IndianRupee className="mr-2 h-4 w-4" />
                    Save collection update
                  </>
                )}
              </Button>

              {pendingTaskContext?.taskId ? (
                AGENT_TASK_COMPLETION_ENABLED ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 flex-1 rounded-lg"
                    onClick={onCompleteTask}
                    disabled={completingTask}
                  >
                    {completingTask ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Completing…
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Mark linked task complete
                      </>
                    )}
                  </Button>
                ) : (
                  <p className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground sm:flex-1">
                    Task completion coming soon.
                  </p>
                )
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-700">
            {readOnly ? "Payment history" : "Collection history"}
          </h3>
          {history.length ? (
            <ul className="space-y-2">
              {history.map((item) => {
                const paymentId = item.paymentId || item.payment_id || "";
                const proofCount = collectionEvidence.filter(
                  (r) => str(r.paymentId) === str(paymentId)
                ).length;
                return (
                  <li
                    key={paymentId || `${item.paymentDate}-${item.amountCollected}`}
                    className="rounded-lg border border-border bg-card p-3 text-sm"
                  >
                    <div className="font-medium tabular-nums">
                      {formatMoney(item.amountCollected)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.paymentDate || "—"} · {item.paymentMode || "—"}
                      {proofCount ? " · Proof attached" : ""}
                    </div>
                    <p className="mt-1 text-slate-600">{item.note || "No note"}</p>
                    {currentUser && proofCount ? (
                      <div className="mt-2">
                        <EvidenceContextActions
                          currentUser={currentUser}
                          labId={collection?.labId}
                          paymentId={paymentId}
                          className="h-7 text-[10px]"
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No payment history found.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function CollectionListItem({
  item,
  expanded,
  onToggleExpand,
  selectedCollection,
  history,
  detailsLoading,
  formProps,
  pendingTaskContext,
  onSave,
  onCompleteTask,
  readOnly = false,
  copy = null,
}) {
  return (
    <Card className="overflow-hidden rounded-lg border-border shadow-sm">
      <CollectionSummaryRow
        item={item}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
        readOnly={readOnly}
        copy={copy}
      />
      {expanded ? (
        <CollectionExpandedPanel
          collection={selectedCollection}
          history={history}
          detailsLoading={detailsLoading}
          pendingTaskContext={pendingTaskContext}
          onSave={onSave}
          onCompleteTask={onCompleteTask}
          readOnly={readOnly}
          copy={copy}
          {...formProps}
        />
      ) : null}
    </Card>
  );
}

export default function CollectionsPage({ currentUser, authToken, viewMode }) {
  const isLabAccount = isLabAccountViewMode(viewMode, currentUser?.role);
  const accountLabels = useMemo(() => {
    if (!isLabAccount) return null;
    return {
      expandDetails: "Expand account details",
      collapseDetails: "Collapse account details",
      viewHistory: "View payment history",
      recordPayment: "View payment history",
      loadingDetails: "Loading account details…",
      noDetails: "No account details found.",
    };
  }, [isLabAccount]);
  const { showToast } = usePortalToast();
  const [summary, setSummary] = useState({
    totalOutstanding: 0,
    overdueCount: 0,
    highRiskCount: 0,
    todayCollections: 0,
  });

  const [collections, setCollections] = useState([]);
  const [expandedLabId, setExpandedLabId] = useState("");
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [history, setHistory] = useState([]);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completingTask, setCompletingTask] = useState(false);

  const [loadError, setLoadError] = useState("");

  const [amountCollected, setAmountCollected] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [note, setNote] = useState("");
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [nextAction, setNextAction] = useState("");

  const [pendingTaskContext, setPendingTaskContext] = useState(null);
  const [collectionProofFile, setCollectionProofFile] = useState(null);
  const [proofRemarks, setProofRemarks] = useState("");
  const [evidenceUploading, setEvidenceUploading] = useState(false);

  const tenantId = currentUser?.tenantId ?? currentUser?.tenant_id ?? "";
  const [collectionEvidence, setCollectionEvidence] = useState([]);

  useEffect(() => {
    if (!tenantId || !selectedCollection?.labId || isLabAccount) {
      setCollectionEvidence([]);
      return;
    }
    let cancelled = false;
    void listOperationalEvidence(tenantId, currentUser, {
      labId: selectedCollection.labId,
      limit: 80,
    }).then((rows) => {
      if (!cancelled) setCollectionEvidence(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [tenantId, currentUser, selectedCollection?.labId, isLabAccount, saving]);

  const predatorSnapshot = useMemo(
    () => ({
      summary,
      collections,
      collectionsListCount: collections.length,
      outstandingReceivables: Number(summary.totalOutstanding ?? 0),
      isLabAccountView: isLabAccount,
      labScopedCollectionCount: isLabAccount ? collections.length : null,
      invoiceVisibilityCount: isLabAccount ? Number(history.length || 0) : null,
      selectedLabId: selectedCollection?.labId || null,
      labId: currentUser?.labId,
      userName: currentUser?.name,
    }),
    [summary, collections, isLabAccount, history.length, selectedCollection?.labId, currentUser?.labId, currentUser?.name]
  );

  usePredatorModuleValidation("Collections", currentUser, predatorSnapshot, !loading);
  usePredatorModuleValidation("Operational Evidence", currentUser, {}, !loading && !isLabAccount);

  usePredatorModuleValidation(
    "Lab Portal",
    currentUser,
    {
      isLabAccountView: isLabAccount,
      labId: currentUser?.labId,
      userName: currentUser?.name,
    },
    !loading && isLabAccount
  );

  useEffect(() => {
    if (loading) return;
    recordCollectionsRenderedSnapshot(predatorSnapshot, {
      source: "CollectionsPage.render",
    });
  }, [loading, predatorSnapshot]);

  usePredatorRenderTrace("Collections", {
    ready: !loading,
    hasData: collections.length > 0 || summary.totalOutstanding > 0,
  });

  usePredatorUiSyncTrace("Collections", {
    loading,
    apiReady: !loading,
    metrics: {
      collections_list: {
        state: collections.length,
        render: collections.length,
      },
      outstanding_receivables: {
        state: Number(summary.totalOutstanding ?? 0),
        render: Number(summary.totalOutstanding ?? 0),
      },
    },
  });

  const loadCollections = useCallback(async () => {
    return predatorTrace("Collections", "page.load", async () => {
      try {
        setLoading(true);
        setLoadError("");

        logSupabaseFeatureSource("Collections.list", { api: "getCollectionsRead" });
        const res = await getCollectionsRead();
        const payload = res?.data || {};

        const allRows = Array.isArray(payload.collections) ? payload.collections : [];
        const rows = filterCollectionsForUser(allRows, currentUser);
        const summaryFromApi = payload.summary || {};
        const scopedSummary = isLabAccount
          ? summarizeCollectionsList(rows, 0)
          : {
              totalOutstanding: Number(summaryFromApi.totalOutstanding ?? 0),
              overdueCount: Number(summaryFromApi.overdueCount ?? 0),
              highRiskCount: Number(summaryFromApi.highRiskCount ?? 0),
              todayCollections: Number(summaryFromApi.todayCollections ?? 0),
            };

        setSummary({
          totalOutstanding: Number(scopedSummary.totalOutstanding ?? 0),
          overdueCount: Number(scopedSummary.overdueCount ?? 0),
          highRiskCount: Number(scopedSummary.highRiskCount ?? 0),
          todayCollections: Number(scopedSummary.todayCollections ?? 0),
        });

        setCollections(rows);
      } catch (err) {
        console.warn("CollectionsPage loadCollections:", err);
        setLoadError(
          err?.message ||
            accountCopy(
              isLabAccount,
              "Failed to load collections",
              "Failed to load account information"
            )
        );
        setSummary({
          totalOutstanding: 0,
          overdueCount: 0,
          highRiskCount: 0,
          todayCollections: 0,
        });
        setCollections([]);
      } finally {
        setLoading(false);
      }
    });
  }, [currentUser, isLabAccount]);

  useEffect(() => {
    loadCollections();
  }, [loadCollections, authToken]);

  useEffect(() => {
    if (loading || isLabAccount) return;
    hydratePendingCollectionTask();
  }, [loading, collections, isLabAccount]);

  async function openCollection(labId, options = {}) {
    const listMatch = findCollectionByLabId(collections, labId);
    const canonicalLabId = listMatch?.labId ?? labId;
    const canonicalKey = labIdKey(canonicalLabId);

    try {
      setDetailsLoading(true);

      if (listMatch) {
        setExpandedLabId(canonicalKey);
        setSelectedCollection(listMatch);
      } else {
        setExpandedLabId(canonicalKey);
      }

      const params = authToken ? { sessionToken: authToken } : {};

      let historyRows = [];
      let sbDetail = null;
      let sbDetailOk = false;
      let sbHistoryOk = false;

      if (supabase) {
        logSupabaseFeatureSource("Collections.history", { api: "getCollectionHistoryRead" });
        const histRead = await getCollectionHistoryRead(canonicalLabId);
        sbHistoryOk = Boolean(histRead?.success);
        if (histRead?.success && Array.isArray(histRead?.data?.history)) {
          historyRows = histRead.data.history;
        }

        logSupabaseFeatureSource("Collections.details", { api: "getCollectionDetailRead" });
        const detailRead = await getCollectionDetailRead(canonicalLabId);
        sbDetailOk = Boolean(detailRead?.success);
        sbDetail = detailRead?.data?.collection ?? null;
      }

      let apiCollection = sbDetail;
      const useAppsScriptDetail = !sbDetailOk && !import.meta.env.DEV;
      const useAppsScriptHistory = !sbHistoryOk && !historyRows.length && !import.meta.env.DEV;

      if (useAppsScriptDetail) {
        logAppsScriptFallbackUsed("Collections.details", {
          primarySourceExpected: "Supabase getCollectionDetailRead",
          fallbackSourceUsed: "Apps Script getCollectionDetails",
          riskLevel: "SAFE",
          metricKey: "collectionsSummary",
          reason: "Supabase detail read failed",
        });
        const detailsRes = await getCollectionDetails(canonicalLabId, params);
        const detailsPayload = detailsRes?.data || detailsRes || {};
        apiCollection = detailsPayload.collection || apiCollection;
      }

      if (useAppsScriptHistory) {
        logAppsScriptFallbackUsed("Collections.history", {
          primarySourceExpected: "Supabase getCollectionHistoryRead",
          fallbackSourceUsed: "Apps Script getCollectionHistory",
          riskLevel: "SAFE",
          metricKey: "collectionsSummary",
          reason: "Supabase history read failed",
        });
        const historyRes = await getCollectionHistory(canonicalLabId, params);
        const historyPayload = historyRes?.data || historyRes || {};
        historyRows = Array.isArray(historyPayload.history) ? historyPayload.history : [];
      }

      let collection = listMatch || null;
      if (apiCollection) {
        const mergedNotes =
          apiCollection.collectionsNotes ??
          apiCollection.note ??
          listMatch?.collectionsNotes ??
          "";
        collection = {
          ...listMatch,
          ...apiCollection,
          labId: labIdKey(apiCollection.labId ?? canonicalLabId),
          collectionsNotes: mergedNotes,
          nextFollowUp:
            apiCollection.nextFollowUp ?? listMatch?.nextFollowUp ?? "",
          nextAction: apiCollection.nextAction ?? listMatch?.nextAction ?? "",
        };
      }

      setExpandedLabId(canonicalKey);
      setSelectedCollection(collection);
      setHistory(historyRows);

      setAmountCollected("");
      setPaymentMode("Cash");
      setNote(collection?.collectionsNotes || collection?.note || "");
      setNextFollowUp(collection?.nextFollowUp || "");
      setNextAction(
        options?.taskContext?.nextAction || collection?.nextAction || ""
      );

      if (options?.fromTask && options?.taskContext) {
        showToast(
          "info",
          `Collection task loaded for ${options.taskContext.labName || collection?.labName || canonicalLabId}.`
        );
      }
    } catch (err) {
      if (listMatch) {
        setExpandedLabId(canonicalKey);
        setSelectedCollection(listMatch);
        setHistory([]);
      } else {
        showToast("error", err.message || "Failed to load collection details");
        setExpandedLabId("");
        setSelectedCollection(null);
      }
    } finally {
      setDetailsLoading(false);
    }
  }

  function hydratePendingCollectionTask() {
    const raw = sessionStorage.getItem("primecare_pending_collection_task");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (!parsed?.labId) {
        sessionStorage.removeItem("primecare_pending_collection_task");
        return;
      }

      setPendingTaskContext(parsed);
      openCollection(parsed.labId, {
        fromTask: true,
        taskContext: parsed,
      });

      sessionStorage.removeItem("primecare_pending_collection_task");
    } catch (err) {
      console.error("Failed to parse pending collection task", err);
      sessionStorage.removeItem("primecare_pending_collection_task");
    }
  }

  async function handleSaveCollection() {
    if (isLabAccount) return;
    const selectedLabId = expandedLabId;
    if (!selectedLabId) return;

    return predatorTrace("Collections", "page.save", async () => {
      try {
        setSaving(true);

        const basePayload = {
          labId: selectedLabId,
          amountCollected: Number(amountCollected || 0),
          paymentMode,
          collectedBy: currentUser?.name || "System User",
          note,
          nextFollowUp,
          nextAction,
        };
        let paymentFallbackLogged = false;

        const amt = Number(amountCollected || 0);
        const notesPayload = {
          labId: labIdKey(selectedLabId),
          note,
          nextFollowUp,
          nextAction,
        };

        if (supabase && amt <= 0) {
          logSupabaseFeatureSource("Collections.notesWrite", {
            api: "updateCollectionNotesWrite",
          });
          const notesRes = await updateCollectionNotesWrite(notesPayload);
          if (notesRes.success) {
            showToast(
              "success",
              pendingTaskContext?.taskId
                ? "Collection updated. You can mark the linked task complete."
                : "Collection updated successfully"
            );
            await loadCollections();
            await openCollection(selectedLabId, {
              fromTask: !!pendingTaskContext,
              taskContext: pendingTaskContext,
            });
            return;
          }

          if (import.meta.env.DEV) {
            throw new Error(notesRes.error || "Supabase collection notes write failed.");
          }

          logAppsScriptFallbackUsed("Collections.notesWrite", {
            primarySourceExpected: "Supabase updateCollectionNotesWrite",
            fallbackSourceUsed: "No Apps Script zero-amount equivalent",
            riskLevel: "WARNING",
            metricKey: "collectionsSummary",
            reason: notesRes.error,
          });
          throw new Error(
            notesRes.error ||
              "Failed to save collection notes. Apps Script does not support zero-amount updates."
          );
        }

        if (supabase && amt > 0) {
          const sbRes = await createPaymentWrite({
            labId: labIdKey(selectedLabId),
            tenantId: currentUser?.tenantId ?? currentUser?.tenant_id ?? null,
            orderId: null,
            amountReceived: amt,
            paymentMode,
            outstandingBefore: Number(selectedCollection?.outstandingAmount ?? 0),
            collectedBy: currentUser?.name || "System User",
            note,
          });

          logSupabaseFeatureSource("Collections.paymentWrite", { api: "createPaymentWrite" });
          if (sbRes.success) {
            if (note || nextFollowUp || nextAction) {
              await updateCollectionNotesWrite(notesPayload);
            }

            const paymentId =
              sbRes.data?.payment?.payment_id ??
              sbRes.data?.payment?.paymentId ??
              "";

            const hadProof = Boolean(collectionProofFile);
            if (hadProof && paymentId) {
              setEvidenceUploading(true);
              const up = await uploadOperationalEvidence({
                file: collectionProofFile,
                tenantId,
                labId: labIdKey(selectedLabId),
                kind: "collection_receipt",
                paymentId,
                uploadedBy: currentUser?.name || "System User",
                uploadedByRole: currentUser?.role || ROLES.AGENT,
                remarks: proofRemarks || note,
                onProgress: () => {},
              });
              setEvidenceUploading(false);
              if (!up.success) {
                showToast("warning", up.error || "Payment saved; proof upload failed.");
              }
              setCollectionProofFile(null);
              setProofRemarks("");
            }

            showToast(
              "success",
              pendingTaskContext?.taskId
                ? `Payment recorded${hadProof ? " · Proof attached" : ""}. You can mark the linked task complete.`
                : `Payment recorded successfully${hadProof ? " · Proof attached" : ""}`
            );
            notifyAgentWorkspaceRefresh({
              source: "collection_payment",
              labId: selectedLabId,
            });

            await loadCollections();
            await openCollection(selectedLabId, {
              fromTask: !!pendingTaskContext,
              taskContext: pendingTaskContext,
            });
            return;
          }

          if (import.meta.env.DEV || !ALLOW_LEGACY_APPS_SCRIPT) {
            throw new Error(sbRes.error || "Supabase payment write failed.");
          }

          logAppsScriptFallbackUsed("Collections.paymentWrite", {
            primarySourceExpected: "Supabase createPaymentWrite",
            fallbackSourceUsed: "Apps Script updateCollection",
            riskLevel: "DANGEROUS",
            metricKey: "collectionsSummary",
            reason: sbRes.error,
          });
          paymentFallbackLogged = true;
        }

        if (amt <= 0) {
          throw new Error(
            "Enter an amount collected or save notes via Supabase when configured."
          );
        }

        if (!paymentFallbackLogged) {
          logAppsScriptFallbackUsed("Collections.paymentWrite", {
            primarySourceExpected: "Supabase payments + ar_credit_control write",
            fallbackSourceUsed: "Apps Script updateCollection",
            riskLevel: "DANGEROUS",
            metricKey: "collectionsSummary",
            reason: supabase
              ? "Using updateCollection after Supabase payment failure."
              : "Supabase client unavailable; using Apps Script updateCollection.",
          });
        }
        if (!ALLOW_LEGACY_APPS_SCRIPT) {
          throw new Error("Supabase collections write is required for pilot access.");
        }
        const res = await updateCollection(basePayload);
        const responsePayload = res?.data || res || {};

        if (!responsePayload?.success) {
          throw new Error(responsePayload?.message || "Failed to update collection");
        }

        showToast(
          "success",
          pendingTaskContext?.taskId && AGENT_TASK_COMPLETION_ENABLED
            ? "Collection updated. You can mark the linked task complete."
            : "Collection updated successfully"
        );

        await loadCollections();
        await openCollection(selectedLabId, {
          fromTask: !!pendingTaskContext,
          taskContext: pendingTaskContext,
        });
      } catch (err) {
        showToast("error", err.message || "Failed to save collection update");
      } finally {
        setSaving(false);
      }
    });
  }

  async function handleCompleteLinkedTask() {
    if (!pendingTaskContext?.taskId) return;

    return predatorTrace("Collections", "page.completeTask", async () => {
      try {
        setCompletingTask(true);

        if (!AGENT_TASK_COMPLETION_ENABLED) {
          return;
        }

        const res = await completeAgentTask({
          taskId: pendingTaskContext.taskId,
          completedBy: currentUser?.name || currentUser?.agentName || "System User",
        });

        const payload = res?.data || res || {};
        if (!payload?.success) {
          throw new Error(payload?.message || "Failed to complete linked task");
        }

        showToast("success", "Collection updated and linked task marked complete.");
        setPendingTaskContext(null);
      } catch (err) {
        showToast("error", err.message || "Failed to complete linked task");
      } finally {
        setCompletingTask(false);
      }
    });
  }

  const filteredCollections = useMemo(() => {
    if (isLabAccount) {
      return [...collections];
    }
    const q = search.trim().toLowerCase();
    const filtered = collections.filter((item) =>
      `${item.labId} ${item.labName} ${item.assignedAgent} ${item.area}`
        .toLowerCase()
        .includes(q)
    );
    return [...filtered].sort(
      (a, b) => Number(b.outstandingAmount || 0) - Number(a.outstandingAmount || 0)
    );
  }, [collections, search, isLabAccount]);

  useEffect(() => {
    if (!isLabAccount || loading || collections.length !== 1) return;
    const key = labIdKey(collections[0].labId);
    if (expandedLabId === key) return;
    void openCollection(collections[0].labId);
  }, [isLabAccount, loading, collections, expandedLabId]);

  useEffect(() => {
    if (
      expandedLabId &&
      !filteredCollections.some((c) => labIdKey(c.labId) === expandedLabId)
    ) {
      setExpandedLabId("");
      setSelectedCollection(null);
      setHistory([]);
    }
  }, [filteredCollections, expandedLabId]);

  async function toggleExpand(labId) {
    const key = labIdKey(labId);
    if (expandedLabId === key) {
      setExpandedLabId("");
      setSelectedCollection(null);
      setHistory([]);
      return;
    }
    await openCollection(labId);
  }

  const formProps = {
    amountCollected,
    setAmountCollected,
    paymentMode,
    setPaymentMode,
    note,
    setNote,
    nextFollowUp,
    setNextFollowUp,
    nextAction,
    setNextAction,
    saving,
    completingTask,
    collectionProofFile,
    setCollectionProofFile,
    proofRemarks,
    setProofRemarks,
    evidenceUploading,
    currentUser,
    tenantId,
    collectionEvidence,
  };

  const handleLabWorkspaceAction = useCallback(
    (action) => {
      if (!isLabAccount) return;
      if (action === "view_orders") {
        showToast("info", "Open Lab Ordering from sidebar to view order details.");
        return;
      }
      if (action === "download_statement") {
        showToast("info", "Statement download placeholder is available in this release.");
        return;
      }
      if (action === "repeat_last_order") {
        showToast("info", "Use Activity Center or Lab Ordering to repeat your latest order.");
        return;
      }
      if (action === "contact_support") {
        showToast("info", "Contact support placeholder: support workflows are coming soon.");
      }
    },
    [isLabAccount, showToast]
  );

  if (loading) {
    return <CollectionsLoading />;
  }

  return (
    <div className="space-y-3 pb-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-[var(--pc-brand-primary)]" />
            <h1 className={typography.pageTitle}>
              {isLabAccount ? "Payments & Account" : "Collections"}
            </h1>
          </div>
          <p className={cn(typography.pageSubtitle, "mt-0.5")}>
            {isLabAccount
              ? "Operational financial workspace for your lab: account health, invoices, and payment activity."
              : "Tenant-wide receivables, follow-ups, and payments. Tap a lab to record payments and follow-ups."}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 rounded-lg"
          onClick={() => loadCollections()}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </header>


      {pendingTaskContext && !isLabAccount ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          <div className="flex items-start gap-2">
            <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-medium">Linked collection task</div>
              <div>
                Lab: <strong>{pendingTaskContext.labName || pendingTaskContext.labId}</strong>
              </div>
              {pendingTaskContext.nextAction ? (
                <div className="mt-0.5">Suggested: {pendingTaskContext.nextAction}</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {loadError}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 h-9 rounded-lg"
            onClick={() => loadCollections()}
          >
            Retry
          </Button>
        </div>
      ) : null}

      <div className={isLabAccount ? "mx-auto max-w-2xl" : ""}>
        {isLabAccount ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <CompactAccountKpi
              title="Outstanding"
              value={formatMoney(summary.totalOutstanding)}
              icon={IndianRupee}
            />
            <CompactAccountKpi
              title="Overdue"
              value={
                filteredCollections[0]?.overdueDays
                  ? `${Number(filteredCollections[0].overdueDays)}d`
                  : "—"
              }
              icon={AlertTriangle}
            />
            <CompactAccountKpi
              title="Total paid"
              value={formatMoney(filteredCollections[0]?.totalPaid)}
              icon={Wallet}
            />
            <CompactAccountKpi
              title="Credit left"
              value={
                Number(filteredCollections[0]?.creditLimit || filteredCollections[0]?.credit_limit || 0) > 0
                  ? formatMoney(
                      Math.max(
                        0,
                        Number(filteredCollections[0]?.creditLimit || filteredCollections[0]?.credit_limit || 0) -
                          Number(filteredCollections[0]?.outstandingAmount || 0)
                      )
                    )
                  : "—"
              }
              icon={ShieldAlert}
            />
          </div>
        ) : (
          <KpiCardGrid columns={4}>
            <KpiCard
              title="Outstanding balance"
              value={formatMoney(summary.totalOutstanding)}
              icon={IndianRupee}
            />
            <KpiCard
              title="Overdue labs"
              value={Number(summary.overdueCount || 0).toLocaleString("en-IN")}
              icon={AlertTriangle}
            />
            <KpiCard
              title="High risk"
              value={Number(summary.highRiskCount || 0).toLocaleString("en-IN")}
              icon={ShieldAlert}
            />
            <KpiCard
              title="Today's collections"
              value={formatMoney(summary.todayCollections)}
              icon={Wallet}
            />
          </KpiCardGrid>
        )}
      </div>

      {!isLabAccount ? (
        <div className="sticky top-0 z-20 -mx-1 border-b border-border bg-background/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/90">
          <div className="space-y-2 rounded-lg border border-border bg-card p-2 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-700">Receivables</div>
              <div className="text-[11px] text-muted-foreground">
                {filteredCollections.length} of {collections.length} shown
              </div>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search lab, agent, area…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 rounded-lg pl-8 text-sm"
                aria-label="Search collections"
              />
            </div>
          </div>
        </div>
      ) : null}

      {filteredCollections.length === 0 ? (
        <EmptyState
          title={isLabAccount ? "No account records" : "No collection records"}
          description={
            collections.length === 0
              ? isLabAccount
                ? "Your lab payment and outstanding details will appear here when available."
                : "Receivables will appear here when labs have outstanding balances."
              : "Try a different search term."
          }
        />
      ) : (
        <div className={cn("space-y-2", isLabAccount ? "mx-auto max-w-2xl" : "")} role="list">
          {filteredCollections.map((item) => {
            const key = labIdKey(item.labId);
            const isExpanded = expandedLabId === key;
            if (isLabAccount) {
              return (
                <LabAccountTimeline
                  key={key}
                  item={item}
                  history={isExpanded ? history : []}
                  detailsLoading={isExpanded && detailsLoading}
                  copy={accountLabels}
                  collectionDetails={
                    isExpanded && labIdKey(selectedCollection?.labId) === key
                      ? selectedCollection
                      : item
                  }
                  onWorkspaceAction={handleLabWorkspaceAction}
                />
              );
            }
            return (
              <CollectionListItem
                key={key}
                item={item}
                expanded={isExpanded}
                onToggleExpand={() => toggleExpand(item.labId)}
                selectedCollection={
                  isExpanded && labIdKey(selectedCollection?.labId) === key
                    ? selectedCollection
                    : isExpanded
                      ? item
                      : null
                }
                history={isExpanded ? history : []}
                detailsLoading={isExpanded && detailsLoading}
                formProps={formProps}
                pendingTaskContext={pendingTaskContext}
                onSave={handleSaveCollection}
                onCompleteTask={handleCompleteLinkedTask}
                readOnly={false}
                copy={accountLabels}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
