import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, PageSkeleton } from "@/components/ux";
import { loadOperationsCommandCenterData } from "@/operations/operationsCommandCenterLoader.js";
import { buildFounderPhaseEngineView } from "@/founder/founderPhaseEngine.js";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import { cn } from "@/lib/utils";
import {
  Compass,
  Target,
  LockOpen,
  AlertTriangle,
  CheckCircle2,
  Circle,
  ArrowRight,
  ChevronRight,
  Lock,
  ListChecks,
  RefreshCw,
} from "lucide-react";

const PHASE_VISUAL_STYLE = {
  complete: "border-emerald-400 bg-emerald-50 text-emerald-950",
  current: "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-300/60 text-indigo-950",
  blocked: "border-amber-400 bg-amber-50 text-amber-950",
  locked: "border-slate-200 bg-slate-100 text-slate-500",
  upcoming: "border-slate-200 bg-white text-slate-600",
};

const MILESTONE_STATUS = {
  completed: { label: "Complete", variant: "success", Icon: CheckCircle2 },
  in_progress: { label: "In progress", variant: "info", Icon: Circle },
  blocked: { label: "Blocked", variant: "warning", Icon: AlertTriangle },
  locked: { label: "Locked", variant: "neutral", Icon: Lock },
};

const BLOCKER_VARIANT = { high: "danger", medium: "warning", low: "info" };

const PAGE_ACTIONS = {
  dashboard: "Dashboard",
  operationsCenter: "Operations Center",
  risk: "Collections",
  orders: "Orders",
  founderNavigation: "Founder Navigation",
  predatorDebug: "Predator Debug",
};

function PhaseBlock({ phase, showArrow }) {
  return (
    <li className="flex min-w-[100px] flex-1 items-stretch gap-0.5">
      <div
        className={cn(
          "flex w-full min-w-[88px] flex-col rounded-lg border px-2 py-2 text-center shadow-sm",
          PHASE_VISUAL_STYLE[phase.visualStatus] || PHASE_VISUAL_STYLE.upcoming
        )}
      >
        <p className="text-[10px] font-bold leading-tight">{phase.shortLabel}</p>
        <p className="mt-1 text-lg font-bold tabular-nums">{phase.progressPct}%</p>
        <p className="text-[9px] opacity-80">
          {phase.completedMilestones}/{phase.milestoneCount}
        </p>
      </div>
      {showArrow ? (
        <ChevronRight className="mt-6 hidden h-4 w-4 shrink-0 text-slate-300 sm:block" aria-hidden />
      ) : null}
    </li>
  );
}

/**
 * Founder Navigation V2 — data-driven journey map.
 */
