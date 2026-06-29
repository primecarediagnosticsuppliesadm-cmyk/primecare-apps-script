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
  invalidateOrdersReadCache,
  invalidateCollectionsReadCache,
} from "@/api/primecareSupabaseApi";
import { selectOpenOrdersForLab } from "@/collections/collectionsOpenOrders.js";
import { loadLabPaymentHistoryForDisplay } from "@/collections/collectionsPaymentHistory.js";
import LabCollectionPanel from "@/components/collections/LabCollectionPanel.jsx";
import HqObjectLink from "@/components/hq/HqObjectLink.jsx";
import HqCreditRiskCommandCenter from "@/components/hq/HqCreditRiskCommandCenter.jsx";
import { consumeHqNavContext } from "@/operations/hqGlobalSearchEngine.js";
import { navigateToLabs, navigateToLabInvoiceCenter } from "@/operations/hqWorkflowNav.js";
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
import { HQ_INVOICE_LIST_MAX_LIMIT } from "@/api/hqReadBounds.js";
import { buildLabAccountLedger } from "@/collections/labAccountLedger.js";
import {
  deriveAccountHealthStatus,
  deriveOpenInvoiceWidgetStatus,
  isCustomerFacingOpenInvoice,
  isInternalDraftInvoice,
  LAB_OPEN_INVOICE_SUMMARY_GRID,
} from "@/collections/invoiceAccountStatus.js";
import {
  buildLabAccountActivityTimeline,
} from "@/collections/labAccountActivity.js";
import InvoiceStatusBadge from "@/components/invoice/InvoiceStatusBadge.jsx";
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
import { notifyFinancialSyncRefresh } from "@/operations/financialSyncEvents.js";
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
  // Agent rows require lab_ownership; cached peek reads omit ownership and show empty.
  if (currentUser?.role === ROLES.AGENT) return null;

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
    totalAllocated: item?.totalAllocated,
    overdueDays: item?.overdueDays,
    creditHold: item?.creditHold ?? item?.credit_hold,
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

const LAB_DASHBOARD_CARD =
  "rounded-lg border border-border bg-card p-3 shadow-sm";

const LAB_OPEN_INVOICE_ACTION_BTN =
  "h-9 min-w-[3.25rem] px-2 text-[10px]";

function displayKpiValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  return value;
}

function CompactAccountKpi({ title, value, icon: Icon }) {
  return (
    <div className={cn(LAB_DASHBOARD_CARD, "flex h-[4.25rem] flex-col justify-between py-2.5")}>
      <div className="flex items-start justify-between gap-2">
        <div className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </div>
        {Icon ? (
          <div className="shrink-0 rounded-md bg-muted p-1.5">
            <Icon className="h-3.5 w-3.5 text-[var(--pc-brand-primary)]" />
          </div>
        ) : null}
      </div>
      <div className="truncate text-sm font-semibold leading-tight tabular-nums text-foreground">
        {displayKpiValue(value)}
      </div>
    </div>
  );
}

function AccountHealthMetric({ label, value, emphasize = false }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "truncate tabular-nums",
          emphasize ? "text-base font-bold text-foreground" : "text-sm font-semibold text-foreground"
        )}
      >
        {displayKpiValue(value)}
      </p>
    </div>
  );
}

function labTopCreditKpiDisplay({ labLedgerKpis, collectionRow }) {
  const creditLimit = Number(
    labLedgerKpis?.creditLimit ??
      collectionRow?.creditLimit ??
      collectionRow?.credit_limit ??
      collectionRow?.creditApproved ??
      0
  );
  const outstanding = Number(
    labLedgerKpis?.outstanding ?? collectionRow?.outstandingAmount ?? 0
  );
  if (creditLimit <= 0) {
    return { label: "Credit", value: "Not configured" };
  }
  return {
    label: "Available Credit",
    value: formatMoney(Math.max(0, creditLimit - outstanding)),
  };
}

