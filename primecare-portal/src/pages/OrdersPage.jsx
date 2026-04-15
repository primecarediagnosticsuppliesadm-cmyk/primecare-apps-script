import React, { useEffect, useMemo, useState } from "react";
import {
  getOrders,
  getOrderDetails,
  updateOrderStatus,
} from "@/api/primecareApi";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [details, setDetails] = useState(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusNote, setStatusNote] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    loadOrders();
  }, [status]);

  async function loadOrders() {
    try {
      setLoading(true);
      setError("");
      const res = await getOrders({ status });
      const result = res?.data || res || {};
      setOrders(Array.isArray(result?.orders) ? result.orders : []);
    } catch (err) {
      setError(err.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }

  async function openOrder(orderId) {
    try {
      setDetailsLoading(true);
      setError("");
      setSuccessMessage("");
      const res = await getOrderDetails(orderId);
      const result = res?.data || res || {};
      setSelectedOrder(orderId);
      setDetails(result);
    } catch (err) {
      setError(err.message || "Failed to load order details");
    } finally {
      setDetailsLoading(false);
    }
  }

  async function handleUpdateStatus(nextStatus) {
    if (!selectedOrder) return;

    try {
      setUpdatingStatus(true);
      setError("");
      setSuccessMessage("");

      const res = await updateOrderStatus({
        orderId: selectedOrder,
        orderStatus: nextStatus,
        note: statusNote,
      });

      const result = res?.data || res || {};
      if (!result?.success) {
        throw new Error(result?.message || "Failed to update status");
      }

      setSuccessMessage(
  nextStatus === "Fulfilled"
    ? "Order fulfilled and inventory updated successfully"
    : `Order status updated to ${nextStatus}`
);
      setStatusNote("");

      await loadOrders();
      await openOrder(selectedOrder);
    } catch (err) {
      setError(err.message || "Failed to update order status");
    } finally {
      setUpdatingStatus(false);
    }
  }

  const filteredOrders = useMemo(() => {
    return orders.filter((o) =>
      `${o.orderId} ${o.labName} ${o.labId}`
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  }, [orders, search]);

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Orders Monitor</h1>
        <p className="text-sm text-slate-500">
          Track all lab orders, inspect line items, and update order status.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-xl bg-green-50 p-3 text-sm text-green-700">
          {successMessage}
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
                <option value="">All Statuses</option>
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
                {filteredOrders.map((order) => (
                  <div
                    key={order.orderId}
                    className={`rounded-2xl border p-4 shadow-sm ${
                      selectedOrder === order.orderId ? "ring-2 ring-slate-200" : ""
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
                        <Badge variant="secondary">
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
                  <div>Status: {details.order.orderStatus || "-"}</div>
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
                    className="min-h-[90px] rounded-xl"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="rounded-xl"
                      disabled={updatingStatus}
                      onClick={() => handleUpdateStatus("Processing")}
                    >
                      {updatingStatus ? "Updating..." : "Mark Processing"}
                    </Button>

                    <Button
                      variant="outline"
                      className="rounded-xl"
                      disabled={updatingStatus}
                      onClick={() => handleUpdateStatus("Fulfilled")}
                    >
                      {updatingStatus ? "Updating..." : "Mark Fulfilled"}
                    </Button>

                    <Button
                      variant="outline"
                      className="rounded-xl"
                      disabled={updatingStatus}
                      onClick={() => handleUpdateStatus("Placed")}
                    >
                      {updatingStatus ? "Updating..." : "Reset to Placed"}
                    </Button>

                    <Button
                      variant="outline"
                      className="rounded-xl border-red-200 text-red-600 hover:bg-red-50"
                      disabled={updatingStatus}
                      onClick={() => handleUpdateStatus("Cancelled")}
                    >
                      {updatingStatus ? "Updating..." : "Cancel Order"}
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