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
import { Bell, Loader2, RefreshCw, CheckCircle2, AlertTriangle, Truck, Clock3 } from "lucide-react";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import { isNotificationsFoundationEnabled } from "@/config/notificationFoundation.js";
import { resolveNotificationFoundationState } from "@/notifications/notificationFoundationProbe.js";
import { ROLES } from "@/config/roles";
import { cn } from "@/lib/utils";

const LAB_SAFE_EVENT_TYPES = new Set([
  "order_created",
  "order_fulfilled",
  "payment_received",
  "collection_due",
]);

const LAB_PLACEHOLDER_NOTIFICATIONS = [
  { event_type: "order_created", severity: "info", status: "pending", source_module: "orders", created_at: new Date().toISOString(), payload_json: { message: "Order received and queued for processing." } },
  { event_type: "order_fulfilled", severity: "medium", status: "read", source_module: "orders", created_at: new Date(Date.now() - 3600 * 1000).toISOString(), payload_json: { message: "Order fulfilled and ready for dispatch." } },
  { event_type: "payment_received", severity: "low", status: "acknowledged", source_module: "collections", created_at: new Date(Date.now() - 7200 * 1000).toISOString(), payload_json: { message: "Payment has been recorded for your account." } },
];

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

function payloadSummary(payload) {
  if (!payload || typeof payload !== "object") return "—";
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }
  const keys = Object.keys(payload).slice(0, 4);
  if (keys.length === 0) return "No details";
  return keys.map((k) => `${k}: ${JSON.stringify(payload[k])}`).join(" · ");
}

function formatGroupLabel(iso) {
  if (!iso) return "Earlier";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "Earlier";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  if (d >= startOfToday) return "Today";
  if (d >= startOfYesterday) return "Yesterday";
  return "Earlier";
}

function groupNotificationsByDate(rows) {
  const groups = [];
  const indexByLabel = new Map();
  for (const row of rows) {
    const label = formatGroupLabel(row.created_at);
    if (!indexByLabel.has(label)) {
      const group = { label, rows: [] };
      indexByLabel.set(label, groups.length);
      groups.push(group);
    }
    groups[indexByLabel.get(label)].rows.push(row);
  }
  return groups;
}

function formatRelativeTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
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
  if (r === ROLES.AGENT) return "Activity Center";
  if (r === ROLES.LAB) return "Order Activity Center";
  return "Notification Center";
}

function eventTitle(eventType) {
  const t = String(eventType || "").toLowerCase();
  if (t === "order_created") return "Order received";
  if (t === "order_fulfilled") return "Order fulfilled";
  if (t === "payment_received") return "Payment received";
  if (t === "collection_due") return "Collection reminder";
  return String(eventType || "Notification").replaceAll("_", " ");
}

function eventIcon(eventType) {
  const t = String(eventType || "").toLowerCase();
  if (t.includes("payment")) return CheckCircle2;
  if (t.includes("due")) return AlertTriangle;
  if (t.includes("fulfilled")) return Truck;
  return Clock3;
}

function payloadValue(payload, keys) {
  for (const key of keys) {
    const value = payload?.[key];
    if (value !== undefined && value !== null && `${value}`.trim() !== "") {
      return value;
    }
  }
  return null;
}

function parseAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function activityMeta(row, payload) {
  const eventType = String(row?.event_type || "").toLowerCase();
  const orderId = String(
    payloadValue(payload, ["orderId", "order_id", "order_no", "orderNumber"]) ||
      row?.source_id ||
      ""
  ).trim();
  const invoiceId = String(payloadValue(payload, ["invoiceId", "invoice_id"]) || "").trim();
  const amount = parseAmount(
    payloadValue(payload, ["amount", "amountPaid", "amount_paid", "total", "orderTotal", "outstanding"])
  );
  const itemCount = Number(payloadValue(payload, ["itemCount", "items", "totalItems", "item_count"]) || 0);
  const dispatchAt = String(payloadValue(payload, ["dispatchDate", "dispatch_at", "eta", "etaDate"]) || "").trim();
  const paymentOverdue = eventType.includes("due") || String(row?.severity || "").toLowerCase() === "high";
  return {
    orderId: orderId || null,
    invoiceId: invoiceId || null,
    amount,
    itemCount: Number.isFinite(itemCount) && itemCount > 0 ? itemCount : null,
    dispatchAt: dispatchAt || null,
    paymentOverdue,
  };
}

