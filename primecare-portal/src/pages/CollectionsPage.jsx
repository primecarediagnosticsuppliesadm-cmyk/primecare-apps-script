import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  peekCollectionsReadCache,
  getLabRecentOrdersRead,
  updateCollectionNotesWrite,
  deriveCollectionPaymentStatus,
} from "@/api/primecareSupabaseApi";
import { selectOpenOrdersForLab } from "@/collections/collectionsOpenOrders.js";
import { loadLabPaymentHistoryForDisplay } from "@/collections/collectionsPaymentHistory.js";
import LabCollectionPanel from "@/components/collections/LabCollectionPanel.jsx";
import HqObjectLink from "@/components/hq/HqObjectLink.jsx";
import HqCreditRiskCommandCenter from "@/components/hq/HqCreditRiskCommandCenter.jsx";
import { consumeHqNavContext } from "@/operations/hqGlobalSearchEngine.js";
import { navigateToLabs } from "@/operations/hqWorkflowNav.js";
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
  DataFreshnessLabel,
  PageHeader,
  DataFetchError,
} from "@/components/ux";
import {
  collectionRiskToVariant,
  paymentStatusToVariant,
} from "@/utils/statusTokens";
import { cn } from "@/lib/utils";
import { labIdKey } from "@/utils/labId.js";
import { getInvoicesForLabRead } from "@/api/invoiceSupabaseApi.js";
import { downloadInvoicePdf } from "@/utils/invoiceDownload.js";
import InvoiceDetailsDrawer from "@/components/invoice/InvoiceDetailsDrawer.jsx";
import InvoiceAllocationsDrawer from "@/components/invoice/InvoiceAllocationsDrawer.jsx";
import {
  AGENT_TASK_COMPLETION_ENABLED,
  ALLOW_LEGACY_APPS_SCRIPT,
} from "@/config/environment";
import { ROLES } from "@/config/roles";
import { getAgentActiveLabOwnershipRowsRead } from "@/api/labOwnershipApi.js";
import { filterCollectionsForUser } from "@/utils/accessFilters.js";
import { notifyAgentWorkspaceRefresh } from "@/pages/agentVisitContext.js";
import { startVisitFromWorkspaceItem } from "@/pages/agentVisitContext.js";
import {
  countMediumHighRisk,
  computeCollectionProgressPct,
  deriveCollectionRecommendedAction,
  formatAgentShortDate,
  formatLastVisitRelative,
  hasDisplayValue,
} from "@/pages/agentUxPresentation.js";
import EvidenceUploadField, {
  EvidenceUploadProgress,
} from "@/components/evidence/EvidenceUploadField.jsx";
import EvidenceContextActions from "@/components/evidence/EvidenceContextActions.jsx";
import { uploadOperationalEvidence, listOperationalEvidence } from "@/api/operationalEvidenceApi.js";
import {
  filterPaymentEvidence,
  formatPaymentProofHistoryNote,
} from "@/utils/operationalEvidenceUi.js";

function str(v) {
  return String(v ?? "").trim();
}
import { summarizeCollectionsList } from "@/metrics/computeReceivableMetrics.js";
import {
  filterRowsByTenant,
  rowTenantId,
} from "@/distributor/distributorOsEngine.js";
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
  CircleDollarSign,
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
  Building2,
  CalendarClock,
} from "lucide-react";
import AgentCollectionPaymentDrawer from "@/components/agent/AgentCollectionPaymentDrawer.jsx";
import { AgentRouteStopBadge } from "@/components/agent/AgentOsSections.jsx";
import { AgentLabFieldStrip } from "@/components/agent/AgentFieldExecution.jsx";
import { useAgentDailyOs } from "@/hooks/useAgentDailyOs.js";
import { sortByAgentRouteOrder } from "@/pages/agentOsModel.js";
import { readPageUiCache, writePageUiCache } from "@/utils/hqPageUiCache.js";

function buildCollectionsViewFromPayload(
  payload,
  currentUser,
  distributorScope,
  isLabAccount,
  ownershipRows = []
) {
  const allRows = Array.isArray(payload?.collections) ? payload.collections : [];
  let rows = filterCollectionsForUser(allRows, currentUser, ownershipRows);
  if (distributorScope?.tenantId) {
    rows = filterRowsByTenant(rows, distributorScope.tenantId, { tenantKey: rowTenantId });
  } else if (
    !isLabAccount &&
    (currentUser?.role === ROLES.EXECUTIVE || currentUser?.role === ROLES.ADMIN)
  ) {
    const homeId = str(currentUser?.tenantId || currentUser?.tenant_id);
    if (homeId) {
      rows = filterRowsByTenant(rows, homeId, { tenantKey: rowTenantId });
    }
  }
  const summaryFromApi = payload?.summary || {};
  const useFilteredSummary =
    isLabAccount ||
    distributorScope?.tenantId ||
    currentUser?.role === ROLES.AGENT;
  const scopedSummary = useFilteredSummary
    ? summarizeCollectionsList(rows, Number(summaryFromApi.todayCollections ?? 0))
    : {
        totalOutstanding: Number(summaryFromApi.totalOutstanding ?? 0),
        overdueCount: Number(summaryFromApi.overdueCount ?? 0),
        highRiskCount: Number(summaryFromApi.highRiskCount ?? 0),
        todayCollections: Number(summaryFromApi.todayCollections ?? 0),
      };
  return {
    collections: rows,
    summary: {
      totalOutstanding: Number(scopedSummary.totalOutstanding ?? 0),
      overdueCount: Number(scopedSummary.overdueCount ?? 0),
      highRiskCount: Number(scopedSummary.highRiskCount ?? 0),
      todayCollections: Number(scopedSummary.todayCollections ?? 0),
    },
  };
}

function hydrateCollectionsFromCache(currentUser, distributorScope, isLabAccount) {
  const cacheKey = `collections:${String(currentUser?.role || "")}:${String(distributorScope?.tenantId || currentUser?.tenantId || "")}:${isLabAccount ? "lab" : "hq"}`;
  const ui = readPageUiCache(cacheKey);
  if (ui?.collections?.length) {
    return { cacheKey, collections: ui.collections, summary: ui.summary };
  }
  const peeked = peekCollectionsReadCache();
  if (!peeked?.data) return null;
  const built = buildCollectionsViewFromPayload(peeked.data, currentUser, distributorScope, isLabAccount);
  if (!built.collections.length) return null;
  return { cacheKey, ...built };
}

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
  return deriveCollectionPaymentStatus({
    outstandingAmount: item?.outstandingAmount,
    totalPaid: item?.totalPaid,
    totalDelivered: item?.totalDelivered,
  });
}

