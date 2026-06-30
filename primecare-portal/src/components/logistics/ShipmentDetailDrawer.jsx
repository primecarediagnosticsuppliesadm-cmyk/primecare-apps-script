import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/ux";
import ShipmentTimeline from "@/components/logistics/ShipmentTimeline.jsx";
import {
  getShipmentEventsRead,
  transitionShipmentStatusWrite,
  updateShipmentAssignmentWrite,
} from "@/api/logisticsSupabaseApi.js";
import {
  ASSIGNEE_TYPE_OPTIONS,
  buildShipmentTimeline,
  DELIVERY_METHOD_OPTIONS,
  nextShipmentStatusOptions,
  shipmentStatusLabel,
  SHIPMENT_STATUS,
} from "@/logistics/logisticsShipmentEngine.js";
import { Loader2 } from "lucide-react";

function str(v) {
  return String(v ?? "").trim();
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
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    deliveryMethod: "",
    assignedToType: "",
    assignedToId: "",
    assignedToName: "",
    courierName: "",
    trackingNumber: "",
    vehicleRef: "",
    expectedDispatchBy: "",
    expectedDeliveryBy: "",
    deliveryNotes: "",
    receiverName: "",
    receiverPhone: "",
    deliveredAt: "",
    failureReason: "",
    rescheduledFor: "",
  });

  useEffect(() => {
    if (!open || !shipment) return;
    setForm({
      deliveryMethod: shipment.deliveryMethod || "",
      assignedToType: shipment.assignedToType || "",
      assignedToId: shipment.assignedToId || "",
      assignedToName: shipment.assignedToName || "",
      courierName: shipment.courierName || "",
      trackingNumber: shipment.trackingNumber || "",
      vehicleRef: shipment.vehicleRef || "",
      expectedDispatchBy: shipment.expectedDispatchBy || "",
      expectedDeliveryBy: shipment.expectedDeliveryBy || "",
      deliveryNotes: shipment.deliveryNotes || "",
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

  const timeline = useMemo(
    () => buildShipmentTimeline(events, shipment?.dispatchStatus),
    [events, shipment?.dispatchStatus]
  );

  const nextStatuses = useMemo(
    () => nextShipmentStatusOptions(shipment?.dispatchStatus),
    [shipment?.dispatchStatus]
  );

  if (!open || !shipment) return null;

  async function saveAssignment() {
    if (readOnly) return;
    setSaving(true);
    setError("");
    const res = await updateShipmentAssignmentWrite(shipment.shipmentId, {
      deliveryMethod: form.deliveryMethod,
      assignedToType: form.assignedToType,
      assignedToId: form.assignedToId,
      assignedToName: form.assignedToName,
      courierName: form.courierName,
      trackingNumber: form.trackingNumber,
      vehicleRef: form.vehicleRef,
      expectedDispatchBy: form.expectedDispatchBy,
      expectedDeliveryBy: form.expectedDeliveryBy,
      deliveryNotes: form.deliveryNotes,
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error || "Failed to save assignment");
      return;
    }
    onUpdated?.(res.data);
  }

  async function handleTransition(toStatus) {
    if (readOnly) return;
    setSaving(true);
    setError("");
    const pod = {
      receiverName: form.receiverName,
      receiverPhone: form.receiverPhone,
      deliveryNotes: form.deliveryNotes,
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
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assignment</h3>
            <Select
              value={form.deliveryMethod || "unset"}
              onValueChange={(v) => setForm((f) => ({ ...f, deliveryMethod: v === "unset" ? "" : v }))}
              disabled={readOnly}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Delivery method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">Select method</SelectItem>
                {DELIVERY_METHOD_OPTIONS.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={form.assignedToType || "unset"}
              onValueChange={(v) => setForm((f) => ({ ...f, assignedToType: v === "unset" ? "" : v }))}
              disabled={readOnly}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Assignee type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">Assignee type</SelectItem>
                {ASSIGNEE_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="h-8 text-xs"
              placeholder="Assigned to name"
              value={form.assignedToName}
              onChange={(e) => setForm((f) => ({ ...f, assignedToName: e.target.value }))}
              disabled={readOnly}
            />
            <Input
              className="h-8 text-xs"
              placeholder="Courier"
              value={form.courierName}
              onChange={(e) => setForm((f) => ({ ...f, courierName: e.target.value }))}
              disabled={readOnly}
            />
            <Input
              className="h-8 text-xs"
              placeholder="Tracking number"
              value={form.trackingNumber}
              onChange={(e) => setForm((f) => ({ ...f, trackingNumber: e.target.value }))}
              disabled={readOnly}
            />
            <Input
              className="h-8 text-xs"
              placeholder="Vehicle (optional)"
              value={form.vehicleRef}
              onChange={(e) => setForm((f) => ({ ...f, vehicleRef: e.target.value }))}
              disabled={readOnly}
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                className="h-8 text-xs"
                value={form.expectedDispatchBy}
                onChange={(e) => setForm((f) => ({ ...f, expectedDispatchBy: e.target.value }))}
                disabled={readOnly}
                aria-label="Expected dispatch by"
              />
              <Input
                type="date"
                className="h-8 text-xs"
                value={form.expectedDeliveryBy}
                onChange={(e) => setForm((f) => ({ ...f, expectedDeliveryBy: e.target.value }))}
                disabled={readOnly}
                aria-label="Expected delivery by"
              />
            </div>
            <Textarea
              className="min-h-[60px] text-xs"
              placeholder="Delivery notes"
              value={form.deliveryNotes}
              onChange={(e) => setForm((f) => ({ ...f, deliveryNotes: e.target.value }))}
              disabled={readOnly}
            />
            {!readOnly ? (
              <Button type="button" size="sm" className="h-8 text-xs" disabled={saving} onClick={() => void saveAssignment()}>
                Save assignment
              </Button>
            ) : null}
          </section>

          {(shipment.dispatchStatus === SHIPMENT_STATUS.DELIVERED ||
            nextStatuses.some((s) => s.id === SHIPMENT_STATUS.DELIVERED)) && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Proof of delivery
              </h3>
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
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</h3>
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
                    {opt.label}
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
