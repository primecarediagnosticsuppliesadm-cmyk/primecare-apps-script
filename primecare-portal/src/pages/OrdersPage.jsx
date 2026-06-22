import React, { useEffect, useMemo, useState } from "react";
import { updateOrderStatus } from "@/api/primecareApi";
import {
  getOrdersRead,
  getOrderDetailsRead,
  updateOrderStatusWrite,
} from "@/api/primecareSupabaseApi";
import { supabase } from "@/api/supabaseClient.js";
import {
  logAppsScriptFallbackUsed,
  logSupabaseFeatureSource,
} from "@/utils/migrationTrace.js";
import { invalidateAdminDashboardCaches } from "@/utils/dashboardInvalidate.js";
import { ALLOW_LEGACY_APPS_SCRIPT } from "@/config/environment";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  KpiCard,
  KpiCardGrid,
  ListSkeleton,
  StatusBadge,
} from "@/components/ux";
import { orderStatusToVariant, paymentStatusToVariant } from "@/utils/statusTokens";
import { Loader2, AlertTriangle } from "lucide-react";
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

function orderPaymentLabel(order) {
  return formatOrderPaymentLabel({
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    invoiceStatus: order.invoiceStatus,
  });
}

function OrdersDetailEmptyState({ kpis, loading, filteredOrders, onShowPending, onShowPendingPayment, onOpenFirst }) {
  const pending = kpis.placed + kpis.processing;
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
        Select an order from the list to review lines, payment status, and fulfillment actions.
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

export default function OrdersPage({
  currentUser = null,
  distributorScope = null,
  embedded = false,
}) {
  const [orders, setOrders] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [details, setDetails] = useState(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [paymentStatus, setPaymentStatus] = useState("ALL");
  const [labFilter, setLabFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState(DEFAULT_ORDER_SORT);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusNote, setStatusNote] = useState("");
  const [error, setError] = useState("");
  const [ordersReadOk, setOrdersReadOk] = useState(true);
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    if (loading || !orders.length) return;
    const ctx = consumeHqNavContext("orders");
    if (ctx?.orderId) {
      void openOrder(ctx.orderId);
    }
  }, [loading, orders.length]);

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
    try {
      if (!silent) {
        setLoading(true);
      }
      setError("");
      const res = await getOrdersRead();
      if (res?.success === false) {
        throw new Error(res.error || "Failed to load orders from Supabase.");
      }

      const rows = Array.isArray(res?.data?.orders) ? res.data.orders : [];
      setOrdersReadOk(true);

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

      setAllOrders(rows);
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
    } catch (err) {
      console.warn("OrdersPage loadOrders:", err);
      const message = err?.message || "Failed to load orders.";
      setError(message);
      setOrdersReadOk(false);
      setAllOrders([]);
      setOrders([]);
    } finally {
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
    return sortOrders(filtered, sortKey);
  }, [orders, search, status, paymentStatus, labFilter, dateFrom, dateTo, sortKey]);

  const kpis = useMemo(() => computeOrdersKpis(orders), [orders]);

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

  const selectedOrderUx = useMemo(() => {
    if (!selectedOrderSummary) return null;
    const orderStatus = normalizeOrderStatusLabel(selectedOrderSummary.orderStatus);
    const cancelled = isCancelledStatus(orderStatus);
    const lines = details?.lines || [];
    const unitCount = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    return {
      orderStatus,
      cancelled,
      paymentLabel: orderPaymentLabel(selectedOrderSummary),
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
  }, [selectedOrderSummary, details?.lines]);

  return (
    <div className={embedded ? "space-y-4" : "space-y-5"}>
      {!embedded ? (
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Orders Monitor</h1>
          <p className="text-sm text-slate-500">
            {distributorScope?.tenantId
              ? `Orders for ${distributorScope.tenantName || "selected distributor"} labs only.`
              : "PrimeCare HQ orders — scan status, payment, and fulfillment at a glance."}
          </p>
        </div>
      ) : null}

      {error ? (
        <div
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
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
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[760px] text-xs">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-slate-500">
                      <th className="px-2 py-2 font-medium">Order ID</th>
                      <th className="px-2 py-2 font-medium">Lab</th>
                      <th className="px-2 py-2 font-medium">Date</th>
                      <th className="px-2 py-2 font-medium">Status</th>
                      <th className="px-2 py-2 font-medium">Payment</th>
                      <th className="px-2 py-2 font-medium text-right">Amount</th>
                      <th className="px-2 py-2 font-medium">Items</th>
                      <th className="px-2 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order) => {
                      const orderStatus = normalizeOrderStatusLabel(order.orderStatus);
                      const payStatus = orderPaymentLabel(order);
                      const isSelected = selectedOrder === order.orderId;
                      const cancelled = isCancelledStatus(orderStatus);
                      return (
                        <tr
                          key={order.orderId}
                          className={`border-b border-slate-100 transition-colors ${
                            isSelected
                              ? "bg-slate-100"
                              : cancelled
                                ? "bg-slate-50/80 text-slate-600"
                                : "hover:bg-slate-50"
                          }`}
                        >
                          <td className="px-2 py-2 font-mono font-medium text-slate-900">
                            {order.orderId}
                          </td>
                          <td className="px-2 py-2 text-slate-700">
                            <div className="max-w-[140px] truncate" title={order.labName}>
                              {order.labName || order.labId || "—"}
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
                onShowPending={() => setStatus("Placed")}
                onShowPendingPayment={() => {
                  setStatus("ALL");
                  setPaymentStatus("Pending");
                }}
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
                    {selectedOrderSummary.labName || selectedOrderSummary.labId}
                  </div>
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
                      {formatMissingField(selectedOrderSummary.invoiceId)}
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
                      disabled={updatingStatus || detailsLoading}
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
                      disabled={updatingStatus || detailsLoading}
                      onClick={() => handleUpdateStatus("Fulfilled")}
                    >
                      Mark Fulfilled
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={updatingStatus || detailsLoading}
                      onClick={() => handleUpdateStatus("Placed")}
                    >
                      Reset to Placed
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-red-200 text-red-600 hover:bg-red-50"
                      disabled={updatingStatus || detailsLoading}
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
    </div>
  );
}
