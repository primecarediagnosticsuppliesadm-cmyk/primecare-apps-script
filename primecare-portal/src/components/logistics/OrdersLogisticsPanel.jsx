import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ux";
import ShipmentTimeline from "@/components/logistics/ShipmentTimeline.jsx";
import { getShipmentByOrderRead, getShipmentEventsRead } from "@/api/logisticsSupabaseApi.js";
import { buildShipmentTimeline, shipmentStatusLabel } from "@/logistics/logisticsShipmentEngine.js";
import { navigateToLogisticsDelivery } from "@/operations/hqWorkflowNav.js";
import { Loader2, Truck } from "lucide-react";

export default function OrdersLogisticsPanel({
  orderId,
  tenantId,
  setActivePage,
  orderFulfilled = false,
}) {
  const [loading, setLoading] = useState(false);
  const [shipment, setShipment] = useState(null);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!orderId || !tenantId || !orderFulfilled) {
      setShipment(null);
      setEvents([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void getShipmentByOrderRead({ tenantId, orderId }).then(async (res) => {
      if (cancelled) return;
      if (!res.success || !res.shipment) {
        setShipment(null);
        setEvents([]);
        setLoading(false);
        return;
      }
      setShipment(res.shipment);
      const evRes = await getShipmentEventsRead({
        tenantId,
        shipmentId: res.shipment.shipmentId,
      });
      if (!cancelled && evRes.success) setEvents(evRes.events || []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [orderId, tenantId, orderFulfilled]);

  const timeline = useMemo(
    () => buildShipmentTimeline(events, shipment?.dispatchStatus),
    [events, shipment?.dispatchStatus]
  );

  if (!orderFulfilled) return null;

  return (
    <section className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Truck className="h-3.5 w-3.5" />
          Logistics
        </h3>
        {setActivePage ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            onClick={() =>
              navigateToLogisticsDelivery(setActivePage, {
                orderId,
                shipmentId: shipment?.shipmentId,
              })
            }
          >
            Open in Logistics
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading shipment…
        </div>
      ) : shipment ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono text-slate-800">{shipment.shipmentId}</span>
            <StatusBadge variant="neutral">{shipmentStatusLabel(shipment.dispatchStatus)}</StatusBadge>
          </div>
          <ShipmentTimeline steps={timeline} />
        </>
      ) : (
        <p className="text-xs text-slate-500">
          Shipment will appear after fulfillment is saved (operational tracking only).
        </p>
      )}
    </section>
  );
}
