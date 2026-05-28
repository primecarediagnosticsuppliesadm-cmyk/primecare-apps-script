import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, PageSkeleton, KpiCard, KpiCardGrid } from "@/components/ux";
import { loadOperationsCommandCenterData } from "@/operations/operationsCommandCenterLoader.js";
import {
  buildExecutiveInterventionModel,
  buildInterventionQueues,
} from "@/operations/executiveInterventionModel.js";
import { applyInterventionAction } from "@/operations/executiveInterventionStateStore.js";
import { traceOperationsCenterLoad } from "@/operations/operationsCommandCenterPredator.js";
import OperationalLabDrawer from "@/components/operations/OperationalLabDrawer.jsx";
import ExecutiveInterventionDrawer from "@/components/executive/ExecutiveInterventionDrawer.jsx";
import ExecutiveWorkflowDrawer from "@/components/executive/ExecutiveWorkflowDrawer.jsx";
import InterventionQueueCard from "@/components/executive/InterventionQueueCard.jsx";
import InterventionClusterCard from "@/components/executive/InterventionClusterCard.jsx";
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

export default function ExecutiveControlTower({ currentUser, setActivePage }) {
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [labDrawerId, setLabDrawerId] = useState("");
  const [drawerContext, setDrawerContext] = useState(null);
  const [prioritiesOpen, setPrioritiesOpen] = useState(true);
  const [founderOpen, setFounderOpen] = useState(true);
  const [workflowIssue, setWorkflowIssue] = useState(null);
  const [workflowTick, setWorkflowTick] = useState(0);

  const tenantId = currentUser?.tenantId || "";

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      const built = await traceOperationsCenterLoad(async () => {
        const payload = await loadOperationsCommandCenterData(currentUser);
        return buildExecutiveInterventionModel(payload, { tenantId: currentUser?.tenantId });
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

  const interventionQueues = useMemo(() => {
    if (!model) return { clusters: [], singles: [], founderActive: [], resolvedCount: 0 };
    void workflowTick;
    return (
      model.interventionQueues ||
      buildInterventionQueues(model.priorities, model.founderQueue, tenantId, model.payload)
    );
  }, [model, tenantId, workflowTick]);

  const handleInterventionAction = useCallback(
    (action, issue) => {
      if (!issue?.id) return;
      const actor = currentUser?.name || currentUser?.email || "Executive";
      const assignTo =
        action === "assign_owner"
          ? issue.owner || issue.currentOwner || "Collections Team"
          : "";
      applyInterventionAction({
        tenantId,
        issueId: issue.id,
        action,
        actor,
        actorRole: currentUser?.role || "executive",
        assignTo,
      });
      setWorkflowTick((n) => n + 1);
      if (workflowIssue?.id === issue.id) {
        const refreshed = buildInterventionQueues(
          model?.priorities,
          model?.founderQueue,
          tenantId,
          model?.payload
        );
        const updated =
          refreshed.allIssues?.find((i) => i.id === issue.id) ||
          refreshed.singles.find((i) => i.id === issue.id) ||
          refreshed.founderActive.find((i) => i.id === issue.id);
        if (updated) setWorkflowIssue(updated);
      }
    },
    [tenantId, currentUser, workflowIssue?.id, model]
  );

  const openIntervention = useCallback((item) => {
    setWorkflowIssue(item);
    setDrawerContext(null);
  }, []);

  usePredatorModuleValidation(
    "Executive Intervention",
    currentUser,
    {
      prioritiesCount: model?.priorities?.length ?? 0,
      founderQueueCount: model?.founderQueue?.length ?? 0,
      feedCount: model?.feed?.length ?? 0,
      healthTileCount: model?.healthStrip?.length ?? 0,
      clusterCount: interventionQueues.clusters?.length ?? 0,
      activeInterventionCount:
        (interventionQueues.singles?.length ?? 0) +
        (interventionQueues.clusters?.reduce((s, c) => s + c.count, 0) ?? 0),
      resolvedCount: interventionQueues.resolvedCount ?? 0,
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

  const { snapshot, feed, healthStrip } = model;
  const { clusters, singles, founderActive, resolvedCount, snoozedCount } = interventionQueues;
  const activeCount =
    singles.length + clusters.reduce((s, c) => s + c.count, 0);

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
            Acknowledge, assign, escalate, and resolve operational issues without leaving this workspace.
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
              {founderActive.length}
            </StatusBadge>
          </h2>
          {founderOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {founderOpen ? (
          <ul className="mt-2 grid gap-2 md:grid-cols-2">
            {founderActive.length ? (
              founderActive.map((item) => (
                <li key={item.id}>
                  <InterventionQueueCard
                    item={item}
                    founder
                    onOpen={openIntervention}
                    onAction={handleInterventionAction}
                  />
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
              Intervention queue
            </h2>
            <span className="text-[10px] text-slate-500">
              {activeCount} active
              {resolvedCount ? ` · ${resolvedCount} resolved` : ""}
              {snoozedCount ? ` · ${snoozedCount} snoozed` : ""}
            </span>
          </button>
          {prioritiesOpen ? (
            <ul className="max-h-[min(480px,55vh)] space-y-1.5 overflow-y-auto pr-0.5">
              {clusters.length || singles.length ? (
                <>
                  {clusters.map((cluster) => (
                    <li key={cluster.id}>
                      <InterventionClusterCard
                        cluster={cluster}
                        onOpen={(item) => openIntervention(item)}
                        onAction={handleInterventionAction}
                      />
                    </li>
                  ))}
                  {singles.map((item) => (
                    <li key={item.id}>
                      <InterventionQueueCard
                        item={item}
                        onOpen={openIntervention}
                        onAction={handleInterventionAction}
                      />
                    </li>
                  ))}
                </>
              ) : (
                <li className="rounded-lg border border-dashed py-6 text-center text-sm text-slate-500">
                  No active interventions — resolved or snoozed items are hidden.
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
        open={Boolean(drawerContext) && !labDrawerId && !workflowIssue}
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

      <ExecutiveWorkflowDrawer
        open={Boolean(workflowIssue)}
        onClose={() => setWorkflowIssue(null)}
        issue={workflowIssue}
        opsPayload={model.payload}
        onAction={handleInterventionAction}
        onOpenLab={(id) => {
          setWorkflowIssue(null);
          setLabDrawerId(String(id));
        }}
      />
    </div>
  );
}
