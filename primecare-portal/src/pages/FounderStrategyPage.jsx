import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, PageSkeleton } from "@/components/ux";
import { loadOperationsCommandCenterData } from "@/operations/operationsCommandCenterLoader.js";
import { buildFounderStrategyModel } from "@/founder/founderStrategyEngine.js";
import { loadVisibleLabContracts } from "@/labContract/labContractStore.js";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import { presetDistributorOsTab } from "@/tenant/tenantFoundationStore.js";
import { cn } from "@/lib/utils";
import {
  Target,
  TrendingUp,
  LockOpen,
  RefreshCw,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
} from "lucide-react";

const PAGE_LABELS = {
  dashboard: "Dashboard",
  operationsCenter: "Operations Center",
  risk: "Credit & Risk",
  orders: "Orders",
  founderNavigation: "Founder Navigation",
  qualificationReview: "Qualification Review",
  distributorOs: "Distributor OS",
};

const QUARTER_BAR = {
  completed: "bg-emerald-500",
  current: "bg-indigo-500",
  future: "bg-slate-200",
};

const URGENCY_VARIANT = {
  Critical: "danger",
  High: "warning",
  Medium: "info",
  Low: "neutral",
};

function ScoreRing({ value, label, className }) {
  return (
    <div className={cn("rounded-lg border bg-white px-3 py-2 text-center shadow-sm", className)}>
      <p className="text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
    </div>
  );
}

