import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, PageSkeleton, KpiCard, KpiCardGrid } from "@/components/ux";
import { loadOperationsCommandCenterData } from "@/operations/operationsCommandCenterLoader.js";
import { buildExecutiveInterventionModel } from "@/operations/executiveInterventionModel.js";
import { traceOperationsCenterLoad } from "@/operations/operationsCommandCenterPredator.js";
import OperationalLabDrawer from "@/components/operations/OperationalLabDrawer.jsx";
import ExecutiveInterventionDrawer from "@/components/executive/ExecutiveInterventionDrawer.jsx";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import { cn } from "@/lib/utils";
import {
  RefreshCw,
  Radio,
  Shield,
  Crown,
  ChevronDown,
  ChevronUp,
  Camera,
  User,
  Building2,
  Wallet,
  FileCheck,
  ClipboardList,
} from "lucide-react";

const SEVERITY_STYLES = {
  CRITICAL: "border-red-300 bg-red-50/90",
  ATTENTION: "border-amber-300 bg-amber-50/70",
  MONITORING: "border-slate-200 bg-slate-50/80",
};

const SEVERITY_BADGE = { CRITICAL: "danger", ATTENTION: "warning", MONITORING: "neutral" };

const HEALTH_STYLES = {
  healthy: "border-emerald-200 bg-emerald-50/60",
  watch: "border-amber-200 bg-amber-50/50",
  risk: "border-red-200 bg-red-50/50",
};

const FEED_DOT = {
  order: "bg-blue-500",
  payment: "bg-emerald-500",
  visit: "bg-violet-500",
  evidence: "bg-cyan-500",
  inventory: "bg-amber-500",
  qualification: "bg-indigo-500",
  ops: "bg-slate-400",
};

