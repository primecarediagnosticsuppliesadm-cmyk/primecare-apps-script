import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ux";
import { loadActivityCenterBundle } from "@/operations/activityCenterData.js";
import {
  ACTIVITY_CENTER_MODULE_OPTIONS,
  ACTIVITY_CENTER_SEVERITY_OPTIONS,
  activityTimelineSeverityClass,
  filterActivityCenterEvents,
  formatActivityModuleLabel,
  formatActivityTimelineSentence,
  formatActivityTimestamp,
  uniqueActivityEventTypes,
} from "@/operations/activityCenterEngine.js";
import {
  navigateFromActivityEvent,
  resolveActivityEventNav,
} from "@/operations/hqWorkflowNav.js";
import HqObjectLink from "@/components/hq/HqObjectLink.jsx";
import { cn } from "@/lib/utils";
import { Bell, History, LayoutList, Loader2, RefreshCw, Search } from "lucide-react";

function str(v) {
  return String(v ?? "").trim();
}

function labAgentLabel(labAgentByLabId, labId) {
  const key = str(labId).toLowerCase();
  if (!key) return "";
  return labAgentByLabId.get(key)?.displayLabel || "";
}

function severityVariant(severity) {
  const s = str(severity).toLowerCase();
  if (s === "critical" || s === "high") return "destructive";
  if (s === "medium") return "secondary";
  return "outline";
}

function statusVariant(status) {
  const s = str(status).toLowerCase();
  if (s === "success" || s === "acknowledged" || s === "read") return "default";
  if (s === "failure") return "destructive";
  return "outline";
}