export default function FounderNavigationPage({ setActivePage = null, currentUser = null }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const tenantId = currentUser?.tenantId || "";

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await loadOperationsCommandCenterData(currentUser);
      setPayload(data);
    } catch (err) {
      setError(err?.message || "Failed to load operational data");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const journey = useMemo(() => {
    if (!payload) return null;
    return buildFounderPhaseEngineView(payload, tenantId);
  }, [payload, tenantId]);

  const predatorSnapshot = useMemo(() => {
    if (!journey) return null;
    return {
      founderNavigation: true,
      currentPhaseId: journey.currentPhaseId,
      pilotReadinessPct: journey.signals?.pilotReadinessPct,
      milestonesCompleted: journey.year1MilestonesCompleted,
      milestonesTotal: journey.year1MilestonesTotal,
      fieldScaleUnlocked: journey.signals?.fieldScaleUnlocked,
      dataStale: journey.signals?.dataStale,
    };
  }, [journey]);

  usePredatorModuleValidation(
    "Founder Navigation",
    currentUser,
    predatorSnapshot ?? {},
    Boolean(predatorSnapshot)
  );

  if (loading) {
    return <PageSkeleton kpiCount={3} kpiColumns={2} listRows={4} />;
  }

  if (!journey) {
    return (
      <div className="p-4 text-sm text-red-700">
        {error || "Unable to compute journey."}
        <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }

  const {
    programTitle,
    programSubtitle,
    version,
    whereWeAreNow,
    currentPhase,
    nextPhase,
    currentGoal,
    nextUnlock,
    blockers,
    highBlockers,
    year1ProgressPercent,
    year1MilestonesCompleted,
    year1MilestonesTotal,
    phases,
    milestones,
    dailyFocus,
    signals,
    contractPipeline,
  } = journey;

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4 pb-12 lg:max-w-4xl lg:p-5">
      <header className="flex items-start justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wide text-slate-500">
          {programSubtitle} · {version}
        </p>
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </header>

      {/* Hero */}
      <section
        className="rounded-xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 via-white to-slate-50 p-4 shadow-sm"
        aria-label="Founder journey hero"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-indigo-100 p-2">
            <Compass className="h-5 w-5 text-indigo-800" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              {programTitle}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge variant="info" compact>
                Phase · {currentPhase?.title}
              </StatusBadge>
              {signals?.dataStale ? (
                <StatusBadge variant="warning" compact>
                  Stale data
                </StatusBadge>
              ) : null}
            </div>
            <p className="mt-2 text-sm leading-snug text-slate-700">{whereWeAreNow}</p>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex justify-between text-[10px] font-medium text-slate-600">
            <span>Year-1 milestones</span>
            <span className="tabular-nums">
              {year1MilestonesCompleted}/{year1MilestonesTotal} · {year1ProgressPercent}%
            </span>
          </div>
          <div
            className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-200/80"
            role="progressbar"
            aria-valuenow={year1ProgressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-indigo-600 transition-all"
              style={{ width: `${year1ProgressPercent}%` }}
            />
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[10px] sm:grid-cols-3">
          <div className="rounded-md border bg-white px-1 py-1.5">
            <p className="text-slate-500">Active labs</p>
            <p className="text-sm font-bold tabular-nums">{signals.activeLabs}</p>
          </div>
          <div className="rounded-md border bg-white px-1 py-1.5">
            <p className="text-slate-500">Contracts</p>
            <p className="text-sm font-bold tabular-nums">
              {contractPipeline?.activeContractCount ?? 0}
            </p>
          </div>
          <div className="rounded-md border bg-white px-1 py-1.5">
            <p className="text-slate-500">Committed / mo</p>
            <p className="text-xs font-bold tabular-nums">
              {contractPipeline?.monthlyCommittedLabel ?? "₹0"}
            </p>
          </div>
          <div className="rounded-md border bg-white px-1 py-1.5">
            <p className="text-slate-500">Visits · 14d</p>
            <p className="text-sm font-bold tabular-nums">{signals.visits14d}</p>
          </div>
          <div className="rounded-md border bg-white px-1 py-1.5">
            <p className="text-slate-500">Proof %</p>
            <p className="text-sm font-bold tabular-nums">{signals.proofCompliancePct}</p>
          </div>
        </div>
      </section>

      {/* Block diagram timeline */}
      <section className="rounded-lg border border-slate-200 bg-white p-3" aria-label="Journey block diagram">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Journey phases
        </h2>
        <ol className="mt-3 flex gap-0.5 overflow-x-auto pb-1">
          {phases.map((phase) => (
            <PhaseBlock key={phase.id} phase={phase} showArrow={phase.showArrow} />
          ))}
        </ol>
        {currentPhase ? (
          <p className="mt-2 text-[11px] text-slate-700">
            <span className="font-semibold text-indigo-800">Now:</span> {currentPhase.headline}
            {nextPhase && nextPhase.visualStatus === "locked" ? (
              <span className="text-slate-500"> → {nextPhase.title} locked</span>
            ) : nextPhase ? (
              <span className="text-slate-500"> → Next: {nextPhase.title}</span>
            ) : null}
          </p>
        ) : null}
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Current goal tracker */}
        <section className="rounded-lg border border-slate-200 bg-white p-3" aria-label="Current goal">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Target className="h-4 w-4 text-indigo-700" />
            {currentGoal.title}
          </h2>
          <p className="mt-1 text-[11px] text-slate-600">{currentGoal.summary}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[9px] uppercase text-slate-500">Current</p>
              <p className="text-lg font-bold text-indigo-900">{currentGoal.current}%</p>
            </div>
            <div>
              <p className="text-[9px] uppercase text-slate-500">Target</p>
              <p className="text-lg font-bold text-slate-800">{currentGoal.target}%</p>
            </div>
            <div>
              <p className="text-[9px] uppercase text-slate-500">Gap</p>
              <p className="text-lg font-bold text-amber-800">{currentGoal.gap}%</p>
            </div>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-indigo-500"
              style={{
                width: `${Math.min(100, (currentGoal.current / currentGoal.target) * 100)}%`,
              }}
            />
          </div>
          {currentGoal.blockingIssues?.length ? (
            <ul className="mt-2 space-y-0.5">
              {currentGoal.blockingIssues.slice(0, 3).map((issue) => (
                <li key={issue} className="text-[10px] text-amber-800">
                  · {issue}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        {/* Next unlock */}
        <section
          className={cn(
            "rounded-lg border p-3",
            nextUnlock.unlocked
              ? "border-emerald-200 bg-emerald-50/50"
              : "border-amber-200/80 bg-amber-50/40"
          )}
          aria-label="Next unlock"
        >
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <LockOpen className="h-4 w-4 text-amber-700" />
            Next unlock · {nextUnlock.title}
          </h2>
          {nextUnlock.unlocked ? (
            <StatusBadge variant="success" compact className="mt-1">
              Unlocked
            </StatusBadge>
          ) : (
            <StatusBadge variant="warning" compact className="mt-1">
              Locked
            </StatusBadge>
          )}
          <p className="mt-1 text-[11px] text-slate-700">{nextUnlock.summary}</p>
          <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
            {nextUnlock.unlocksWhen.map((item) => (
              <li key={item} className="flex gap-1 text-[10px] text-slate-700">
                <ArrowRight className="mt-0.5 h-3 w-3 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
          {setActivePage && nextUnlock.portalHint ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 h-8 w-full text-[10px] max-md:min-h-10"
              onClick={() => setActivePage(nextUnlock.portalHint)}
            >
              Open operations workspace
            </Button>
          ) : null}
        </section>
      </div>

      {/* Daily focus */}
      <section className="rounded-lg border border-indigo-100 bg-indigo-50/30 p-3" aria-label="Daily focus">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ListChecks className="h-4 w-4 text-indigo-700" />
          Today&apos;s focus
        </h2>
        <ol className="mt-2 space-y-2">
          {dailyFocus.map((item, i) => (
            <li
              key={item.title}
              className="flex items-start justify-between gap-2 rounded-md border border-white bg-white px-2.5 py-2"
            >
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900">
                  {i + 1}. {item.title}
                </p>
                <p className="text-[10px] text-slate-600">{item.detail}</p>
              </div>
              {setActivePage && item.action ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 text-[10px]"
                  onClick={() => setActivePage(item.action)}
                >
                  {PAGE_ACTIONS[item.action] || "Open"}
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      {/* Milestones */}
      <section className="rounded-lg border border-slate-200 bg-white p-3" aria-label="Milestones">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Milestones
        </h2>
        <ul className="mt-2 max-h-[min(280px,40vh)] space-y-1.5 overflow-y-auto">
          {milestones.map((m) => {
            const meta = MILESTONE_STATUS[m.status] || MILESTONE_STATUS.in_progress;
            const Icon = meta.Icon;
            return (
              <li
                key={m.id}
                className={cn(
                  "flex items-start gap-2 rounded-md border px-2 py-1.5",
                  m.status === "completed" && "border-emerald-100 bg-emerald-50/50",
                  m.status === "blocked" && "border-amber-100 bg-amber-50/50",
                  m.status === "locked" && "border-slate-100 bg-slate-50 opacity-80"
                )}
              >
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-[11px] font-semibold">{m.title}</p>
                    <StatusBadge variant={meta.variant} compact>
                      {meta.label}
                    </StatusBadge>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    {m.current}
                    {m.unit === "%" ? "%" : ` ${m.unit}`} / {m.target}
                    {m.unit === "%" ? "%" : ` ${m.unit}`}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Blockers */}
      {blockers.length ? (
        <section className="rounded-lg border border-slate-200 bg-white p-3" aria-label="Blockers">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Blockers
            {highBlockers.length > 0 ? (
              <StatusBadge variant="danger" compact>
                {highBlockers.length} high
              </StatusBadge>
            ) : null}
          </h2>
          <ul className="mt-2 space-y-1.5">
            {blockers.slice(0, 6).map((b) => (
              <li key={b.id} className="rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold">{b.title}</p>
                  <StatusBadge variant={BLOCKER_VARIANT[b.severity] || "neutral"} compact>
                    {b.severity}
                  </StatusBadge>
                </div>
                <p className="text-[10px] text-slate-600">{b.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? (
        <p className="text-xs text-amber-800">{error}</p>
      ) : null}

      <p className="text-center text-[10px] text-slate-400">
        Live ops data · refresh to recompute phase engine
      </p>
    </div>
  );
}
