import React, { memo } from "react";
import { Button } from "@/components/ui/button";
import KpiCard from "@/components/ux/KpiCard";
import KpiCardGrid from "@/components/ux/KpiCardGrid";
import StatusBadge from "@/components/ux/StatusBadge";
import {
  Building2,
  ClipboardCheck,
  CalendarClock,
  CircleDollarSign,
  ShieldAlert,
  IndianRupee,
  MapPin,
  ArrowRight,
  PlusCircle,
} from "lucide-react";
import {
  priorityToBadgeVariant,
  queueTypeLabel,
} from "@/pages/agentDailyWorkspace.js";
import {
  deriveAttentionReasons,
  deriveQueueRecommendedAction,
  formatAgentActivityNotification,
  formatAgentActivityVisit,
  formatAgentCurrency,
} from "@/pages/agentUxPresentation.js";

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function creditLabel(status) {
  const s = String(status || "").toUpperCase();
  if (s === "HOLD") return "Hold";
  if (s === "NEAR_LIMIT") return "Near limit";
  return "OK";
}

function creditVariant(status) {
  const s = String(status || "").toUpperCase();
  if (s === "HOLD") return "danger";
  if (s === "NEAR_LIMIT") return "warning";
  return "success";
}

export const TodayKpiStrip = memo(function TodayKpiStrip({ kpis, loading }) {
  return (
    <KpiCardGrid columns={6}>
      <KpiCard
        loading={loading}
        title="Visits Today"
        value={kpis.visitsCompletedToday}
        icon={ClipboardCheck}
        subtitle="Logged today"
      />
      <KpiCard
        loading={loading}
        title="Collections Today"
        value={kpis.collectionsToday}
        icon={CircleDollarSign}
        subtitle="Collection visits logged"
      />
      <KpiCard
        loading={loading}
        title="Overdue Labs"
        value={kpis.overdueLabs}
        icon={ShieldAlert}
        subtitle="Past due threshold"
      />
      <KpiCard
        loading={loading}
        title="Follow-Ups"
        value={kpis.pendingFollowUps}
        icon={CalendarClock}
        subtitle="Due today or overdue"
      />
      <KpiCard
        loading={loading}
        title="Active Labs"
        value={kpis.activeLabs}
        icon={Building2}
        subtitle="In your territory"
      />
      <KpiCard
        loading={loading}
        title="Recovery"
        value={kpis.recoveryPct != null ? `${kpis.recoveryPct}%` : "—"}
        icon={IndianRupee}
        subtitle="Paid vs exposure"
      />
    </KpiCardGrid>
  );
});

const VISIT_QUEUE_TYPES = new Set([
  "VISIT_DUE",
  "NO_VISIT",
  "FOLLOW_UP_DUE",
  "INACTIVE_LAB",
  "QUALIFICATION_PENDING",
  "ONBOARDING_PENDING",
]);

export const AgentCommandCenterKpiStrip = memo(function AgentCommandCenterKpiStrip({
  kpis,
  actionQueue = [],
  loading,
}) {
  const visitsDue = (actionQueue || []).filter((item) =>
    VISIT_QUEUE_TYPES.has(String(item.queueType || "").toUpperCase())
  ).length;

  return (
    <KpiCardGrid columns={3}>
      <KpiCard
        loading={loading}
        title="Collections Due"
        value={kpis.collectionsDue}
        icon={CircleDollarSign}
        subtitle="Accounts needing payment"
      />
      <KpiCard
        loading={loading}
        title="Visits Due"
        value={visitsDue}
        icon={ClipboardCheck}
        subtitle="Scheduled or overdue visits"
      />
      <KpiCard
        loading={loading}
        title="Total Outstanding"
        value={formatCurrency(kpis.totalOutstanding)}
        icon={IndianRupee}
        subtitle="Across your territory"
      />
    </KpiCardGrid>
  );
});

function formatActivityWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 60 * 60 * 1000) return "Just now";
  if (diffMs < 24 * 60 * 60 * 1000) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export const AgentRecentActivitySection = memo(function AgentRecentActivitySection({
  recentVisits = [],
  notifications = [],
  loading = false,
}) {
  const visitItems = (recentVisits || []).slice(0, 5).map((visit) => ({
    id: `visit-${visit.visitId || visit.id || visit.labId}-${visit.visitDate}`,
    label: formatAgentActivityVisit(visit),
    when: formatActivityWhen(visit.visitDate),
    ts: visit.visitDate || "",
  }));

  const notifyItems = (notifications || []).slice(0, 5).map((row) => ({
    id: `notify-${row.event_id || row.id || row.created_at}`,
    label: formatAgentActivityNotification(row),
    when: formatActivityWhen(row.created_at),
    ts: row.created_at || "",
  }));

  const merged = [...notifyItems, ...visitItems]
    .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
    .slice(0, 6);

  if (loading) {
    return (
      <div className="animate-pulse rounded-lg border border-border bg-card px-3 py-2">
        <div className="h-3 w-24 rounded bg-muted" />
      </div>
    );
  }

  return (
    <section className="space-y-1.5">
      <h2 className="text-sm font-semibold">Recent activity</h2>
      {merged.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-2 text-center text-[11px] text-muted-foreground">
          No recent activity yet.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {merged.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-2 px-2.5 py-2">
              <p className="min-w-0 flex-1 text-[11px] leading-snug text-foreground">{item.label}</p>
              <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {item.when}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});

export const TodaysMissionCard = memo(function TodaysMissionCard({
  kpis,
  actionQueue = [],
  topPriority,
  onStartRoute,
  onOpenCollections,
}) {
  const labsToVisit = (actionQueue || []).filter((item) =>
    VISIT_QUEUE_TYPES.has(String(item.queueType || "").toUpperCase())
  ).length;
  const collectionsDue = Number(kpis?.collectionsDue ?? 0);
  const recoveryOpportunity = Number(kpis?.totalOutstanding ?? 0);

  return (
    <article className="rounded-xl border-2 border-[var(--pc-brand-primary)]/25 bg-gradient-to-br from-[var(--pc-brand-primary)]/8 via-card to-card p-3 shadow-sm md:p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--pc-brand-primary)]">
        Today&apos;s Mission
      </p>
      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3 text-[11px] lg:grid-cols-4">
        <div>
          <p className="text-muted-foreground">Labs to visit</p>
          <p className="text-lg font-bold tabular-nums text-foreground">{labsToVisit}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Collections due</p>
          <p className="text-lg font-bold tabular-nums text-foreground">{collectionsDue}</p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <p className="text-muted-foreground">Expected recovery</p>
          <p className="text-lg font-bold tabular-nums text-foreground">
            {formatAgentCurrency(recoveryOpportunity)}
          </p>
        </div>
        <div className="col-span-2">
          <p className="text-muted-foreground">Highest priority</p>
          <p className="truncate text-sm font-semibold text-foreground">
            {topPriority ? topPriority.labName : "Queue clear"}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" className="h-9 flex-1 rounded-lg px-3 text-xs font-semibold sm:flex-none" onClick={onStartRoute}>
          Start Route
          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-9 rounded-lg px-3 text-xs" onClick={onOpenCollections}>
          Open Collections
        </Button>
      </div>
    </article>
  );
});

export const AgentProgressCards = memo(function AgentProgressCards({ kpis, performance }) {
  const collectionTarget = 10000;
  const collectedAmount = Number(performance?.collectionsRecovered ?? 0);
  const collectionPct = Math.min(
    100,
    Math.round((collectedAmount / collectionTarget) * 100) || 0
  );

  const visitTarget = 5;
  const visitsDone = Number(kpis?.visitsCompletedToday ?? 0);
  const visitPct = Math.min(100, Math.round((visitsDone / visitTarget) * 100) || 0);

  const followUpsDue = Number(kpis?.pendingFollowUps ?? 0);

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <article className="rounded-lg border border-border bg-card px-2.5 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Collection progress
        </p>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="text-sm font-bold tabular-nums text-foreground">
            {formatAgentCurrency(collectedAmount)}
          </span>
          <span className="text-[10px] text-muted-foreground">
            of {formatAgentCurrency(collectionTarget)} target
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-[var(--pc-brand-primary)] transition-all"
            style={{ width: `${collectionPct}%` }}
          />
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">{collectionPct}% complete</p>
      </article>

      <article className="rounded-lg border border-border bg-card px-2.5 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Visits progress
        </p>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="text-sm font-bold tabular-nums text-foreground">{visitsDone}</span>
          <span className="text-[10px] text-muted-foreground">/ {visitTarget} today</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${visitPct}%` }}
          />
        </div>
      </article>

      <article className="rounded-lg border border-border bg-card px-2.5 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Follow-ups due
        </p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{followUpsDue}</p>
        <p className="text-[10px] text-muted-foreground">
          {followUpsDue === 0 ? "All caught up" : "Scheduled or overdue"}
        </p>
      </article>
    </div>
  );
});

export const ActionQueueCard = memo(function ActionQueueCard({
  item,
  onStartVisit,
  onRecordCollection,
  onOpenLab,
}) {
  const reasons = deriveAttentionReasons(item);
  const recommended = deriveQueueRecommendedAction(item);
  const outstanding = Number(item.outstanding || 0);

  return (
    <article className="flex h-full flex-col rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <h3 className="min-w-0 flex-1 truncate text-base font-bold text-foreground md:text-lg">
          {item.labName}
        </h3>
        {outstanding > 0 ? (
          <div className="shrink-0 text-right">
            <div className="text-2xl font-bold tabular-nums leading-none text-foreground">
              {formatAgentCurrency(outstanding)}
            </div>
            <div className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Outstanding
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex flex-1 flex-col gap-2 md:grid md:grid-cols-2 md:gap-3">
        {reasons.length > 0 ? (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Why this is priority
            </p>
            <ul className="mt-1 space-y-0.5">
              {reasons.map((reason) => (
                <li key={reason} className="text-[11px] text-foreground">
                  · {reason}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div />
        )}

        <div className="rounded-md bg-muted/40 px-2 py-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Recommended action
          </p>
          <p className="text-xs font-semibold text-foreground">{recommended}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/60 pt-2.5">
        <Button
          type="button"
          size="sm"
          className="h-8 rounded-lg px-2.5 text-xs font-semibold"
          onClick={() => onStartVisit(item)}
        >
          Start Visit
          <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Button>
        {outstanding > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 rounded-lg px-2.5 text-xs"
            onClick={() => onRecordCollection(item)}
          >
            <CircleDollarSign className="mr-1 h-3.5 w-3.5" />
            Record Payment
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-lg px-2.5 text-xs"
          onClick={() => onOpenLab(item)}
        >
          Open Lab
        </Button>
      </div>
    </article>
  );
});

export const LabPriorityRow = memo(function LabPriorityRow({ lab, onStartVisit, onRecordCollection }) {
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-border/80 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-semibold">{lab.labName}</span>
          <StatusBadge variant={priorityToBadgeVariant(lab.queuePriority)} compact>
            {lab.queuePriority}
          </StatusBadge>
          <StatusBadge variant={creditVariant(lab.creditStatus)} compact>
            {creditLabel(lab.creditStatus)}
          </StatusBadge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          <MapPin className="mr-0.5 inline h-3 w-3" />
          {lab.area || lab.city || "—"} · Last visit {lab.lastVisit || "—"}
          {Number(lab.outstanding) > 0 ? ` · ${formatCurrency(lab.outstanding)}` : ""}
        </p>
        <p className="mt-0.5 text-xs font-medium text-foreground">{lab.nextAction}</p>
        {lab.stage ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">Stage: {lab.stage}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 gap-1.5">
        <Button type="button" size="sm" className="h-8 rounded-lg text-xs" onClick={() => onStartVisit(lab)}>
          Visit
        </Button>
        {Number(lab.outstanding) > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 rounded-lg text-xs"
            onClick={() => onRecordCollection(lab)}
          >
            Collect
          </Button>
        ) : null}
      </div>
    </article>
  );
});

export function QuickActionsBar({ onLogVisit, onRecordCollection, onMyLabs }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Button type="button" className="h-11 rounded-xl" onClick={onLogVisit}>
        <PlusCircle className="mr-2 h-4 w-4" />
        Log Visit
      </Button>
      <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={onRecordCollection}>
        <CircleDollarSign className="mr-2 h-4 w-4" />
        Collection
      </Button>
      <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={onMyLabs}>
        <Building2 className="mr-2 h-4 w-4" />
        My Labs
      </Button>
      <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={onLogVisit}>
        <CalendarClock className="mr-2 h-4 w-4" />
        Follow-Up
      </Button>
    </div>
  );
}

export const TodaysRouteSection = memo(function TodaysRouteSection({ route, onOpenStop }) {
  if (!route?.flat?.length) {
    return (
      <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
        No route stops ranked yet — clear queue items will appear here.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {route.sections?.length > 1 ? (
        <div className="flex flex-wrap gap-1">
          {route.sections.map((section) => (
            <span
              key={section.area}
              className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground"
            >
              {section.area} · {section.stopCount}
            </span>
          ))}
        </div>
      ) : null}
      <ul className="space-y-1.5">
        {route.flat.map((stop) => (
          <li key={stop.id}>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-xl border border-border bg-card px-2.5 py-2 text-left shadow-sm transition hover:border-primary/30"
              onClick={() => onOpenStop(stop)}
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
                {stop.routeOrder}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{stop.labName}</p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {stop.area || "Territory"} · {queueTypeLabel(stop.queueType)}
                </p>
              </div>
              {stop.outstanding > 0 ? (
                <span className="shrink-0 text-[10px] font-semibold tabular-nums">
                  {formatCurrency(stop.outstanding)}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
});

export const AgentPerformanceStrip = memo(function AgentPerformanceStrip({ metrics }) {
  const tiles = [
    { label: "Visits", value: metrics.visitsCompleted },
    { label: "Recovered", value: metrics.collectionsRecoveredLabel },
    { label: "Labs touched", value: metrics.activeLabsTouched },
    { label: "Overdue", value: metrics.overdueLabs },
    {
      label: "Follow-ups",
      value: metrics.followUpCompletionPct != null ? `${metrics.followUpCompletionPct}%` : "—",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-lg border border-border/80 bg-muted/20 px-2.5 py-2 text-center"
        >
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{tile.label}</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{tile.value}</p>
        </div>
      ))}
    </div>
  );
});

export function QueueEmptyState({ type }) {
  const copy =
    type === "collections"
      ? {
          title: "No collections due",
          description: "Outstanding is clear for now.",
        }
      : type === "followups"
        ? {
            title: "No follow-ups pending",
            description: "You're caught up for today.",
          }
        : type === "visits"
          ? {
              title: "No visits planned",
              description: "Start a visit when you're in the field.",
            }
          : {
              title: "Queue is clear",
              description: "No urgent actions right now.",
            };

  return (
    <p className="rounded-lg border border-dashed px-3 py-2.5 text-center text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">{copy.title}. </span>
      {copy.description}
    </p>
  );
}