function financialStatusSummary(item, invoices = []) {
  const totalAllocated = invoices.reduce(
    (sum, inv) => sum + Number(inv.allocatedAmount ?? 0),
    0
  );
  return deriveAccountHealthStatus({
    outstandingAmount: item?.outstandingAmount,
    totalPaid: Number(item?.totalPaid ?? 0),
    totalAllocated,
    overdueDays: item?.overdueDays,
    riskStatus: item?.riskStatus,
    creditHold: item?.creditHold ?? item?.credit_hold,
  });
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

function activityKindDotClass(kind) {
  if (kind === "payment") return "bg-emerald-500";
  if (kind === "pending") return "bg-amber-500";
  if (kind === "fulfillment") return "bg-violet-500";
  if (kind === "invoice") return "bg-sky-500";
  return "bg-blue-500";
}

function splitActivityMetaLines(subline, trailing) {
  const lines = [];
  const rawSubline = String(subline || "").trim();
  if (rawSubline) {
    const methodSplit = rawSubline.split(" · Method:");
    lines.push(methodSplit[0].trim());
    if (methodSplit[1]) lines.push(`Method: ${methodSplit[1].trim()}`);
  }
  const rawTrailing = String(trailing || "").trim();
  if (rawTrailing) {
    lines.push(rawTrailing.replace(/^Outstanding balance /i, "Outstanding "));
  }
  return lines;
}

function LabActivityTimelineEntry({ entry }) {
  const isPayment = entry.kind === "payment";
  const titleParts = isPayment ? String(entry.title || "").split(" — ") : [];
  const paymentTitle = titleParts[0] || entry.title;
  const paymentAmount = titleParts[1] || "";
  const metaLines =
    entry.subline || entry.trailing
      ? splitActivityMetaLines(entry.subline, entry.trailing)
      : entry.detail
        ? [entry.detail]
        : [];

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-slate-900">{paymentTitle}</p>
        {isPayment && paymentAmount ? (
          <p className="text-sm font-bold tabular-nums text-foreground">{paymentAmount}</p>
        ) : null}
        {metaLines.map((line) => (
          <p key={line} className="text-[10px] text-muted-foreground">
            {line}
          </p>
        ))}
      </div>
      <span className="shrink-0 pt-0.5 text-[10px] text-muted-foreground">
        {formatShortDate(entry.date)}
      </span>
    </div>
  );
}

