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
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { ROLES } from "@/config/roles";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import {
  filterRowsByTenant,
  rowTenantId,
} from "@/distributor/distributorOsEngine.js";

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

/** Tailwind classes for stronger order-status recognition (outline Badge). */
function orderStatusBadgeClass(statusRaw) {
  const s = String(statusRaw || "Placed").trim();
  if (s === "Fulfilled") {
    return "border-emerald-300 bg-emerald-50 text-emerald-900 shadow-sm ring-1 ring-emerald-200/70 font-semibold";
  }
  if (s === "Processing") {
    return "border-amber-300 bg-amber-50 text-amber-950 shadow-sm ring-1 ring-amber-200/70 font-semibold";
  }
  if (s === "Cancelled") {
    return "border-red-300 bg-red-50 text-red-900 shadow-sm ring-1 ring-red-200/70 font-semibold";
  }
  const low = s.toLowerCase();
  if (low === "pending" || low === "placed") {
    return "border-slate-300 bg-slate-100 text-slate-900 shadow-sm font-semibold";
  }
  return "border-blue-200 bg-blue-50 text-blue-950 shadow-sm font-semibold";
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
  /** Sentinel for "All Statuses" — not sent to Supabase while list read is unfiltered. */
  const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusNote, setStatusNote] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    loadOrders();
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

  async function loadOrders(options = {}) {
    const silent = Boolean(options?.silent);
    try {
      if (!silent) {
        setLoading(true);
      }
      setError("");
      const res = await getOrdersRead();
      const result = res?.data || res || {};
      const rows = Array.isArray(result?.orders) ? result.orders : [];
      console.log("SUPABASE ORDERS MAPPED:", rows);
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
      setOrders([]);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  function patchOrdersListStatus(orderId, nextStatus) {
    setOrders((prev) =>
      (Array.isArray(prev) ? prev : []).map((o) =>
        o.orderId === orderId ? { ...o, orderStatus: nextStatus } : o
      )
    );
  }

  function patchDetailsOrderStatus(orderId, nextStatus) {
    setDetails((d) => {
      if (!d?.order || d.order.orderId !== orderId) return d;
      return {
        ...d,
        order: { ...d.order, orderStatus: nextStatus },
      };
    });
  }

  /** Instant status sync in list + panel before reloadOrders finishes. */
  function applyOptimisticOrderStatus(orderId, nextStatus) {
    patchOrdersListStatus(orderId, nextStatus);
    patchDetailsOrderStatus(orderId, nextStatus);
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
      console.log("SUPABASE ORDER DETAILS:", data);
      setSelectedOrder(orderId);
      setDetails(data);
    } catch (err) {
      console.warn("OrdersPage openOrder:", err);
      setDetails({ order: null, lines: [] });
    } finally {
      setDetailsLoading(false);
    }
  }

  async function handleUpdateStatus(nextStatus) {
    if (!selectedOrder) return;

    const id = selectedOrder;
    console.log("ORDER STATUS UPDATE START", {
      orderId: id,
      nextStatus,
    });

    try {
      setUpdatingStatus(true);
      setError("");
      setSuccessMessage("");

      const statusPayload = { note: statusNote, orderStatus: nextStatus };

      if (supabase) {
        logSupabaseFeatureSource("Orders.statusWrite", { api: "updateOrderStatusWrite" });
        console.log("ORDERS STATUS SUPABASE AUTHORITATIVE", {
          orderId: id,
          nextStatus,
          fallbackDisabled: true,
        });
        const sbRes = await updateOrderStatusWrite(id, nextStatus, statusPayload);
        if (sbRes.success) {
          setSuccessMessage(orderStatusSuccessMessage(nextStatus));
          setStatusNote("");
          applyOptimisticOrderStatus(id, nextStatus);
          console.log("ORDER STATUS UPDATE SUCCESS", {
            orderId: id,
            nextStatus,
            source: "supabase",
          });

          await loadOrders({ silent: true });
          await openOrder(id, { preserveSuccess: true });
          setSelectedOrder(id);
          console.log("ORDER STATUS UPDATE UI REFRESHED", { orderId: id, nextStatus });
          invalidateAdminDashboardCaches();
          return;
        }

        throw new Error(
          sbRes.error ||
            "Supabase order status update failed. Apps Script fallback is disabled when Supabase is configured."
        );
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
      applyOptimisticOrderStatus(id, nextStatus);
      console.log("ORDER STATUS UPDATE SUCCESS", {
        orderId: id,
        nextStatus,
        source: "apps_script",
      });

      await loadOrders({ silent: true });
      await openOrder(id, { preserveSuccess: true });
      setSelectedOrder(id);
      console.log("ORDER STATUS UPDATE UI REFRESHED", { orderId: id, nextStatus });
      invalidateAdminDashboardCaches();
    } catch (err) {
      setError(err.message || "Failed to update order status");
    } finally {
      setUpdatingStatus(false);
    }
  }

  const filteredOrders = useMemo(() => {
    console.log("ORDERS STATE BEFORE FILTER:", orders);

    const q = String(search || "").trim().toLowerCase();

    let list = Array.isArray(orders) ? orders : [];

    if (q) {
      list = list.filter((o) => {
        const hay = [
          String(o.orderId || "").toLowerCase(),
          String(o.labId || "").toLowerCase(),
          String(o.labName || "").toLowerCase(),
          String(o.orderStatus || "").toLowerCase(),
          String(o.paymentStatus || "").toLowerCase(),
          String(o.invoiceStatus || "").toLowerCase(),
          String(o.createdBy || "").toLowerCase(),
          String(o.notes || "").toLowerCase(),
        ].join(" ");
        return hay.includes(q);
      });
    }

    if (status !== "ALL") {
      const st = String(status || "").toLowerCase();
      list = list.filter(
        (o) => String(o.orderStatus || "").toLowerCase() === st
      );
    }

    console.log("ORDERS AFTER FILTER:", list);
    return list;
  }, [orders, search, status]);

  usePredatorModuleValidation(
    "PrimeCare OS",
    currentUser,
    {
      primecareOs: true,
      page: "orders",
      homeTenantId: str(currentUser?.tenantId || currentUser?.tenant_id),
      visibleOrders: orders.map((o) => ({
        tenantId: o.tenantId,
        orderId: o.orderId,
      })),
    },
    !distributorScope?.tenantId && !loading
  );

  return (
    <div className={embedded ? "space-y-4" : "space-y-5"}>
      {!embedded ? (
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Orders Monitor</h1>
          <p className="text-sm text-slate-500">
            {distributorScope?.tenantId
              ? `Orders for ${distributorScope.tenantName || "selected distributor"} labs only.`
              : "PrimeCare HQ orders — use Distributor OS for distributor tenants."}
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
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

      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle>All Orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                placeholder="Search order ID, lab name, or lab ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 rounded-xl"
              />

              <select
                className="h-11 rounded-xl border bg-white px-3 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="ALL">All Statuses</option>
                <option value="Placed">Placed</option>
                <option value="Processing">Processing</option>
                <option value="Fulfilled">Fulfilled</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading orders...
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-sm text-slate-500">No orders found.</div>
            ) : (
              <div className="space-y-3">
                {filteredOrders.map((order, idx) => (
                  <div
                    key={`${order.orderId}-${idx}`}
                    className={`rounded-2xl p-4 transition-shadow ${
                      selectedOrder === order.orderId
                        ? "border-2 border-slate-900 bg-slate-50 shadow-lg ring-2 ring-slate-900/10"
                        : "border border-slate-200 bg-white shadow-sm"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{order.orderId}</div>
                        <div className="text-sm text-slate-500">
                          {order.labName} • {order.orderDate || "-"}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {order.labId || "-"}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Badge
                          variant="outline"
                          className={orderStatusBadgeClass(order.orderStatus)}
                        >
                          {order.orderStatus || "Placed"}
                        </Badge>
                        <Badge variant="outline">
                          {order.paymentStatus || "Pending"}
                        </Badge>
                        <Badge>
                          ₹{Number(order.orderTotal || 0).toLocaleString()}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-3">
                      <Button
                        variant="outline"
                        className="rounded-xl"
                        disabled={updatingStatus}
                        onClick={() => openOrder(order.orderId)}
                      >
                        View Details
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader>
            <CardTitle>Order Details</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedOrder ? (
              <div className="text-sm text-slate-500">
                Select an order to view details.
              </div>
            ) : detailsLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading details...
              </div>
            ) : details?.order ? (
              <div className="space-y-4">
                <div>
                  <div className="font-semibold">{details.order.orderId}</div>
                  <div className="text-sm text-slate-500">
                    {details.order.labName}
                  </div>
                </div>

                <div className="text-sm space-y-1">
                  <div>Invoice: {details.order.invoiceId || "-"}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-slate-600">Status:</span>
                    <Badge
                      variant="outline"
                      className={`text-xs ${orderStatusBadgeClass(details.order.orderStatus)}`}
                    >
                      {details.order.orderStatus || "Placed"}
                    </Badge>
                  </div>
                  <div>Payment: {details.order.paymentStatus || "-"}</div>
                  <div>
                    Total: ₹
                    {Number(details.order.orderTotal || 0).toLocaleString()}
                  </div>
                  <div>Contact: {details.order.contactPerson || "-"}</div>
                  <div>Phone: {details.order.mobileNumber || "-"}</div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium text-slate-700">
                    Update Status
                  </div>

                  <Textarea
                    placeholder="Optional note for this status update..."
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    disabled={updatingStatus || detailsLoading}
                    className="min-h-[90px] rounded-xl"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="rounded-xl"
                      disabled={updatingStatus || detailsLoading}
                      onClick={() => handleUpdateStatus("Processing")}
                    >
                      {updatingStatus ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        "Mark Processing"
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      className="rounded-xl"
                      disabled={updatingStatus || detailsLoading}
                      onClick={() => handleUpdateStatus("Fulfilled")}
                    >
                      {updatingStatus ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        "Mark Fulfilled"
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      className="rounded-xl"
                      disabled={updatingStatus || detailsLoading}
                      onClick={() => handleUpdateStatus("Placed")}
                    >
                      {updatingStatus ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        "Reset to Placed"
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      className="rounded-xl border-red-200 text-red-600 hover:bg-red-50"
                      disabled={updatingStatus || detailsLoading}
                      onClick={() => handleUpdateStatus("Cancelled")}
                    >
                      {updatingStatus ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Updating...
                        </>
                      ) : (
                        "Cancel Order"
                      )}
                    </Button>
                  </div>
                </div>

                {details.order.notes ? (
                  <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                    <div className="font-medium">Notes</div>
                    <div className="mt-1 whitespace-pre-wrap">
                      {details.order.notes}
                    </div>
                  </div>
                ) : null}

                <div className="space-y-2">
                  {details.lines?.length ? (
                    details.lines.map((line) => (
                      <div key={line.orderLineId} className="rounded-xl border p-3">
                        <div className="font-medium">{line.productName}</div>
                        <div className="text-sm text-slate-500">
                          {line.productId} • Qty {line.quantity}
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          Unit Price: ₹
                          {Number(line.unitSellingPrice || 0).toLocaleString()}
                        </div>
                        <div className="text-sm text-slate-600">
                          Tax: ₹{Number(line.taxAmount || 0).toLocaleString()}
                        </div>
                        <div className="text-sm font-medium">
                          ₹{Number(line.netLineTotal || 0).toLocaleString()}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-slate-500">
                      No line items found.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">No details available.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}