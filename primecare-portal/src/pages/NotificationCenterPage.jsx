import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  getNotificationEventsRead,
  updateNotificationEventStatusWrite,
} from "@/api/notificationApi.js";
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENT_TYPES,
  NOTIFICATION_EVENT_STATUSES,
  NOTIFICATION_SEVERITIES,
  NOTIFICATION_SOURCE_MODULES,
} from "@/notifications/notificationConstants.js";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ux";
import { Bell, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import { isNotificationsFoundationEnabled } from "@/config/notificationFoundation.js";
import { resolveNotificationFoundationState } from "@/notifications/notificationFoundationProbe.js";
import { ROLES } from "@/config/roles";

const LAB_SAFE_EVENT_TYPES = new Set([
  "order_created",
  "order_fulfilled",
  "payment_received",
  "collection_due",
]);

function isAdminOrExecutive(role) {
  const r = String(role || "").toLowerCase();
  return r === ROLES.ADMIN || r === ROLES.EXECUTIVE;
}

function severityVariant(severity) {
  const s = String(severity || "info").toLowerCase();
  if (s === "critical" || s === "high") return "destructive";
  if (s === "medium") return "secondary";
  return "outline";
}

function statusVariant(status) {
  const s = String(status || "pending").toLowerCase();
  if (s === "acknowledged") return "default";
  if (s === "read") return "secondary";
  return "outline";
}

function formatWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : "—";
}

function payloadSummary(payload) {
  if (!payload || typeof payload !== "object") return "—";
  const keys = Object.keys(payload).slice(0, 4);
  if (keys.length === 0) return "{}";
  return keys.map((k) => `${k}: ${JSON.stringify(payload[k])}`).join(" · ");
}

function roleScopeHint(role) {
  const r = String(role || "").toLowerCase();
  if (r === ROLES.AGENT) {
    return "Assigned labs and targeted events only (RLS-scoped).";
  }
  if (r === ROLES.LAB) {
    return "Order & payment updates for your lab only.";
  }
  return "Tenant-wide internal event log (admin/executive view).";
}

function pageTitleForRole(role) {
  const r = String(role || "").toLowerCase();
  if (r === ROLES.AGENT) return "My Notifications";
  if (r === ROLES.LAB) return "Order & Payment Updates";
  return "Notification Center";
}

