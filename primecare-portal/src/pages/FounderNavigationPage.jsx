import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ux";
import {
  getFounderJourneyView,
  FOUNDER_JOURNEY_VERSION,
} from "@/founder/founderJourneyDefinition.js";
import { cn } from "@/lib/utils";
import {
  Compass,
  Target,
  LockOpen,
  AlertTriangle,
  CheckCircle2,
  Circle,
  ArrowRight,
} from "lucide-react";

const PHASE_STATUS_STYLE = {
  complete: "border-emerald-200 bg-emerald-50/80 text-emerald-900",
  current: "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200/80 text-indigo-950",
  upcoming: "border-slate-200 bg-slate-50 text-slate-600",
};

const BLOCKER_VARIANT = {
  high: "danger",
  medium: "warning",
  low: "info",
};

function PhaseNode({ phase, isLast }) {
  const Icon =
    phase.status === "complete" ? CheckCircle2 : phase.status === "current" ? Target : Circle;
  return (
    <li className="flex min-w-0 flex-1 flex-col items-center">
      <div
        className={cn(
          "flex w-full max-w-[140px] flex-col rounded-lg border px-2 py-2 text-center transition",
          PHASE_STATUS_STYLE[phase.status] || PHASE_STATUS_STYLE.upcoming
        )}
      >
        <Icon
          className={cn(
            "mx-auto h-4 w-4 shrink-0",
            phase.status === "current" && "text-indigo-700"
          )}
        />
        <p className="mt-1 text-[10px] font-semibold leading-tight">{phase.shortLabel}</p>
        <p className="mt-0.5 text-[9px] opacity-80">{phase.window}</p>
      </div>
      {!isLast ? (
        <div
          className="mt-2 hidden h-0.5 w-full max-w-[24px] bg-slate-200 sm:block"
          aria-hidden
        />
      ) : null}
    </li>
  );
}

/**
 * Founder Navigation — static journey map (scan in ~15s).
 */
export default function FounderNavigationPage({ setActivePage = null }) {
  const journey = useMemo(() => getFounderJourneyView(), []);

  const {
    programTitle,
    programSubtitle,
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
    completedPhases,
    phaseCount,
  } = journey;

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4 pb-12 lg:max-w-4xl lg:p-5">
      {/* 1. Founder Journey Hero */}
      <section
        className="rounded-xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50 via-white to-slate-50 p-4 shadow-sm"
        aria-label="Founder journey hero"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-indigo-100 p-2">
            <Compass className="h-5 w-5 text-indigo-800" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-indigo-700">
              {programSubtitle}
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
              {programTitle}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge variant="info" compact>
                Phase · {currentPhase?.title}
              </StatusBadge>
              <span className="text-[10px] text-slate-500">
                {completedPhases}/{phaseCount} phases complete · {FOUNDER_JOURNEY_VERSION}
              </span>
            </div>
            <p className="mt-2 text-sm leading-snug text-slate-700">{whereWeAreNow}</p>
          </div>
        </div>

        {/* 5. Year-1 Progress Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between gap-2 text-[10px] font-medium text-slate-600">
            <span>Year-1 progress</span>
            <span className="tabular-nums">
              {year1MilestonesCompleted}/{year1MilestonesTotal} milestones · {year1ProgressPercent}%
            </span>
          </div>
          <div
            className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-200/80"
            role="progressbar"
            aria-valuenow={year1ProgressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Year 1 progress"
          >
            <div
              className="h-full rounded-full bg-indigo-600 transition-all"
              style={{ width: `${year1ProgressPercent}%` }}
            />
          </div>
        </div>
      </section>

      {/* 2. Journey Timeline */}
      <section aria-label="Journey timeline" className="rounded-lg border border-slate-200 bg-white p-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Journey timeline
        </h2>
        <ol className="mt-3 flex gap-1 overflow-x-auto pb-1 sm:justify-between">
          {phases.map((phase, i) => (
            <PhaseNode key={phase.id} phase={phase} isLast={i === phases.length - 1} />
          ))}
        </ol>
        {currentPhase ? (
          <p className="mt-3 rounded-md bg-slate-50 px-2 py-1.5 text-[11px] text-slate-700">
            <span className="font-semibold text-indigo-800">Now:</span> {currentPhase.headline}
            {nextPhase ? (
              <span className="text-slate-500">
                {" "}
                → Next: {nextPhase.title}
              </span>
            ) : null}
          </p>
        ) : null}
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* 3. Current Goal Card */}
        <section
          className="rounded-lg border border-slate-200 bg-white p-3"
          aria-label="Current goal"
        >
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <Target className="h-4 w-4 text-indigo-700" />
            Current goal
          </h2>
          <p className="mt-1 text-sm font-medium text-indigo-950">{currentGoal.title}</p>
          <p className="mt-1 text-[11px] leading-snug text-slate-600">{currentGoal.summary}</p>
          <ul className="mt-2 space-y-1">
            {currentGoal.successCriteria.map((item) => (
              <li
                key={item}
                className="flex gap-1.5 text-[10px] leading-snug text-slate-700"
              >
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        {/* 4. Next Unlock Card */}
        <section
          className="rounded-lg border border-amber-200/80 bg-amber-50/40 p-3"
          aria-label="Next unlock"
        >
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
            <LockOpen className="h-4 w-4 text-amber-700" />
            Next unlock
          </h2>
          <p className="mt-1 text-sm font-medium text-amber-950">{nextUnlock.title}</p>
          <p className="mt-1 text-[11px] leading-snug text-slate-700">{nextUnlock.summary}</p>
          <ul className="mt-2 space-y-1">
            {nextUnlock.unlocksWhen.map((item) => (
              <li key={item} className="flex gap-1.5 text-[10px] text-slate-700">
                <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-amber-700" />
                {item}
              </li>
            ))}
          </ul>
          {nextUnlock.portalHint && setActivePage ? (
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

      {/* Blockers — what is blocking us */}
      <section
        className="rounded-lg border border-slate-200 bg-white p-3"
        aria-label="Blockers"
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          What is blocking us
          {highBlockers.length > 0 ? (
            <StatusBadge variant="danger" compact>
              {highBlockers.length} high
            </StatusBadge>
          ) : null}
        </h2>
        <ul className="mt-2 space-y-2">
          {blockers.map((b) => (
            <li
              key={b.id}
              className="rounded-md border border-slate-100 bg-slate-50/80 px-2.5 py-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold text-slate-900">{b.title}</p>
                <StatusBadge variant={BLOCKER_VARIANT[b.severity] || "neutral"} compact>
                  {b.severity}
                </StatusBadge>
                <span className="text-[10px] text-slate-500">{b.owner}</span>
              </div>
              <p className="mt-0.5 text-[10px] text-slate-600">{b.detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-center text-[10px] text-slate-400">
        Static roadmap · update in founderJourneyDefinition.js as milestones land
      </p>
    </div>
  );
}