function urgencyTone(row) {
  const eventType = String(row?.event_type || "").toLowerCase();
  const severity = String(row?.severity || "").toLowerCase();
  if (eventType.includes("due")) return { label: "Overdue", tone: "text-red-700 bg-red-50 border-red-200" };
  if (severity === "high" || severity === "critical") {
    return { label: "High", tone: "text-amber-700 bg-amber-50 border-amber-200" };
  }
  if (String(row?.status || "").toLowerCase() === "pending") {
    return { label: "New", tone: "text-blue-700 bg-blue-50 border-blue-200" };
  }
  return { label: "Update", tone: "text-emerald-700 bg-emerald-50 border-emerald-200" };
}

export default function NotificationCenterPage({ currentUser, setActivePage }) {
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

  const pendingCount = useMemo(
    () => rows.filter((r) => String(r.status).toLowerCase() === "pending").length,
    [rows]
  );
  const displayRows = useMemo(() => {
    if (role === ROLES.LAB && rows.length === 0) return LAB_PLACEHOLDER_NOTIFICATIONS;
    return rows;
  }, [role, rows]);

  const groupedRows = useMemo(() => groupNotificationsByDate(displayRows), [displayRows]);
  const isLabTimeline = role === ROLES.LAB;
  const duplicateEventCount = useMemo(() => {
    const seen = new Set();
    let duplicates = 0;
    for (const row of displayRows) {
      const key = String(row.event_id || `${row.event_type}-${row.created_at}`);
      if (seen.has(key)) duplicates += 1;
      seen.add(key);
    }
    return duplicates;
  }, [displayRows]);
  const timestampsStable = useMemo(
    () => displayRows.every((row) => Number.isFinite(new Date(row.created_at).getTime())),
    [displayRows]
  );
  const groupLabelsStable = useMemo(
    () => groupedRows.every((group) => ["Today", "Yesterday", "Earlier"].includes(group.label)),
    [groupedRows]
  );
  const nonAdminSetupPending =
    !showAdminUi &&
    (foundationState?.mode === "setup_pending" || foundationState?.mode === "schema_cache");

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
      ownLabActivityOnly:
        role !== ROLES.LAB || rows.every((r) => LAB_SAFE_EVENT_TYPES.has(String(r.event_type || ""))),
      duplicateEventCount,
      timestampsStable,
      groupLabelsStable,
    },
    !loading
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

  function handleActivityCta(targetPage) {
    if (typeof setActivePage !== "function") return;
    setActivePage(targetPage);
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
            {isLabTimeline
              ? "Track live order and payment movement for your lab in one compact operational feed."
              : "Internal in-app activity stream (no live WhatsApp, SMS, or email)."}{" "}
            {roleScopeHint(role)}
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

      {nonAdminSetupPending ? (
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
      ) : nonAdminSetupPending ? null : displayRows.length === 0 ? (
        <EmptyState
          title={role === ROLES.LAB ? "No recent order or payment activity." : "No notification events"}
          description={
            role === ROLES.LAB
              ? "New operational updates will appear here when orders or account activity changes."
              : "Events appear here when modules call createNotificationEvent (e.g. order created, payment received)."
          }
        />
      ) : (
        <div className={cn("space-y-4", isLabTimeline && "mx-auto max-w-2xl")}>
          {groupedRows.map((group) => (
            <section key={group.label}>
              <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </h2>
              <ul className="relative space-y-0 pl-3">
                <div className="absolute bottom-1 left-[5px] top-1 w-px bg-border" aria-hidden />
                {group.rows.map((row) => {
                  const payload =
                    row.payload_json && typeof row.payload_json === "object"
                      ? row.payload_json
                      : {};
                  const Icon = eventIcon(row.event_type);
                  const isPending = String(row.status).toLowerCase() === "pending";
                  const busy = updatingId === row.event_id;
                  const rowKey = row.event_id || `${row.event_type}-${row.created_at}`;
                  const meta = activityMeta(row, payload);
                  const urgency = urgencyTone(row);
                  const eventType = String(row.event_type || "").toLowerCase();
                  const orderRelated = eventType.includes("order");
                  const paymentRelated = eventType.includes("payment") || eventType.includes("collection");
                  const actionButtons = isLabTimeline
                    ? [
                        orderRelated && {
                          key: "view-order",
                          label: "View Order",
                          page: "labOrders",
                        },
                        orderRelated && {
                          key: "repeat-order",
                          label: "Repeat Order",
                          page: "labOrders",
                        },
                        (paymentRelated || eventType.includes("due")) && {
                          key: "open-payment",
                          label: "Open Payment Page",
                          page: "labAccount",
                        },
                        meta.invoiceId && {
                          key: "view-invoice",
                          label: "View Invoice",
                          page: "labAccount",
                        },
                      ].filter(Boolean)
                    : [];

                  return (
                    <li key={rowKey} className="relative border-b border-border/40 py-1.5 pl-3.5 last:border-b-0">
                      <span
                        className={cn(
                          "absolute left-0 top-2.5 flex h-2 w-2 items-center justify-center rounded-full border border-background",
                          isPending ? "bg-amber-500" : "bg-emerald-500"
                        )}
                        aria-hidden
                      />
                      <div className="rounded-md border border-border bg-card p-2 shadow-sm transition hover:shadow-md">
                        <div className="flex items-start gap-2">
                          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
                            <Icon className="h-3 w-3" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-semibold">{eventTitle(row.event_type)}</span>
                              {isLabTimeline ? (
                                <span
                                  className={cn(
                                    "rounded border px-1 py-0 text-[10px] font-medium",
                                    urgency.tone
                                  )}
                                >
                                  {urgency.label}
                                </span>
                              ) : null}
                              {!isLabTimeline ? (
                                <Badge variant={severityVariant(row.severity)} className="text-[10px]">
                                  {row.severity}
                                </Badge>
                              ) : null}
                              {!isLabTimeline ? (
                                <Badge variant={statusVariant(row.status)} className="text-[10px]">
                                  {row.status}
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {formatRelativeTime(row.created_at)}
                              {!isLabTimeline && row.source_module ? ` · ${row.source_module}` : null}
                            </p>
                            <p className="mt-1 text-[11px] leading-snug text-foreground/90">
                              {payloadSummary(payload)}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                              {meta.orderId ? <span className="rounded bg-muted px-1 py-0.5">ORD {meta.orderId}</span> : null}
                              {meta.itemCount ? <span>{meta.itemCount} items</span> : null}
                              {meta.amount ? <span className="font-semibold text-foreground">₹{Number(meta.amount).toLocaleString()}</span> : null}
                              {meta.dispatchAt ? <span>Dispatch {meta.dispatchAt}</span> : null}
                              {meta.invoiceId ? <span>Invoice {meta.invoiceId}</span> : null}
                            </div>
                          </div>
                        </div>
                        {isLabTimeline && actionButtons.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {actionButtons.map((action) => (
                              <Button
                                key={`${rowKey}-${action.key}`}
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 rounded-md px-2 text-[11px]"
                                onClick={() => handleActivityCta(action.page)}
                              >
                                {action.label}
                              </Button>
                            ))}
                          </div>
                        ) : null}
                        {!isLabTimeline && row.event_id ? (
                          <div className="mt-2 flex justify-end gap-1.5">
                            {isPending ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
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
                                className="h-7 text-xs"
                                disabled={busy}
                                onClick={() => markStatus(row.event_id, "acknowledged")}
                              >
                                Acknowledge
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
