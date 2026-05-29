import React, { useState } from "react";
import { StatusBadge } from "@/components/ux";
import { PILOT_EMPTY_LABEL } from "@/utils/pilotDisplay.js";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Gauge,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

const SEVERITY_VARIANT = {
  CRITICAL: "danger",
  ATTENTION: "warning",
  MONITORING: "info",
};

const TREND_ICON = {
  improving: TrendingUp,
  worsening: TrendingDown,
  stable: Activity,
};

const PREVIEW_LIMIT = 3;

function TrendPill({ trend, deltaPct, compact }) {
  const Icon = TREND_ICON[trend] || Activity;
  const color =
    trend === "improving"
      ? "text-emerald-700 bg-emerald-50"
      : trend === "worsening"
        ? "text-red-700 bg-red-50"
        : "text-slate-600 bg-slate-50";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded font-medium",
        compact ? "px-1 py-0 text-[9px]" : "px-1.5 py-0.5 text-[10px]",
        color
      )}
    >
      <Icon className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {trend}
      {!compact && deltaPct != null ? ` ${deltaPct > 0 ? "+" : ""}${deltaPct}%` : null}
    </span>
  );
}

function DriftRow({ drift, onOpenLab }) {
  return (
    <li className="flex items-start justify-between gap-2 rounded-md border border-slate-200/80 bg-white px-2 py-1.5">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-slate-900">{drift.title}</p>
        <p className="truncate text-[10px] text-slate-500">
          {drift.subtitle || drift.summary}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <StatusBadge variant={SEVERITY_VARIANT[drift.severity] || "info"} compact>
          {drift.severity === "CRITICAL" ? "!" : drift.severity?.slice(0, 3)}
        </StatusBadge>
        {drift.labId && onOpenLab ? (
          <button
            type="button"
            className="text-[9px] text-indigo-600 underline"
            onClick={() => onOpenLab(drift.labId)}
          >
            Lab
          </button>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Collapsed-by-default intelligence — expand for detail.
 */
export default function ExecutiveIntelligenceLayer({ intelligence, onOpenLab }) {
  const [open, setOpen] = useState(false);
  const [showAllDrift, setShowAllDrift] = useState(false);

  if (!intelligence) return null;

  const {
    driftSignals = [],
    agents = [],
    escalationInsights = [],
    trendStrips = [],
    reliability = {},
  } = intelligence;

  const atRiskAgents = agents.filter((a) => a.atRisk);
  const criticalDrift = driftSignals.filter((d) => d.severity === "CRITICAL").length;
  const visibleDrift = showAllDrift ? driftSignals : driftSignals.slice(0, PREVIEW_LIMIT);
  const worseningTrends = trendStrips.filter((t) => t.trend === "worsening").length;

  const summaryParts = [
    reliability.overall != null ? `Reliability ${reliability.overall}` : "Reliability not scored yet",
    driftSignals.length ? `${driftSignals.length} drift` : null,
    atRiskAgents.length ? `${atRiskAgents.length} agents at risk` : null,
    escalationInsights.length ? `${escalationInsights.length} escalations` : null,
  ].filter(Boolean);

  return (
    <section
      className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2"
      aria-label="Executive intelligence"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Gauge className="h-4 w-4 text-indigo-600" />
            Intelligence
            {criticalDrift > 0 ? (
              <StatusBadge variant="danger" compact>
                {criticalDrift} critical
              </StatusBadge>
            ) : null}
          </h2>
          {!open ? (
            <p className="mt-0.5 truncate text-[10px] text-slate-600">{summaryParts.join(" · ")}</p>
          ) : null}
        </div>
        {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
      </button>

      {open ? (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {trendStrips.map((strip) => (
              <span
                key={strip.key}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px]"
                title={strip.label}
              >
                <span className="text-slate-500">{strip.label.split(" ")[0]}</span>
                <span className="font-semibold tabular-nums">{strip.value}</span>
                <TrendPill trend={strip.trend} compact />
              </span>
            ))}
            <span className="inline-flex items-center rounded-md border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-900">
              Score {reliability.overall ?? PILOT_EMPTY_LABEL}
            </span>
          </div>

          {driftSignals.length ? (
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Top drift signals
              </p>
              <ul className="space-y-1">
                {visibleDrift.map((d) => (
                  <DriftRow key={d.id} drift={d} onOpenLab={onOpenLab} />
                ))}
              </ul>
              {driftSignals.length > PREVIEW_LIMIT ? (
                <button
                  type="button"
                  className="mt-1 text-[10px] font-medium text-indigo-700"
                  onClick={() => setShowAllDrift((v) => !v)}
                >
                  {showAllDrift
                    ? "Show less"
                    : `Show ${driftSignals.length - PREVIEW_LIMIT} more`}
                </button>
              ) : null}
            </div>
          ) : (
            <p className="text-[11px] text-emerald-800">No drift in current window.</p>
          )}

          {(atRiskAgents.length > 0 || escalationInsights.length > 0) && (
            <div className="flex flex-wrap gap-2 text-[10px] text-slate-600">
              {atRiskAgents.length > 0 ? (
                <span>
                  At-risk: {atRiskAgents.map((a) => a.name).slice(0, 3).join(", ")}
                  {atRiskAgents.length > 3 ? ` +${atRiskAgents.length - 3}` : ""}
                </span>
              ) : null}
              {escalationInsights.length > 0 ? (
                <span>{escalationInsights.length} escalation pattern(s)</span>
              ) : null}
            </div>
          )}

          {worseningTrends >= 2 ? (
            <p className="flex items-center gap-1 text-[10px] text-amber-800">
              <AlertTriangle className="h-3 w-3" />
              Multiple metrics worsening — review founder queue first.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
