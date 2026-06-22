import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { KpiCard, KpiCardGrid } from "@/components/ux";
import {
  ACCESS_AUDIT_ACTION_OPTIONS,
  buildAccessAuditContext,
  computeAccessAuditKpis,
  enrichAccessAuditEvents,
  filterAccessAuditEvents,
  validateAccessAuditIntegrity,
} from "@/operations/accessAuditEngine.js";
import { cn } from "@/lib/utils";
import { RefreshCw, Search, Shield, X } from "lucide-react";

function StatusPill({ status }) {
  const isSuccess = status === "Success";
  return (
    <Badge variant={isSuccess ? "default" : "destructive"} className="text-[10px]">
      {status}
    </Badge>
  );
}

function AuditDetailDrawer({ event, onClose }) {
  if (!event) return null;

  const hasPrevious = Object.keys(event.previousValues || {}).length > 0;
  const hasNext = Object.keys(event.newValues || {}).length > 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true">
      <div className="h-full w-full max-w-xl overflow-y-auto border-l bg-white p-4 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Access Audit</p>
            <h3 className="text-sm font-bold text-slate-900">{event.actionLabel}</h3>
            <p className="text-xs text-slate-600">{event.timestampLabel}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <dl className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div>
              <dt className="text-slate-500">Performed by</dt>
              <dd className="font-medium text-slate-900">{event.performedByName}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Target user</dt>
              <dd className="font-medium text-slate-900">{event.targetUserName}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Status</dt>
              <dd>
                <StatusPill status={event.status} />
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Reason</dt>
              <dd className="text-slate-800">{event.reason}</dd>
            </div>
          </div>

          {(hasPrevious || hasNext) && (
            <div className="grid gap-2 sm:grid-cols-2">
              {hasPrevious ? (
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="mb-1 font-medium text-slate-700">Previous values</p>
                  <pre className="whitespace-pre-wrap break-all font-mono text-[10px] text-slate-600">
                    {JSON.stringify(event.previousValues, null, 2)}
                  </pre>
                </div>
              ) : null}
              {hasNext ? (
                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="mb-1 font-medium text-slate-700">New values</p>
                  <pre className="whitespace-pre-wrap break-all font-mono text-[10px] text-slate-600">
                    {JSON.stringify(event.newValues, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          )}

          <div className="rounded-lg border border-slate-200 p-3">
            <p className="mb-1 font-medium text-slate-700">Related entities</p>
            <ul className="space-y-1 text-slate-700">
              {event.targetLabId !== "—" ? (
                <li>
                  Lab: {event.targetLabName} ({event.targetLabId})
                </li>
              ) : null}
              {event.distributorName !== "—" ? <li>Distributor: {event.distributorName}</li> : null}
              {event.relatedEntities?.fromAgentId ? (
                <li>From agent: {event.relatedEntities.fromAgentId}</li>
              ) : null}
              {event.relatedEntities?.toAgentId ? (
                <li>To agent: {event.relatedEntities.toAgentId}</li>
              ) : null}
            </ul>
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <p className="mb-1 font-medium text-slate-700">Full event payload</p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] text-slate-600">
              {JSON.stringify(event.rawPayload, null, 2)}
            </pre>
          </div>
        </dl>
      </div>
    </div>
  );
}

export default function AccessAuditPanel({
  tenantId,
  bundle,
  loading = false,
  error = "",
  onReload,
}) {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [distributorFilter, setDistributorFilter] = useState("");
  const [labFilter, setLabFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedEvent, setSelectedEvent] = useState(null);

  const context = useMemo(
    () => buildAccessAuditContext(bundle, tenantId),
    [bundle, tenantId]
  );

  const enrichedEvents = useMemo(
    () => enrichAccessAuditEvents(bundle?.auditEvents || [], context),
    [bundle?.auditEvents, context]
  );

  const filteredEvents = useMemo(() => {
    const base = filterAccessAuditEvents(enrichedEvents, {
      action: actionFilter,
      userId: userFilter,
      distributorId: distributorFilter,
      labId: labFilter,
      status: statusFilter,
      dateFrom,
      dateTo,
    });
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((ev) => {
      const hay = [
        ev.actionLabel,
        ev.performedByName,
        ev.targetUserName,
        ev.targetLabName,
        ev.targetLabId,
        ev.distributorName,
        ev.reason,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [
    enrichedEvents,
    actionFilter,
    userFilter,
    distributorFilter,
    labFilter,
    statusFilter,
    dateFrom,
    dateTo,
    search,
  ]);

  const kpis = useMemo(() => computeAccessAuditKpis(enrichedEvents), [enrichedEvents]);
  const validation = useMemo(
    () => validateAccessAuditIntegrity(enrichedEvents),
    [enrichedEvents]
  );

  const directoryUsers = bundle?.directoryUsers || [];
  const distributors = bundle?.distributorAssignments || [];

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      ) : null}

      <KpiCardGrid columns={4}>
        <KpiCard title="Events Today" value={kpis.eventsToday} icon={Shield} />
        <KpiCard title="Password Resets Today" value={kpis.passwordResetsToday} />
        <KpiCard title="User Changes Today" value={kpis.userChangesToday} />
        <KpiCard title="Lab Transfers Today" value={kpis.labTransfersToday} />
      </KpiCardGrid>

      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <label className="text-[10px] text-slate-600">
          From
          <Input
            type="date"
            className="mt-0.5 h-8 text-xs"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label className="text-[10px] text-slate-600">
          To
          <Input
            type="date"
            className="mt-0.5 h-8 text-xs"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
        <label className="text-[10px] text-slate-600">
          Action
          <select
            className="mt-0.5 block h-8 rounded-md border border-slate-200 px-2 text-xs"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            {ACCESS_AUDIT_ACTION_OPTIONS.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] text-slate-600">
          User
          <select
            className="mt-0.5 block h-8 min-w-[140px] rounded-md border border-slate-200 px-2 text-xs"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
          >
            <option value="">All users</option>
            {directoryUsers.map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] text-slate-600">
          Distributor
          <select
            className="mt-0.5 block h-8 min-w-[140px] rounded-md border border-slate-200 px-2 text-xs"
            value={distributorFilter}
            onChange={(e) => setDistributorFilter(e.target.value)}
          >
            <option value="">All distributors</option>
            {distributors.map((d) => (
              <option key={d.distributorId} value={d.distributorId}>
                {d.distributorName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[10px] text-slate-600">
          Lab
          <Input
            className="mt-0.5 h-8 w-28 text-xs"
            placeholder="Lab ID / name"
            value={labFilter}
            onChange={(e) => setLabFilter(e.target.value)}
          />
        </label>
        <label className="text-[10px] text-slate-600">
          Status
          <select
            className="mt-0.5 block h-8 rounded-md border border-slate-200 px-2 text-xs"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="success">Success</option>
            <option value="failure">Failure</option>
          </select>
        </label>
        <div className="relative min-w-[160px] flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            className="h-8 pl-7 text-xs"
            placeholder="Search audit…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          disabled={loading}
          onClick={() => onReload?.()}
        >
          <RefreshCw className={cn("mr-1 h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[960px] text-xs">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-slate-500">
              <th className="px-2 py-2">Timestamp</th>
              <th className="px-2 py-2">Action</th>
              <th className="px-2 py-2">Performed By</th>
              <th className="px-2 py-2">Target User</th>
              <th className="px-2 py-2">Target Lab</th>
              <th className="px-2 py-2">Distributor</th>
              <th className="px-2 py-2">Reason</th>
              <th className="px-2 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredEvents.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-2 py-8 text-center text-slate-500">
                  No audit events match the current filters.
                </td>
              </tr>
            ) : (
              filteredEvents.map((ev) => (
                <tr
                  key={ev.id}
                  className="cursor-pointer border-b border-slate-100 hover:bg-indigo-50/40"
                  onClick={() => setSelectedEvent(ev)}
                >
                  <td className="whitespace-nowrap px-2 py-2">{ev.timestampLabel}</td>
                  <td className="px-2 py-2 font-medium text-slate-900">{ev.actionLabel}</td>
                  <td className="px-2 py-2">{ev.performedByName}</td>
                  <td className="px-2 py-2">{ev.targetUserName}</td>
                  <td className="px-2 py-2">
                    {ev.targetLabId !== "—" ? `${ev.targetLabName} (${ev.targetLabId})` : "—"}
                  </td>
                  <td className="px-2 py-2">{ev.distributorName}</td>
                  <td className="max-w-[160px] truncate px-2 py-2" title={ev.reason}>
                    {ev.reason}
                  </td>
                  <td className="px-2 py-2">
                    <StatusPill status={ev.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-slate-500">
        Read-only audit trail — {filteredEvents.length} of {enrichedEvents.length} events shown.
        Integrity:{" "}
        <span
          className={cn(
            "font-medium",
            validation.overall === "PASS" && "text-emerald-700",
            validation.overall === "WARN" && "text-amber-700",
            validation.overall === "FAIL" && "text-red-700"
          )}
        >
          {validation.overall}
        </span>
        {validation.checks.length > 0 ? ` (${validation.checks.length} note(s))` : ""}.
      </p>

      {selectedEvent ? (
        <AuditDetailDrawer event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      ) : null}
    </div>
  );
}
