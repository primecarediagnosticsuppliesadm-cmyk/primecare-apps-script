import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ux";
import ShipmentTimeline from "@/components/logistics/ShipmentTimeline.jsx";
import {
  getLogisticsCouriersRead,
  getShipmentEventsRead,
  getShipmentRouteAssignmentRead,
  transitionShipmentStatusWrite,
  updateShipmentAssignmentWrite,
} from "@/api/logisticsSupabaseApi.js";
import {
  applyOrderDeliveryOverrideWrite,
  getOrderDeliverySnapshotRead,
  getOrderInvoiceForDeliveryOverrideRead,
} from "@/api/deliveryChargeSupabaseApi.js";
import {
  canEditDeliveryChargeOverride,
  deliveryChargeReasonLabel,
} from "@/logistics/deliveryChargeEngine.js";
import {
  ASSIGNMENT_TYPE,
  ASSIGNMENT_TYPE_OPTIONS,
  assignmentTypeLabel,
  assignmentTypeToDeliveryFields,
  deliveryMethodToAssignmentType,
  isCustomerPickupAssignment,
  isExternalCourierAssignment,
  validateShipmentAssignment,
} from "@/logistics/logisticsCourierEngine.js";
import {
  buildShipmentTimeline,
  dispatchActionLabel,
  nextShipmentStatusOptions,
  shipmentStatusLabel,
  SHIPMENT_STATUS,
} from "@/logistics/logisticsShipmentEngine.js";
import { deliveryDayLabel, formatDeliveryWindow } from "@/logistics/logisticsRouteEngine.js";
import { Loader2 } from "lucide-react";

function str(v) {
  return String(v ?? "").trim();
}