export default function NotificationCenterPage({ currentUser }) {
  const tenantId = currentUser?.tenantId ?? currentUser?.tenant_id ?? null;
  const role = String(currentUser?.role || "").toLowerCase();
  const showAdminUi = isAdminOrExecutive(role);
  const showSetupBanner = showAdminUi;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState("");
  const [foundationState, setFoundationState] = useState(null);

  const [severity, setSeverity] = useState("");
  const [status, setStatus] = useState("");
  const [sourceModule, setSourceModule] = useState("");
  const [eventType, setEventType] = useState("");
  const [channel, setChannel] = useState("");

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await getNotificationEventsRead({
        tenantId,
        severity: showAdminUi ? severity || undefined : undefined,
        status: showAdminUi ? status || undefined : undefined,
        sourceModule: showAdminUi ? sourceModule || undefined : undefined,
        eventType: showAdminUi ? eventType || undefined : undefined,
        channel: showAdminUi ? channel || undefined : undefined,
        limit: 100,
      });
      if (!res?.success) {
        throw new Error(res?.error || "Failed to load notifications");
      }
      const incoming = Array.isArray(res.data) ? res.data : [];
      if (role === ROLES.LAB) {
        setRows(incoming.filter((r) => LAB_SAFE_EVENT_TYPES.has(String(r.event_type || ""))));
      } else {
        setRows(incoming);
      }
    } catch (err) {
      setError(err?.message || "Failed to load notifications");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, severity, status, sourceModule, eventType, channel, role, showAdminUi]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  useEffect(() => {
    let cancelled = false;
    resolveNotificationFoundationState().then((state) => {
      if (!cancelled) setFoundationState(state);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  usePredatorModuleValidation(
    "Notifications",
    currentUser,
    {
      notificationCenterLoaded: !loading,
      eventCount: rows.length,
      foundationEnabled: isNotificationsFoundationEnabled(),
      foundationMode: foundationState?.mode,
      isLabAccountView: role === ROLES.LAB,
      labId: currentUser?.labId,
      userName: currentUser?.name,
    },
    !loading
  );

  const pendingCount = useMemo(
    () => rows.filter((r) => String(r.status).toLowerCase() === "pending").length,
    [rows]
  );

  async function markStatus(eventId, nextStatus) {
    setUpdatingId(eventId);
    try {
      const res = await updateNotificationEventStatusWrite({ eventId, status: nextStatus });
      if (!res?.success) {
        throw new Error(res?.error || "Update failed");
      }
      setRows((prev) =>
        prev.map((r) => (r.event_id === eventId ? { ...r, status: nextStatus } : r))
      );
    } catch (err) {
      setError(err?.message || "Failed to update notification");
    } finally {
      setUpdatingId("");
    }
  }

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Bell className="h-6 w-6 text-muted-foreground" />
            {pageTitleForRole(role)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Internal event log (in-app and placeholder channels only — no live WhatsApp, SMS, or
            email). {roleScopeHint(role)}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={loadRows} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
      </header>

      {showAdminUi ? (
      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs font-medium text-muted-foreground">
            Severity
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="">All</option>
              {NOTIFICATION_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Status
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All</option>
              {NOTIFICATION_EVENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Module
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
              value={sourceModule}
              onChange={(e) => setSourceModule(e.target.value)}
            >
              <option value="">All</option>
              {NOTIFICATION_SOURCE_MODULES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Event type
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
            >
              <option value="">All</option>
              {NOTIFICATION_EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">
            Channel
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option value="">All</option>
              {NOTIFICATION_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {pendingCount} pending · {rows.length} shown (tenant-scoped via RLS)
        </p>
      </Card>
      ) : null}

      {showSetupBanner &&
      (foundationState?.mode === "setup_pending" ||
        foundationState?.mode === "schema_cache" ||
        foundationState?.mode === "disabled") ? (
        <div
          role="status"
          className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-900 dark:text-sky-100"
        >
          <p className="font-medium">Notification Foundation — setup pending</p>
          <p className="mt-1 text-xs opacity-90">{foundationState.message}</p>
          {foundationState.suggestedFix ? (
            <p className="mt-2 text-xs">{foundationState.suggestedFix}</p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
          {String(error).toLowerCase().includes("does not exist") ? (
            <p className="mt-2 text-xs">
              Run `primecare-portal/supabase/sql/notifications_foundation_migration.sql` in Supabase.
            </p>
          ) : null}
        </div>
      ) : null}

      {!showAdminUi &&
      (foundationState?.mode === "setup_pending" || foundationState?.mode === "schema_cache") ? (
        <EmptyState
          title={role === ROLES.LAB ? "Updates are not available yet" : "Notifications are not available yet"}
          description={
            role === ROLES.LAB
              ? "Your lab will see order and payment updates here once enabled."
              : "You’ll see your notifications here once enabled."
          }
        />
      ) : null}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading notifications…
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={role === ROLES.LAB ? "No updates yet" : "No notification events"}
          description={
            role === ROLES.LAB
              ? "Order and payment updates for your lab will appear here."
              : "Events appear here when modules call createNotificationEvent (e.g. order created, payment received)."
          }
        />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const payload =
              row.payload_json && typeof row.payload_json === "object"
                ? row.payload_json
                : {};
            const inApp = (row.deliveries || []).find(
              (d) => String(d.channel).toLowerCase() === "in_app"
            );
            const isPending = String(row.status).toLowerCase() === "pending";
            const busy = updatingId === row.event_id;

            return (
              <Card key={row.event_id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{row.event_type}</span>
                      <Badge variant={severityVariant(row.severity)}>{row.severity}</Badge>
                      <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
                      <span className="text-xs text-muted-foreground">{row.source_module}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatWhen(row.created_at)} · source {row.source_id || "—"} · lab{" "}
                      {row.target_lab_id || "—"}
                    </p>
                    <p className="mt-2 text-sm text-foreground/90">{payloadSummary(payload)}</p>
                    {inApp ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        in_app: {inApp.status}
                        {row.deliveries?.length > 1
                          ? ` (+${row.deliveries.length - 1} placeholder channel logs)`
                          : null}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {isPending ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => markStatus(row.event_id, "read")}
                      >
                        Mark read
                      </Button>
                    ) : null}
                    {String(row.status).toLowerCase() !== "acknowledged" ? (
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy}
                        onClick={() => markStatus(row.event_id, "acknowledged")}
                      >
                        Acknowledge
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
