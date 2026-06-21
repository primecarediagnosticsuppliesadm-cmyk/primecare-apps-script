import React, { memo } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, MapPin, MessageCircle, Phone, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildDailyChecklistItems,
  buildDirectionsUrl,
  buildTelUrl,
  buildWhatsAppUrl,
  enrichLabFieldContext,
  formatOutcomeSummary,
  resolveLabContact,
} from "@/pages/agentFieldExecution.js";
import { formatAgentCurrency } from "@/pages/agentUxPresentation.js";

export const AgentLabQuickActions = memo(function AgentLabQuickActions({
  lab,
  className,
  size = "sm",
}) {
  const contact = resolveLabContact(lab);
  const tel = buildTelUrl(contact.phone);
  const whatsapp = buildWhatsAppUrl(contact.phone);
  const directions = buildDirectionsUrl(lab);
  const btnClass = size === "xs" ? "h-7 rounded-lg px-2 text-[10px]" : "h-8 rounded-lg px-2.5 text-xs";

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {tel ? (
        <Button type="button" size="sm" variant="outline" className={btnClass} asChild>
          <a href={tel}>
            <Phone className="mr-1 h-3 w-3" />
            Call
          </a>
        </Button>
      ) : null}
      {whatsapp ? (
        <Button type="button" size="sm" variant="outline" className={btnClass} asChild>
          <a href={whatsapp} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="mr-1 h-3 w-3" />
            WhatsApp
          </a>
        </Button>
      ) : null}
      {directions ? (
        <Button type="button" size="sm" variant="outline" className={btnClass} asChild>
          <a href={directions} target="_blank" rel="noopener noreferrer">
            <MapPin className="mr-1 h-3 w-3" />
            Directions
          </a>
        </Button>
      ) : null}
    </div>
  );
});

export const AgentLastVisitOutcome = memo(function AgentLastVisitOutcome({
  lab,
  recentVisits = [],
  assignedLabs = [],
  className,
  compact = false,
}) {
  const ctx = enrichLabFieldContext(lab, recentVisits, assignedLabs);
  const summary = formatOutcomeSummary(ctx.lastOutcome);
  if (!summary) return null;

  return (
    <p
      className={cn(
        "text-muted-foreground",
        compact ? "text-[10px]" : "text-[11px]",
        className
      )}
    >
      <span className="font-medium text-foreground">Last outcome:</span> {summary}
    </p>
  );
});

export const AgentCollectionTargetCompare = memo(function AgentCollectionTargetCompare({
  outstanding = 0,
  collectionTarget,
  className,
  showBar = true,
}) {
  const out = Number(outstanding || 0);
  const target = Number(
    collectionTarget ?? computeSuggestedCollectionToday(out)
  );
  if (out <= 0 && target <= 0) return null;

  const effectiveTarget = target > 0 ? target : out;
  const pct = out > 0 ? Math.min(100, Math.round((effectiveTarget / out) * 100)) : 100;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-[var(--pc-brand-primary)]/30 bg-[var(--pc-brand-primary)]/5 px-2.5 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Target today
          </p>
          <p className="text-lg font-bold tabular-nums text-[var(--pc-brand-primary)]">
            {formatAgentCurrency(effectiveTarget)}
          </p>
        </div>
        <div className="rounded-lg bg-muted/40 px-2.5 py-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Outstanding
          </p>
          <p className="text-lg font-bold tabular-nums text-foreground">
            {formatAgentCurrency(out)}
          </p>
        </div>
      </div>
      {showBar && out > 0 ? (
        <div>
          <div className="mb-0.5 flex justify-between text-[10px] text-muted-foreground">
            <span>Target vs outstanding</span>
            <span className="font-semibold tabular-nums text-foreground">{pct}% of balance</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[var(--pc-brand-primary)]"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
});

export const AgentVisitObjectivePanel = memo(function AgentVisitObjectivePanel({
  lab,
  collection,
  recentVisits = [],
  assignedLabs = [],
  routeStopNumber,
  className,
}) {
  if (!lab) return null;

  const ctx = enrichLabFieldContext(
    { ...lab, outstanding: collection?.outstandingAmount ?? lab.outstanding },
    recentVisits,
    assignedLabs
  );

  return (
    <section
      className={cn(
        "rounded-xl border-2 border-[var(--pc-brand-primary)]/25 bg-gradient-to-br from-[var(--pc-brand-primary)]/8 via-card to-card p-3 shadow-sm",
        className
      )}
    >
      <div className="flex items-start gap-2">
        <Target className="mt-0.5 h-4 w-4 shrink-0 text-[var(--pc-brand-primary)]" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--pc-brand-primary)]">
            Visit objective
            {routeStopNumber ? ` · Stop #${routeStopNumber}` : ""}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{ctx.objective}</p>
        </div>
      </div>

      {ctx.reasons.length > 0 ? (
        <ul className="mt-2 space-y-0.5 pl-6">
          {ctx.reasons.map((reason) => (
            <li key={reason} className="text-[11px] text-foreground">
              · {reason}
            </li>
          ))}
        </ul>
      ) : null}

      <AgentLastVisitOutcome
        lab={lab}
        recentVisits={recentVisits}
        assignedLabs={assignedLabs}
        className="mt-2 pl-6"
      />

      {ctx.outstanding > 0 ? (
        <AgentCollectionTargetCompare
          outstanding={ctx.outstanding}
          collectionTarget={ctx.collectionTarget}
          className="mt-3"
        />
      ) : null}

      <AgentLabQuickActions lab={ctx.lab} className="mt-3 pl-1" />
    </section>
  );
});

export const AgentDailyChecklist = memo(function AgentDailyChecklist({
  osState,
  routeStops = [],
  recentVisits = [],
  className,
}) {
  const items = buildDailyChecklistItems(osState, routeStops, recentVisits);
  const doneCount = items.filter((i) => i.done).length;

  return (
    <article className={cn("rounded-xl border border-border bg-card p-3 shadow-sm md:p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Daily checklist</h2>
        <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
          {doneCount}/{items.length} done
        </span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2 rounded-lg bg-muted/20 px-2 py-1.5">
            {item.done ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <span
              className={cn(
                "text-xs leading-snug",
                item.done ? "text-muted-foreground line-through" : "font-medium text-foreground"
              )}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
});

export const AgentLabFieldStrip = memo(function AgentLabFieldStrip({
  lab,
  recentVisits = [],
  assignedLabs = [],
  outstanding,
  collectionTarget,
  showTargetCompare = true,
  className,
}) {
  const ctx = enrichLabFieldContext(lab, recentVisits, assignedLabs);
  const out = Number(outstanding ?? ctx.outstanding ?? 0);
  const target = Number(collectionTarget ?? ctx.collectionTarget ?? 0);

  return (
    <div className={cn("space-y-2", className)}>
      <AgentLastVisitOutcome lab={lab} recentVisits={recentVisits} assignedLabs={assignedLabs} />
      {showTargetCompare && out > 0 ? (
        <AgentCollectionTargetCompare outstanding={out} collectionTarget={target} showBar={false} />
      ) : null}
      <AgentLabQuickActions lab={ctx.lab} />
    </div>
  );
});
