import React, { memo } from "react";
import { Button } from "@/components/ui/button";
import KpiCard from "@/components/ux/KpiCard";
import KpiCardGrid from "@/components/ux/KpiCardGrid";
import StatusBadge from "@/components/ux/StatusBadge";
import EmptyState from "@/components/ux/EmptyState";
import {
  Building2,
  ClipboardCheck,
  CalendarClock,
  CircleDollarSign,
  ShieldAlert,
  IndianRupee,
  MapPin,
  Phone,
  MessageCircle,
  ArrowRight,
  PlusCircle,
} from "lucide-react";
import {
  priorityToBadgeVariant,
  queueTypeLabel,
} from "@/pages/agentDailyWorkspace.js";

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
        title="Assigned Labs"
        value={kpis.assignedLabs}
        icon={Building2}
        subtitle="Your territory"
      />
      <KpiCard
        loading={loading}
        title="Visits Today"
        value={kpis.visitsCompletedToday}
        icon={ClipboardCheck}
        subtitle="Logged today"
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
        title="Collections Due"
        value={kpis.collectionsDue}
        icon={CircleDollarSign}
        subtitle="Needs payment action"
      />
      <KpiCard
        loading={loading}
        title="Risk Labs"
        value={kpis.overdueRiskLabs}
        icon={ShieldAlert}
        subtitle="Hold or near limit"
      />
      <KpiCard
        loading={loading}
        title="Sales Today"
        value={formatCurrency(kpis.salesLoggedToday)}
        icon={IndianRupee}
        subtitle="From visit outcomes"
      />
    </KpiCardGrid>
  );
});

export const ActionQueueCard = memo(function ActionQueueCard({
  item,
  onStartVisit,
  onRecordCollection,
  onViewLab,
  onAddFollowUp,
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-3.5 shadow-[var(--pc-shadow-card)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold text-foreground">{item.labName}</h3>
            <StatusBadge variant={priorityToBadgeVariant(item.priority)} compact>
              {item.priority}
            </StatusBadge>
            <StatusBadge variant="info" compact>
              {queueTypeLabel(item.queueType)}
            </StatusBadge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
        </div>
        {item.outstanding > 0 ? (
          <div className="shrink-0 text-right text-xs font-semibold text-foreground">
            {formatCurrency(item.outstanding)}
          </div>
        ) : null}
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <div>
          <dt className="inline">Overdue: </dt>
          <dd className="inline font-medium text-foreground">{Number(item.daysOverdue || 0)}d</dd>
        </div>
        <div>
          <dt className="inline">Last visit: </dt>
          <dd className="inline font-medium text-foreground">{item.lastVisit || "—"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="inline">Next: </dt>
          <dd className="inline font-medium text-foreground">{item.nextAction}</dd>
        </div>
        {item.qualificationLabel ? (
          <div className="col-span-2">
            <dt className="inline">Qualification: </dt>
            <dd className="inline font-medium text-foreground">{item.qualificationLabel}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button
          type="button"
          size="sm"
          className="h-8 rounded-lg px-2.5 text-xs"
          onClick={() => onStartVisit(item)}
        >
          Start Visit
          <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Button>
        {item.queueType === "COLLECTION_DUE" || item.outstanding > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 rounded-lg px-2.5 text-xs"
            onClick={() => onRecordCollection(item)}
          >
            Collection
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-lg px-2.5 text-xs"
          onClick={() => onViewLab(item)}
        >
          View Lab
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 rounded-lg px-2.5 text-xs"
          onClick={() => onAddFollowUp(item)}
        >
          Follow-Up
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 rounded-lg px-2 text-xs" disabled title="Coming soon">
          <Phone className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" size="sm" variant="ghost" className="h-8 rounded-lg px-2 text-xs" disabled title="Coming soon">
          <MessageCircle className="h-3.5 w-3.5" />
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

export function QueueEmptyState({ type }) {
  const copy =
    type === "collections"
      ? {
          title: "No collections due",
          description: "Outstanding is clear for now. Keep visits moving on risk labs.",
        }
      : type === "followups"
        ? {
            title: "No follow-ups pending",
            description: "You're caught up on scheduled follow-ups for today.",
          }
        : type === "visits"
          ? {
              title: "No visits planned",
              description: "Use Start Visit when you're ready to log field activity.",
            }
          : {
              title: "Queue is clear",
              description: "No urgent actions right now. Use quick actions to log new work.",
            };

  return <EmptyState title={copy.title} description={copy.description} className="py-8" />;
}
