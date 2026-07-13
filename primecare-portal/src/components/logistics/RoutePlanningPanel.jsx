import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  assignShipmentToRouteWrite,
  completeDeliveryRouteWrite,
  createDeliveryRouteWrite,
  getDeliveryRoutesRead,
  getDeliveryRouteStopsRead,
  getLogisticsCouriersRead,
  getLogisticsWarehousesRead,
  getUnassignedShipmentsForPlanningRead,
  reorderRouteStopsWrite,
  removeShipmentFromRouteWrite,
  updateDeliveryRouteWrite,
  upsertLogisticsWarehouseWrite,
} from "@/api/logisticsSupabaseApi.js";
import {
  computeRoutePlanningKpis,
  DELIVERY_DAY_OPTIONS,
  deliveryDayLabel,
  groupShipmentsByPreferredDay,
  ROUTE_PLANNING_FUTURE,
  ROUTE_STATUS,
  routeStatusLabel,
} from "@/logistics/logisticsRouteEngine.js";
import { KpiCard, KpiCardGrid } from "@/components/ux";
import { Loader2, ArrowDown, ArrowUp, CheckCircle2, MapPin, Route, Truck } from "lucide-react";

function str(v) {
  return String(v ?? "").trim();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function RoutePlanningPanel({ tenantId, currentUser, readOnly = false, onChanged }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [routes, setRoutes] = useState([]);
  const [stopsByRoute, setStopsByRoute] = useState({});
  const [unassigned, setUnassigned] = useState([]);
  const [labPreferredDays, setLabPreferredDays] = useState({});
  const [warehouses, setWarehouses] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [plannedDate, setPlannedDate] = useState(todayIso());
  const [createForm, setCreateForm] = useState({
    routeName: "",
    warehouseId: "",
    deliveryDay: "mon",
    vehicleType: "",
    capacity: "20",
    courierId: "",
  });
  const [warehouseForm, setWarehouseForm] = useState({ warehouseName: "", city: "" });

  const actorId =
    currentUser?.email || currentUser?.userId || currentUser?.id || currentUser?.name || "";

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError("");
    const [routesRes, unassignedRes, whRes, courierRes] = await Promise.all([
      getDeliveryRoutesRead({ tenantId, plannedDate }),
      getUnassignedShipmentsForPlanningRead({ tenantId }),
      getLogisticsWarehousesRead({ tenantId }),
      getLogisticsCouriersRead({ tenantId, activeOnly: true }),
    ]);

    if (!routesRes.success) setError(routesRes.error || "Failed to load routes");
    else setRoutes(routesRes.routes || []);

    if (unassignedRes.success) {
      setUnassigned(unassignedRes.shipments || []);
      setLabPreferredDays(unassignedRes.labPreferredDays || {});
    }

    if (whRes.success) setWarehouses(whRes.warehouses || []);
    if (courierRes.success) setCouriers(courierRes.couriers || []);

    const stopMap = {};
    for (const route of routesRes.routes || []) {
      const stopsRes = await getDeliveryRouteStopsRead({ routeId: route.id });
      if (stopsRes.success) stopMap[route.id] = stopsRes.stops || [];
    }
    setStopsByRoute(stopMap);
    setLoading(false);
  }, [tenantId, plannedDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const routeKpis = useMemo(() => {
    const stopMap = new Map(Object.entries(stopsByRoute));
    return computeRoutePlanningKpis(routes, stopMap);
  }, [routes, stopsByRoute]);

  const groupedUnassigned = useMemo(
    () => groupShipmentsByPreferredDay(unassigned, new Map(Object.entries(labPreferredDays))),
    [unassigned, labPreferredDays]
  );

  const selectedRoute = routes.find((r) => r.id === selectedRouteId) || null;
  const selectedStops = stopsByRoute[selectedRouteId] || [];

  async function handleCreateRoute() {
    if (readOnly) return;
    setSaving(true);
    setError("");
    setMessage("");
    const res = await createDeliveryRouteWrite({
      tenantId,
      routeName: createForm.routeName,
      warehouseId: createForm.warehouseId,
      deliveryDay: createForm.deliveryDay,
      vehicleType: createForm.vehicleType,
      capacity: Number(createForm.capacity),
      plannedDate,
      courierId: createForm.courierId,
      actorId,
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error || "Failed to create route");
      return;
    }
    setMessage(`Route created: ${res.data.routeCode}`);
    setCreateForm((f) => ({ ...f, routeName: "" }));
    setSelectedRouteId(res.data.id);
    onChanged?.();
    await load();
  }

  async function handleCreateWarehouse() {
    if (readOnly || !str(warehouseForm.warehouseName)) return;
    setSaving(true);
    const res = await upsertLogisticsWarehouseWrite({
      tenantId,
      warehouseName: warehouseForm.warehouseName,
      city: warehouseForm.city,
      actorId,
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error || "Failed to create warehouse");
      return;
    }
    setWarehouseForm({ warehouseName: "", city: "" });
    await load();
  }

  async function handleAssignShipment(shipmentId) {
    if (readOnly || !selectedRouteId) return;
    setSaving(true);
    setError("");
    const res = await assignShipmentToRouteWrite({ routeId: selectedRouteId, shipmentId });
    setSaving(false);
    if (!res.success) {
      setError(res.error || "Failed to assign shipment");
      return;
    }
    onChanged?.();
    await load();
  }

  async function moveStop(shipmentId, direction) {
    if (readOnly || !selectedRouteId) return;
    const ids = selectedStops.map((s) => s.shipmentId);
    const idx = ids.indexOf(shipmentId);
    if (idx < 0) return;
    const nextIdx = direction === "up" ? idx - 1 : idx + 1;
    if (nextIdx < 0 || nextIdx >= ids.length) return;
    [ids[idx], ids[nextIdx]] = [ids[nextIdx], ids[idx]];
    setSaving(true);
    const res = await reorderRouteStopsWrite({ routeId: selectedRouteId, orderedShipmentIds: ids });
    setSaving(false);
    if (!res.success) {
      setError(res.error || "Failed to reorder stops");
      return;
    }
    setStopsByRoute((prev) => ({ ...prev, [selectedRouteId]: res.stops || [] }));
    onChanged?.();
  }

  async function handleRemoveStop(shipmentId) {
    if (readOnly || !selectedRouteId) return;
    setSaving(true);
    const res = await removeShipmentFromRouteWrite({ routeId: selectedRouteId, shipmentId });
    setSaving(false);
    if (!res.success) {
      setError(res.error || "Failed to remove stop");
      return;
    }
    onChanged?.();
    await load();
  }

  async function handleAssignDriver(courierId) {
    if (readOnly || !selectedRouteId) return;
    setSaving(true);
    const res = await updateDeliveryRouteWrite(selectedRouteId, {
      courierId,
      routeStatus: courierId ? ROUTE_STATUS.ASSIGNED : ROUTE_STATUS.PLANNING,
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error || "Failed to assign driver");
      return;
    }
    onChanged?.();
    await load();
  }

  async function handleMarkComplete(failed = false) {
    if (readOnly || !selectedRouteId) return;
    setSaving(true);
    const res = await completeDeliveryRouteWrite({ routeId: selectedRouteId, actorId, failed });
    setSaving(false);
    if (!res.success) {
      setError(res.error || "Failed to update route");
      return;
    }
    setMessage(failed ? "Route marked failed" : "Route marked complete");
    onChanged?.();
    await load();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-slate-500">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading route planning…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      ) : null}
      {message ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {message}
        </p>
      ) : null}

      <KpiCardGrid columns={3} className="sm:grid-cols-2 lg:grid-cols-6">
        <KpiCard title="Routes Today" value={routeKpis.routesToday} icon={Route} />
        <KpiCard title="Vehicles Out" value={routeKpis.vehiclesOut} icon={Truck} />
        <KpiCard title="Avg Stops" value={routeKpis.averageStops} icon={MapPin} />
        <KpiCard title="Planned Deliveries" value={routeKpis.plannedDeliveries} icon={MapPin} />
        <KpiCard title="Completed Routes" value={routeKpis.completedRoutes} icon={CheckCircle2} />
        <KpiCard title="Failed Routes" value={routeKpis.failedRoutes} icon={CheckCircle2} />
      </KpiCardGrid>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Create Route</h2>
          <p className="mt-1 text-xs text-slate-500">
            Operational planning only — no finance, invoice, or payment changes.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Input
              className="h-8 text-xs sm:col-span-2"
              placeholder="Route name *"
              value={createForm.routeName}
              onChange={(e) => setCreateForm((f) => ({ ...f, routeName: e.target.value }))}
              disabled={readOnly}
            />
            <Input
              type="date"
              className="h-8 text-xs"
              value={plannedDate}
              onChange={(e) => setPlannedDate(e.target.value)}
              disabled={readOnly}
            />
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={createForm.deliveryDay}
              onChange={(e) => setCreateForm((f) => ({ ...f, deliveryDay: e.target.value }))}
              disabled={readOnly}
            >
              {DELIVERY_DAY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              value={createForm.warehouseId}
              onChange={(e) => setCreateForm((f) => ({ ...f, warehouseId: e.target.value }))}
              disabled={readOnly}
            >
              <option value="">Warehouse (optional)</option>
              {warehouses.map((w) => (
                <option key={w.warehouseId} value={w.warehouseId}>
                  {w.warehouseName}
                </option>
              ))}
            </select>
            <Input
              className="h-8 text-xs"
              placeholder="Vehicle type"
              value={createForm.vehicleType}
              onChange={(e) => setCreateForm((f) => ({ ...f, vehicleType: e.target.value }))}
              disabled={readOnly}
            />
            <Input
              type="number"
              min="1"
              className="h-8 text-xs"
              placeholder="Capacity"
              value={createForm.capacity}
              onChange={(e) => setCreateForm((f) => ({ ...f, capacity: e.target.value }))}
              disabled={readOnly}
            />
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-xs sm:col-span-2"
              value={createForm.courierId}
              onChange={(e) => setCreateForm((f) => ({ ...f, courierId: e.target.value }))}
              disabled={readOnly}
            >
              <option value="">Driver / courier (optional)</option>
              {couriers.map((c) => (
                <option key={c.courierId} value={c.courierId}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {!readOnly ? (
            <Button type="button" size="sm" className="mt-3 h-8 text-xs" disabled={saving} onClick={() => void handleCreateRoute()}>
              Create route
            </Button>
          ) : null}

          <div className="mt-4 border-t pt-3">
            <p className="text-[11px] font-medium text-slate-700">Add warehouse</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Input
                className="h-8 flex-1 text-xs"
                placeholder="Warehouse name"
                value={warehouseForm.warehouseName}
                onChange={(e) => setWarehouseForm((f) => ({ ...f, warehouseName: e.target.value }))}
                disabled={readOnly}
              />
              <Input
                className="h-8 w-32 text-xs"
                placeholder="City"
                value={warehouseForm.city}
                onChange={(e) => setWarehouseForm((f) => ({ ...f, city: e.target.value }))}
                disabled={readOnly}
              />
              {!readOnly ? (
                <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={saving} onClick={() => void handleCreateWarehouse()}>
                  Add
                </Button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Routes — {plannedDate}</h2>
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
            {routes.length === 0 ? (
              <p className="text-xs text-slate-500">No routes for this date.</p>
            ) : (
              routes.map((route) => (
                <button
                  key={route.id}
                  type="button"
                  onClick={() => setSelectedRouteId(route.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition ${
                    selectedRouteId === route.id
                      ? "border-indigo-300 bg-indigo-50"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <p className="font-medium text-slate-900">{route.routeName}</p>
                  <p className="text-[10px] text-slate-500">
                    {route.routeCode} · {deliveryDayLabel(route.deliveryDay)} ·{" "}
                    {routeStatusLabel(route.routeStatus)} · {(stopsByRoute[route.id] || []).length}/
                    {route.capacity} stops
                  </p>
                </button>
              ))
            )}
          </div>
        </section>
      </div>

      {selectedRoute ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{selectedRoute.routeName}</h2>
              <p className="text-xs text-slate-500">
                {selectedRoute.routeCode} · {routeStatusLabel(selectedRoute.routeStatus)}
              </p>
            </div>
            {!readOnly ? (
              <div className="flex flex-wrap gap-2">
                <select
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  value={selectedRoute.courierId || ""}
                  onChange={(e) => void handleAssignDriver(e.target.value)}
                  disabled={saving}
                >
                  <option value="">Assign driver</option>
                  {couriers.map((c) => (
                    <option key={c.courierId} value={c.courierId}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={saving} onClick={() => void handleMarkComplete(false)}>
                  Mark complete
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={saving} onClick={() => void handleMarkComplete(true)}>
                  Mark failed
                </Button>
              </div>
            ) : null}
          </div>

          <div className="mt-3 space-y-2">
            {selectedStops.length === 0 ? (
              <p className="text-xs text-slate-500">No stops assigned yet.</p>
            ) : (
              selectedStops.map((stop) => (
                <div key={stop.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs">
                  <span className="font-mono text-slate-500">#{stop.sequenceNumber}</span>
                  <div className="flex-1">
                    <p className="font-medium text-slate-900">{stop.shipment?.labName || stop.shipmentId}</p>
                    <p className="text-[10px] text-slate-500">
                      {stop.shipment?.orderId} · {stop.shipment?.labCity || "—"}
                    </p>
                  </div>
                  {!readOnly ? (
                    <>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => void moveStop(stop.shipmentId, "up")}>
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => void moveStop(stop.shipmentId, "down")}>
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => void handleRemoveStop(stop.shipmentId)}>
                        Remove
                      </Button>
                    </>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Unassigned Shipments by Preferred Delivery Day</h2>
        <p className="mt-1 text-xs text-slate-500">
          Grouped by lab preferred delivery day. Select a route above, then assign shipments.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {DELIVERY_DAY_OPTIONS.map((day) => {
            const rows = groupedUnassigned[day.value] || [];
            return (
              <div key={day.value} className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-800">{day.label}</p>
                <p className="text-[10px] text-slate-500">{rows.length} shipment(s)</p>
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                  {rows.map((s) => (
                    <li key={s.shipmentId} className="flex items-center justify-between gap-1 text-[10px]">
                      <span className="truncate">{s.labName || s.shipmentId}</span>
                      {!readOnly && selectedRouteId ? (
                        <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[10px]" disabled={saving} onClick={() => void handleAssignShipment(s.shipmentId)}>
                          Add
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
        <p className="text-xs font-medium text-slate-700">Future foundation (not implemented)</p>
        <p className="mt-1 text-[11px] text-slate-500">{ROUTE_PLANNING_FUTURE.join(" · ")}</p>
      </section>
    </div>
  );
}