function Section({ title, icon: Icon, children, className }) {
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-slate-50/80 p-3", className)}>
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
        {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Founder Strategy Engine V1 — deterministic execution system (executive only).
 */
export default function FounderStrategyPage({ setActivePage = null, currentUser = null }) {
  const [payload, setPayload] = useState(null);
  const [portfolioContracts, setPortfolioContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const tenantId = currentUser?.tenantId || "";

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [data, contracts] = await Promise.all([
        loadOperationsCommandCenterData(currentUser),
        loadVisibleLabContracts(),
      ]);
      setPayload(data);
      setPortfolioContracts(contracts);
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

  const model = useMemo(() => {
    if (!payload) return null;
    return buildFounderStrategyModel(payload, tenantId, { contracts: portfolioContracts });
  }, [payload, tenantId, portfolioContracts]);

  const predatorSnapshot = useMemo(() => {
    if (!model) return null;
    return {
      founderStrategy: true,
      priorityCount: model.todayPriorities.length,
      overallHealth: model.health.overall,
      labProgress: model.revenueGap.labProgressPct,
      dataStale: model.signals.dataStale,
      growthBlocker: model.growthBlocker,
    };
  }, [model]);

  usePredatorModuleValidation(
    "Founder Strategy",
    currentUser,
    predatorSnapshot ?? {},
    Boolean(predatorSnapshot)
  );

  if (loading) return <PageSkeleton rows={8} />;
  if (error) {
    return (
      <div className="p-4 text-sm text-red-700">
        <p>{error}</p>
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }
  if (!model) return null;

  const {
    todayPriorities,
    revenueGap,
    contractPipeline,
    milestoneUnlock,
    flywheel,
    ninetyDayPlan,
    year1Roadmap,
    health,
    growthBlocker,
  } = model;

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-3 pb-8">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Target className="h-5 w-5 text-indigo-600" aria-hidden />
            Founder Strategy
          </h1>
          <p className="mt-0.5 text-xs text-slate-600">
            Deterministic priorities from live ops data — no AI.
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={() => void load()} aria-label="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </header>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        <p className="font-semibold">What is blocking growth?</p>
        <p className="text-xs opacity-90">{growthBlocker}</p>
      </div>

      <Section title="Founder health" icon={Activity}>
        <div className="grid grid-cols-3 gap-2">
          <ScoreRing value={health.overall} label="Overall" />
          <ScoreRing value={health.execution} label="Execution" />
          <ScoreRing value={health.revenueReadiness} label="Revenue ready" />
        </div>
        <ul className="mt-2 grid grid-cols-2 gap-1 text-[10px] text-slate-600">
          <li>Pilot {health.components.pilotReadiness}%</li>
          <li>Collections {health.components.collectionsHealth}%</li>
          <li>Field {health.components.fieldActivity}%</li>
          <li>Proof {health.components.proofCompliance}%</li>
          <li>Closure {health.components.interventionClosure}%</li>
        </ul>
      </Section>

      <Section title="Today's priorities" icon={Target}>
        {todayPriorities.length === 0 ? (
          <p className="text-xs text-slate-500">No ranked actions — load operational data or all gates pass.</p>
        ) : (
          <ol className="space-y-2">
            {todayPriorities.map((p, i) => (
              <li key={p.id} className="rounded-lg border bg-white p-2 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold text-slate-400">#{i + 1}</p>
                    <p className="text-sm font-semibold text-slate-900">{p.title}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold tabular-nums text-indigo-600">{p.impactScore}</p>
                    <StatusBadge variant={URGENCY_VARIANT[p.urgency] || "neutral"} label={p.urgency} />
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-600">{p.outcome}</p>
                {setActivePage && p.page ? (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={() => setActivePage(p.page)}
                  >
                    {PAGE_LABELS[p.page] || p.page}
                    <ArrowRight className="ml-0.5 h-3 w-3" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Section>

      {contractPipeline ? (
        <Section title="Contract pipeline" icon={Target}>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg border bg-white p-2">
              <p className="text-slate-500">Active contracts</p>
              <p className="text-lg font-bold tabular-nums">{contractPipeline.activeContractCount}</p>
            </div>
            <div className="rounded-lg border bg-white p-2">
              <p className="text-slate-500">Committed / mo</p>
              <p className="text-sm font-bold">{contractPipeline.monthlyCommittedLabel}</p>
            </div>
            <div className="rounded-lg border bg-white p-2">
              <p className="text-slate-500">Pipeline</p>
              <p className="text-lg font-bold tabular-nums">{contractPipeline.pipelineCount}</p>
            </div>
          </div>
          {setActivePage ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="mt-2 h-auto p-0 text-xs"
              onClick={() => {
                presetDistributorOsTab("contracts");
                setActivePage("distributorOs");
              }}
            >
              Distributor contracts
              <ArrowRight className="ml-0.5 h-3 w-3" />
            </Button>
          ) : null}
        </Section>
      ) : null}

      <Section title="Revenue gap" icon={TrendingUp}>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border bg-white p-2 text-sm">
            <p className="text-[10px] font-bold uppercase text-slate-500">Labs</p>
            <p>
              <span className="font-bold">{revenueGap.currentLabs}</span>
              <span className="text-slate-400"> / {revenueGap.targetLabs} target</span>
            </p>
            <p className="text-xs text-slate-600">Gap {revenueGap.labGap} · {revenueGap.labProgressPct}%</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-indigo-500"
                style={{ width: `${revenueGap.labProgressPct}%` }}
              />
            </div>
          </div>
          <div className="rounded-lg border bg-white p-2 text-sm">
            <p className="text-[10px] font-bold uppercase text-slate-500">Monthly revenue (est.)</p>
            <p>
              <span className="font-bold">{revenueGap.currentMonthlyLabel}</span>
              <span className="text-slate-400"> / {revenueGap.targetMonthlyLabel}</span>
            </p>
            <p className="text-xs text-slate-600">Gap {revenueGap.revenueGapLabel} · {revenueGap.revenueProgressPct}%</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${revenueGap.revenueProgressPct}%` }}
              />
            </div>
          </div>
        </div>
        <p className="mt-1 text-[10px] text-slate-500">{revenueGap.estimateNote}</p>
      </Section>

      <Section title="Milestone unlock" icon={LockOpen}>
        <p className="text-sm font-semibold text-slate-800">
          {milestoneUnlock.currentMilestone}
          <span className="font-normal text-slate-500"> → {milestoneUnlock.nextMilestone}</span>
        </p>
        <ul className="mt-2 space-y-1 text-xs">
          {milestoneUnlock.completedConditions.map((c) => (
            <li key={c.label} className="flex items-center gap-1 text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
              {c.label}
            </li>
          ))}
          {milestoneUnlock.requiredConditions.map((c) => (
            <li key={c.label} className="flex items-center gap-1 text-slate-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              {c.label} — {c.detail}
            </li>
          ))}
          {milestoneUnlock.blockedConditions.map((c) => (
            <li key={c.label} className="flex items-center gap-1 text-red-800">
              <XCircle className="h-3.5 w-3.5 shrink-0" />
              {c.label} — {c.detail}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Business flywheel">
        <div className="flex flex-wrap items-center justify-center gap-1 text-[10px] font-medium text-slate-600">
          {flywheel.stages.map((s, i) => (
            <React.Fragment key={s.key}>
              <div
                className={cn(
                  "min-w-[72px] rounded-lg border px-2 py-1.5 text-center",
                  flywheel.bottleneck?.key === s.key
                    ? "border-amber-400 bg-amber-50 ring-1 ring-amber-300"
                    : "border-slate-200 bg-white"
                )}
              >
                <p>{s.label}</p>
                <p className="text-base font-bold tabular-nums text-slate-900">{s.count}</p>
                {s.sub ? <p className="text-[9px]">{s.sub}</p> : null}
              </div>
              {i < flywheel.stages.length - 1 ? (
                <ArrowRight className="h-3 w-3 text-slate-300" aria-hidden />
              ) : null}
            </React.Fragment>
          ))}
        </div>
        {flywheel.bottleneck ? (
          <p className="mt-2 text-center text-[10px] text-amber-800">
            Bottleneck: <strong>{flywheel.bottleneck.label}</strong>
          </p>
        ) : null}
      </Section>

      <Section title="90-day execution plan">
        <div className="space-y-2">
          {ninetyDayPlan.map((row) => (
            <div key={row.horizon} className="rounded-lg border bg-white p-2 text-xs">
              <p className="font-bold text-indigo-800">{row.horizon}</p>
              <p>
                <span className="text-slate-500">Target:</span> {row.target}
              </p>
              <p>
                <span className="text-slate-500">Current:</span> {row.current}
                <span className="text-slate-400"> · Gap {row.gap}</span>
              </p>
              <p className="mt-0.5 text-slate-700">{row.action}</p>
              {setActivePage && row.page ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0"
                  onClick={() => setActivePage(row.page)}
                >
                  Open {PAGE_LABELS[row.page]}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Year 1 roadmap">
        <div className="space-y-2">
          {year1Roadmap.map((q) => (
            <div key={q.id}>
              <div className="mb-0.5 flex justify-between text-xs">
                <span className="font-semibold">{q.label}</span>
                <span className="tabular-nums text-slate-500">{q.progressPct}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn("h-full transition-all", QUARTER_BAR[q.status] || QUARTER_BAR.future)}
                  style={{ width: `${q.progressPct}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-500">{q.phases.join(" · ")}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-slate-500">
          Green = completed · Blue = current quarter · Gray = future
        </p>
      </Section>
    </div>
  );
}
