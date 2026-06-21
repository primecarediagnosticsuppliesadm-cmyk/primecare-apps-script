import React, { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatRouteStopBadge,
  getRouteStopTargetAmount,
} from "@/pages/agentOsModel.js";
import { formatAgentCurrency } from "@/pages/agentUxPresentation.js";
import { AgentLabQuickActions } from "@/components/agent/AgentFieldExecution.jsx";

export const AgentRouteStopBadge = memo(function AgentRouteStopBadge({
  stopNumber,
  className,
  compact = false,
}) {
  if (!stopNumber || stopNumber < 1) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md bg-[var(--pc-brand-primary)]/10 font-bold uppercase tracking-wide text-[var(--pc-brand-primary)] ring-1 ring-[var(--pc-brand-primary)]/25",
        compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]",
        className
      )}
    >
      {formatRouteStopBadge(stopNumber)}
    </span>
  );
});

export const AgentTodaysProgressCard = memo(function AgentTodaysProgressCard({
  osState,
  loading = false,
}) {
  if (loading) {
    return (
      <article className="animate-pulse rounded-xl border border-border bg-card p-4">
        <div className="h-4 w-32 rounded bg-muted" />
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="h-12 rounded bg-muted" />
          <div className="h-12 rounded bg-muted" />
          <div className="h-12 rounded bg-muted" />
        </div>
      </article>
    );
  }

  const visitsDone = Number(osState?.completedStops ?? osState?.visitsCompletedToday ?? 0);
  const visitsTotal = Math.max(Number(osState?.totalStops ?? 0), visitsDone);
  const progressPct = Number(osState?.visitProgressPct ?? 0);

  return (
    <article className="rounded-xl border border-border bg-card p-3 shadow-sm md:p-4">
      <h2 className="text-sm font-semibold text-foreground">Today&apos;s Progress</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Visits completed
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
            {visitsDone} / {visitsTotal || visitsDone || 0} completed
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Collections recorded
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
            {formatAgentCurrency(osState?.collectionsRecordedToday ?? 0)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Outstanding remaining
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
            {formatAgentCurrency(osState?.outstandingRemaining ?? 0)}
          </p>
        </div>
      </div>
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Visit progress</span>
          <span className="font-semibold tabular-nums text-foreground">{progressPct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-[var(--pc-brand-primary)] transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>
    </article>
  );
});

export const AgentDayCompleteCard = memo(function AgentDayCompleteCard({
  osState,
  onOpenCollections,
  onScheduleFollowUps,
}) {
  const visitsDone = Number(osState?.visitsCompletedToday ?? osState?.completedStops ?? 0);
  const collected = Number(osState?.collectionsRecordedToday ?? 0);
  const remaining = Number(osState?.outstandingRemaining ?? 0);

  return (
    <article className="rounded-xl border-2 border-emerald-300/40 bg-gradient-to-br from-emerald-50/80 via-card to-card p-4 shadow-md md:p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">
        Day complete
      </p>
      <h2 className="mt-1 text-2xl font-bold text-foreground">Great work.</h2>
      <div className="mt-3 space-y-1 text-sm text-foreground">
        <p>
          <span className="font-bold tabular-nums">{visitsDone}</span> visit
          {visitsDone === 1 ? "" : "s"} completed
        </p>
        <p>
          <span className="font-bold tabular-nums">{formatAgentCurrency(collected)}</span> collected
          today
        </p>
        {remaining > 0 ? (
          <p className="text-muted-foreground">
            <span className="font-semibold tabular-nums text-foreground">
              {formatAgentCurrency(remaining)}
            </span>{" "}
            still outstanding across your territory
          </p>
        ) : null}
      </div>
      <div className="mt-4">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Next suggested action
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" size="sm" className="h-9 rounded-lg text-xs" onClick={onOpenCollections}>
            Review collections
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 rounded-lg text-xs"
            onClick={onScheduleFollowUps}
          >
            Schedule follow-ups
          </Button>
        </div>
      </div>
    </article>
  );
});

export function AgentStickyMissionWidget({
  osState,
  loading = false,
  onOpenVisit,
  dayComplete = false,
}) {
  const [expanded, setExpanded] = useState(false);

  if (loading || dayComplete || !osState?.currentStop) return null;

  const stop = osState.currentStop;
  const stopNum = stop.stopNumber ?? osState.currentStopIndex + 1;
  const total = osState.totalStops || 1;
  const target = getRouteStopTargetAmount(stop);

  return (
    <div className="pointer-events-none fixed bottom-6 right-4 z-40 hidden lg:block">
      <div className="pointer-events-auto w-64 overflow-hidden rounded-xl border border-border bg-card/95 shadow-lg backdrop-blur">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/40"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--pc-brand-primary)]">
              Today
            </p>
            <p className="truncate text-xs font-semibold text-foreground">
              Stop {stopNum} of {total}
            </p>
          </div>
          {expanded ? (
            <ChevronRight className="h-4 w-4 shrink-0 rotate-90 text-muted-foreground" />
          ) : (
            <ChevronLeft className="h-4 w-4 shrink-0 -rotate-90 text-muted-foreground" />
          )}
        </button>

        {expanded ? (
          <div className="border-t border-border/60 px-3 pb-3 pt-2">
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--pc-brand-primary)]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-foreground">{stop.labName}</p>
                {target > 0 ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Target:{" "}
                    <span className="font-bold tabular-nums text-foreground">
                      {formatAgentCurrency(target)}
                    </span>
                  </p>
                ) : null}
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              className="mt-2 h-8 w-full rounded-lg text-xs font-semibold"
              onClick={() => onOpenVisit?.(stop)}
            >
              Open Visit
              <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
            <AgentLabQuickActions lab={stop} className="mt-2" size="xs" />
          </div>
        ) : (
          <div className="border-t border-border/60 px-3 py-2">
            <p className="truncate text-[11px] font-medium text-foreground">{stop.labName}</p>
            {target > 0 ? (
              <p className="text-[10px] tabular-nums text-muted-foreground">
                Target {formatAgentCurrency(target)}
              </p>
            ) : null}
            <AgentLabQuickActions lab={stop} className="mt-1.5" size="xs" />
          </div>
        )}
      </div>
    </div>
  );
}