function LabOpenInvoiceSummaryRow({
  invoice,
  rowId,
  invoiceDownloadKey,
  onView,
  onDownload,
  onSubmitAdvice,
}) {
  const openBalance = Number(invoice.openBalance ?? invoice.amount ?? 0);
  const downloadKey = invoice.invoiceDbId || invoice.orderId || rowId;
  const downloading = invoiceDownloadKey === downloadKey;

  return (
    <div className="rounded-md border border-border/70 px-2.5 py-2">
      <div className={cn("hidden sm:grid", LAB_OPEN_INVOICE_SUMMARY_GRID)}>
        <div className="min-w-0">
          <p className="truncate font-mono text-[11px] font-semibold text-slate-900" title={invoice.invoiceId}>
            {invoice.invoiceId}
          </p>
          <p className="text-[10px] text-muted-foreground">Due {formatShortDate(invoice.dueDate)}</p>
        </div>
        <p className="text-right text-base font-bold tabular-nums text-amber-700">{formatMoney(openBalance)}</p>
        <span className="justify-self-start">
          <InvoiceStatusBadge status={invoice.rawStatus || invoice.status} displayStatus={invoice.status} />
        </span>
        <div className="flex items-center justify-end gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={LAB_OPEN_INVOICE_ACTION_BTN}
            onClick={() => onView(invoice)}
          >
            View
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={LAB_OPEN_INVOICE_ACTION_BTN}
            disabled={downloading}
            onClick={() => void onDownload(invoice)}
          >
            {downloading ? <Loader2 className="h-3 w-3 animate-spin" /> : "PDF"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={LAB_OPEN_INVOICE_ACTION_BTN}
            disabled={openBalance <= 0}
            onClick={() => onSubmitAdvice?.(invoice)}
          >
            Advice
          </Button>
        </div>
      </div>
      <div className="space-y-2 sm:hidden">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-mono text-sm font-semibold">{invoice.invoiceId}</p>
            <p className="text-xs text-muted-foreground">Due {formatShortDate(invoice.dueDate)}</p>
          </div>
          <InvoiceStatusBadge status={invoice.rawStatus || invoice.status} displayStatus={invoice.status} />
        </div>
        <p className="text-lg font-bold tabular-nums text-amber-700">{formatMoney(openBalance)}</p>
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(LAB_OPEN_INVOICE_ACTION_BTN, "flex-1 sm:flex-none")}
            onClick={() => onView(invoice)}
          >
            View
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(LAB_OPEN_INVOICE_ACTION_BTN, "flex-1 sm:flex-none")}
            disabled={downloading}
            onClick={() => void onDownload(invoice)}
          >
            PDF
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(LAB_OPEN_INVOICE_ACTION_BTN, "flex-1 sm:flex-none")}
            disabled={openBalance <= 0}
            onClick={() => onSubmitAdvice?.(invoice)}
          >
            Advice
          </Button>
        </div>
      </div>
    </div>
  );
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
  detailsError,
  copy,
  collectionDetails,
  setActivePage,
  onSubmitPaymentAdvice,
  tenantId,
}) {
  const { showToast } = usePortalToast();
  const outstanding = Number(item.outstandingAmount || 0);
  const totalPaid = Number(item.totalPaid || 0);
  const overdueDays = Number(item.overdueDays || 0);
  const paymentLabel = displayPaymentStatus(item);
  const riskLabel = item.riskStatus || "Low";
  const dueDate = item.nextFollowUp || item.dueDate || "";
  const creditLimit = Number(
    item.creditLimit || item.credit_limit || item.creditApproved || item.credit_limit_amount || 0
  );
  const creditUsed = Math.max(0, outstanding);
  const utilizationPct = creditLimit > 0 ? Math.min(100, Math.round((creditUsed / creditLimit) * 100)) : null;
  const [invoiceDrawer, setInvoiceDrawer] = useState(null);
  const [allocationsDrawer, setAllocationsDrawer] = useState(null);
  const [activeFinanceTab, setActiveFinanceTab] = useState("activity");
  const [serverInvoices, setServerInvoices] = useState([]);
  const [invoiceDownloadKey, setInvoiceDownloadKey] = useState("");
  const labId = item?.labId || item?.lab_id || "";

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
        sentAt: inv.sentAt,
        rawStatus: inv.status,
        hasPdf: inv.hasPdf,
        pdfGeneratedAt: inv.pdfGeneratedAt,
        labId: inv.labId,
        status: deriveOpenInvoiceWidgetStatus({
          status: inv.status,
          openBalance: inv.openBalance,
          paidAmount: inv.allocatedAmount,
          allocatedAmount: inv.allocatedAmount,
          dueDate: inv.dueDate,
          sentAt: inv.sentAt,
        }),
      }));
    }
    return buildInvoiceRows(collectionDetails || item, history);
  }, [serverInvoices, collectionDetails, item, history]);
  const health = useMemo(
    () => financialStatusSummary(item, invoices),
    [item, invoices]
  );
  const financialTimeline = useMemo(
    () =>
      buildLabAccountActivityTimeline({
        item: collectionDetails || item,
        history,
        invoices,
        formatMoney,
        formatShortDate,
      }),
    [collectionDetails, item, history, invoices]
  );
  const timelineGroups = useMemo(() => groupTimelineByDate(financialTimeline), [financialTimeline]);
  const accountStandingSummary =
    overdueDays > 0
      ? `Attention needed: ${overdueDays} day overdue balance.`
      : outstanding <= 0
        ? "Account is in good standing with no pending balance."
        : "Account is active with pending balance under monitoring.";
  const availableCredit =
    creditLimit > 0 ? Math.max(0, creditLimit - creditUsed) : null;
  const lastPaymentDate = deriveLastPaymentDateFromHistory(history);
  const openInvoicesTop = useMemo(
    () =>
      invoices
        .filter(isCustomerFacingOpenInvoice)
        .sort((a, b) => str(b.dueDate).localeCompare(str(a.dueDate)))
        .slice(0, 5),
    [invoices]
  );
  const statementRows = useMemo(
    () =>
      invoices.slice(0, 12).map((invoice, idx) => ({
        id: `${invoice.invoiceId}-${idx}`,
        title: `${invoice.invoiceId}`,
        detail: `Order ${invoice.orderId || "—"} · ${formatMoney(invoice.amount)}`,
        date: invoice.dueDate,
      })),
    [invoices]
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
          subline: entry.subline,
          trailing: entry.trailing,
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
    <div className="space-y-3">
      <section className={LAB_DASHBOARD_CARD}>
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Account Health
          </h3>
          <span className={cn("inline-block rounded border px-2 py-0.5 text-[10px] font-medium", health.tone)}>
            {health.label}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <AccountHealthMetric label="Outstanding" value={formatMoney(outstanding)} emphasize />
          <AccountHealthMetric label="Paid" value={formatMoney(totalPaid)} emphasize />
          <AccountHealthMetric
            label="Credit Limit"
            value={creditLimit > 0 ? formatMoney(creditLimit) : "Not configured"}
          />
          <AccountHealthMetric
            label="Available Credit"
            value={availableCredit == null ? "—" : formatMoney(availableCredit)}
          />
          <AccountHealthMetric
            label="Last Payment"
            value={lastPaymentDate ? formatShortDate(lastPaymentDate) : "—"}
          />
          <AccountHealthMetric label="Next Payment" value={dueDate ? formatShortDate(dueDate) : "—"} />
          <AccountHealthMetric
            label="Behavior"
            value={overdueDays > 0 ? `Delayed by ${overdueDays}d` : "On track"}
          />
          <AccountHealthMetric label="Risk" value={riskLabel || "—"} />
        </div>
        {utilizationPct != null ? (
          <div className="mt-2.5 border-t border-border/60 pt-2.5">
            <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>Credit used</span>
              <span className="tabular-nums">
                {formatMoney(creditUsed)} / {formatMoney(creditLimit)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn(
                  "h-full rounded-full",
                  utilizationPct >= 85 ? "bg-red-500" : utilizationPct >= 65 ? "bg-amber-500" : "bg-emerald-500"
                )}
                style={{ width: `${utilizationPct}%` }}
              />
            </div>
          </div>
        ) : null}
        <p className="mt-2 text-[10px] text-muted-foreground">{accountStandingSummary}</p>
      </section>

      <section className={LAB_DASHBOARD_CARD}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Open Invoices
          </h3>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-[11px] font-medium"
            onClick={() => navigateToLabInvoiceCenter(setActivePage)}
          >
            View all invoices →
          </Button>
        </div>
        {openInvoicesTop.length ? (
          <div className="space-y-1.5">
            {openInvoicesTop.map((invoice, idx) => (
              <LabOpenInvoiceSummaryRow
                key={`${invoice.invoiceId}-${idx}`}
                invoice={invoice}
                rowId={`${invoice.invoiceId}-${idx}`}
                invoiceDownloadKey={invoiceDownloadKey}
                onView={setInvoiceDrawer}
                onDownload={handleInvoiceDownload}
                onSubmitAdvice={onSubmitPaymentAdvice}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border/80 px-3 py-3 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1.5 font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              No outstanding invoices
            </div>
            <p className="mt-1">
              Browse the{" "}
              <button
                type="button"
                className="font-medium text-[var(--pc-brand-primary)] underline-offset-2 hover:underline"
                onClick={() => navigateToLabInvoiceCenter(setActivePage)}
              >
                Invoice Center
              </button>{" "}
              for historical invoices.
            </p>
          </div>
        )}
      </section>

      <section className={LAB_DASHBOARD_CARD}>
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
        ) : detailsError ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-[11px] text-amber-900">
            {detailsError}
          </p>
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
                    <li key={entry.id} className="relative border-b border-border/50 py-2 pl-3 last:border-b-0">
                      <span
                        className={cn(
                          "absolute left-0 top-3 h-1.5 w-1.5 rounded-full border border-background",
                          activityKindDotClass(entry.kind)
                        )}
                        aria-hidden
                      />
                      <LabActivityTimelineEntry entry={entry} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-dashed px-2 py-2 text-[11px] text-muted-foreground">
            {activeFinanceTab === "activity"
              ? "No payment or invoice activity recorded yet."
              : activeFinanceTab === "statements"
                ? "Statement summaries appear here from your invoice history. Download documents from Invoice Center."
                : activeFinanceTab === "credit"
                  ? "Credit usage and limit events will appear here when configured for your lab."
                  : activeFinanceTab === "notes"
                    ? "Account notes from PrimeCare finance will appear here."
                    : "No entries in this tab yet."}
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
  const [detailsError, setDetailsError] = useState("");
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
  const profileLabId = labIdKey(currentUser?.labId || currentUser?.lab_id || "");
  const userRole = str(currentUser?.role || "").toLowerCase();
  const [labAccountLedger, setLabAccountLedger] = useState(null);
  const collectionsLengthRef = useRef(collections.length);
  const openCollectionRequestRef = useRef(0);
  const openCollectionInflightRef = useRef("");
  const labAutoOpenedRef = useRef("");
  const labLedgerLoadKeyRef = useRef("");
  collectionsLengthRef.current = collections.length;
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
        const hasRows = collectionsLengthRef.current > 0 || hadCacheOnMount.current;
        if (silent || hasRows) setListRefreshing(true);
        else setLoading(true);
        setLoadError("");

        logSupabaseFeatureSource("Collections.list", { api: "getCollectionsRead" });
        const [res, ownershipRes] = await Promise.all([
          getCollectionsRead({
            force: userRole === ROLES.AGENT ? true : silent,
          }),
          userRole === ROLES.AGENT
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
          userRole !== ROLES.AGENT &&
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
        if (!collectionsLengthRef.current && !hadCacheOnMount.current) {
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
  }, [
    userRole,
    isLabAccount,
    distributorScope?.tenantId,
    tenantId,
    collectionsCacheKey,
    currentUser,
  ]);

  const loadLabAccountLedger = useCallback(async () => {
    if (!isLabAccount || !profileLabId) return;
    const loadKey = `${tenantId}:${profileLabId}`;

    setLabAccountLedger({ status: "loading" });

    try {
      const [invoiceRes, historyRes, detailRes] = await Promise.all([
        getInvoicesForLabRead(profileLabId, {
          tenantId,
          pageSize: HQ_INVOICE_LIST_MAX_LIMIT,
        }),
        getCollectionHistoryRead(profileLabId),
        getCollectionDetailRead(profileLabId),
      ]);

      const ledger = buildLabAccountLedger({
        invoices: invoiceRes?.rows || [],
        paymentHistory: historyRes?.data?.history || [],
        arRow: detailRes?.data?.collection,
        labId: profileLabId,
        labName: str(currentUser?.labName || currentUser?.lab_name || ""),
      });

      labLedgerLoadKeyRef.current = loadKey;
      setLabAccountLedger({
        status: "ready",
        ...ledger,
      });
    } catch (err) {
      console.warn("CollectionsPage labAccountLedger:", err);
      setLabAccountLedger({ status: "ready", hasLedgerData: false, collectionItem: null });
    }
  }, [isLabAccount, profileLabId, tenantId, currentUser?.labName, currentUser?.lab_name]);

  useEffect(() => {
    void loadCollections({ silent: hadCacheOnMount.current });
    // Initial load only — Refresh calls handleRefresh explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, tenantId, profileLabId, isLabAccount]);

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
      if (ctx.orderId) setPaymentOrderId(str(ctx.orderId));
      if (ctx.paymentAmount) setAmountCollected(String(ctx.paymentAmount));
      if (ctx.focusSection === "payment") {
        if (!collections.length) return;
        void openCollectionPanel(ctx.labId, "payment");
      }
      window.setTimeout(() => {
        document.getElementById(`hq-credit-lab-${targetId}`)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 150);
      return;
    }
    if (!collections.length) return;
    if (ctx.orderId) setPaymentOrderId(str(ctx.orderId));
    if (ctx.paymentAmount) setAmountCollected(String(ctx.paymentAmount));
    void openCollectionPanel(ctx.labId, ctx.focusSection || "details");
  }, [loading, collections.length, isLabAccount, currentUser, isAgentView]);

  useEffect(() => {
    if (loading || isLabAccount) return;
    hydratePendingCollectionTask();
  }, [loading, collections, isLabAccount]);

  async function openCollection(labId, options = {}) {
    const listMatch = findCollectionByLabId(collections, labId);
    const ledgerMatch =
      !listMatch && isLabAccount && labAccountLedger?.collectionItem?.labId
        ? labAccountLedger.collectionItem
        : null;
    const canonicalLabId = listMatch?.labId ?? ledgerMatch?.labId ?? labId;
    const canonicalKey = labIdKey(canonicalLabId);
    if (!canonicalKey) return;

    if (openCollectionInflightRef.current === canonicalKey && !options?.force) return;
    openCollectionInflightRef.current = canonicalKey;
    const requestId = ++openCollectionRequestRef.current;

    try {
      setDetailsLoading(true);
      setDetailsError("");

      if ((listMatch || ledgerMatch) && !options?.suppressExpand) {
        setExpandedLabId(canonicalKey);
        setSelectedCollection(listMatch || ledgerMatch);
      } else if (!options?.suppressExpand) {
        setExpandedLabId(canonicalKey);
      }

      const params = authToken ? { sessionToken: authToken } : {};

      let historyRows = [];
      let sbDetail = null;
      let sbDetailOk = false;
      let sbHistoryOk = false;

      if (supabase) {
        try {
          logSupabaseFeatureSource("Collections.history", {
            api: "loadLabPaymentHistoryForDisplay",
          });
          historyRows = await loadLabPaymentHistoryForDisplay(supabase, canonicalLabId);
          sbHistoryOk = true;
        } catch (histErr) {
          console.warn("CollectionsPage payment history:", histErr);
        }

        try {
          logSupabaseFeatureSource("Collections.details", { api: "getCollectionDetailRead" });
          const detailRead = await getCollectionDetailRead(canonicalLabId);
          sbDetailOk = Boolean(detailRead?.success);
          sbDetail = detailRead?.data?.collection ?? null;
        } catch (detailErr) {
          console.warn("CollectionsPage collection detail:", detailErr);
        }
      }

      if (requestId !== openCollectionRequestRef.current) return;

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

      if (requestId !== openCollectionRequestRef.current) return;

      let collection = listMatch || ledgerMatch || null;
      if (apiCollection) {
        const mergedNotes =
          apiCollection.collectionsNotes ??
          apiCollection.note ??
          listMatch?.collectionsNotes ??
          ledgerMatch?.collectionsNotes ??
          "";
        collection = {
          ...(listMatch || ledgerMatch || {}),
          ...apiCollection,
          labId: labIdKey(apiCollection.labId ?? canonicalLabId),
          collectionsNotes: mergedNotes,
          nextFollowUp:
            apiCollection.nextFollowUp ?? listMatch?.nextFollowUp ?? ledgerMatch?.nextFollowUp ?? "",
          nextAction: apiCollection.nextAction ?? listMatch?.nextAction ?? ledgerMatch?.nextAction ?? "",
        };
      }

      if (!options?.suppressExpand) {
        setExpandedLabId(canonicalKey);
      }
      setSelectedCollection(collection);
      setHistory(historyRows);

      if (!historyRows.length && !sbHistoryOk && isLabAccount) {
        setDetailsError("Payment activity is temporarily unavailable. Try Refresh.");
      }

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
      if (requestId !== openCollectionRequestRef.current) return;
      console.warn("CollectionsPage openCollection:", err);
      const fallback = listMatch || ledgerMatch;
      setExpandedLabId(canonicalKey);
      setSelectedCollection(
        fallback || {
          labId: canonicalLabId,
          labName: str(currentUser?.labName || currentUser?.lab_name || ""),
        }
      );
      setHistory([]);
      setDetailsError(err?.message || "Failed to load payment activity.");
      if (!isLabAccount && !fallback) {
        showToast("error", err.message || "Failed to load collection details");
        setExpandedLabId("");
        setSelectedCollection(null);
      }
    } finally {
      if (requestId === openCollectionRequestRef.current) {
        if (openCollectionInflightRef.current === canonicalKey) {
          openCollectionInflightRef.current = "";
        }
        setDetailsLoading(false);
      }
    }
  }

  const handleRefresh = useCallback(async () => {
    labAutoOpenedRef.current = "";
    labLedgerLoadKeyRef.current = "";
    openCollectionInflightRef.current = "";
    await loadCollections({ silent: true });
    if (isLabAccount && profileLabId) {
      await loadLabAccountLedger();
      labAutoOpenedRef.current = "";
      await openCollection(profileLabId, { force: true });
    }
  }, [loadCollections, loadLabAccountLedger, isLabAccount, profileLabId]);

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
            const paidOrderId = paymentOrderId || basePayload.orderId || "";
            setLastPaymentByLabId((prev) => ({ ...prev, [paidLabKey]: paidDate }));
            setPaymentOrderId("");
            invalidateOrdersReadCache();
            invalidateCollectionsReadCache();
            notifyFinancialSyncRefresh({
              source: "collection_payment",
              labId: selectedLabId,
              orderId: paidOrderId,
            });

            await loadCollections();
            if ((isAgentView || isHqCreditRisk) && paymentDrawerLabId) {
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

  const labDisplayCollections = useMemo(() => {
    if (!isLabAccount) return filteredCollections;
    if (filteredCollections.length) return filteredCollections;
    if (
      labAccountLedger?.status === "ready" &&
      labAccountLedger.hasLedgerData &&
      labAccountLedger.collectionItem?.labId
    ) {
      return [labAccountLedger.collectionItem];
    }
    return [];
  }, [isLabAccount, filteredCollections, labAccountLedger]);

  const labLedgerKpis = useMemo(() => {
    if (!isLabAccount || filteredCollections.length) return null;
    if (labAccountLedger?.status !== "ready") return null;
    return labAccountLedger;
  }, [isLabAccount, filteredCollections.length, labAccountLedger]);

  useEffect(() => {
    if (!isLabAccount || !profileLabId) return undefined;
    const loadKey = `${tenantId}:${profileLabId}`;
    if (labLedgerLoadKeyRef.current === loadKey) return undefined;
    void loadLabAccountLedger();
  }, [isLabAccount, profileLabId, tenantId, loadLabAccountLedger]);

  useEffect(() => {
    if (!isLabAccount || loading || !profileLabId) return;
    if (!filteredCollections.length && labAccountLedger?.status !== "ready") return;
    const targetLabId =
      filteredCollections[0]?.labId ||
      (labAccountLedger?.status === "ready" ? labAccountLedger.collectionItem?.labId : "") ||
      profileLabId;
    if (!targetLabId) return;
    const key = labIdKey(targetLabId);
    if (labAutoOpenedRef.current === key) return;
    labAutoOpenedRef.current = key;
    void openCollection(targetLabId);
    // Auto-open lab account details once per lab session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isLabAccount,
    loading,
    profileLabId,
    filteredCollections.length,
    labAccountLedger?.status,
    labAccountLedger?.collectionItem?.labId,
  ]);

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

  function handleLabSubmitPaymentAdvice(invoice) {
    const invoiceLabel = str(invoice?.invoiceId ?? invoice?.invoiceNumber ?? "invoice");
    showToast(
      "info",
      `Payment advice for ${invoiceLabel} is reviewed by PrimeCare finance before your account is updated. Open Activity Center to track status.`
    );
    setActivePage?.("notifications");
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
    if ((isAgentView || isHqCreditRisk) && focusSection === "payment") {
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
        "pb-6",
        isLabAccount ? "space-y-2" : "space-y-3",
        isAgentView && !embedded && "mx-auto w-full max-w-[1360px]"
      )}
    >
      {!embedded ? (
        <PageHeader
          compact={isLabAccount}
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
                ? "Your account dashboard — balances, health, payment activity, and open invoice summary."
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
              className={cn("block", isLabAccount ? "mt-0 text-[10px]" : "mt-1")}
            />
          }
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 rounded-lg"
              onClick={() => void handleRefresh()}
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
              onRetry={() => void handleRefresh()}
          retrying={loading || listRefreshing}
          staleDataNote={
            collections.length > 0 ? "Showing the last account data loaded successfully." : ""
          }
        />
      ) : null}

      <div className={isLabAccount ? "mx-auto max-w-7xl" : ""}>
        {isLabAccount ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <CompactAccountKpi
              title="Outstanding"
              value={formatMoney(
                labLedgerKpis?.outstanding ??
                  summary.totalOutstanding ??
                  filteredCollections[0]?.outstandingAmount ??
                  0
              )}
              icon={IndianRupee}
            />
            <CompactAccountKpi
              title="Overdue"
              value={
                (labLedgerKpis?.overdueDays ?? filteredCollections[0]?.overdueDays)
                  ? `${Number(labLedgerKpis?.overdueDays ?? filteredCollections[0]?.overdueDays)}d`
                  : "—"
              }
              icon={AlertTriangle}
            />
            <CompactAccountKpi
              title="Total paid"
              value={formatMoney(
                labLedgerKpis?.totalPaid ??
                  filteredCollections[0]?.totalPaid ??
                  0
              )}
              icon={Wallet}
            />
            {(() => {
              const creditKpi = labTopCreditKpiDisplay({
                labLedgerKpis,
                collectionRow: filteredCollections[0],
              });
              return (
                <CompactAccountKpi title={creditKpi.label} value={creditKpi.value} icon={ShieldAlert} />
              );
            })()}
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
          onRecordPayment={(labId) => openCollectionPanel(labId, "payment")}
        />
      ) : labDisplayCollections.length === 0 ? (
        isLabAccount ? (
          labAccountLedger?.status === "loading" ? (
            <div className="mx-auto max-w-2xl">
              <ListSkeleton rows={4} />
            </div>
          ) : (
            <EmptyState
              title="No account records"
              description="Your lab payment and outstanding details will appear here when available."
            />
          )
        ) : (
          <EmptyState
            title="No collection records"
            description={
              collections.length === 0
                ? "Receivables will appear here when labs have outstanding balances."
                : "Try a different search term."
            }
          />
        )
      ) : isLabAccount ? (
        <div className="mx-auto max-w-7xl space-y-4" role="list">
          {labDisplayCollections.map((item) => {
            const key = labIdKey(item.labId);
            const isExpanded = expandedLabId === key;
            return (
              <LabAccountTimeline
                key={key}
                item={item}
                history={isExpanded ? history : []}
                detailsLoading={isExpanded && detailsLoading}
                detailsError={isExpanded ? detailsError : ""}
                copy={accountLabels}
                tenantId={tenantId}
                collectionDetails={
                  isExpanded && labIdKey(selectedCollection?.labId) === key
                    ? selectedCollection
                    : item
                }
                setActivePage={setActivePage}
                onSubmitPaymentAdvice={handleLabSubmitPaymentAdvice}
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

      {(isAgentView || isHqCreditRisk) ? (
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
              isAgentView={isAgentView}
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
