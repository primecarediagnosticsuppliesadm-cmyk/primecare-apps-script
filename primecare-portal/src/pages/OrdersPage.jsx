import React, { useEffect, useMemo, useRef, useState } from "react";
import { updateOrderStatus } from "@/api/primecareApi";
import {
  getOrdersRead,
  getOrderDetailsRead,
  updateOrderStatusWrite,
  peekOrdersReadCache,
} from "@/api/primecareSupabaseApi";
import { supabase } from "@/api/supabaseClient.js";
import {
  logAppsScriptFallbackUsed,
  logSupabaseFeatureSource,
} from "@/utils/migrationTrace.js";
import { invalidateAdminDashboardCaches } from "@/utils/dashboardInvalidate.js";
import { readPageUiCache, writePageUiCache } from "@/utils/hqPageUiCache.js";
import { ALLOW_LEGACY_APPS_SCRIPT } from "@/config/environment";
import { isPredatorAutoValidationEnabled } from "@/predator/predatorGuards.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  KpiCard,
  KpiCardGrid,
  ListSkeleton,
  StatusBadge,
  PageHeader,
  DataFetchError,
  usePortalToast,
} from "@/components/ux";
import { orderStatusToVariant, paymentStatusToVariant } from "@/utils/statusTokens";
import { Loader2, AlertTriangle, Download, Eye, CircleDollarSign } from "lucide-react";
import { ROLES } from "@/config/roles";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import {
  filterRowsByTenant,
  rowTenantId,
} from "@/distributor/distributorOsEngine.js";
import {
  ORDER_SORT_OPTIONS,
  DEFAULT_ORDER_SORT,
  filterOrders,
  sortOrders,
  computeOrdersKpis,
  buildLabFilterOptions,
  formatMissingField,
  formatItemCount,
  normalizeOrderStatusLabel,
  normalizePaymentStatusLabel,
  diagnoseOrdersReadDrift,
} from "@/orders/ordersMonitorEngine.js";
import {
  extractLatestCancellationNote,
  formatOrderPaymentLabel,
  formatProductUnitLabel,
  isCancelledStatus,
  resolveCancelledByLabel,
} from "@/utils/orderTracking.js";
import { collectOrderRowIds } from "@/metrics/computeRevenueMetrics.js";
import { consumeHqNavContext } from "@/operations/hqGlobalSearchEngine.js";
import HqObjectLink from "@/components/hq/HqObjectLink.jsx";
import {
  canNavigateToCollections,
  collectionsNavLabelForRole,
  navigateToCollections,
  navigateToLabs,
  navigateToOperationsCenter,
  navigateToOrders,
} from "@/operations/hqWorkflowNav.js";
import { loadOperationsCenterAdminBundle } from "@/operations/operationsCenterAdminData.js";
import { resolveLabAgentForLabId } from "@/operations/labAgentResolver.js";
import HqOrdersOperationsQueue from "@/components/hq/HqOrdersOperationsQueue.jsx";
import InvoiceDetailsDrawer from "@/components/invoice/InvoiceDetailsDrawer.jsx";
import InvoiceStatusBadge from "@/components/invoice/InvoiceStatusBadge.jsx";
import { getInvoicesByOrderIdsRead } from "@/api/invoiceSupabaseApi.js";
import { onFinancialSyncRefresh } from "@/operations/financialSyncEvents.js";
import { downloadInvoicePdf } from "@/utils/invoiceDownload.js";
import {
  ORDER_QUEUE_KEYS,
  buildOrdersOperationsQueue,
  filterOrdersByQueue,
  queueKeyToFilterPatch,
} from "@/orders/ordersOperationsQueueEngine.js";
import { cn } from "@/lib/utils";

function str(v) {
  return String(v ?? "").trim();
}

function orderStatusSuccessMessage(nextStatus) {
  switch (nextStatus) {
    case "Fulfilled":
      return "Order marked Fulfilled";
    case "Processing":
      return "Order moved to Processing";
    case "Placed":
      return "Order reset to Placed";
    case "Cancelled":
      return "Order cancelled";
    default:
      return `Order status updated to ${nextStatus}`;
  }
}

function formatCurrency(amount) {
  return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
}

