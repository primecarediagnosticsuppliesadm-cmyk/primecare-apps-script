import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ux";
import InterventionActionBar from "@/components/executive/InterventionActionBar.jsx";
import { ACTION_PLAN_TYPES } from "@/operations/executiveActionQueueTypes.js";
import { filterOpenExecutiveActionQueueItems } from "@/operations/executiveActionQueueEngine.js";
import { cn } from "@/lib/utils";
import { Zap, ChevronDown, ChevronUp } from "lucide-react";

const SEVERITY_BADGE = { CRITICAL: "danger", ATTENTION: "warning", MONITORING: "neutral" };

const SOURCE_LABELS = {
  qualification: "Qualification",
  contract_renewal: "Contract",
  commission: "Commission",
  ownership: "Ownership",
};

function impactTone(score) {
  if (score >= 75) return "text-red-700 bg-red-50 border-red-200";
  if (score >= 50) return "text-amber-800 bg-amber-50 border-amber-200";
  return "text-slate-700 bg-slate-50 border-slate-200";
}

function QueueRow({
  item,
  onOpen,
  onWorkflowAction,
  onExecutePlan,
  busyAction = "",
  actionsDisabled = false,
}) {
  const primaryPlan = (item.actionPlan || []).find((p) => p.variant === "primary");
  const workflowPlans = (item.actionPlan || []).filter((p) => p.type === ACTION_PLAN_TYPES.WORKFLOW);

  return (
    <article
      role="button"
      tabIndex={0}
      className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-2 shadow-sm transition hover:border-slate-300 hover:shadow-md"
      onClick={() => onOpen?.(item)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen?.(item);
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                impactTone(item.impactScore ?? 0)
              )}
              title="Executive Impact Score"
            >
              <Zap className="h-3 w-3" />
              {item.impactScore ?? 0}
            </span>
            <span className="text-xs font-semibold text-slate-900">{item.title}</span>
            <StatusBadge variant={SEVERITY_BADGE[item.severity] || "neutral"} compact>
              {item.severity}
            </StatusBadge>
            <StatusBadge variant="neutral" compact>
              {SOURCE_LABELS[item.sourceModule] || item.sourceModule}
            </StatusBadge>
            {item.ageLabel ? (
              <span className="text-[10px] text-slate-500">{item.ageLabel}</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-slate-800">{item.subtitle}</p>
          <p className="mt-0.5 line-clamp-2 text-[10px] text-slate-600">{item.summary}</p>
          <p className="mt-1 text-[10px] text-slate-500">Next · {item.recommendedAction}</p>
        </div>
      </div>

      <div
        className="mt-2 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2"
        onClick={(e) => e.stopPropagation()}
      >
        {primaryPlan ? (
          <Button
            type="button"
            size="sm"
            className="h-7 px-2 text-[10px]"
            disabled={actionsDisabled || Boolean(busyAction)}
            onClick={() => onExecutePlan?.(primaryPlan, item)}
          >
            {primaryPlan.label}
          </Button>
        ) : null}
        {(item.actionPlan || [])
          .filter((p) => p.variant !== "primary" && p.type !== ACTION_PLAN_TYPES.WORKFLOW)
          .slice(0, 1)
          .map((plan) => (
            <Button
              key={plan.id}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[10px]"
              disabled={actionsDisabled || Boolean(busyAction)}
              onClick={() => onExecutePlan?.(plan, item)}
            >
              {plan.label}
            </Button>
          ))}
        {workflowPlans.length ? (
          <InterventionActionBar
            issue={item}
            compact
            busyAction={busyAction}
            disabled={actionsDisabled}
            onAction={(action) => onWorkflowAction?.(action, item)}
            className="ml-auto"
          />
        ) : null}
      </div>
    </article>
  );
}

const PREVIEW_LIMIT = 6;

/**
 * Revenue-producing executive action queue (Sprint 1A).
 */
export default function ExecutiveActionQueuePanel({
  queue = null,
  loading = false,
  onOpen,
  onWorkflowAction,
  onExecutePlan,
  busyAction = "",
  actionsDisabled = false,
  className,
}) {
  const [expanded, setExpanded] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const openItems = useMemo(
    () => filterOpenExecutiveActionQueueItems(queue?.items || []),
    [queue?.items]
  );

  const visibleItems = showAll ? openItems : openItems.slice(0, PREVIEW_LIMIT);
  const counts = queue?.counts || { open: 0, total: 0, bySource: {} };

  return (
    <section
      className={cn(
        "rounded-xl border-2 border-amber-500/30 bg-gradient-to-b from-amber-50/40 to-white p-3",
        className
      )}
      aria-label="Executive action queue"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
          <Zap className="h-4 w-4 text-amber-600" />
          Executive Action Queue
          <StatusBadge variant={counts.open > 0 ? "danger" : "success"} compact>
            {counts.open} open
          </StatusBadge>
          {loading ? (
            <span className="text-[10px] font-normal text-slate-500">Updating…</span>
          ) : null}
        </h2>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {!expanded && openItems.length > 0 ? (
        <p className="mt-1 line-clamp-2 text-[10px] text-slate-600">
          {openItems
            .slice(0, 2)
            .map((i) => `${i.title}: ${i.subtitle}`)
            .join(" · ")}
          {openItems.length > 2 ? ` · +${openItems.length - 2} more` : ""}
        </p>
      ) : null}

      {expanded ? (
        <div className="mt-2">
          <div className="mb-2 flex flex-wrap gap-2 text-[10px] text-slate-600">
            {Object.entries(counts.bySource || {}).map(([source, n]) => (
              <span key={source} className="rounded-full bg-white px-2 py-0.5 border border-slate-200">
                {SOURCE_LABELS[source] || source}: {n}
              </span>
            ))}
            <span className="text-slate-400">Sorted by Executive Impact Score</span>
          </div>

          {openItems.length ? (
            <ul className="max-h-[min(420px,50vh)] space-y-1.5 overflow-y-auto pr-0.5">
              {visibleItems.map((item) => (
                <li key={item.id}>
                  <QueueRow
                    item={item}
                    onOpen={onOpen}
                    onWorkflowAction={onWorkflowAction}
                    onExecutePlan={onExecutePlan}
                    busyAction={busyAction}
                    actionsDisabled={actionsDisabled}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-emerald-800">
              No open revenue actions — qualification, contracts, and commissions are current.
            </p>
          )}

          {openItems.length > PREVIEW_LIMIT ? (
            <button
              type="button"
              className="mt-2 text-[10px] font-medium text-amber-900 underline"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? "Show fewer" : `Show ${openItems.length - PREVIEW_LIMIT} more`}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