function formatFeedTime(iso) {
  if (!iso) return "Recently";
  const d = new Date(String(iso).length <= 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function PriorityCard({ item, onCta }) {
  return (
    <article
      className={cn(
        "rounded-lg border px-2.5 py-2 shadow-sm",
        SEVERITY_STYLES[item.severity] || SEVERITY_STYLES.MONITORING
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs font-semibold text-slate-900">{item.title}</span>
            <StatusBadge variant={SEVERITY_BADGE[item.severity] || "neutral"} compact>
              {item.severity}
            </StatusBadge>
            {item.ageLabel ? (
              <span className="text-[10px] text-slate-500">{item.ageLabel}</span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[11px] font-medium">{item.subtitle}</p>
          {item.owner ? <p className="text-[10px] text-slate-500">Owner · {item.owner}</p> : null}
          <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-600">{item.summary}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <Button
          type="button"
          size="sm"
          className="h-7 px-2 text-[10px]"
          onClick={() => onCta(item.cta, item)}
        >
          {item.actionLabel}
        </Button>
      </div>
    </article>
  );
}

function FounderCard({ item, onCta }) {
  return (
    <article className="rounded-lg border-2 border-slate-800/20 bg-white px-2.5 py-2 shadow-sm">
      <div className="flex flex-wrap items-center gap-1">
        <Crown className="h-3.5 w-3.5 text-amber-600" />
        <span className="text-xs font-semibold">{item.title}</span>
        <StatusBadge variant={SEVERITY_BADGE[item.severity] || "danger"} compact>
          {item.severity}
        </StatusBadge>
        <span className="text-[10px] text-slate-500">Escalation · {item.escalationAge}</span>
      </div>
      <p className="mt-1 text-[11px] font-medium text-slate-800">{item.subtitle}</p>
      <p className="text-[10px] text-slate-500">Owner · {item.owner || "Unassigned"}</p>
      <p className="mt-0.5 text-[11px] text-slate-600">Last: {item.lastAction}</p>
      <p className="text-[11px] font-medium text-slate-800">Next · {item.nextExpectedAction}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        <Button type="button" size="sm" className="h-7 px-2 text-[10px]" onClick={() => onCta("assign_followup", item)}>
          Assign follow-up
        </Button>
        {item.labId ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[10px]"
            onClick={() => onCta("view_timeline", item)}
          >
            Open timeline
          </Button>
        ) : null}
        {item.labId ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[10px]"
            onClick={() => onCta("open_lab", item)}
          >
            View lab
          </Button>
        ) : null}
      </div>
    </article>
  );
}

export default function ExecutiveControlTower({ currentUser, setActivePage }) {
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [labDrawerId, setLabDrawerId] = useState("");
  const [drawerContext, setDrawerContext] = useState(null);
  const [prioritiesOpen, setPrioritiesOpen] = useState(true);
  const [founderOpen, setFounderOpen] = useState(true);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      const built = await traceOperationsCenterLoad(async () => {
        const payload = await loadOperationsCommandCenterData(currentUser);
        return buildExecutiveInterventionModel(payload);
      });
      setModel(built);
    } catch (err) {
      setError(err?.message || "Failed to load executive workspace");
      setModel(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUser]);

  useEffect(() => {
    void load(false);
  }, [load]);

  usePredatorModuleValidation(
    "Executive Intervention",
    currentUser,
    {
      prioritiesCount: model?.priorities?.length ?? 0,
      founderQueueCount: model?.founderQueue?.length ?? 0,
      feedCount: model?.feed?.length ?? 0,
      healthTileCount: model?.healthStrip?.length ?? 0,
      executiveIntervention: true,
    },
    !loading && Boolean(model)
  );

  const navigate = useCallback(
    (page) => {
      if (!page) return;
      setActivePage?.(page);
    },
    [setActivePage]
  );

  const handleCta = useCallback(
    (cta, item) => {
      switch (cta) {
        case "open_lab":
        case "view_timeline":
          if (item.labId) setLabDrawerId(String(item.labId));
          break;
        case "open_collection":
          if (item.labId) setLabDrawerId(String(item.labId));
          else navigate("collections");
          break;
        case "open_qualification":
          navigate("qualificationReview");
          break;
        case "open_orders":
          navigate("orders");
          break;
        case "open_inventory":
          navigate("inventory");
          break;
        case "assign_followup":
          navigate("visits");
          break;
        case "open_agent":
          setDrawerContext({ type: "agent", agentName: item.owner || item.subtitle, title: item.subtitle });
          break;
        case "open_evidence":
          if (item.labId) setLabDrawerId(String(item.labId));
          break;
        default:
          if (item.labId) setLabDrawerId(String(item.labId));
      }
    },
    [navigate]
  );

  const openFeed = useCallback((row) => {
    if (row.labId) {
      setDrawerContext({
        type: "feed",
        feedItem: row,
        labId: row.labId,
        title: row.eventType || row.title,
      });
    } else {
      setDrawerContext({ type: "feed", feedItem: row, title: row.eventType || row.title });
    }
  }, []);

  if (loading) {
    return <PageSkeleton kpiCount={5} kpiColumns={3} listRows={6} />;
  }

  if (!model) {
    return <div className="p-4 text-sm text-red-700">{error || "Unable to load executive workspace."}</div>;
  }

  const { snapshot, priorities, founderQueue, feed, healthStrip } = model;

  return (
    <div className="mx-auto max-w-6xl space-y-3 p-4 pb-10 lg:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Executive intervention
          </p>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Control Tower
          </h1>
          <p className="mt-0.5 max-w-xl text-sm text-slate-600">
            What needs attention, what is deteriorating, and what leadership should act on today.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={refreshing}
          onClick={() => void load(true)}
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section
        className="sticky top-0 z-20 -mx-4 border-b border-slate-200/80 bg-white/95 px-4 py-2 backdrop-blur-sm lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0"
        aria-label="Executive KPI strip"
      >
        <KpiCardGrid columns={3} className="sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard
            title="Revenue today"
            value={snapshot.revenueToday}
            subtitle="Fulfilled orders"
            className="!rounded-xl !p-3"
          />
          <KpiCard
            title="Collections exposure"
            value={snapshot.collectionsExposure}
            subtitle={`${snapshot.collectionsPending} overdue accounts`}
            className="!rounded-xl !p-3"
          />
          <KpiCard
            title="High-risk labs"
            value={snapshot.highRiskLabs}
            subtitle="Credit & overdue flags"
            className="!rounded-xl !p-3"
          />
          <KpiCard
            title="Field activity"
            value={snapshot.visitsToday}
            subtitle={`${snapshot.activeAgentsToday} agents active`}
            className="!rounded-xl !p-3"
          />
          <KpiCard
            title="Supply pressure"
            value={snapshot.lowStockSkus}
            subtitle={`${snapshot.ordersPendingFulfillment} orders open`}
            className="!rounded-xl !p-3"
          />
        </KpiCardGrid>
      </section>

      <section aria-label="Operational health">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Shield className="h-4 w-4" />
          Operational health
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {healthStrip.map((tile) => (
            <button
              key={tile.key}
              type="button"
              className={cn(
                "rounded-lg border px-2.5 py-2 text-left transition hover:shadow-sm",
                HEALTH_STYLES[tile.status] || HEALTH_STYLES.watch
              )}
              onClick={() => navigate(tile.action)}
            >
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                {tile.title}
              </p>
              <p className="text-sm font-semibold text-slate-900">{tile.label}</p>
              <p className="text-[10px] capitalize text-slate-500">{tile.trend}</p>
              <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-slate-600">
                {tile.detail}
              </p>
            </button>
          ))}
        </div>
      </section>

      <section
        className="rounded-xl border-2 border-slate-800/15 bg-slate-50/50 p-3"
        aria-label="Founder attention queue"
      >
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left"
          onClick={() => setFounderOpen((v) => !v)}
        >
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Crown className="h-4 w-4 text-amber-700" />
            Founder attention queue
            <StatusBadge variant="danger" compact>
              {founderQueue.length}
            </StatusBadge>
          </h2>
          {founderOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {founderOpen ? (
          <ul className="mt-2 grid gap-2 md:grid-cols-2">
            {founderQueue.length ? (
              founderQueue.map((item) => (
                <li key={item.id}>
                  <FounderCard item={item} onCta={handleCta} />
                </li>
              ))
            ) : (
              <li className="col-span-full py-4 text-center text-sm text-emerald-800">
                No founder escalations in the current operational window.
              </li>
            )}
          </ul>
        ) : null}
      </section>

      <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <section aria-label="Executive priorities">
          <button
            type="button"
            className="mb-2 flex w-full items-center justify-between gap-2"
            onClick={() => setPrioritiesOpen((v) => !v)}
          >
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ClipboardList className="h-4 w-4 text-red-600" />
              Priorities today
            </h2>
            <span className="text-[10px] text-slate-500">{priorities.length} items</span>
          </button>
          {prioritiesOpen ? (
            <ul className="max-h-[min(480px,55vh)] space-y-1.5 overflow-y-auto pr-0.5">
              {priorities.length ? (
                priorities.map((item) => (
                  <li key={item.id}>
                    <PriorityCard item={item} onCta={handleCta} />
                  </li>
                ))
              ) : (
                <li className="rounded-lg border border-dashed py-6 text-center text-sm text-slate-500">
                  No operational priorities flagged.
                </li>
              )}
            </ul>
          ) : null}
        </section>

        <section aria-label="Live operations feed">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Radio className="h-4 w-4" />
            Live operations feed
          </h2>
          <ul className="max-h-[min(480px,55vh)] space-y-0.5 overflow-y-auto rounded-lg border bg-white p-1">
            {feed.length ? (
              feed.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className="flex w-full gap-2 rounded-md px-2 py-1.5 text-left text-[11px] hover:bg-slate-50"
                    onClick={() => openFeed(row)}
                  >
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        FEED_DOT[row.kind] || FEED_DOT.ops
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold text-slate-900">
                          <span className="text-[10px] uppercase text-slate-400">
                            {row.eventType}
                          </span>
                          {row.labName ? ` · ${row.labName}` : ""}
                        </span>
                        <span className="shrink-0 tabular-nums text-slate-500">
                          {formatFeedTime(row.createdAt)}
                        </span>
                      </div>
                      <p className="truncate text-slate-600">{row.subtitle}</p>
                      <div className="mt-0.5 flex flex-wrap gap-2 text-[10px] text-slate-500">
                        {row.agentName ? <span>{row.agentName}</span> : null}
                        {row.hasProof ? (
                          <span className="inline-flex items-center gap-0.5 text-cyan-700">
                            <Camera className="h-3 w-3" />
                            Proof
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                </li>
              ))
            ) : (
              <li className="py-6 text-center text-sm text-slate-500">
                No operational events in the current window.
              </li>
            )}
          </ul>
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <h2 className="mb-2 text-sm font-semibold">Quick intervention</h2>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => navigate("operationsCenter")}>
            Operations center
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => navigate("collections")}>
            <Wallet className="mr-1 h-3.5 w-3.5" />
            Collections
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => navigate("visits")}>
            <User className="mr-1 h-3.5 w-3.5" />
            Field visits
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => navigate("qualificationReview")}>
            <FileCheck className="mr-1 h-3.5 w-3.5" />
            Qualifications
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => navigate("labs")}>
            <Building2 className="mr-1 h-3.5 w-3.5" />
            Labs
          </Button>
        </div>
      </section>

      <OperationalLabDrawer
        open={Boolean(labDrawerId)}
        onClose={() => setLabDrawerId("")}
        labId={labDrawerId}
        opsPayload={model.payload}
        currentUser={currentUser}
        onAction={(action) => {
          setLabDrawerId("");
          navigate(action);
        }}
      />

      <ExecutiveInterventionDrawer
        open={Boolean(drawerContext) && !labDrawerId}
        onClose={() => setDrawerContext(null)}
        context={drawerContext}
        opsPayload={model.payload}
        currentUser={currentUser}
        onNavigate={navigate}
        onLabAction={(action, snap) => {
          setDrawerContext(null);
          if (snap?.labId) setLabDrawerId(String(snap.labId));
          else navigate(action);
        }}
      />
    </div>
  );
}
