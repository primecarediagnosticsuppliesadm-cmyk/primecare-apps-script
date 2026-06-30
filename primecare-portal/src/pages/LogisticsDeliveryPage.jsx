import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  PageHeader,
  KpiCard,
  KpiCardGrid,
  StatusBadge,
  DataFetchError,
  PageSkeleton,
} from "@/components/ux";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getLogisticsShipmentsRead } from "@/api/logisticsSupabaseApi.js";
import {
  computeLogisticsKpis,
  deliveryMethodLabel,
  DISPATCH_QUEUE_FILTERS,
  filterShipments,
  shipmentStatusLabel,
  sortShipmentsByCreatedDesc,
} from "@/logistics/logisticsShipmentEngine.js";
import ShipmentDetailDrawer from "@/components/logistics/ShipmentDetailDrawer.jsx";
import { consumeHqNavContext } from "@/operations/hqGlobalSearchEngine.js";
import { ROLES } from "@/config/roles.js";
import { cn } from "@/lib/utils";
import {
  Truck,
  Package,
  Navigation,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
} from "lucide-react";

function str(v) {
  return String(v ?? "").trim();
}

function resolveTenantId(currentUser) {
  return str(currentUser?.tenantId || currentUser?.tenant_id) || null;
}

function formatCurrency(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(value) {
  const raw = str(value);
  if (!raw) return "—";
  const d = new Date(raw.length <= 10 ? `${raw}T12:00:00` : raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(value) {
  const raw = str(value);
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LogisticsDeliveryPage({ currentUser = null, setActivePage = null }) {
  const tenantId = resolveTenantId(currentUser);
  const readOnly = str(currentUser?.role).toLowerCase() === ROLES.READ_ONLY_AUDITOR;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [shipments, setShipments] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const load = useCallback(
    async ({ force = false } = {}) => {
      if (!tenantId) {
        setError("Tenant context missing.");
        setLoading(false);
        return;
      }
      try {
        if (force) setRefreshing(true);
        else setLoading(true);
        setError("");
        const res = await getLogisticsShipmentsRead({ tenantId });
        if (!res.success) {
          setError(res.error || "Failed to load shipments");
          return;
        }
        setShipments(res.shipments || []);
        setWarning(res.warning || "");
      } catch (err) {
        setError(err?.message || "Failed to load logistics data");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tenantId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const ctx = consumeHqNavContext("logisticsDelivery");
    if (!ctx) return;
    if (ctx.statusFilter) setStatusFilter(str(ctx.statusFilter));
    if (ctx.search) setSearch(str(ctx.search));
    if (ctx.shipmentId && shipments.length) {
      const match = shipments.find((s) => s.shipmentId === str(ctx.shipmentId));
      if (match) {
        setSelectedShipment(match);
        setDrawerOpen(true);
      }
    } else if (ctx.orderId && shipments.length) {
      const match = shipments.find((s) => s.orderId === str(ctx.orderId));
      if (match) {
        setSelectedShipment(match);
        setDrawerOpen(true);
      }
    }
  }, [shipments]);

  const kpis = useMemo(() => computeLogisticsKpis(shipments), [shipments]);

  const filteredRows = useMemo(() => {
    const filtered = filterShipments(shipments, { statusFilter, search });
    return sortShipmentsByCreatedDesc(filtered);
  }, [shipments, statusFilter, search]);

  function openShipment(row) {
    setSelectedShipment(row);
    setDrawerOpen(true);
  }

  function handleShipmentUpdated(updated) {
    if (!updated?.shipmentId) return;
    setShipments((prev) =>
      prev.map((row) => (row.shipmentId === updated.shipmentId ? updated : row))
    );
    setSelectedShipment(updated);
  }

  if (loading && !shipments.length) {
    return <PageSkeleton rows={10} />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-3 pb-8">
      <PageHeader
        title="Logistics & Delivery"
        subtitle="Operational dispatch queue — shipments are separate from order finance."
        icon={Truck}
        rightAction={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => void load({ force: true })}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      {error ? (
        <DataFetchError
          message={error}
          onRetry={() => void load({ force: true })}
          retrying={refreshing}
          staleDataNote={shipments.length ? "Showing last loaded dispatch data." : ""}
        />
      ) : null}

      {warning ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {warning}
        </p>
      ) : null}

      <KpiCardGrid columns={4}>
        <KpiCard
          title="Ready For Dispatch"
          value={kpis.readyForDispatch}
          subtitle="Awaiting assignment"
          icon={Package}
          onClick={() => setStatusFilter("ready_for_dispatch")}
        />
        <KpiCard
          title="Out For Delivery"
          value={kpis.outForDelivery}
          subtitle="In transit"
          icon={Navigation}
          onClick={() => setStatusFilter("out_for_delivery")}
        />
        <KpiCard
          title="Delivered Today"
          value={kpis.deliveredToday}
          subtitle="Completed today"
          icon={CheckCircle2}
          onClick={() => setStatusFilter("delivered")}
        />
        <KpiCard
          title="Failed Deliveries"
          value={kpis.failedDeliveries}
          subtitle="Needs attention"
          icon={AlertTriangle}
          onClick={() => setStatusFilter("delivery_failed")}
        />
      </KpiCardGrid>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Dispatch Queue</h2>
              <p className="text-xs text-slate-500">{filteredRows.length} shipments</p>
            </div>
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <Input
                className="h-8 pl-8 text-xs"
                placeholder="Search shipment, order, lab…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {DISPATCH_QUEUE_FILTERS.map((f) => {
              const active = statusFilter === f.id;
              return (
                <button
                  key={f.id || "all"}
                  type="button"
                  onClick={() => setStatusFilter(f.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                    active
                      ? "border-indigo-300 bg-indigo-50 text-indigo-800"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  )}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Shipment</th>
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Lab</th>
                <th className="px-3 py-2">City</th>
                <th className="px-3 py-2 text-right">Order Value</th>
                <th className="px-3 py-2">Delivery Method</th>
                <th className="px-3 py-2">Assigned To</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Expected Delivery</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-slate-500">
                    No shipments match this filter.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr
                    key={row.shipmentId}
                    className="cursor-pointer hover:bg-slate-50/80"
                    onClick={() => openShipment(row)}
                  >
                    <td className="px-3 py-2 font-mono text-slate-900">{row.shipmentId}</td>
                    <td className="px-3 py-2 font-mono">{row.orderId}</td>
                    <td className="px-3 py-2">{row.labName || row.labId || "—"}</td>
                    <td className="px-3 py-2">{row.labCity || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatCurrency(row.orderValue)}
                    </td>
                    <td className="px-3 py-2">{deliveryMethodLabel(row.deliveryMethod)}</td>
                    <td className="px-3 py-2">{row.assignedToName || "—"}</td>
                    <td className="px-3 py-2">
                      <StatusBadge variant="neutral" compact>
                        {shipmentStatusLabel(row.dispatchStatus)}
                      </StatusBadge>
                    </td>
                    <td className="px-3 py-2">{formatDate(row.expectedDeliveryBy)}</td>
                    <td className="px-3 py-2">{formatDateTime(row.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ShipmentDetailDrawer
        open={drawerOpen}
        shipment={selectedShipment}
        tenantId={tenantId}
        currentUser={currentUser}
        readOnly={readOnly}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedShipment(null);
        }}
        onUpdated={handleShipmentUpdated}
      />
    </div>
  );
}