function formatDateTime(value) {
  const raw = str(value);
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ShipmentDetailDrawer({
  open,
  shipment,
  tenantId,
  currentUser,
  readOnly = false,
  onClose,
  onUpdated,
}) {
  const [events, setEvents] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    assignmentType: "",
    courierId: "",
    assignedToName: "",
    trackingNumber: "",
    expectedDeliveryBy: "",
    dispatchNotes: "",
    receiverName: "",
    receiverPhone: "",
    deliveredAt: "",
    failureReason: "",
    rescheduledFor: "",
  });
  const [orderDelivery, setOrderDelivery] = useState(null);
  const [canOverrideDelivery, setCanOverrideDelivery] = useState(false);
  const [overrideAmount, setOverrideAmount] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [savingOverride, setSavingOverride] = useState(false);
  const [routeAssignment, setRouteAssignment] = useState(null);

  useEffect(() => {
    if (!open || !shipment) return;
    const assignmentType =
      deliveryMethodToAssignmentType(shipment.deliveryMethod, shipment.assignedToType) || "";
    setForm({
      assignmentType,
      courierId: shipment.courierId || "",
      assignedToName: shipment.assignedToName || "",
      trackingNumber: shipment.trackingNumber || "",
      expectedDeliveryBy: shipment.expectedDeliveryBy || "",
      dispatchNotes: shipment.dispatchNotes || "",
      receiverName: shipment.receiverName || "",
      receiverPhone: shipment.receiverPhone || "",
      deliveredAt: shipment.deliveredAt
        ? shipment.deliveredAt.slice(0, 16)
        : new Date().toISOString().slice(0, 16),
      failureReason: shipment.failureReason || "",
      rescheduledFor: shipment.rescheduledFor || "",
    });
    setError("");
  }, [open, shipment]);

  useEffect(() => {
    if (!open || !tenantId) return;
    void getLogisticsCouriersRead({ tenantId, activeOnly: true }).then((res) => {
      if (res.success) setCouriers(res.couriers || []);
    });
  }, [open, tenantId]);

  useEffect(() => {
    if (!open || !shipment?.shipmentId) return;
    let cancelled = false;
    setLoadingEvents(true);
    void getShipmentEventsRead({ tenantId, shipmentId: shipment.shipmentId }).then((res) => {
      if (cancelled) return;
      if (res.success) setEvents(res.events || []);
      setLoadingEvents(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, shipment?.shipmentId, tenantId]);

  useEffect(() => {
    if (!open || !tenantId || !shipment?.orderId) return;
    let cancelled = false;
    void (async () => {
      const [deliveryRes, invRes] = await Promise.all([
        getOrderDeliverySnapshotRead({ tenantId, orderId: shipment.orderId }),
        getOrderInvoiceForDeliveryOverrideRead({ tenantId, orderId: shipment.orderId }),
      ]);
      if (cancelled) return;
      const delivery = deliveryRes.delivery;
      setOrderDelivery(delivery);
      setCanOverrideDelivery(canEditDeliveryChargeOverride(invRes.invoice || {}));
      if (delivery?.hasHqOverride) {
        setOverrideAmount(String(delivery.overrideAmount ?? delivery.deliveryChargeAmount ?? ""));
        setOverrideReason(delivery.overrideReason || "");
      } else {
        setOverrideAmount(
          delivery?.deliveryChargeAmount != null ? String(delivery.deliveryChargeAmount) : ""
        );
        setOverrideReason("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tenantId, shipment?.orderId, shipment?.deliveryChargeAmount]);

  useEffect(() => {
    if (!open || !shipment?.shipmentId) return;
    let cancelled = false;
    void getShipmentRouteAssignmentRead({ shipmentId: shipment.shipmentId }).then((res) => {
      if (cancelled) return;
      if (res.success) setRouteAssignment(res.assignment);
    });
    return () => {
      cancelled = true;
    };
  }, [open, shipment?.shipmentId]);

  const timeline = useMemo(
    () => buildShipmentTimeline(events, shipment?.dispatchStatus),
    [events, shipment?.dispatchStatus]
  );

  const nextStatuses = useMemo(
    () => nextShipmentStatusOptions(shipment?.dispatchStatus),
    [shipment?.dispatchStatus]
  );

  const selectedCourier = useMemo(
    () => couriers.find((c) => c.courierId === form.courierId),
    [couriers, form.courierId]
  );

  const externalCourier = isExternalCourierAssignment(form.assignmentType);
  const customerPickup = isCustomerPickupAssignment(form.assignmentType);

  if (!open || !shipment) return null;

  function buildAssignmentPayload() {
    const mapped = assignmentTypeToDeliveryFields(form.assignmentType);
    const courier = couriers.find((c) => c.courierId === form.courierId);
    return {
      deliveryMethod: mapped.deliveryMethod,
      assignedToType: mapped.assignedToType || null,
      assignedToName: customerPickup ? null : str(form.assignedToName) || null,
      courierId: externalCourier ? str(form.courierId) || null : null,
      courierName: externalCourier ? courier?.name || shipment.courierName || null : null,
      trackingNumber: externalCourier ? str(form.trackingNumber) || null : null,
      expectedDeliveryBy: str(form.expectedDeliveryBy) || null,
      dispatchNotes: str(form.dispatchNotes) || null,
    };
  }

  async function saveAssignment() {
    if (readOnly) return false;
    const validation = validateShipmentAssignment({
      assignmentType: form.assignmentType,
      courierId: form.courierId,
      assignedToName: form.assignedToName,
      trackingNumber: form.trackingNumber,
    });
    if (!validation.valid) {
      setError(validation.error);
      return false;
    }
    setSaving(true);
    setError("");
    const res = await updateShipmentAssignmentWrite(shipment.shipmentId, buildAssignmentPayload());
    setSaving(false);
    if (!res.success) {
      setError(res.error || "Failed to save assignment");
      return false;
    }
    onUpdated?.(res.data);
    return true;
  }

  async function saveDeliveryOverride() {
    if (readOnly || !canOverrideDelivery) return false;
    const reason = str(overrideReason);
    if (!reason) {
      setError("Override reason is required");
      return false;
    }
    if (overrideAmount === "" || overrideAmount == null) {
      setError("Override amount is required");
      return false;
    }
    setSavingOverride(true);
    setError("");
    const res = await applyOrderDeliveryOverrideWrite({
      tenantId,
      orderId: shipment.orderId,
      labId: shipment.labId,
      overrideAmount: Number(overrideAmount),
      overrideReason: reason,
      actorId: currentUser?.id || currentUser?.userId || currentUser?.email,
    });
    setSavingOverride(false);
    if (!res.success) {
      setError(res.error || "Failed to save delivery override");
      return false;
    }
    setOrderDelivery(res.data);
    onUpdated?.({
      ...shipment,
      deliveryChargeAmount: res.data?.deliveryChargeAmount ?? 0,
      deliveryChargeReason: res.data?.deliveryChargeReason ?? "",
    });
    return true;
  }

  async function handleTransition(toStatus) {
    if (readOnly) return;
    const needsAssignment =
      toStatus === SHIPMENT_STATUS.ASSIGNED || toStatus === SHIPMENT_STATUS.OUT;
    if (needsAssignment) {
      const saved = await saveAssignment();
      if (!saved) return;
    }
    setSaving(true);
    setError("");
    const pod = {
      receiverName: form.receiverName,
      receiverPhone: form.receiverPhone,
      deliveredAt: form.deliveredAt ? new Date(form.deliveredAt).toISOString() : undefined,
      failureReason: form.failureReason,
      rescheduledFor: form.rescheduledFor,
    };
    const res = await transitionShipmentStatusWrite({
      shipmentId: shipment.shipmentId,
      tenantId,
      toStatus,
      actorId: currentUser?.id || currentUser?.userId || currentUser?.email,
      pod,
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error || "Status update failed");
      return;
    }
    const evRes = await getShipmentEventsRead({ tenantId, shipmentId: shipment.shipmentId });
    if (evRes.success) setEvents(evRes.events || []);
    onUpdated?.(res.data);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <p className="font-mono text-sm font-semibold text-slate-900">{shipment.shipmentId}</p>
            <p className="text-xs text-slate-500">Order {shipment.orderId}</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge variant="neutral">{shipmentStatusLabel(shipment.dispatchStatus)}</StatusBadge>
            <span className="text-xs text-slate-600">{shipment.labName || shipment.labId}</span>
          </div>

          {error ? <p className="text-xs text-amber-700">{error}</p> : null}

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Delivery Charge (operational)
            </h3>
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-700">
              <p>
                <span className="text-slate-500">Charge:</span>{" "}
                ₹{Number(shipment.deliveryChargeAmount ?? orderDelivery?.deliveryChargeAmount ?? 0).toLocaleString("en-IN")}
              </p>
              <p>
                <span className="text-slate-500">Reason:</span>{" "}
                {deliveryChargeReasonLabel(
                  shipment.deliveryChargeReason || orderDelivery?.deliveryChargeReason
                )}
              </p>
              {orderDelivery?.hasHqOverride ? (
                <p className="mt-1 text-[10px] text-slate-500">
                  HQ override by {orderDelivery.overrideBy || "—"}
                </p>
              ) : null}
            </div>
            {!readOnly && canOverrideDelivery ? (
              <div className="space-y-2 rounded-lg border border-dashed border-slate-300 p-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                  HQ override (before invoice sent)
                </p>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  className="h-8 text-xs"
                  placeholder="Override amount (₹)"
                  value={overrideAmount}
                  onChange={(e) => setOverrideAmount(e.target.value)}
                />
                <Textarea
                  className="min-h-[52px] text-xs"
                  placeholder="Override reason *"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={savingOverride}
                  onClick={() => void saveDeliveryOverride()}
                >
                  {savingOverride ? "Saving…" : "Apply override"}
                </Button>
              </div>
            ) : !readOnly && !canOverrideDelivery ? (
              <p className="text-[10px] text-slate-500">
                Delivery override locked — invoice has already been sent.
              </p>
            ) : null}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Route Planning
            </h3>
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-700">
              <p>
                <span className="text-slate-500">Assigned route:</span>{" "}
                {routeAssignment?.route?.routeName || routeAssignment?.route?.routeCode || "—"}
              </p>
              <p>
                <span className="text-slate-500">Delivery sequence:</span>{" "}
                {routeAssignment?.sequenceNumber ? `#${routeAssignment.sequenceNumber}` : "—"}
              </p>
              <p>
                <span className="text-slate-500">Warehouse:</span>{" "}
                {routeAssignment?.warehouse?.warehouseName || "—"}
              </p>
              <p>
                <span className="text-slate-500">Est. delivery window:</span>{" "}
                {formatDeliveryWindow(routeAssignment)}
              </p>
              {routeAssignment?.route?.deliveryDay ? (
                <p>
                  <span className="text-slate-500">Route day:</span>{" "}
                  {deliveryDayLabel(routeAssignment.route.deliveryDay)}
                </p>
              ) : null}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Dispatch Assignment
            </h3>
            <Select
              value={form.assignmentType || "unset"}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  assignmentType: v === "unset" ? "" : v,
                  courierId: v === ASSIGNMENT_TYPE.EXTERNAL_COURIER ? f.courierId : "",
                  trackingNumber:
                    v === ASSIGNMENT_TYPE.CUSTOMER_PICKUP ? "" : f.trackingNumber,
                }))
              }
              disabled={readOnly}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Assignment type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">Select assignment type</SelectItem>
                {ASSIGNMENT_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {!customerPickup ? (
              <Input
                className="h-8 text-xs"
                placeholder="Assigned person *"
                value={form.assignedToName}
                onChange={(e) => setForm((f) => ({ ...f, assignedToName: e.target.value }))}
                disabled={readOnly}
              />
            ) : null}

            {externalCourier ? (
              <>
                <Select
                  value={form.courierId || "unset"}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, courierId: v === "unset" ? "" : v }))
                  }
                  disabled={readOnly}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Assigned courier *" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">Select courier</SelectItem>
                    {couriers.map((c) => (
                      <SelectItem key={c.courierId} value={c.courierId}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedCourier ? (
                  <p className="text-[10px] text-slate-500">
                    {selectedCourier.contactPerson || "—"} · {selectedCourier.phone || "—"}
                  </p>
                ) : null}
                <Input
                  className="h-8 text-xs"
                  placeholder="Tracking number *"
                  value={form.trackingNumber}
                  onChange={(e) => setForm((f) => ({ ...f, trackingNumber: e.target.value }))}
                  disabled={readOnly}
                />
              </>
            ) : null}

            <Input
              type="date"
              className="h-8 text-xs"
              value={form.expectedDeliveryBy}
              onChange={(e) => setForm((f) => ({ ...f, expectedDeliveryBy: e.target.value }))}
              disabled={readOnly}
              aria-label="Expected delivery date"
            />
            <Textarea
              className="min-h-[60px] text-xs"
              placeholder="Dispatch notes"
              value={form.dispatchNotes}
              onChange={(e) => setForm((f) => ({ ...f, dispatchNotes: e.target.value }))}
              disabled={readOnly}
            />
            {!readOnly ? (
              <Button
                type="button"
                size="sm"
                className="h-8 text-xs"
                disabled={saving}
                onClick={() => void saveAssignment()}
              >
                Save assignment
              </Button>
            ) : null}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Courier Information
            </h3>
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-700">
              <p>
                <span className="text-slate-500">Type:</span>{" "}
                {assignmentTypeLabel(form.assignmentType) || "—"}
              </p>
              <p>
                <span className="text-slate-500">Courier:</span>{" "}
                {selectedCourier?.name || shipment.courierName || "—"}
              </p>
              <p>
                <span className="text-slate-500">Tracking:</span> {form.trackingNumber || "—"}
              </p>
              <p>
                <span className="text-slate-500">Expected delivery:</span>{" "}
                {form.expectedDeliveryBy || "—"}
              </p>
              <p>
                <span className="text-slate-500">Actual delivery:</span>{" "}
                {formatDateTime(shipment.deliveredAt)}
              </p>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Receiver</h3>
            <Input
              className="h-8 text-xs"
              placeholder="Receiver name"
              value={form.receiverName}
              onChange={(e) => setForm((f) => ({ ...f, receiverName: e.target.value }))}
              disabled={readOnly}
            />
            <Input
              className="h-8 text-xs"
              placeholder="Receiver phone"
              value={form.receiverPhone}
              onChange={(e) => setForm((f) => ({ ...f, receiverPhone: e.target.value }))}
              disabled={readOnly}
            />
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Delivery Proof
            </h3>
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">
              Photo and signature capture will be available in a future phase.
            </div>
          </section>

          {(shipment.dispatchStatus === SHIPMENT_STATUS.DELIVERED ||
            nextStatuses.some((s) => s.id === SHIPMENT_STATUS.DELIVERED)) && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Delivered timestamp
              </h3>
              <Input
                type="datetime-local"
                className="h-8 text-xs"
                value={form.deliveredAt}
                onChange={(e) => setForm((f) => ({ ...f, deliveredAt: e.target.value }))}
                disabled={readOnly}
                aria-label="Delivered at"
              />
            </section>
          )}

          {!readOnly && nextStatuses.length ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Dispatch Actions
              </h3>
              <div className="flex flex-wrap gap-2">
                {nextStatuses.map((opt) => (
                  <Button
                    key={opt.id}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    disabled={saving}
                    onClick={() => void handleTransition(opt.id)}
                  >
                    {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                    {dispatchActionLabel(opt.id)}
                  </Button>
                ))}
              </div>
              {nextStatuses.some((s) => s.id === SHIPMENT_STATUS.FAILED) ? (
                <Input
                  className="h-8 text-xs"
                  placeholder="Failure reason"
                  value={form.failureReason}
                  onChange={(e) => setForm((f) => ({ ...f, failureReason: e.target.value }))}
                />
              ) : null}
              {nextStatuses.some((s) => s.id === SHIPMENT_STATUS.RESCHEDULED) ? (
                <Input
                  type="date"
                  className="h-8 text-xs"
                  value={form.rescheduledFor}
                  onChange={(e) => setForm((f) => ({ ...f, rescheduledFor: e.target.value }))}
                  aria-label="Rescheduled for"
                />
              ) : null}
            </section>
          ) : null}

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Timeline</h3>
            {loadingEvents ? (
              <p className="text-xs text-slate-500">Loading timeline…</p>
            ) : (
              <ShipmentTimeline steps={timeline} />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