function shouldShowPaidLabel(item) {
  return Number(item?.totalPaid || 0) > 0;
}

function deriveLastPaymentDateFromHistory(history) {
  for (const entry of history || []) {
    const date = str(entry.paymentDate ?? entry.payment_date ?? "");
    if (date) return date.slice(0, 10);
  }
  return "";
}

/** Ignore boolean/string falsey credit-hold flags (avoids rendering a "false" badge). */
function creditHoldBadgeText(creditHold) {
  if (creditHold == null || creditHold === false) return "";
  const raw = String(creditHold).trim();
  if (!raw || raw.toLowerCase() === "false" || raw === "0" || raw.toLowerCase() === "no") {
    return "";
  }
  if (raw.toLowerCase() === "hold" || raw.toLowerCase() === "true") return "Credit hold";
  return raw;
}

function isAgentCollectionsView(currentUser, isLabAccount) {
  return !isLabAccount && String(currentUser?.role || "").toLowerCase() === ROLES.AGENT;
}

function isHqCreditRiskView(currentUser, isLabAccount, isAgentView) {
  if (isLabAccount || isAgentView) return false;
  const role = String(currentUser?.role || "").toLowerCase();
  return role === ROLES.ADMIN || role === ROLES.EXECUTIVE;
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

function localDateYmd(d = new Date()) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
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
  setActivePage,
  onRecordInvoicePayment,
  tenantId,
}) {
  const { showToast } = usePortalToast();
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
  const [invoiceDrawer, setInvoiceDrawer] = useState(null);
  const [allocationsDrawer, setAllocationsDrawer] = useState(null);
  const [activeFinanceTab, setActiveFinanceTab] = useState("activity");
  const [serverInvoices, setServerInvoices] = useState([]);
  const [invoiceDownloadKey, setInvoiceDownloadKey] = useState("");
  const labId = item?.labId || item?.lab_id || "";

  const handleWorkspaceAction = useCallback(
    (action) => {
      const storageKey = labIdKey(labId) ? `lab-ordering-handoff:${labIdKey(labId)}` : "";
      if (action === "view_orders") {
        setActivePage?.("labOrders");
        return;
      }
      if (action === "download_statement") {
        setActiveFinanceTab("statements");
        return;
      }
      if (action === "repeat_last_order") {
        if (storageKey) {
          try {
            window.localStorage.setItem(
              storageKey,
              JSON.stringify({
                message: "Open Previous Orders to repeat your latest order.",
                openOrdersTab: true,
              })
            );
          } catch {
            // ignore storage failures
          }
        }
        setActivePage?.("labOrders");
        return;
      }
      if (action === "contact_support") {
        setActivePage?.("notifications");
        showToast("success", "Activity Center opened — track orders and payment updates here.");
      }
    },
    [labId, setActivePage, showToast]
  );

  useEffect(() => {
    let cancelled = false;
    if (!labId) return undefined;
    void getInvoicesForLabRead(labId, { tenantId }).then((res) => {
      if (!cancelled && res.success) {
        setServerInvoices(res.rows || []);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [labId, tenantId]);

  const invoices = useMemo(() => {
    if (serverInvoices.length) {
      return serverInvoices.map((inv) => ({
        invoiceId: inv.invoiceNumber || inv.id,
        invoiceDbId: inv.id,
        orderId: inv.orderId,
        amount: inv.totalAmount,
        subtotal: inv.subtotal,
        taxAmount: inv.taxAmount,
        totalAmount: inv.totalAmount,
        allocatedAmount: inv.allocatedAmount,
        openBalance: inv.openBalance,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        status: inv.displayStatus || inv.status,
        rawStatus: inv.status,
        hasPdf: inv.hasPdf,
        labId: inv.labId,
      }));
    }
    return buildInvoiceRows(collectionDetails || item, history);
  }, [serverInvoices, collectionDetails, item, history]);
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

  async function handleInvoiceDownload(invoice) {
    const key = invoice?.invoiceDbId || invoice?.orderId || invoice?.invoiceId || "invoice";
    setInvoiceDownloadKey(key);
    try {
      await downloadInvoicePdf({
        invoiceId: invoice?.invoiceDbId,
        orderId: invoice?.orderId,
        tenantId,
        onPhase: (phase, detail) => {
          if (phase === "error") {
            showToast("error", detail || "Unable to download invoice PDF.");
          }
          if (phase === "success") {
            showToast("success", "Invoice download started.");
          }
        },
      });
    } finally {
      setInvoiceDownloadKey("");
    }
  }

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
              <div className="hidden text-[10px] font-medium uppercase tracking-wide text-slate-500 xl:grid xl:grid-cols-[1fr_0.9fr_0.8fr_0.8fr_0.8fr_0.7fr_1.2fr] xl:gap-2 xl:px-2 xl:py-1">
                <span>Invoice</span>
                <span>Order</span>
                <span>Total</span>
                <span>Allocated</span>
                <span>Open</span>
                <span>Status</span>
                <span>Actions</span>
              </div>
              <div className="space-y-1">
                {topInvoices.map((invoice, idx) => {
                  const id = `${invoice.invoiceId}-${idx}`;
                  const total = Number(invoice.totalAmount ?? invoice.amount ?? 0);
                  const allocated = Number(invoice.allocatedAmount ?? 0);
                  const openBalance = Number(
                    invoice.openBalance ?? Math.max(0, total - allocated)
                  );
                  return (
                    <div
                      key={id}
                      className="rounded-md border border-border/70 px-2 py-1.5 transition hover:border-slate-300"
                    >
                      <div className="hidden items-center gap-1 xl:grid xl:grid-cols-[1fr_0.9fr_0.8fr_0.8fr_0.8fr_0.7fr_1.2fr] xl:gap-2">
                        <div className="min-w-0 text-[11px] font-semibold text-slate-900">{invoice.invoiceId}</div>
                        <div className="min-w-0 text-[10px] text-slate-600">{invoice.orderId || "—"}</div>
                        <div className="text-[11px] font-semibold tabular-nums text-slate-900">{formatMoney(total)}</div>
                        <div className="text-[10px] tabular-nums text-emerald-700">{formatMoney(allocated)}</div>
                        <div className="text-[10px] tabular-nums text-amber-700">{formatMoney(openBalance)}</div>
                        <div className="text-[10px]">
                          <span
                            className={cn(
                              "rounded px-1 py-0.5",
                              invoice.status === "paid" || invoice.status === "Paid"
                                ? "bg-emerald-50 text-emerald-700"
                                : invoice.status === "overdue"
                                  ? "bg-red-50 text-red-700"
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
                            onClick={() => setInvoiceDrawer(invoice)}
                          >
                            View Invoice
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 px-1.5 text-[10px]"
                            onClick={() => setAllocationsDrawer(invoice)}
                          >
                            Allocations
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 px-1.5 text-[10px]"
                            disabled={!invoice.orderId || openBalance <= 0}
                            onClick={() =>
                              onRecordInvoicePayment?.({
                                ...invoice,
                                labId,
                              })
                            }
                          >
                            Record Payment
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 px-1.5 text-[10px]"
                            disabled={invoiceDownloadKey === (invoice.invoiceDbId || invoice.orderId || id)}
                            onClick={() => void handleInvoiceDownload(invoice)}
                          >
                            {invoiceDownloadKey === (invoice.invoiceDbId || invoice.orderId || id) ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              "Download"
                            )}
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2 xl:hidden">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">{invoice.invoiceId}</p>
                            <p className="text-xs text-slate-600">Order {invoice.orderId || "—"}</p>
                          </div>
                          <span
                            className={cn(
                              "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                              invoice.status === "paid" || invoice.status === "Paid"
                                ? "bg-emerald-50 text-emerald-700"
                                : invoice.status === "overdue"
                                  ? "bg-red-50 text-red-700"
                                  : "bg-amber-50 text-amber-700"
                            )}
                          >
                            {invoice.status}
                          </span>
                        </div>
                        <dl className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <dt className="text-muted-foreground">Total</dt>
                            <dd className="font-semibold tabular-nums">{formatMoney(total)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Allocated</dt>
                            <dd className="font-semibold tabular-nums text-emerald-700">{formatMoney(allocated)}</dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Open</dt>
                            <dd className="font-semibold tabular-nums text-amber-700">{formatMoney(openBalance)}</dd>
                          </div>
                        </dl>
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-9 rounded-lg text-xs"
                            onClick={() => setInvoiceDrawer(invoice)}
                          >
                            View Invoice
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-9 rounded-lg text-xs"
                            onClick={() => setAllocationsDrawer(invoice)}
                          >
                            Allocations
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-9 rounded-lg text-xs"
                            disabled={!invoice.orderId || openBalance <= 0}
                            onClick={() =>
                              onRecordInvoicePayment?.({
                                ...invoice,
                                labId,
                              })
                            }
                          >
                            Record Payment
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-9 rounded-lg text-xs"
                            disabled={invoiceDownloadKey === (invoice.invoiceDbId || invoice.orderId || id)}
                            onClick={() => void handleInvoiceDownload(invoice)}
                          >
                            {invoiceDownloadKey === (invoice.invoiceDbId || invoice.orderId || id) ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              "Download"
                            )}
                          </Button>
                        </div>
                      </div>
                      {expandedInvoiceId === id ? (
                        <div className="mt-1.5 rounded border border-dashed border-border px-2 py-1 text-[10px] text-slate-600">
                          <div>Order {invoice.orderId || "—"} <ArrowRight className="mx-0.5 inline h-2.5 w-2.5" /> {invoice.invoiceId}</div>
                          <div>
                            Allocated {formatMoney(allocated)} · Open {formatMoney(openBalance)} · Due{" "}
                            {formatShortDate(invoice.dueDate)} · {invoice.status}
                          </div>
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
            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => handleWorkspaceAction("view_orders")}>
              <FileText className="mr-1 h-3 w-3" />
              Orders
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => handleWorkspaceAction("download_statement")}>
              <Download className="mr-1 h-3 w-3" />
              Statements
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => handleWorkspaceAction("repeat_last_order")}>
              Repeat
            </Button>
            <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => handleWorkspaceAction("contact_support")}>
              <LifeBuoy className="mr-1 h-3 w-3" />
              Support
            </Button>
          </div>
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

      <InvoiceAllocationsDrawer
        open={Boolean(allocationsDrawer)}
        onClose={() => setAllocationsDrawer(null)}
        invoiceId={allocationsDrawer?.invoiceDbId}
        invoiceNumber={allocationsDrawer?.invoiceId}
        totalAmount={allocationsDrawer?.totalAmount ?? allocationsDrawer?.amount}
        allocatedAmount={allocationsDrawer?.allocatedAmount}
        openBalance={allocationsDrawer?.openBalance}
      />
      <InvoiceDetailsDrawer
        open={Boolean(invoiceDrawer)}
        onClose={() => setInvoiceDrawer(null)}
        invoiceId={invoiceDrawer?.invoiceDbId}
        orderId={invoiceDrawer?.orderId}
        tenantId={tenantId}
        invoicePreview={
          invoiceDrawer
            ? {
                id: invoiceDrawer.invoiceDbId,
                invoiceNumber: invoiceDrawer.invoiceId,
                orderId: invoiceDrawer.orderId,
                labId: invoiceDrawer.labId || labId,
                invoiceDate: invoiceDrawer.invoiceDate,
                dueDate: invoiceDrawer.dueDate,
                subtotal: invoiceDrawer.subtotal ?? invoiceDrawer.amount,
                taxAmount: invoiceDrawer.taxAmount,
                totalAmount: invoiceDrawer.totalAmount ?? invoiceDrawer.amount,
                status: invoiceDrawer.rawStatus || invoiceDrawer.status,
                displayStatus: invoiceDrawer.status,
                hasPdf: invoiceDrawer.hasPdf,
              }
            : null
        }
        onDownloadPhase={(phase, detail) => {
          if (phase === "error") showToast("error", detail || "Unable to download invoice PDF.");
          if (phase === "success") showToast("success", "Invoice download started.");
        }}
      />
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

function CollectionStatusBadges({ item, paymentLabel, creditHoldLabel }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <StatusBadge variant={collectionRiskToVariant(item.riskStatus)} compact>
        {item.riskStatus || "Low"}
      </StatusBadge>
      <StatusBadge variant={paymentStatusToVariant(paymentLabel)} compact>
        {paymentLabel}
      </StatusBadge>
      {creditHoldLabel ? (
        <StatusBadge variant="danger" compact>
          {creditHoldLabel}
        </StatusBadge>
      ) : null}
    </div>
  );
}

function AgentCollectionWorkQueueRow({
  item,
  routeStopNumber,
  recentVisits = [],
  assignedLabs = [],
  onRecordPayment,
  onOpenLab,
  onScheduleFollowUp,
}) {
  const outstanding = Number(item.outstandingAmount || 0);
  const totalPaid = Number(item.totalPaid || 0);
  const creditHoldLabel = creditHoldBadgeText(item.creditHold);
  const recommended = deriveCollectionRecommendedAction(item);
  const progressPct = computeCollectionProgressPct(outstanding, totalPaid);

  return (
    <article className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            {routeStopNumber ? <AgentRouteStopBadge stopNumber={routeStopNumber} compact /> : null}
          </div>
          <h3 className="truncate text-base font-bold text-slate-900">
            {item.labName || item.labId}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {creditHoldLabel ? (
              <StatusBadge variant="danger" compact>
                {creditHoldLabel}
              </StatusBadge>
            ) : null}
          </div>
        </div>
      </div>

      {outstanding > 0 ? (
        <AgentLabFieldStrip
          lab={item}
          recentVisits={recentVisits}
          assignedLabs={assignedLabs}
          outstanding={outstanding}
          className="mt-3"
        />
      ) : (
        <AgentLabFieldStrip
          lab={item}
          recentVisits={recentVisits}
          assignedLabs={assignedLabs}
          showTargetCompare={false}
          className="mt-3"
        />
      )}

      {totalPaid > 0 || progressPct > 0 ? (
        <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
          {totalPaid > 0 ? (
            <span>
              <span className="text-muted-foreground">Collected so far </span>
              <span className="font-semibold tabular-nums">{formatMoney(totalPaid)}</span>
            </span>
          ) : null}
          {progressPct > 0 ? (
            <span>
              <span className="text-muted-foreground">Progress </span>
              <span className="font-semibold tabular-nums">{progressPct}%</span>
            </span>
          ) : null}
        </div>
      ) : null}

      {progressPct > 0 ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-[var(--pc-brand-primary)]"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      ) : null}

      <div className="mt-2 rounded-md bg-muted/40 px-2 py-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Guidance
        </p>
        <p className="text-xs font-semibold text-foreground">{recommended}</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/60 pt-2.5">
        <Button
          type="button"
          size="sm"
          className="h-9 rounded-lg px-3 text-xs font-semibold"
          onClick={onRecordPayment}
        >
          <IndianRupee className="mr-1 h-3.5 w-3.5" />
          Record Payment
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 rounded-lg px-2.5 text-xs"
          onClick={onScheduleFollowUp}
        >
          <CalendarClock className="mr-1 h-3 w-3" />
          Schedule Follow-Up
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 rounded-lg px-2.5 text-xs"
          onClick={onOpenLab}
        >
          <Building2 className="mr-1 h-3 w-3" />
          Open Lab
        </Button>
      </div>
    </article>
  );
}

function AgentCollectionSummaryRow({
  item,
  expanded,
  onToggleExpand,
  onRecordPayment,
  onViewDetails,
  onAddFollowUp,
}) {
  const outstanding = Number(item.outstandingAmount || 0);
  const paymentLabel = displayPaymentStatus(item);
  const creditHoldLabel = creditHoldBadgeText(item.creditHold);
  const totalPaid = Number(item.totalPaid || 0);

  return (
    <div
      className={cn(
        "flex flex-col gap-2 px-3 py-2",
        expanded ? "bg-slate-50/80" : "bg-white"
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onToggleExpand}
          className="mt-0.5 shrink-0 rounded-md p-0.5 text-slate-500 hover:bg-slate-100"
          aria-expanded={expanded}
          aria-controls={`collection-detail-${labIdKey(item.labId)}`}
          aria-label={expanded ? "Collapse collection details" : "Expand collection details"}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">
                {item.labName || item.labId}
              </div>
              <div className="mt-1">
                <CollectionStatusBadges
                  item={item}
                  paymentLabel={paymentLabel}
                  creditHoldLabel={creditHoldLabel}
                />
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                Outstanding
              </div>
              <div className="text-lg font-bold tabular-nums text-slate-900">
                {formatMoney(outstanding)}
              </div>
              {totalPaid > 0 ? (
                <div className="text-[11px] tabular-nums text-slate-500">
                  Paid {formatMoney(totalPaid)}
                </div>
              ) : null}
            </div>
          </div>
          <p className="mt-1 text-[11px] font-medium text-[var(--pc-brand-primary)]">
            Assigned to you
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 pl-6">
        <Button
          type="button"
          size="sm"
          className="h-9 min-w-[8.5rem] flex-1 rounded-lg px-3 text-xs font-semibold sm:flex-none"
          onClick={onRecordPayment}
        >
          <IndianRupee className="mr-1.5 h-3.5 w-3.5" />
          Record Payment
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 rounded-lg px-3 text-xs"
          onClick={onViewDetails}
        >
          View Details
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-9 rounded-lg px-2 text-xs text-muted-foreground"
          onClick={onAddFollowUp}
        >
          Add Follow-up
        </Button>
      </div>
    </div>
  );
}

function CollectionSummaryRow({
  item,
  expanded,
  onToggleExpand,
  readOnly = false,
  copy,
  isAgentView = false,
  onRecordPayment,
  onViewDetails,
  onAddFollowUp,
  onOpenLab,
  lastPaymentDate = "",
}) {
  if (isAgentView) {
    return (
      <AgentCollectionSummaryRow
        item={item}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
        onRecordPayment={onRecordPayment}
        onViewDetails={onViewDetails}
        onAddFollowUp={onAddFollowUp}
      />
    );
  }

  const labels = copy || {
    expandDetails: "Expand collection details",
    collapseDetails: "Collapse collection details",
    viewHistory: "View payment history",
    recordPayment: "Record payment / notes",
  };
  const outstanding = Number(item.outstandingAmount || 0);
  const totalPaid = Number(item.totalPaid || 0);
  const overdueDays = Number(item.overdueDays || 0);
  const agent = displayAgentName(item.assignedAgent);
  const paymentLabel = displayPaymentStatus(item);
  const lastFollowUp = item.lastFollowUp || item.nextFollowUp;
  const creditHoldLabel = creditHoldBadgeText(item.creditHold);
  const lastPaymentLabel = lastPaymentDate ? formatShortDate(lastPaymentDate) : "—";

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
              {onOpenLab ? (
                <HqObjectLink onClick={() => onOpenLab(item.labId)} title="Review lab">
                  {item.labName || item.labId}
                </HqObjectLink>
              ) : (
                item.labName || item.labId
              )}
            </span>
            {item.area ? (
              <span className="text-[11px] text-slate-400">{item.area}</span>
            ) : null}
          </div>
          <div className="mt-1">
            <CollectionStatusBadges
              item={item}
              paymentLabel={paymentLabel}
              creditHoldLabel={creditHoldLabel}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-lg border border-border/60 bg-muted/25 px-2.5 py-2 sm:ml-8">
        <SummaryMetric label="Outstanding">
          <span className="font-semibold tabular-nums">{formatMoney(outstanding)}</span>
        </SummaryMetric>
        <SummaryMetric label="Total paid">
          <span className="font-semibold tabular-nums">{formatMoney(totalPaid)}</span>
        </SummaryMetric>
        <SummaryMetric label="Last payment">{lastPaymentLabel}</SummaryMetric>
      </div>

      <div className={cn("grid gap-x-3 gap-y-2 sm:ml-8", readOnly ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-4")}>
        <SummaryMetric label="Overdue days">
          {overdueDays > 0 ? <span className="text-[var(--pc-danger)]">{overdueDays}d</span> : "—"}
        </SummaryMetric>
        {readOnly ? (
          <>
            <SummaryMetric label="Status">{paymentLabel}</SummaryMetric>
          </>
        ) : (
          <>
            <SummaryMetric label="Last follow-up">{formatShortDate(lastFollowUp)}</SummaryMetric>
            <SummaryMetric label="Next follow-up">{formatShortDate(item.nextFollowUp)}</SummaryMetric>
            <SummaryMetric label="Agent">{agent || "—"}</SummaryMetric>
          </>
        )}
      </div>

      {!readOnly ? (
        <div className="flex flex-wrap gap-1.5 sm:ml-8">
          <Button
            type="button"
            size="sm"
            className="h-9 min-w-[8.5rem] rounded-lg px-3 text-xs font-semibold"
            onClick={onRecordPayment}
          >
            <IndianRupee className="mr-1.5 h-3.5 w-3.5" />
            Record Payment
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 rounded-lg px-3 text-xs"
            onClick={onViewDetails}
          >
            View Details
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-9 rounded-lg px-2 text-xs text-muted-foreground"
            onClick={onAddFollowUp}
          >
            Add Follow-up
          </Button>
        </div>
      ) : null}

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
  focusSection = "",
  isAgentView = false,
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
          <section
            className={cn(
              "space-y-3 rounded-lg border border-border bg-card p-3",
              focusSection === "payment" && "ring-2 ring-[var(--pc-brand-primary)]/25"
            )}
          >
            <h3 className="text-xs font-semibold text-slate-700">
              {isAgentView ? "Record payment" : "Record payment & follow-up"}
            </h3>

            <div className="space-y-2">
              <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Amount collected
              </label>
              <Input
                id={`collection-amount-${labIdKey(collection.labId)}`}
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

            <div
              className={cn(
                "grid gap-3 sm:grid-cols-2",
                focusSection === "followup" && "rounded-lg ring-2 ring-[var(--pc-brand-primary)]/25"
              )}
            >
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
                ) : null
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
                const proofRows = filterPaymentEvidence(collectionEvidence, paymentId);
                const proofNote = formatPaymentProofHistoryNote(proofRows);
                return (
                  <li
                    key={paymentId || `${item.paymentDate}-${item.amountCollected}`}
                    className="rounded-lg border border-border bg-card p-3 text-sm"
                  >
                    <div className="font-medium tabular-nums">
                      {formatMoney(item.amountCollected)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[item.paymentDate, item.paymentMode].filter(Boolean).join(" · ") ||
                        "Payment recorded"}
                      {proofNote ? ` · ${proofNote}` : ""}
                    </div>
                    <p className="mt-1 text-slate-600">{item.note || "No note"}</p>
                    {currentUser && proofRows.length ? (
                      <div className="mt-2">
                        <EvidenceContextActions
                          currentUser={currentUser}
                          labId={collection?.labId}
                          paymentId={paymentId}
                          scope="payment"
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
  isAgentView = false,
  onRecordPayment,
  onViewDetails,
  onAddFollowUp,
  onOpenLab,
  onScheduleFollowUp,
  focusSection = "",
  routeStopNumber,
  recentVisits = [],
  assignedLabs = [],
  lastPaymentDate = "",
  openOrders = [],
  ordersLoading = false,
  paymentStatusLabel = "Pending",
  useTabbedPanel = false,
}) {
  if (isAgentView) {
    return (
      <AgentCollectionWorkQueueRow
        item={item}
        routeStopNumber={routeStopNumber}
        recentVisits={recentVisits}
        assignedLabs={assignedLabs}
        onRecordPayment={onRecordPayment}
        onOpenLab={onOpenLab}
        onScheduleFollowUp={onScheduleFollowUp}
      />
    );
  }

  return (
    <Card className="overflow-hidden rounded-lg border-border shadow-sm">
      <CollectionSummaryRow
        item={item}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
        readOnly={readOnly}
        copy={copy}
        isAgentView={isAgentView}
        onRecordPayment={onRecordPayment}
        onViewDetails={onViewDetails}
        onAddFollowUp={onAddFollowUp}
        onOpenLab={onOpenLab}
        lastPaymentDate={
          expanded
            ? deriveLastPaymentDateFromHistory(history) || lastPaymentDate
            : lastPaymentDate
        }
      />
      {expanded ? (
        useTabbedPanel ? (
          <LabCollectionPanel
            collection={selectedCollection}
            history={history}
            openOrders={openOrders}
            ordersLoading={ordersLoading}
            lastPaymentDate={lastPaymentDate}
            paymentStatusLabel={paymentStatusLabel}
            detailsLoading={detailsLoading}
            pendingTaskContext={pendingTaskContext}
            onSave={onSave}
            onCompleteTask={onCompleteTask}
            readOnly={readOnly}
            copy={copy}
            focusSection={focusSection}
            {...formProps}
          />
        ) : (
          <CollectionExpandedPanel
            collection={selectedCollection}
            history={history}
            detailsLoading={detailsLoading}
            pendingTaskContext={pendingTaskContext}
            onSave={onSave}
            onCompleteTask={onCompleteTask}
            readOnly={readOnly}
            copy={copy}
            focusSection={focusSection}
            isAgentView={isAgentView}
            {...formProps}
          />
        )
      ) : null}
    </Card>
  );
}

export default function CollectionsPage({
  currentUser,
  authToken,
  viewMode,
  distributorScope = null,
  embedded = false,
  setActivePage,
}) {
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

  const hydratedCollections = useMemo(
    () => hydrateCollectionsFromCache(currentUser, distributorScope, isLabAccount),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-time hydration only
    []
  );  const hadCacheOnMount = useRef(Boolean(hydratedCollections));
  const collectionsCacheKey =
    hydratedCollections?.cacheKey ||
    `collections:${String(currentUser?.role || "")}:${String(distributorScope?.tenantId || currentUser?.tenantId || "")}:${isLabAccount ? "lab" : "hq"}`;

  const [summary, setSummary] = useState(
    () =>
      hydratedCollections?.summary ?? {
        totalOutstanding: 0,
        overdueCount: 0,
        highRiskCount: 0,
        todayCollections: 0,
      }
  );

  const [collections, setCollections] = useState(() => hydratedCollections?.collections ?? []);
  const [expandedLabId, setExpandedLabId] = useState("");
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [history, setHistory] = useState([]);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(() => !hydratedCollections);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [dataLoadedAt, setDataLoadedAt] = useState(() => (hydratedCollections ? Date.now() : null));
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
  const [expandFocus, setExpandFocus] = useState("");
  const [paymentDrawerLabId, setPaymentDrawerLabId] = useState("");
  const [paymentOrderId, setPaymentOrderId] = useState("");
  const [lastPaymentByLabId, setLastPaymentByLabId] = useState({});
  const [labOrdersByLabId, setLabOrdersByLabId] = useState({});
  const [labOrdersLoadingByLabId, setLabOrdersLoadingByLabId] = useState({});
  const [hqFocusLabId, setHqFocusLabId] = useState("");
  const [hqCreditAttentionFilter, setHqCreditAttentionFilter] = useState("");

  const isAgentView = useMemo(
    () => isAgentCollectionsView(currentUser, isLabAccount),
    [currentUser, isLabAccount]
  );

  const isHqCreditRisk = useMemo(
    () => isHqCreditRiskView(currentUser, isLabAccount, isAgentView),
    [currentUser, isLabAccount, isAgentView]
  );

  const { orderByLabId, workspace: agentWorkspace } = useAgentDailyOs(currentUser, { enabled: isAgentView });

  const tenantId =
    distributorScope?.tenantId ||
    currentUser?.tenantId ||
    currentUser?.tenant_id ||
    "";
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

  const loadCollections = useCallback(async ({ silent = false } = {}) => {
    return predatorTrace("Collections", "page.load", async () => {
      try {
        const hasRows = collections.length > 0 || hadCacheOnMount.current;
        if (silent || hasRows) setListRefreshing(true);
        else setLoading(true);
        setLoadError("");

        logSupabaseFeatureSource("Collections.list", { api: "getCollectionsRead" });
        const [res, ownershipRes] = await Promise.all([
          getCollectionsRead({ force: silent }),
          currentUser?.role === ROLES.AGENT
            ? getAgentActiveLabOwnershipRowsRead()
            : Promise.resolve({ data: { rows: [] } }),
        ]);
        const payload = res?.data || {};
        const ownershipRows = Array.isArray(ownershipRes?.data?.rows)
          ? ownershipRes.data.rows
          : [];
        const built = buildCollectionsViewFromPayload(
          payload,
          currentUser,
          distributorScope,
          isLabAccount,
          ownershipRows
        );

        setSummary(built.summary);
        setCollections(built.collections);
        writePageUiCache(collectionsCacheKey, {
          collections: built.collections,
          summary: built.summary,
        });

        const rows = built.collections;
        if (
          !isLabAccount &&
          String(currentUser?.role || "").toLowerCase() !== ROLES.AGENT &&
          supabase &&
          rows.length
        ) {
          const paidLabs = rows.filter((row) => Number(row.totalPaid || 0) > 0);
          if (paidLabs.length) {
            void (async () => {
              const next = {};
              await Promise.all(
                paidLabs.map(async (row) => {
                  const hist = await getCollectionHistoryRead(row.labId);
                  const date = deriveLastPaymentDateFromHistory(hist?.data?.history);
                  if (date) next[labIdKey(row.labId)] = date;
                })
              );
              if (Object.keys(next).length) {
                setLastPaymentByLabId((prev) => ({ ...prev, ...next }));
              }
            })();
          }
        }
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
        if (!collections.length && !hadCacheOnMount.current) {
          setSummary({
            totalOutstanding: 0,
            overdueCount: 0,
            highRiskCount: 0,
            todayCollections: 0,
          });
          setCollections([]);
        }
      } finally {
        setLoading(false);
        setListRefreshing(false);
        setDataLoadedAt(Date.now());
      }
    });
  }, [currentUser, isLabAccount, distributorScope, collections.length, collectionsCacheKey]);

  useEffect(() => {
    void loadCollections({ silent: hadCacheOnMount.current });
  }, [loadCollections, authToken]);

  useEffect(() => {
    if (loading || isLabAccount) return;
    const ctx =
      consumeHqNavContext("risk") ||
      consumeHqNavContext("collections");
    if (!ctx) return;

    if (ctx.attentionFilter && isHqCreditRiskView(currentUser, isLabAccount, isAgentView)) {
      setHqCreditAttentionFilter(str(ctx.attentionFilter));
    }

    if (!ctx.labId) return;
    const targetId = labIdKey(ctx.labId);
    if (isHqCreditRiskView(currentUser, isLabAccount, isAgentView)) {
      setHqFocusLabId(targetId);
      window.setTimeout(() => {
        document.getElementById(`hq-credit-lab-${targetId}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 150);
      return;
    }
    if (!collections.length) return;
    void openCollectionPanel(ctx.labId, ctx.focusSection || "details");
  }, [loading, collections.length, isLabAccount, currentUser, isAgentView]);

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

      if (listMatch && !options?.suppressExpand) {
        setExpandedLabId(canonicalKey);
        setSelectedCollection(listMatch);
      } else if (!options?.suppressExpand) {
        setExpandedLabId(canonicalKey);
      }

      const params = authToken ? { sessionToken: authToken } : {};

      let historyRows = [];
      let sbDetail = null;
      let sbDetailOk = false;
      let sbHistoryOk = false;

      if (supabase) {
        logSupabaseFeatureSource("Collections.history", {
          api: "loadLabPaymentHistoryForDisplay",
        });
        historyRows = await loadLabPaymentHistoryForDisplay(supabase, canonicalLabId);
        sbHistoryOk = true;

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

      if (!options?.suppressExpand) {
        setExpandedLabId(canonicalKey);
      }
      setSelectedCollection(collection);
      setHistory(historyRows);

      if (supabase && !isLabAccount && !isAgentView) {
        setLabOrdersLoadingByLabId((prev) => ({ ...prev, [canonicalKey]: true }));
        try {
          logSupabaseFeatureSource("Collections.openOrders", { api: "getLabRecentOrdersRead" });
          const ordersRes = await getLabRecentOrdersRead(canonicalLabId);
          const openOrders = selectOpenOrdersForLab(ordersRes?.data?.orders || []);
          setLabOrdersByLabId((prev) => ({ ...prev, [canonicalKey]: openOrders }));
        } catch (orderErr) {
          console.warn("CollectionsPage openOrders:", orderErr);
          setLabOrdersByLabId((prev) => ({ ...prev, [canonicalKey]: [] }));
        } finally {
          setLabOrdersLoadingByLabId((prev) => ({ ...prev, [canonicalKey]: false }));
        }
      }

      setAmountCollected("");
      setPaymentMode("Cash");
      setNote(collection?.collectionsNotes || collection?.note || "");
      setNextFollowUp(collection?.nextFollowUp || "");
      setNextAction(
        options?.taskContext?.nextAction || collection?.nextAction || ""
      );
      setExpandFocus(options?.focusSection || "details");

      const latestPaymentDate = deriveLastPaymentDateFromHistory(historyRows);
      if (latestPaymentDate) {
        setLastPaymentByLabId((prev) => ({ ...prev, [canonicalKey]: latestPaymentDate }));
      }

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
    const selectedLabId = expandedLabId || paymentDrawerLabId;
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
          const linkedOrderId = resolvePaymentOrderIdForLab(selectedLabId);
          const sbRes = await createPaymentWrite({
            labId: labIdKey(selectedLabId),
            tenantId: tenantId || null,
            orderId: linkedOrderId,
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

            const paidLabKey = labIdKey(selectedLabId);
            const paidDate = localDateYmd(new Date());
            setLastPaymentByLabId((prev) => ({ ...prev, [paidLabKey]: paidDate }));
            setPaymentOrderId("");

            await loadCollections();
            if (isAgentView && paymentDrawerLabId) {
              setPaymentDrawerLabId("");
              setSelectedCollection(null);
              setHistory([]);
            } else {
              await openCollection(selectedLabId, {
                fromTask: !!pendingTaskContext,
                taskContext: pendingTaskContext,
              });
            }
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
    if (isAgentView && orderByLabId?.size) {
      return sortByAgentRouteOrder(filtered, orderByLabId, (row) => labIdKey(row.labId));
    }
    return [...filtered].sort(
      (a, b) => Number(b.outstandingAmount || 0) - Number(a.outstandingAmount || 0)
    );
  }, [collections, search, isLabAccount, isAgentView, orderByLabId]);

  const agentQueueSummary = useMemo(() => {
    if (!isAgentView) return null;
    const totalCollected = filteredCollections.reduce(
      (sum, row) => sum + Number(row.totalPaid || 0),
      0
    );
    return {
      totalOutstanding: summary.totalOutstanding,
      accountsDue: filteredCollections.length,
      mediumHighRisk: countMediumHighRisk(filteredCollections),
      totalCollected,
    };
  }, [isAgentView, filteredCollections, summary.totalOutstanding]);

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

  useEffect(() => {
    if (detailsLoading || !expandedLabId) return;
    requestAnimationFrame(() => {
      if (expandFocus === "payment") {
        document.getElementById(`collection-amount-${expandedLabId}`)?.focus();
      } else if (expandFocus === "followup") {
        document
          .getElementById(`collection-followup-date-${expandedLabId}`)
          ?.focus();
      }
    });
  }, [detailsLoading, expandFocus, expandedLabId]);

  async function toggleExpand(labId) {
    const key = labIdKey(labId);
    if (expandedLabId === key) {
      setExpandedLabId("");
      setSelectedCollection(null);
      setHistory([]);
      setExpandFocus("");
      return;
    }
    await openCollection(labId);
  }

  function resolvePaymentOrderIdForLab(labId) {
    const explicit = str(paymentOrderId);
    if (explicit) return explicit;
    const key = labIdKey(labId);
    const openOrders = labOrdersByLabId[key] || [];
    if (openOrders.length === 1) {
      return str(openOrders[0]?.orderId ?? openOrders[0]?.order_id) || null;
    }
    return null;
  }

  function handleRecordInvoicePayment(invoice) {
    const orderId = str(invoice?.orderId ?? invoice?.order_id);
    const openBalance = Number(invoice?.openBalance ?? invoice?.amount ?? 0);
    if (orderId) setPaymentOrderId(orderId);
    if (openBalance > 0) setAmountCollected(String(openBalance));
    const labId = str(invoice?.labId ?? invoice?.lab_id ?? selectedCollection?.labId);
    if (labId) openCollectionPanel(labId, "payment");
  }

  function openCollectionPanel(labId, focusSection = "details") {
    const key = labIdKey(labId);
    if (focusSection !== "payment") {
      setPaymentOrderId("");
    }
    if (isAgentView && focusSection === "payment") {
      setPaymentDrawerLabId(key);
      void openCollection(labId, { focusSection, suppressExpand: true });
      return;
    }
    if (expandedLabId === key) {
      setExpandFocus(focusSection);
      return;
    }
    void openCollection(labId, { focusSection });
  }

  function handleOpenLabReview(labId) {
    if (!setActivePage || !labId) return;
    navigateToLabs(setActivePage, { labId, openReviewDrawer: true });
  }

  function handleHqOpenCollections(labId) {
    const key = labIdKey(labId);
    setHqFocusLabId(key);
    window.setTimeout(() => {
      document.getElementById(`hq-credit-lab-${key}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 100);
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
    paymentOrderId,
    onPaymentOrderIdChange: setPaymentOrderId,
  };

  const handleScheduleFollowUp = useCallback(
    (item) => {
      startVisitFromWorkspaceItem(
        {
          labId: item.labId,
          labName: item.labName,
          nextAction: item.nextAction || "Schedule follow-up",
          outstanding: item.outstandingAmount,
          daysOverdue: item.overdueDays,
        },
        { visitType: "Follow-up", followUpType: "Call", source: "collections_work_queue" }
      );
      setActivePage?.("visits");
    },
    [setActivePage]
  );

  return (
    <div
      className={cn(
        "space-y-3 pb-6",
        isAgentView && !embedded && "mx-auto w-full max-w-[1360px]"
      )}
    >
      {!embedded ? (
        <PageHeader
          title={
            isLabAccount
              ? "Payments & Account"
              : isHqCreditRisk
                ? "Credit & Risk"
                : "Collections"
          }
          subtitle={
            distributorScope?.tenantId
              ? `Collections for ${distributorScope.tenantName || "selected distributor"} only.`
              : isLabAccount
                ? "Operational financial workspace for your lab: account health, invoices, and payment activity."
                : isAgentView
                  ? "Who to collect from, how much is owed, and what to do next."
                  : isHqCreditRisk
                    ? "Operational command center for collections, credit exposure, and intervention priorities."
                    : "PrimeCare HQ receivables — use Distributor OS for distributor tenants."
          }
          icon={Wallet}
          freshness={
            <DataFreshnessLabel
              loadedAt={dataLoadedAt}
              refreshing={loading || listRefreshing}
              className="mt-1 block"
            />
          }
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 rounded-lg"
              onClick={() => loadCollections()}
              disabled={loading || listRefreshing}
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", (loading || listRefreshing) && "animate-spin")} />
              Refresh
            </Button>
          }
        />
      ) : null}

      {loading && collections.length === 0 ? (
        <>
          <PageSkeleton kpiCount={4} kpiColumns={4} showList={false} />
          <div className="animate-pulse rounded-lg border border-border bg-card p-3 shadow-sm">
            <div className="mb-2 h-9 w-full rounded-lg bg-muted" />
            <ListSkeleton rows={6} />
          </div>
        </>
      ) : null}

      {!(loading && collections.length === 0) ? (
        <>
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
        <DataFetchError
          message={loadError}
          onRetry={() => loadCollections()}
          retrying={loading || listRefreshing}
          staleDataNote={
            collections.length > 0 ? "Showing the last account data loaded successfully." : ""
          }
        />
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
        ) : isAgentView ? (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            <CompactAccountKpi
              title="Outstanding"
              value={formatMoney(agentQueueSummary?.totalOutstanding ?? summary.totalOutstanding)}
              icon={IndianRupee}
            />
            <CompactAccountKpi
              title="Accounts due"
              value={String(agentQueueSummary?.accountsDue ?? filteredCollections.length)}
              icon={Wallet}
            />
            <CompactAccountKpi
              title="Med/high risk"
              value={String(agentQueueSummary?.mediumHighRisk ?? 0)}
              icon={ShieldAlert}
            />
            <CompactAccountKpi
              title="Total collected"
              value={formatMoney(agentQueueSummary?.totalCollected ?? 0)}
              icon={CircleDollarSign}
            />
          </div>
        ) : isHqCreditRisk ? null : (
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
              <div className="text-xs font-semibold text-slate-700">
                {isAgentView ? "Work queue" : isHqCreditRisk ? "Filter labs" : "Receivables"}
              </div>
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

      {isHqCreditRisk ? (
        <HqCreditRiskCommandCenter
          key={hqCreditAttentionFilter || "credit-default"}
          collections={collections}
          searchFiltered={filteredCollections}
          searchActive={Boolean(search.trim())}
          initialAttentionFilter={hqCreditAttentionFilter}
          summary={summary}
          lastPaymentByLabId={lastPaymentByLabId}
          focusLabId={hqFocusLabId}
          setActivePage={setActivePage}
          currentUser={currentUser}
          onReviewLab={handleOpenLabReview}
          onOpenCollections={handleHqOpenCollections}
        />
      ) : filteredCollections.length === 0 ? (
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
      ) : isLabAccount ? (
        <div className="mx-auto max-w-2xl space-y-2" role="list">
          {filteredCollections.map((item) => {
            const key = labIdKey(item.labId);
            const isExpanded = expandedLabId === key;
            return (
              <LabAccountTimeline
                key={key}
                item={item}
                history={isExpanded ? history : []}
                detailsLoading={isExpanded && detailsLoading}
                copy={accountLabels}
                tenantId={tenantId}
                collectionDetails={
                  isExpanded && labIdKey(selectedCollection?.labId) === key
                    ? selectedCollection
                    : item
                }
                setActivePage={setActivePage}
                onRecordInvoicePayment={handleRecordInvoicePayment}
              />
            );
          })}
        </div>
      ) : isAgentView ? (
        <div className="grid gap-3" role="list">
          {filteredCollections.map((item) => {
            const key = labIdKey(item.labId);
            return (
              <CollectionListItem
                key={key}
                item={item}
                expanded={false}
                onToggleExpand={() => {}}
                selectedCollection={null}
                history={[]}
                detailsLoading={false}
                formProps={formProps}
                pendingTaskContext={pendingTaskContext}
                onSave={handleSaveCollection}
                onCompleteTask={handleCompleteLinkedTask}
                readOnly={false}
                copy={accountLabels}
                isAgentView
                onRecordPayment={() => openCollectionPanel(item.labId, "payment")}
                onOpenLab={() => setActivePage?.("labs")}
                onScheduleFollowUp={() => handleScheduleFollowUp(item)}
                routeStopNumber={orderByLabId.get(labIdKey(item.labId))}
                recentVisits={agentWorkspace?.recentVisits}
                assignedLabs={agentWorkspace?.assignedLabs}
              />
            );
          })}
        </div>
      ) : (
        <div className="space-y-2" role="list">
          {filteredCollections.map((item) => {
            const key = labIdKey(item.labId);
            const isExpanded = expandedLabId === key;
            const rowLastPayment =
              (isExpanded ? deriveLastPaymentDateFromHistory(history) : "") ||
              lastPaymentByLabId[key] ||
              "";
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
                isAgentView={false}
                useTabbedPanel={false}
                focusSection={isExpanded ? expandFocus : ""}
                onRecordPayment={() => openCollectionPanel(item.labId, "payment")}
                onViewDetails={() => openCollectionPanel(item.labId, "details")}
                onAddFollowUp={() => openCollectionPanel(item.labId, "followup")}
                onOpenLab={isHqCreditRisk ? handleOpenLabReview : undefined}
                lastPaymentDate={rowLastPayment}
                openOrders={labOrdersByLabId[key] || []}
                ordersLoading={Boolean(labOrdersLoadingByLabId[key])}
                paymentStatusLabel={displayPaymentStatus(item)}
              />
            );
          })}
        </div>
      )}

      {isAgentView ? (
        <AgentCollectionPaymentDrawer
          open={Boolean(paymentDrawerLabId)}
          onClose={() => {
            setPaymentDrawerLabId("");
            setSelectedCollection(null);
            setHistory([]);
          }}
          labName={selectedCollection?.labName}
          loading={detailsLoading && Boolean(paymentDrawerLabId)}
        >
          {selectedCollection && labIdKey(selectedCollection.labId) === paymentDrawerLabId ? (
            <CollectionExpandedPanel
              collection={selectedCollection}
              history={history}
              detailsLoading={false}
              pendingTaskContext={pendingTaskContext}
              onSave={handleSaveCollection}
              onCompleteTask={handleCompleteLinkedTask}
              readOnly={false}
              copy={accountLabels}
              focusSection="payment"
              isAgentView
              {...formProps}
            />
          ) : null}
        </AgentCollectionPaymentDrawer>
      ) : null}
        </>
      ) : null}
    </div>
  );
}
