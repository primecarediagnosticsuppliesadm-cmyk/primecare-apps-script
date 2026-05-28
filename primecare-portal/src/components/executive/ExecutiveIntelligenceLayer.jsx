import React, { useState } from "react";
import { StatusBadge } from "@/components/ux";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Gauge,
  TrendingDown,
  TrendingUp,
  Users,
  Building2,
  Zap,
} from "lucide-react";

const SEVERITY_VARIANT = {
  CRITICAL: "danger",
  ATTENTION: "warning",
  MONITORING: "info",
};

const LIFECYCLE_LABEL = {
  onboarding: "Onboarding",
  active_growth: "Active growth",
  stable: "Stable",
  declining: "Declining",
  collections_risk: "Collections risk",
  dormant: "Dormant",
  strategic_account: "Strategic",
};

const TREND_ICON = {
  improving: TrendingUp,
  worsening: TrendingDown,
  stable: Activity,
};

function TrendPill({ trend, deltaPct }) {
  const Icon = TREND_ICON[trend] || Activity;
  const color =
    trend === "improving"
      ? "text-emerald-700 bg-emerald-50"
      : trend === "worsening"
        ? "text-red-700 bg-red-50"
        : "text-slate-600 bg-slate-50";
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium", color)}>
      <Icon className="h-3 w-3" />
      {trend}
      {deltaPct != null ? ` ${deltaPct > 0 ? "+" : ""}${deltaPct}%` : ""}
    </span>
  );
}

function DriftCard({ drift, onOpenLab }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-900">{drift.title}</p>
          {drift.subtitle ? (
            <p className="truncate text-[10px] text-slate-500">{drift.subtitle}</p>
          ) : null}
        </div>
        <StatusBadge variant={SEVERITY_VARIANT[drift.severity] || "info"} compact>
          {drift.severity}
        </StatusBadge>
      </div>
      <p className="mt-1 line-clamp-2 text-[10px] text-slate-600">{drift.summary}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <TrendPill trend={drift.trend} />
        <span className="text-[10px] text-slate-400">First: {drift.firstDetected}</span>
      </div>
      <p className="mt-1 text-[10px] font-medium text-indigo-800">{drift.recommendedAction}</p>
      {drift.labId && onOpenLab ? (
        <button
          type="button"
          className="mt-1 text-[10px] text-indigo-600 underline"
          onClick={() => onOpenLab(drift.labId)}
        >
          Open lab
        </button>
      ) : null}
    </article>
  );
}

/**
 * Compact deterministic intelligence layer (no AI summaries).
 */