function formatDateTime(value) {
  const raw = str(value);
  if (!raw) return null;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return raw;
  return d.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function orderPaymentLabel(order, invoice = null) {
  if (invoice?.displayStatus) {
    const key = String(invoice.displayStatus).toLowerCase();
    if (key === "paid") return "Paid";
    if (key === "partially paid") return "Partially Paid";
    if (key === "overdue") return "Overdue";
    if (key === "outstanding" || key === "sent" || key === "open") return "Outstanding";
  }
  if (invoice && Number(invoice.openBalance ?? 0) <= 0.009) return "Paid";
  return formatOrderPaymentLabel({
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    invoiceStatus: invoice?.displayStatus ?? invoice?.status ?? order.invoiceStatus,
  });
}

function resolveOrderPaidAmount(order, invoice) {
  if (invoice?.allocatedAmount != null) return Number(invoice.allocatedAmount);
  const total = Number(invoice?.totalAmount ?? order?.orderTotal ?? 0);
  return Math.max(0, total - resolveOrderOutstanding(order, invoice));
}

function resolveOrderOutstanding(order, invoice) {
  if (invoice?.openBalance != null) return Number(invoice.openBalance);
  const total = Number(order?.orderTotal || 0);
  if (invoice) {
    const allocated = Number(invoice.allocatedAmount || 0);
    return Math.max(0, total - allocated);
  }
  return total;
}

function canRecordOrderPayment(order, invoice, orderUx) {
  if (!order || orderUx?.cancelled || !orderUx?.fulfilled) return false;
  return resolveOrderOutstanding(order, invoice) > 0.009;
}

function OrdersDetailEmptyState({
  kpis,
  loading,
  filteredOrders,
  onShowPending,
  onShowPendingPayment,
  onOpenFirst,
  activeQueueKey = "",
  queue = [],
}) {
  const pending = kpis.placed + kpis.processing;
  const activeQueue = queue.find((q) => q.id === activeQueueKey);
  const suggestions = [];

  if (pending > 0) {
    suggestions.push({
      label: `Review ${pending} pending order${pending === 1 ? "" : "s"} (Placed + Processing)`,
      action: onShowPending,
    });
  }
  if (kpis.pendingPayment > 0) {
    suggestions.push({
      label: `Check ${kpis.pendingPayment} order${kpis.pendingPayment === 1 ? "" : "s"} with pending payment`,
      action: onShowPendingPayment,
    });
  }
  if (kpis.cancelled > 0) {
    suggestions.push({
      label: `${kpis.cancelled} cancelled order${kpis.cancelled === 1 ? "" : "s"} on file — audit if disputes arise`,
      action: () => onShowPending?.(),
    });
  }
  if (filteredOrders.length > 0) {
    suggestions.push({
      label: `Open latest order: ${filteredOrders[0].orderId}`,
      action: () => onOpenFirst?.(filteredOrders[0].orderId),
    });
  }
  if (suggestions.length === 0) {
    suggestions.push({
      label: "No orders in scope — adjust filters or wait for new placements",
      action: null,
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        {activeQueue
          ? `${activeQueue.label}: ${activeQueue.count} order${activeQueue.count === 1 ? "" : "s"} in this bucket. Select one from the list to review details.`
          : "Select an order from the list to review lines, payment status, and fulfillment actions."}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Pending orders</p>
          <p className="text-xl font-bold tabular-nums text-slate-900">{loading ? "—" : pending}</p>
          <p className="text-[11px] text-slate-500">Placed + Processing</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">Pending payment</p>
          <p className="text-xl font-bold tabular-nums text-amber-950">{loading ? "—" : kpis.pendingPayment}</p>
          <p className="text-[11px] text-amber-800/80">Excludes cancelled</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Cancelled</p>
          <p className="text-xl font-bold tabular-nums text-slate-900">{loading ? "—" : kpis.cancelled}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">Recently fulfilled</p>
          <p className="text-xl font-bold tabular-nums text-emerald-950">
            {loading
              ? "—"
              : (queue.find((q) => q.id === ORDER_QUEUE_KEYS.RECENTLY_FULFILLED)?.count ?? kpis.fulfilled)}
          </p>
          <p className="text-[11px] text-emerald-800/80">Last 14 days</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2.5 sm:col-span-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800">Active order value</p>
          <p className="text-lg font-bold tabular-nums text-emerald-950">
            {loading ? "—" : formatCurrency(kpis.totalOrderValue)}
          </p>
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold text-slate-700">Suggested next actions</p>
        <ul className="space-y-1.5">
          {suggestions.map((item, idx) => (
            <li key={idx}>
              {item.action ? (
                <button
                  type="button"
                  className="w-full rounded-lg border border-dashed border-slate-200 px-3 py-2 text-left text-xs text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  onClick={item.action}
                >
                  {item.label}
                </button>
              ) : (
                <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs text-slate-500">
                  {item.label}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function scopeOrdersForUser(allOrders, currentUser, distributorScope) {
  if (distributorScope?.tenantId) {
    return filterRowsByTenant(allOrders, distributorScope.tenantId, { tenantKey: rowTenantId });
  }
  if (currentUser?.role === ROLES.EXECUTIVE || currentUser?.role === ROLES.ADMIN) {
    const homeId = str(currentUser?.tenantId || currentUser?.tenant_id);
    return homeId ? filterRowsByTenant(allOrders, homeId, { tenantKey: rowTenantId }) : allOrders;
  }
  return allOrders;
}

function hydrateOrdersFromCache(currentUser, distributorScope) {
  const ui = readPageUiCache(
    `orders:${String(currentUser?.role || "")}:${String(distributorScope?.tenantId || currentUser?.tenantId || "")}`
  );
  if (ui?.allOrders?.length) {
    return {
      allOrders: ui.allOrders,
      orders: ui.orders || ui.allOrders,
      ordersReadOk: ui.ordersReadOk !== false,
    };
  }
  const peeked = peekOrdersReadCache();
  const rows = Array.isArray(peeked?.data?.orders) ? peeked.data.orders : [];
  if (!rows.length) return null;
  const allOrders = rows;
  return {
    allOrders,
    orders: scopeOrdersForUser(allOrders, currentUser, distributorScope),
    ordersReadOk: peeked?.success !== false,
  };
}

export default function OrdersPage({
  currentUser = null,
  distributorScope = null,
  embedded = false,
  setActivePage,
}) {
  const ordersCacheKey = `orders:${String(currentUser?.role || "")}:${String(distributorScope?.tenantId || currentUser?.tenantId || "")}`;
  const hydratedOrders = useMemo(
    () => hydrateOrdersFromCache(currentUser, distributorScope),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-time hydration only
    []
  );
  const hadCacheOnMount = useRef(Boolean(hydratedOrders));

  const [orders, setOrders] = useState(() => hydratedOrders?.orders ?? []);
  const [allOrders, setAllOrders] = useState(() => hydratedOrders?.allOrders ?? []);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [details, setDetails] = useState(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [paymentStatus, setPaymentStatus] = useState("ALL");
  const [labFilter, setLabFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState(DEFAULT_ORDER_SORT);
  const [loading, setLoading] = useState(() => !hydratedOrders);
  const [listRefreshing, setListRefreshing] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusNote, setStatusNote] = useState("");
  const [error, setError] = useState("");
  const [ordersReadOk, setOrdersReadOk] = useState(() => hydratedOrders?.ordersReadOk ?? true);
  const [successMessage, setSuccessMessage] = useState("");
  const [labAssignments, setLabAssignments] = useState([]);
  const [directoryUsers, setDirectoryUsers] = useState([]);
  const [activeQueueKey, setActiveQueueKey] = useState("");
  const [invoiceByOrderId, setInvoiceByOrderId] = useState({});
  const [invoiceDrawer, setInvoiceDrawer] = useState(null);
  const [invoiceDownloadKey, setInvoiceDownloadKey] = useState("");

  const { showToast } = usePortalToast();

  const homeTenantId = str(currentUser?.tenantId || currentUser?.tenant_id);

  useEffect(() => {
    const orderLabId = details?.order?.labId;
    if (!homeTenantId || !setActivePage || !orderLabId) return;
    if (labAssignments.length > 0 || directoryUsers.length > 0) return;
    let cancelled = false;
    void loadOperationsCenterAdminBundle(homeTenantId).then((bundle) => {
      if (!cancelled) {
        setLabAssignments(bundle?.labAssignments || []);
        setDirectoryUsers(bundle?.directoryUsers || []);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [homeTenantId, setActivePage, details?.order?.labId, labAssignments.length, directoryUsers.length]);

  useEffect(() => {
    void loadOrders({ silent: hadCacheOnMount.current });
  }, []);

  useEffect(() => {
    if (distributorScope?.tenantId) {
      setOrders(
        filterRowsByTenant(allOrders, distributorScope.tenantId, { tenantKey: rowTenantId })
      );
      return;
    }
    if (currentUser?.role === ROLES.EXECUTIVE || currentUser?.role === ROLES.ADMIN) {
      const homeId = str(currentUser?.tenantId || currentUser?.tenant_id);
      setOrders(homeId ? filterRowsByTenant(allOrders, homeId, { tenantKey: rowTenantId }) : allOrders);
      return;
    }
    setOrders(allOrders);
  }, [allOrders, distributorScope?.tenantId, currentUser?.role, currentUser?.tenantId]);

  useEffect(() => {
    if (loading || !orders.length) return;
    const ctx = consumeHqNavContext("orders");
    if (ctx?.labId) setLabFilter(ctx.labId);
    if (ctx?.orderId) void openOrder(ctx.orderId);
  }, [loading, orders.length]);

  async function probeRlsOrderRows() {
    if (!supabase) return [];
    const { data, error } = await supabase.from("orders").select("*");
    if (error) {
      console.warn("[OrdersPage] RLS probe failed:", error.message);
      return null;
    }
    return Array.isArray(data) ? data : [];
  }

  async function loadOrders(options = {}) {
    const silent = Boolean(options?.silent);
    const hadRows = orders.length > 0 || allOrders.length > 0;
    try {
      if (!silent) {
        setLoading(true);
      } else if (hadRows) {
        setListRefreshing(true);
      }
      setError("");
      const res = await getOrdersRead();
      if (res?.success === false) {
        throw new Error(res.error || "Failed to load orders from Supabase.");
      }

      const rows = Array.isArray(res?.data?.orders) ? res.data.orders : [];
      setOrdersReadOk(true);

      if (isPredatorAutoValidationEnabled()) {
        const rlsRows = await probeRlsOrderRows();
        if (rlsRows != null) {
          const diagnosis = diagnoseOrdersReadDrift({
            rawRows: rlsRows,
            mappedOrders: rows,
            meta: res?.meta,
          });
          if (diagnosis.drift) {
            console.warn("[OrdersPage] orders count drift (RLS vs API mapping)", diagnosis);
          }
        } else if (res?.meta?.rawRowCount != null && res.meta.rawRowCount !== rows.length) {
          console.warn("[OrdersPage] orders count drift (raw vs mapped)", {
            rawRowCount: res.meta.rawRowCount,
            mappedRowCount: rows.length,
            orderIds: res.meta.orderIds,
          });
        }
      }

      setAllOrders(rows);
      const scoped = scopeOrdersForUser(rows, currentUser, distributorScope);
      if (distributorScope?.tenantId) {
        setOrders(filterRowsByTenant(rows, distributorScope.tenantId, { tenantKey: rowTenantId }));
      } else if (
        currentUser?.role === ROLES.EXECUTIVE ||
        currentUser?.role === ROLES.ADMIN
      ) {
        const homeId = str(currentUser?.tenantId || currentUser?.tenant_id);
        setOrders(homeId ? filterRowsByTenant(rows, homeId, { tenantKey: rowTenantId }) : rows);
      } else {
        setOrders(rows);
      }
      writePageUiCache(ordersCacheKey, {
        allOrders: rows,
        orders: scoped,
        ordersReadOk: true,
      });
    } catch (err) {
      console.warn("OrdersPage loadOrders:", err);
      const message = err?.message || "Failed to load orders.";
      setError(message);
      setOrdersReadOk(false);
      if (!hadRows) {
        setAllOrders([]);
        setOrders([]);
      }
    } finally {
      setListRefreshing(false);
      if (!silent) {
        setLoading(false);
      }
    }
  }

  async function openOrder(orderId, options = {}) {
    const { preserveSuccess = false } = options;
    try {
      setDetailsLoading(true);
      setError("");
      if (!preserveSuccess) {
        setSuccessMessage("");
      }
      const res = await getOrderDetailsRead(orderId);
      const result = res?.data || res || {};
      const data = {
        order: result.order || null,
        lines: Array.isArray(result.lines) ? result.lines : [],
      };
      if (!data.order) {
        throw new Error(`Order ${orderId} not found or not visible under current access.`);
      }
      setSelectedOrder(orderId);
      setDetails(data);
    } catch (err) {
      console.warn("OrdersPage openOrder:", err);
      setError(err?.message || "Failed to load order details.");
      setDetails(null);
    } finally {
      setDetailsLoading(false);
    }
  }

  async function handleUpdateStatus(nextStatus) {
    if (!selectedOrder) return;

    const id = selectedOrder;

    try {
      setUpdatingStatus(true);
      setError("");
      setSuccessMessage("");

      const statusPayload = { note: statusNote, orderStatus: nextStatus };

      if (supabase) {
        logSupabaseFeatureSource("Orders.statusWrite", { api: "updateOrderStatusWrite" });
        const sbRes = await updateOrderStatusWrite(id, nextStatus, statusPayload);
        if (!sbRes.success) {
          throw new Error(
            sbRes.error ||
              "Supabase order status update failed. Apps Script fallback is disabled when Supabase is configured."
          );
        }

        setSuccessMessage(orderStatusSuccessMessage(nextStatus));
        setStatusNote("");
        await loadOrders({ silent: true });
        await openOrder(id, { preserveSuccess: true });
        if (nextStatus === "Fulfilled") {
          await refreshInvoicesForOrders([id]);
        }
        invalidateAdminDashboardCaches();
        return;
      }

      if (!ALLOW_LEGACY_APPS_SCRIPT) {
        throw new Error("Supabase order status update is required for pilot access.");
      }

      logAppsScriptFallbackUsed("Orders.statusWrite", {
        primarySourceExpected: "Supabase order status + AR/inventory side-effect write",
        fallbackSourceUsed: "Apps Script updateOrderStatus",
        riskLevel: "DANGEROUS",
        metricKeys: ["ordersBrowse", "todaysRevenue", "totalSoldValue"],
        reason: "Supabase client unavailable; using Apps Script updateOrderStatus.",
        nextStatus,
      });
      const res = await updateOrderStatus({
        orderId: id,
        orderStatus: nextStatus,
        note: statusNote,
      });

      const result = res?.data || res || {};
      if (!result?.success) {
        throw new Error(result?.message || "Failed to update status");
      }

      setSuccessMessage(
        nextStatus === "Fulfilled"
          ? "Order marked Fulfilled. Inventory updated."
          : orderStatusSuccessMessage(nextStatus)
      );
      setStatusNote("");
      await loadOrders({ silent: true });
      await openOrder(id, { preserveSuccess: true });
      invalidateAdminDashboardCaches();
    } catch (err) {
      setError(err.message || "Failed to update order status");
    } finally {
      setUpdatingStatus(false);
    }
  }

  const labOptions = useMemo(() => buildLabFilterOptions(orders), [orders]);

  const filteredOrders = useMemo(() => {
    const filtered = filterOrders(orders, {
      search,
      status,
      paymentStatus,
      labId: labFilter,
      dateFrom,
      dateTo,
    });
    const queueFiltered = activeQueueKey
      ? filterOrdersByQueue(filtered, activeQueueKey)
      : filtered;
    return sortOrders(queueFiltered, sortKey);
  }, [orders, search, status, paymentStatus, labFilter, dateFrom, dateTo, sortKey, activeQueueKey]);

  const kpis = useMemo(() => computeOrdersKpis(orders), [orders]);
  const operationsQueue = useMemo(
    () => buildOrdersOperationsQueue(orders, kpis),
    [orders, kpis]
  );
  const highlightedOrderIds = useMemo(() => {
    if (!activeQueueKey) return new Set();
    const bucket = operationsQueue.find((q) => q.id === activeQueueKey);
    return new Set(bucket?.orderIds || []);
  }, [activeQueueKey, operationsQueue]);

  async function refreshInvoicesForOrders(orderIds = []) {
    const ids = [...new Set((orderIds || []).map((id) => str(id)).filter(Boolean))];
    if (!ids.length) return;
    const res = await getInvoicesByOrderIdsRead(ids, { tenantId: homeTenantId });
    if (res.success) {
      setInvoiceByOrderId((prev) => ({ ...prev, ...(res.byOrderId || {}) }));
    }
  }

  useEffect(() => {
    const orderIds = filteredOrders.map((order) => str(order.orderId)).filter(Boolean);
    if (!orderIds.length) {
      setInvoiceByOrderId({});
      return undefined;
    }
    let cancelled = false;
    void getInvoicesByOrderIdsRead(orderIds, { tenantId: homeTenantId }).then((res) => {
      if (!cancelled && res.success) {
        setInvoiceByOrderId(res.byOrderId || {});
      }
    });
    return () => {
      cancelled = true;
    };
  }, [filteredOrders, homeTenantId]);

  useEffect(() => {
    return onFinancialSyncRefresh((detail) => {
      const orderIds = detail?.orderId
        ? [str(detail.orderId)]
        : filteredOrders.map((order) => str(order.orderId)).filter(Boolean);
      if (orderIds.length) void refreshInvoicesForOrders(orderIds);
    });
  }, [filteredOrders, homeTenantId]);

  function handleQueueSelect(queueKey) {
    if (!queueKey) {
      setActiveQueueKey("");
      return;
    }
    setActiveQueueKey(queueKey);
    const patch = queueKeyToFilterPatch(queueKey);
    if (patch) {
      setStatus(patch.status);
      setPaymentStatus(patch.paymentStatus);
      setSortKey(patch.sortKey);
    }
    setSelectedOrder(null);
    setDetails(null);
  }

  usePredatorModuleValidation(
    "PrimeCare OS",
    currentUser,
    {
      primecareOs: true,
      page: "orders",
      homeTenantId: str(currentUser?.tenantId || currentUser?.tenant_id),
      ordersReadOk,
      ordersReadError: ordersReadOk ? null : error || null,
      visibleOrders: orders.map((o) => ({
        tenantId: o.tenantId,
        orderId: o.orderId,
      })),
      ordersRowCount: orders.length,
      orderIds: collectOrderRowIds(
        orders.map((o) => ({ order_id: o.orderId, orderId: o.orderId }))
      ),
    },
    !distributorScope?.tenantId && !loading
  );

  const selectedOrderSummary = details?.order;

  const selectedOrderInvoice = useMemo(() => {
    if (!selectedOrderSummary?.orderId) return null;
    return invoiceByOrderId[selectedOrderSummary.orderId] || null;
  }, [selectedOrderSummary, invoiceByOrderId]);

  async function handleInvoiceDownload(invoice, orderId) {
    const key = invoice?.id || orderId || "invoice";
    setInvoiceDownloadKey(key);
    try {
      await downloadInvoicePdf({
        invoiceId: invoice?.id,
        orderId: invoice?.orderId || orderId,
        tenantId: homeTenantId,
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

  function handleRecordOrderPayment() {
    if (!selectedOrderSummary?.labId || !canNavigateToCollections(currentUser?.role)) return;
    const outstanding = resolveOrderOutstanding(selectedOrderSummary, selectedOrderInvoice);
    navigateToCollections(setActivePage, {
      labId: selectedOrderSummary.labId,
      orderId: selectedOrderSummary.orderId,
      focusSection: "payment",
      paymentAmount: outstanding > 0.009 ? outstanding : selectedOrderSummary.orderTotal,
      role: currentUser?.role,
    });
  }

  function handleOpenCreditRisk() {
    if (!selectedOrderSummary?.labId || !canNavigateToCollections(currentUser?.role)) return;
    navigateToCollections(setActivePage, {
      labId: selectedOrderSummary.labId,
      orderId: selectedOrderSummary.orderId,
      focusSection: "payment",
      paymentAmount: resolveOrderOutstanding(selectedOrderSummary, selectedOrderInvoice),
      role: currentUser?.role,
    });
  }

  function openInvoiceDrawer(invoice) {
    if (!invoice) return;
    setInvoiceDrawer(invoice);
  }

  function resolveOrderInvoice(order) {
    if (!order?.orderId) return null;
    return invoiceByOrderId[order.orderId] || null;
  }

  const selectedLabAgent = useMemo(() => {
    if (!selectedOrderSummary?.labId) {
      return resolveLabAgentForLabId("", labAssignments, directoryUsers);
    }
    return resolveLabAgentForLabId(
      selectedOrderSummary.labId,
      labAssignments,
      directoryUsers
    );
  }, [selectedOrderSummary, labAssignments, directoryUsers]);

  const selectedOrderUx = useMemo(() => {
    if (!selectedOrderSummary) return null;
    const orderStatus = normalizeOrderStatusLabel(selectedOrderSummary.orderStatus);
    const cancelled = isCancelledStatus(orderStatus);
    const fulfilled = orderStatus === "Fulfilled";
    const lines = details?.lines || [];
    const unitCount = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    const outstandingAmount = resolveOrderOutstanding(selectedOrderSummary, selectedOrderInvoice);
    const paidAmount = resolveOrderPaidAmount(selectedOrderSummary, selectedOrderInvoice);
    const totalAmount = Number(
      selectedOrderInvoice?.totalAmount ?? selectedOrderSummary.orderTotal ?? 0
    );
    return {
      orderStatus,
      cancelled,
      fulfilled,
      paymentLabel: orderPaymentLabel(selectedOrderSummary, selectedOrderInvoice),
      paidAmount,
      outstandingAmount,
      totalAmount,
      canRecordPayment: canRecordOrderPayment(selectedOrderSummary, selectedOrderInvoice, {
        cancelled,
        fulfilled,
      }),
      productUnitLabel: formatProductUnitLabel(lines.length, unitCount),
      cancellationReason: cancelled
        ? extractLatestCancellationNote(
            selectedOrderSummary.notes,
            selectedOrderSummary.statusNotes
          )
        : "",
      cancelledOn:
        selectedOrderSummary.cancelledAt ||
        selectedOrderSummary.cancelled_at ||
        selectedOrderSummary.updatedAt ||
        "",
      cancelledByLabel: resolveCancelledByLabel(selectedOrderSummary.createdBy),
    };
  }, [selectedOrderSummary, selectedOrderInvoice, details?.lines]);

  return (
    <div className={embedded ? "space-y-4" : "space-y-5"}>
      {!embedded ? (
        <PageHeader
          title="Orders"
          subtitle={
            distributorScope?.tenantId
              ? `Orders for ${distributorScope.tenantName || "selected distributor"} labs only.`
              : "PrimeCare HQ orders — scan status, payment, and fulfillment at a glance."
          }
        />
      ) : null}

      {error ? (
        <DataFetchError
          message={error}
          onRetry={() => void loadOrders()}
          retrying={loading}
          staleDataNote={orders.length > 0 ? "Showing the last orders loaded successfully." : ""}
        />
      ) : null}

      {successMessage ? (
        <div
          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 shadow-sm"
          role="status"
        >
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">
            ✓
          </span>
          <span>{successMessage}</span>
        </div>
      ) : null}

      <KpiCardGrid columns={4} className="lg:grid-cols-4 xl:grid-cols-7">
        <KpiCard title="Total Orders" value={kpis.totalOrders} loading={loading} />
        <KpiCard title="Placed" value={kpis.placed} loading={loading} />
        <KpiCard title="Processing" value={kpis.processing} loading={loading} />
        <KpiCard title="Fulfilled" value={kpis.fulfilled} loading={loading} />
        <KpiCard title="Cancelled" value={kpis.cancelled} loading={loading} />
        <KpiCard title="Pending Payment" value={kpis.pendingPayment} loading={loading} />
        <KpiCard
          title="Active Order Value"
          value={formatCurrency(kpis.totalOrderValue)}
          subtitle="Excludes cancelled orders"
          loading={loading}
        />
      </KpiCardGrid>

      <HqOrdersOperationsQueue
        orders={orders}
        kpis={kpis}
        activeQueueKey={activeQueueKey}
        onSelectQueue={handleQueueSelect}
        loading={loading}
      />

      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <Input
                placeholder="Search order ID, lab, status…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 rounded-lg text-sm lg:col-span-2"
              />
              <select
                className="h-9 rounded-lg border bg-white px-2 text-sm"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value)}
              >
                {ORDER_SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <select
                className="h-9 rounded-lg border bg-white px-2 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="ALL">All statuses</option>
                <option value="Placed">Placed</option>
                <option value="Processing">Processing</option>
                <option value="Fulfilled">Fulfilled</option>
                <option value="Cancelled">Cancelled</option>
              </select>
              <select
                className="h-9 rounded-lg border bg-white px-2 text-sm"
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
              >
                <option value="ALL">All payments</option>
                <option value="Pending">Pending</option>
                <option value="Paid">Paid</option>
                <option value="Partial">Partial</option>
              </select>
              <select
                className="h-9 rounded-lg border bg-white px-2 text-sm"
                value={labFilter}
                onChange={(e) => setLabFilter(e.target.value)}
              >
                <option value="ALL">All labs</option>
                {labOptions.map((lab) => (
                  <option key={lab.id} value={lab.id}>
                    {lab.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-1">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-9 rounded-lg text-xs"
                  title="From date"
                />
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-9 rounded-lg text-xs"
                  title="To date"
                />
              </div>
            </div>

            <div className="text-xs text-slate-500">
              Showing {filteredOrders.length} of {orders.length} orders
            </div>

            {loading ? (
              <ListSkeleton rows={6} />
            ) : !ordersReadOk ? (
              <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-4 text-sm text-red-700">
                Orders failed to load. Check the error banner above.
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">
                {orders.length === 0
                  ? "No orders visible for your tenant."
                  : "No orders match the current filters."}
              </div>
            ) : (
              <>
              <div className="hidden overflow-x-auto rounded-lg border border-slate-200 xl:block">
                <table className="w-full min-w-[920px] text-xs">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-slate-500">
                      <th className="px-2 py-2 font-medium">Order ID</th>
                      <th className="px-2 py-2 font-medium">Lab</th>
                      <th className="px-2 py-2 font-medium">Date</th>
                      <th className="px-2 py-2 font-medium">Status</th>
                      <th className="px-2 py-2 font-medium">Payment</th>
                      <th className="px-2 py-2 font-medium">Invoice</th>
                      <th className="px-2 py-2 font-medium">Invoice Status</th>
                      <th className="px-2 py-2 font-medium text-right">Amount</th>
                      <th className="px-2 py-2 font-medium">Items</th>
                      <th className="px-2 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order) => {
                      const orderStatus = normalizeOrderStatusLabel(order.orderStatus);
                      const orderInvoice = resolveOrderInvoice(order);
                      const payStatus = orderPaymentLabel(order, orderInvoice);
                      const isSelected = selectedOrder === order.orderId;
                      const cancelled = isCancelledStatus(orderStatus);
                      return (
                        <tr
                          key={order.orderId}
                          className={cn(
                            "border-b border-slate-100 transition-colors",
                            isSelected
                              ? "bg-slate-100"
                              : highlightedOrderIds.has(order.orderId)
                                ? "bg-amber-50/70 ring-1 ring-inset ring-amber-200"
                                : cancelled
                                  ? "bg-slate-50/80 text-slate-600"
                                  : "hover:bg-slate-50"
                          )}
                        >
                          <td className="px-2 py-2 font-mono font-medium text-slate-900">
                            <HqObjectLink
                              onClick={setActivePage ? () => void openOrder(order.orderId) : undefined}
                              title="Review order"
                            >
                              {order.orderId}
                            </HqObjectLink>
                          </td>
                          <td className="px-2 py-2 text-slate-700">
                            <div className="max-w-[140px] truncate" title={order.labName}>
                              <HqObjectLink
                                onClick={
                                  setActivePage && (order.labId || order.labName)
                                    ? () =>
                                        navigateToLabs(setActivePage, {
                                          labId: order.labId || order.labName,
                                          labName: order.labName,
                                          openReviewDrawer: true,
                                        })
                                    : undefined
                                }
                                title="Review lab"
                              >
                                {order.labName || order.labId || "—"}
                              </HqObjectLink>
                            </div>
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap text-slate-600">
                            {order.orderDate || "—"}
                          </td>
                          <td className="px-2 py-2">
                            <StatusBadge
                              variant={orderStatusToVariant(orderStatus)}
                              compact
                            >
                              {orderStatus}
                            </StatusBadge>
                          </td>
                          <td className="px-2 py-2">
                            <StatusBadge variant={paymentStatusToVariant(payStatus)} compact>
                              {payStatus}
                            </StatusBadge>
                          </td>
                          <td className="px-2 py-2 font-mono text-[10px] text-slate-700">
                            {orderInvoice?.invoiceNumber || (order.invoiceId ? "Linked" : "—")}
                          </td>
                          <td className="px-2 py-2">
                            {orderInvoice ? (
                              <InvoiceStatusBadge
                                status={orderInvoice.status}
                                displayStatus={orderInvoice.displayStatus}
                              />
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right font-medium tabular-nums text-slate-900">
                            {formatCurrency(order.orderTotal)}
                          </td>
                          <td className="px-2 py-2 text-slate-600">
                            {formatItemCount(order.itemCount ?? 0)}
                          </td>
                          <td className="px-2 py-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[11px]"
                              disabled={updatingStatus}
                              onClick={() => openOrder(order.orderId)}
                            >
                              Review
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="space-y-2 xl:hidden">
                {filteredOrders.map((order) => {
                  const orderStatus = normalizeOrderStatusLabel(order.orderStatus);
                  const orderInvoice = resolveOrderInvoice(order);
                  const payStatus = orderPaymentLabel(order, orderInvoice);
                  return (
                    <div
                      key={order.orderId}
                      className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-xs font-semibold text-slate-900">
                            {order.orderId}
                          </p>
                          <p className="truncate text-sm text-slate-700">
                            {order.labName || order.labId || "—"}
                          </p>
                          <p className="mt-1 text-base font-bold tabular-nums">
                            {formatCurrency(order.orderTotal)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {order.orderDate || "—"} · {formatItemCount(order.itemCount ?? 0)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <StatusBadge variant={orderStatusToVariant(orderStatus)} compact>
                            {orderStatus}
                          </StatusBadge>
                          <StatusBadge variant={paymentStatusToVariant(payStatus)} compact>
                            {payStatus}
                          </StatusBadge>
                        </div>
                      </div>
                      {orderInvoice?.invoiceNumber ? (
                        <p className="mt-2 text-[10px] text-muted-foreground">
                          Invoice {orderInvoice.invoiceNumber}
                        </p>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2 h-9 w-full rounded-lg text-xs"
                        disabled={updatingStatus}
                        onClick={() => openOrder(order.orderId)}
                      >
                        Review order
                      </Button>
                    </div>
                  );
                })}
              </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Order Details</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedOrder ? (
              <OrdersDetailEmptyState
                kpis={kpis}
                loading={loading}
                filteredOrders={filteredOrders}
                activeQueueKey={activeQueueKey}
                queue={operationsQueue}
                onShowPending={() => handleQueueSelect(ORDER_QUEUE_KEYS.AWAITING_FULFILLMENT)}
                onShowPendingPayment={() => handleQueueSelect(ORDER_QUEUE_KEYS.PENDING_PAYMENT)}
                onOpenFirst={(orderId) => void openOrder(orderId)}
              />
            ) : detailsLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading details…
              </div>
            ) : selectedOrderSummary ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                  <div className="font-mono text-sm font-semibold text-slate-900">
                    {selectedOrderSummary.orderId}
                  </div>
                  <div className="mt-0.5 text-sm text-slate-600">
                    <HqObjectLink
                      onClick={
                        setActivePage && (selectedOrderSummary.labId || selectedOrderSummary.labName)
                          ? () =>
                              navigateToLabs(setActivePage, {
                                labId: selectedOrderSummary.labId || selectedOrderSummary.labName,
                                labName: selectedOrderSummary.labName,
                                openReviewDrawer: true,
                              })
                          : undefined
                      }
                      title="Review lab"
                    >
                      {selectedOrderSummary.labName || selectedOrderSummary.labId}
                    </HqObjectLink>
                  </div>
                  {setActivePage ? (
                    <p className="mt-1 text-xs text-slate-600">
                      Assigned agent:{" "}
                      {selectedLabAgent.isAssigned ? (
                        <HqObjectLink
                          onClick={() =>
                            navigateToOperationsCenter(setActivePage, {
                              agentId: selectedLabAgent.agentId,
                              agentName: selectedLabAgent.agentName,
                              labId: selectedOrderSummary.labId,
                            })
                          }
                          title="Open agent in Operations Center"
                        >
                          {selectedLabAgent.displayLabel}
                        </HqObjectLink>
                      ) : (
                        <span className="text-amber-700">Unassigned</span>
                      )}
                    </p>
                  ) : null}
                  {setActivePage ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() =>
                          navigateToOrders(setActivePage, { labId: selectedOrderSummary.labId })
                        }
                      >
                        All lab orders
                      </Button>
                      {canNavigateToCollections(currentUser?.role) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() =>
                            navigateToCollections(setActivePage, {
                              labId: selectedOrderSummary.labId,
                              focusSection: "details",
                              role: currentUser?.role,
                            })
                          }
                        >
                          {collectionsNavLabelForRole(currentUser?.role)}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusBadge
                      variant={orderStatusToVariant(
                        normalizeOrderStatusLabel(selectedOrderSummary.orderStatus)
                      )}
                    >
                      {normalizeOrderStatusLabel(selectedOrderSummary.orderStatus)}
                    </StatusBadge>
                    <StatusBadge
                      variant={paymentStatusToVariant(selectedOrderUx?.paymentLabel)}
                    >
                      {selectedOrderUx?.paymentLabel}
                    </StatusBadge>
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-900">
                      {formatCurrency(selectedOrderSummary.orderTotal)}
                    </span>
                  </div>
                </div>

                {selectedOrderUx?.cancelled ? (
                  <section className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
                    <p className="font-semibold text-red-800">Order Cancelled</p>
                    <p className="mt-0.5 text-xs text-red-700">This order will not be fulfilled.</p>
                    <dl className="mt-2 grid grid-cols-1 gap-1.5 text-xs">
                      <div>
                        <dt className="text-red-800/80">Cancelled On</dt>
                        <dd>
                          {selectedOrderUx.cancelledOn
                            ? formatDateTime(selectedOrderUx.cancelledOn)
                            : "Not captured"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-red-800/80">Reason</dt>
                        <dd className="whitespace-pre-wrap">
                          {selectedOrderUx.cancellationReason || "No reason captured"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-red-800/80">Cancelled By</dt>
                        <dd>{selectedOrderUx.cancelledByLabel}</dd>
                      </div>
                    </dl>
                  </section>
                ) : null}

                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Order Summary
                  </h3>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                    <dt className="text-slate-500">Order Date</dt>
                    <dd className="text-slate-900">
                      {selectedOrderSummary.orderDate || "Not captured"}
                    </dd>
                    <dt className="text-slate-500">Invoice</dt>
                    <dd className="text-slate-900">
                      {selectedOrderInvoice?.invoiceNumber ||
                        formatMissingField(selectedOrderSummary.invoiceId)}
                    </dd>
                    <dt className="text-slate-500">Invoice Status</dt>
                    <dd className="text-slate-900">
                      {selectedOrderInvoice ? (
                        <InvoiceStatusBadge
                          status={selectedOrderInvoice.status}
                          displayStatus={selectedOrderInvoice.displayStatus}
                        />
                      ) : (
                        "—"
                      )}
                    </dd>
                    <dt className="text-slate-500">Contact</dt>
                    <dd className="text-slate-900">
                      {formatMissingField(selectedOrderSummary.contactPerson)}
                    </dd>
                    <dt className="text-slate-500">Phone</dt>
                    <dd className="text-slate-900">
                      {formatMissingField(selectedOrderSummary.mobileNumber)}
                    </dd>
                  </dl>
                </section>

                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Items
                    </h3>
                    {selectedOrderUx?.productUnitLabel ? (
                      <span className="text-[11px] text-slate-500">
                        {selectedOrderUx.productUnitLabel}
                      </span>
                    ) : null}
                  </div>
                  {details.lines?.length ? (
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full min-w-[420px] text-xs">
                        <thead>
                          <tr className="border-b bg-slate-50 text-left text-slate-500">
                            <th className="px-2 py-1.5">Product</th>
                            <th className="px-2 py-1.5">SKU</th>
                            <th className="px-2 py-1.5 text-right">Qty</th>
                            <th className="px-2 py-1.5 text-right">Unit</th>
                            <th className="px-2 py-1.5 text-right">Line total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {details.lines.map((line) => (
                            <tr key={line.orderLineId} className="border-b border-slate-100">
                              <td className="px-2 py-1.5 font-medium text-slate-900">
                                {line.productName || "—"}
                              </td>
                              <td className="px-2 py-1.5 font-mono text-[10px] text-slate-600">
                                {line.productId || "—"}
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums">
                                {line.quantity}
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums">
                                {formatCurrency(line.unitSellingPrice)}
                              </td>
                              <td className="px-2 py-1.5 text-right font-medium tabular-nums">
                                {formatCurrency(line.netLineTotal)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">No line items found.</div>
                  )}
                </section>

                {selectedOrderUx?.fulfilled && !selectedOrderUx?.cancelled ? (
                  <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Invoice
                      </h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedOrderInvoice ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-9 text-xs"
                            onClick={() => openInvoiceDrawer(selectedOrderInvoice)}
                          >
                            <Eye className="mr-1.5 h-3.5 w-3.5" />
                            View Invoice
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-9 text-xs"
                          disabled={
                            invoiceDownloadKey ===
                            (selectedOrderInvoice?.id || selectedOrderSummary.orderId)
                          }
                          onClick={() =>
                            void handleInvoiceDownload(
                              selectedOrderInvoice,
                              selectedOrderSummary.orderId
                            )
                          }
                        >
                          {invoiceDownloadKey ===
                          (selectedOrderInvoice?.id || selectedOrderSummary.orderId) ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Download className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Download Invoice
                        </Button>
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Payment
                      </h3>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge variant={paymentStatusToVariant(selectedOrderUx.paymentLabel)}>
                          {selectedOrderUx.paymentLabel}
                        </StatusBadge>
                      </div>
                      <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <dt className="text-slate-500">Paid</dt>
                          <dd className="font-semibold tabular-nums text-emerald-700">
                            {formatCurrency(selectedOrderUx.paidAmount)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Outstanding</dt>
                          <dd className="font-semibold tabular-nums text-amber-700">
                            {formatCurrency(selectedOrderUx.outstandingAmount)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-slate-500">Total</dt>
                          <dd className="font-semibold tabular-nums text-slate-900">
                            {formatCurrency(selectedOrderUx.totalAmount)}
                          </dd>
                        </div>
                      </dl>
                      {selectedOrderUx.canRecordPayment && canNavigateToCollections(currentUser?.role) ? (
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="h-9 text-xs"
                            onClick={handleRecordOrderPayment}
                          >
                            <CircleDollarSign className="mr-1.5 h-3.5 w-3.5" />
                            Record Payment
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-9 text-xs"
                            onClick={handleOpenCreditRisk}
                          >
                            Open in {collectionsNavLabelForRole(currentUser?.role)}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </section>
                ) : null}

                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status Actions
                  </h3>
                  <Textarea
                    placeholder="Optional note for this status update…"
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    disabled={updatingStatus || detailsLoading}
                    className="min-h-[72px] rounded-lg text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        updatingStatus ||
                        detailsLoading ||
                        selectedOrderUx?.cancelled ||
                        selectedOrderUx?.fulfilled
                      }
                      onClick={() => handleUpdateStatus("Processing")}
                    >
                      {updatingStatus ? (
                        <>
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          Updating…
                        </>
                      ) : (
                        "Mark Processing"
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        updatingStatus ||
                        detailsLoading ||
                        selectedOrderUx?.cancelled ||
                        selectedOrderUx?.fulfilled
                      }
                      onClick={() => handleUpdateStatus("Fulfilled")}
                    >
                      Mark Fulfilled
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        updatingStatus ||
                        detailsLoading ||
                        selectedOrderUx?.cancelled ||
                        selectedOrderUx?.fulfilled
                      }
                      onClick={() => handleUpdateStatus("Placed")}
                    >
                      Reset to Placed
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-red-200 text-red-600 hover:bg-red-50"
                      disabled={
                        updatingStatus ||
                        detailsLoading ||
                        selectedOrderUx?.cancelled ||
                        selectedOrderUx?.fulfilled
                      }
                      onClick={() => handleUpdateStatus("Cancelled")}
                    >
                      Cancel Order
                    </Button>
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Activity / Notes
                  </h3>
                  {statusNote ? (
                    <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                      <div className="text-xs font-medium text-amber-800">Pending status note</div>
                      <div className="mt-1 whitespace-pre-wrap">{statusNote}</div>
                    </div>
                  ) : null}
                  {selectedOrderSummary.notes ? (
                    <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      <div className="text-xs font-medium text-slate-500">Order notes</div>
                      <div className="mt-1 whitespace-pre-wrap">{selectedOrderSummary.notes}</div>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">No order notes on file.</div>
                  )}
                  {formatDateTime(selectedOrderSummary.updatedAt) ? (
                    <div className="text-xs text-slate-500">
                      Last updated: {formatDateTime(selectedOrderSummary.updatedAt)}
                    </div>
                  ) : selectedOrderSummary.createdAt ? (
                    <div className="text-xs text-slate-500">
                      Created: {formatDateTime(selectedOrderSummary.createdAt)}
                    </div>
                  ) : null}
                </section>
              </div>
            ) : (
              <div className="text-sm text-slate-500">No details available for this order.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <InvoiceDetailsDrawer
        open={Boolean(invoiceDrawer)}
        onClose={() => setInvoiceDrawer(null)}
        invoiceId={invoiceDrawer?.id}
        orderId={invoiceDrawer?.orderId}
        tenantId={homeTenantId}
        invoicePreview={invoiceDrawer}
        onDownloadPhase={(phase, detail) => {
          if (phase === "error") showToast("error", detail || "Unable to download invoice PDF.");
          if (phase === "success") showToast("success", "Invoice download started.");
        }}
      />
    </div>
  );
}
