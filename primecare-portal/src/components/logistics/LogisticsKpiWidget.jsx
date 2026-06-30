import React, { useEffect, useState } from "react";
import { KpiCard, KpiCardGrid } from "@/components/ux";
import { getLogisticsShipmentsRead } from "@/api/logisticsSupabaseApi.js";
import { computeLogisticsKpis } from "@/logistics/logisticsShipmentEngine.js";
import { navigateToLogisticsDelivery } from "@/operations/hqWorkflowNav.js";
import { Package, Navigation, CheckCircle2, AlertTriangle } from "lucide-react";

export default function LogisticsKpiWidget({ tenantId, setActivePage }) {
  const [kpis, setKpis] = useState({
    readyForDispatch: 0,
    outForDelivery: 0,
    deliveredToday: 0,
    failedDeliveries: 0,
  });

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    void getLogisticsShipmentsRead({ tenantId }).then((res) => {
      if (cancelled || !res.success) return;
      setKpis(computeLogisticsKpis(res.shipments || []));
    });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const open = (statusFilter = "") => {
    if (typeof setActivePage !== "function") return;
    navigateToLogisticsDelivery(setActivePage, { statusFilter });
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Logistics & Delivery</h2>
          <p className="text-xs text-slate-500">Operational dispatch overview</p>
        </div>
        {setActivePage ? (
          <button
            type="button"
            onClick={() => open()}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Open Logistics
          </button>
        ) : null}
      </div>
      <KpiCardGrid columns={4}>
        <KpiCard
          title="Ready"
          value={kpis.readyForDispatch}
          subtitle="Awaiting dispatch"
          icon={Package}
          onClick={() => open("ready_for_dispatch")}
        />
        <KpiCard
          title="Out For Delivery"
          value={kpis.outForDelivery}
          subtitle="In transit"
          icon={Navigation}
          onClick={() => open("out_for_delivery")}
        />
        <KpiCard
          title="Delivered Today"
          value={kpis.deliveredToday}
          subtitle="Completed today"
          icon={CheckCircle2}
          onClick={() => open("delivered")}
        />
        <KpiCard
          title="Failed"
          value={kpis.failedDeliveries}
          subtitle="Needs attention"
          icon={AlertTriangle}
          onClick={() => open("delivery_failed")}
        />
      </KpiCardGrid>
    </div>
  );
}