export default function ActivityCenterPanel({ tenantId, setActivePage }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [events, setEvents] = useState([]);
  const [counts, setCounts] = useState(null);
  const [labAgentByLabId, setLabAgentByLabId] = useState(() => new Map());

  const [severity, setSeverity] = useState("");
  const [module, setModule] = useState("");
  const [eventType, setEventType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState("timeline");

  const load = useCallback(async (opts = {}) => {
    const isRefresh = opts.refresh === true;
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      const bundle = await loadActivityCenterBundle(tenantId);
      setEvents(bundle.events || []);
      setCounts(bundle.counts || null);
      setLabAgentByLabId(bundle.labAgentByLabId || new Map());
      if (bundle.error) setError(bundle.error);
    } catch (err) {
      setError(err?.message || "Failed to load activity feed");
      setEvents([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const eventTypeOptions = useMemo(() => uniqueActivityEventTypes(events), [events]);

  const filtered = useMemo(
    () =>
      filterActivityCenterEvents(events, {
        severity,
        module,
        eventType,
        dateFrom,
        dateTo,
        search,
      }),
    [events, severity, module, eventType, dateFrom, dateTo, search]
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <label className="text-[10px] font-medium text-muted-foreground">
            Severity
            <select
              className="mt-0.5 block h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              {ACTIVITY_CENTER_SEVERITY_OPTIONS.map((opt) => (
                <option key={opt.value || "all"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-medium text-muted-foreground">
            Module
            <select
              className="mt-0.5 block h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
              value={module}
              onChange={(e) => setModule(e.target.value)}
            >
              {ACTIVITY_CENTER_MODULE_OPTIONS.map((opt) => (
                <option key={opt.value || "all"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-medium text-muted-foreground">
            Event type
            <select
              className="mt-0.5 block h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
            >
              <option value="">All types</option>
              {eventTypeOptions.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-medium text-muted-foreground">
            From
            <Input
              type="date"
              className="mt-0.5 h-9 text-xs"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="text-[10px] font-medium text-muted-foreground">
            To
            <Input
              type="date"
              className="mt-0.5 h-9 text-xs"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          <label className="text-[10px] font-medium text-muted-foreground">
            Search
            <div className="relative mt-0.5">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 pl-7 text-xs"
                placeholder="Entity, actor…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>
            {filtered.length} of {events.length} events
            {counts
              ? ` · ${counts.notifications} notifications · ${counts.provisioning} provisioning · ${counts.inventory} inventory · ${counts.purchaseOrders} PO`
              : ""}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border bg-muted/30 p-0.5">
              <Button
                type="button"
                variant={viewMode === "timeline" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 gap-1 px-2 text-[10px]"
                onClick={() => setViewMode("timeline")}
              >
                <History className="h-3 w-3" />
                Timeline
              </Button>
              <Button
                type="button"
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 gap-1 px-2 text-[10px]"
                onClick={() => setViewMode("table")}
              >
                <LayoutList className="h-3 w-3" />
                Table
              </Button>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={loading || refreshing}
              onClick={() => void load({ refresh: true })}
            >
              {refreshing ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading operational feed…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No operational events"
          description="Events appear when orders, payments, inventory, provisioning, or audit activity is recorded."
        />
      ) : viewMode === "timeline" ? (
        <ul className="space-y-2">
          {filtered.map((ev) => {
            const navTarget = setActivePage ? resolveActivityEventNav(ev) : null;
            const labAgent = labAgentLabel(labAgentByLabId, ev.labId);
            return (
            <li
              key={ev.id}
              className={cn(
                "rounded-xl border border-l-4 px-3 py-2.5 shadow-sm",
                activityTimelineSeverityClass(ev.severity)
              )}
            >
              <p className="text-sm font-medium text-foreground">
                {formatActivityTimelineSentence(ev)}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                <span className="tabular-nums">{formatActivityTimestamp(ev.timestamp)}</span>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {formatActivityModuleLabel(ev.module)}
                </Badge>
                <Badge variant={statusVariant(ev.status)} className="text-[10px] capitalize">
                  {ev.status}
                </Badge>
                {ev.severity && ev.severity !== "info" ? (
                  <Badge variant={severityVariant(ev.severity)} className="text-[10px] capitalize">
                    {ev.severity}
                  </Badge>
                ) : null}
                {labAgent ? (
                  <span className="text-[10px] text-slate-600">Lab agent: {labAgent}</span>
                ) : null}
                {navTarget ? (
                  <HqObjectLink
                    onClick={() => navigateFromActivityEvent(setActivePage, ev)}
                    className="text-[10px]"
                    title={`Open ${navTarget.label}`}
                  >
                    Open {navTarget.label}
                  </HqObjectLink>
                ) : null}
              </div>
            </li>
            );
          })}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full min-w-[880px] text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                <th className="px-3 py-2.5">Timestamp</th>
                <th className="px-3 py-2.5">Event type</th>
                <th className="px-3 py-2.5">Entity</th>
                <th className="px-3 py-2.5">Actor</th>
                <th className="px-3 py-2.5">Module</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Severity</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ev) => {
                const navTarget = setActivePage ? resolveActivityEventNav(ev) : null;
                const labAgent = labAgentLabel(labAgentByLabId, ev.labId);
                return (
                <tr key={ev.id} className="border-b border-border/60 hover:bg-muted/20">
                  <td className="whitespace-nowrap px-3 py-2.5 text-foreground">
                    {formatActivityTimestamp(ev.timestamp)}
                  </td>
                  <td className="px-3 py-2.5 font-medium capitalize text-foreground">
                    {ev.eventLabel}
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-2.5" title={ev.entity}>
                    {navTarget ? (
                      <HqObjectLink
                        onClick={() => navigateFromActivityEvent(setActivePage, ev)}
                        title={`Open ${navTarget.label}`}
                      >
                        {ev.entity}
                      </HqObjectLink>
                    ) : (
                      ev.entity
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div>{ev.actor}</div>
                    {labAgent ? (
                      <div className="text-[10px] text-muted-foreground">Lab agent: {labAgent}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 capitalize">{formatActivityModuleLabel(ev.module)}</td>
                  <td className="px-3 py-2.5">
                    <Badge variant={statusVariant(ev.status)} className="text-[10px] capitalize">
                      {ev.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant={severityVariant(ev.severity)} className="text-[10px] capitalize">
                      {ev.severity}
                    </Badge>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ActivityCenterHeader() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
        <Bell className="h-6 w-6 text-muted-foreground" />
        Activity Center
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        HQ operational heartbeat — orders, payments, inventory, provisioning, and audit events in one feed.
      </p>
    </div>
  );
}