export default function ExecutiveIntelligenceLayer({ intelligence, onOpenLab }) {
  const [open, setOpen] = useState(true);
  const [section, setSection] = useState("drift");

  if (!intelligence) return null;

  const {
    driftSignals = [],
    agents = [],
    labLifecycle = [],
    escalationInsights = [],
    trendStrips = [],
    reliability = {},
  } = intelligence;

  const atRiskAgents = agents.filter((a) => a.atRisk);

  return (
    <section
      className="rounded-xl border border-indigo-200/60 bg-gradient-to-b from-indigo-50/40 to-white p-3"
      aria-label="Executive intelligence"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Gauge className="h-4 w-4 text-indigo-700" />
          Operational intelligence
          <StatusBadge variant="info" compact>
            Deterministic
          </StatusBadge>
        </h2>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {trendStrips.map((strip) => (
              <div
                key={strip.key}
                className="rounded-lg border border-slate-200/80 bg-white px-2 py-1.5"
              >
                <p className="text-[9px] font-medium uppercase tracking-wide text-slate-500">
                  {strip.label}
                </p>
                <p className="text-sm font-semibold tabular-nums">{strip.value}</p>
                <TrendPill trend={strip.trend} deltaPct={strip.deltaPct} />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 px-2 py-1.5 col-span-2 sm:col-span-1">
              <p className="text-[9px] uppercase text-slate-500">Operational reliability</p>
              <p className="text-lg font-bold text-indigo-900">{reliability.overall}</p>
            </div>
            <ScoreChip label="Execution" value={reliability.executionReliability} />
            <ScoreChip label="Collections" value={reliability.collectionsDiscipline} />
            <ScoreChip label="Field" value={reliability.fieldDiscipline} />
            <ScoreChip label="Closure" value={reliability.interventionClosureHealth} />
          </div>

          <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-1">
            {[
              ["drift", "Drift", driftSignals.length],
              ["agents", "Agents", atRiskAgents.length || agents.length],
              ["labs", "Labs", labLifecycle.length],
              ["escalation", "Escalation", escalationInsights.length],
            ].map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                className={cn(
                  "rounded-md px-2 py-1 text-[10px] font-medium",
                  section === key
                    ? "bg-indigo-100 text-indigo-900"
                    : "text-slate-600 hover:bg-slate-100"
                )}
                onClick={() => setSection(key)}
              >
                {label}
                {count ? ` (${count})` : ""}
              </button>
            ))}
          </div>

          {section === "drift" ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {driftSignals.length ? (
                driftSignals.map((d) => (
                  <DriftCard key={d.id} drift={d} onOpenLab={onOpenLab} />
                ))
              ) : (
                <p className="col-span-full py-4 text-center text-sm text-emerald-800">
                  No operational drift detected in the current window.
                </p>
              )}
            </div>
          ) : null}

          {section === "agents" ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {agents.length ? (
                agents.map((a) => (
                  <li
                    key={a.name}
                    className={cn(
                      "rounded-lg border px-2.5 py-2",
                      a.atRisk ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-white"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1 text-xs font-semibold">
                        <Users className="h-3.5 w-3.5" />
                        {a.name}
                      </span>
                      {a.atRisk ? (
                        <StatusBadge variant="warning" compact>
                          At risk
                        </StatusBadge>
                      ) : null}
                    </div>
                    <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-slate-600">
                      <span>Reliability {a.reliabilityScore}</span>
                      <span>Pressure {a.pressureScore}</span>
                      <span>Proof {a.proofCompliance}%</span>
                      <span>Visits 14d {a.recentVisits}</span>
                    </div>
                    <TrendPill trend={a.activityTrend} />
                  </li>
                ))
              ) : (
                <li className="col-span-full py-4 text-center text-sm text-slate-500">
                  No agent activity in window.
                </li>
              )}
            </ul>
          ) : null}

          {section === "labs" ? (
            <ul className="flex flex-wrap gap-1.5">
              {labLifecycle.map((lab) => (
                <li key={lab.labId}>
                  <button
                    type="button"
                    className="inline-flex max-w-[200px] flex-col rounded-lg border border-slate-200 bg-white px-2 py-1 text-left hover:border-indigo-300"
                    onClick={() => onOpenLab?.(lab.labId)}
                  >
                    <span className="flex items-center gap-1 truncate text-[10px] font-semibold">
                      <Building2 className="h-3 w-3 shrink-0" />
                      {lab.labName}
                    </span>
                    <span className="text-[9px] text-indigo-700">
                      {LIFECYCLE_LABEL[lab.lifecycle] || lab.lifecycle}
                    </span>
                    {lab.transition ? (
                      <span className="line-clamp-1 text-[9px] text-slate-500">{lab.transition}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {section === "escalation" ? (
            <ul className="space-y-1.5">
              {escalationInsights.length ? (
                escalationInsights.map((ins) => (
                  <li
                    key={ins.id}
                    className="flex gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2"
                  >
                    <Zap className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs font-semibold">{ins.title}</p>
                        <StatusBadge variant={SEVERITY_VARIANT[ins.severity] || "warning"} compact>
                          {ins.kind?.replace(/_/g, " ")}
                        </StatusBadge>
                      </div>
                      {ins.subtitle ? (
                        <p className="text-[10px] text-slate-500">{ins.subtitle}</p>
                      ) : null}
                      <p className="text-[10px] text-slate-600">{ins.summary}</p>
                      <p className="text-[10px] font-medium text-indigo-800">{ins.recommendedAction}</p>
                    </div>
                  </li>
                ))
              ) : (
                <li className="py-4 text-center text-sm text-emerald-800">
                  No escalation patterns requiring executive action.
                </li>
              )}
            </ul>
          ) : null}

          {driftSignals.some((d) => d.severity === "CRITICAL") ? (
            <p className="flex items-center gap-1 text-[10px] text-red-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              {driftSignals.filter((d) => d.severity === "CRITICAL").length} critical drift signal(s)
              — review founder queue and intervention queue.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ScoreChip({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
      <p className="text-[9px] uppercase text-slate-500">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value ?? "—"}</p>
    </div>
  );
}
