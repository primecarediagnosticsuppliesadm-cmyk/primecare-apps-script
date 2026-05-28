import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { getAgentWorkspaceRead } from "@/api/primecareSupabaseApi";
import { completeAgentTask } from "@/api/primecareApi";
import { logAppsScriptFallbackUsed } from "@/utils/migrationTrace.js";
import { deriveCreditTierFromLabRecord } from "@/metrics/creditTier.js";
import { AGENT_TASK_COMPLETION_ENABLED } from "@/config/environment";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import PageSkeleton from "@/components/ux/PageSkeleton";
import AgentLabSnapshotDrawer from "@/components/agent/AgentLabSnapshotDrawer.jsx";
import {
  TodayKpiStrip,
  ActionQueueCard,
  QuickActionsBar,
  QueueEmptyState,
  TodaysRouteSection,
  AgentPerformanceStrip,
} from "@/pages/AgentDailyWorkspaceSections.jsx";
import { buildAgentDailyWorkspaceModel } from "@/pages/agentDailyWorkspace.js";
import {
  recordAgentWorkspaceEvent,
  traceAgentDailyWorkspaceLoad,
} from "@/pages/agentDailyWorkspacePredator.js";
import {
  startVisitFromWorkspaceItem,
  startCollectionFromWorkspaceItem,
  notifyAgentWorkspaceRefresh,
} from "@/pages/agentVisitContext.js";

const EMPTY_WORKSPACE = {
  summary: {
    todayVisits: 0,
    pendingCollections: 0,
    totalOutstanding: 0,
    activeLabs: 0,
    openTasks: 0,
    highPriorityTasks: 0,
  },
  tasks: [],
  assignedLabs: [],
  recentVisits: [],
  pendingCollections: [],
};

function normalizeLab(lab) {
  const outstanding = Number(lab?.outstanding ?? lab?.outstandingAmount ?? 0);
  const creditStatus = deriveCreditTierFromLabRecord({
    ...lab,
    outstanding,
    creditLimit: Number(lab?.creditLimit || 0),
    daysOverdue: Number(lab?.daysOverdue ?? lab?.overdueDays ?? 0),
    allowedOverdueDays: Number(lab?.allowedOverdueDays || 15),
  });
  return {
    ...lab,
    outstanding,
    creditStatus,
  };
}

function normalizeWorkspacePayload(payload) {
  return {
    ...EMPTY_WORKSPACE,
    ...payload,
    assignedLabs: Array.isArray(payload.assignedLabs)
      ? payload.assignedLabs.map(normalizeLab)
      : [],
    pendingCollections: Array.isArray(payload.pendingCollections)
      ? payload.pendingCollections.map(normalizeLab)
      : [],
  };
}

function queueItemFromSnapshot(snapshot) {
  if (!snapshot) return null;
  if (snapshot.queueItem) return snapshot.queueItem;
  if (!snapshot.labId) return null;
  return {
    labId: snapshot.labId,
    labName: snapshot.labName,
    nextAction: snapshot.collection?.nextAction || "Open lab",
    outstanding: Number(snapshot.collection?.outstandingAmount ?? snapshot.lab?.outstanding ?? 0),
    daysOverdue: Number(snapshot.collection?.overdueDays ?? snapshot.lab?.daysOverdue ?? 0),
    priority: "MEDIUM",
    queueType: "TASK",
    reason: "Lab snapshot",
  };
}

export default function AgentDashboard({ currentUser, setActivePage }) {
  const [workspace, setWorkspace] = useState(EMPTY_WORKSPACE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [snapshotLabId, setSnapshotLabId] = useState("");
  const [completedQueueIds] = useState(() => new Set());

  const loadWorkspace = useCallback(
    async (showRefreshState = false) => {
      try {
        if (showRefreshState) setRefreshing(true);
        else setLoading(true);
        setError("");

        recordAgentWorkspaceEvent("agent_workspace.load_start");

        await traceAgentDailyWorkspaceLoad(async () => {
          const apiRes = await getAgentWorkspaceRead(currentUser);
          if (!apiRes?.success) {
            throw new Error(apiRes?.error || "Failed to load agent workspace");
          }
          const normalized = normalizeWorkspacePayload(apiRes.data || EMPTY_WORKSPACE);
          const model = buildAgentDailyWorkspaceModel(normalized);
          setWorkspace(normalized);
          recordAgentWorkspaceEvent("agent_workspace.load_success", {
            queueCount: model.actionQueue.length,
            assignedLabs: model.kpis.activeLabs,
          });
          return model;
        });
      } catch (err) {
        console.error(err);
        setError(err.message || "Failed to load daily workspace");
        setWorkspace(EMPTY_WORKSPACE);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [currentUser]
  );

  useEffect(() => {
    loadWorkspace(false);
  }, [loadWorkspace]);

  useEffect(() => {
    const onRefresh = () => {
      void loadWorkspace(true);
    };
    window.addEventListener("primecare:agentWorkspaceRefresh", onRefresh);
    return () => window.removeEventListener("primecare:agentWorkspaceRefresh", onRefresh);
  }, [loadWorkspace]);

  const dailyModel = useMemo(
    () => buildAgentDailyWorkspaceModel(workspace),
    [workspace]
  );

  const { kpis, actionQueue, todaysRoute, performance } = dailyModel;

  const visibleQueue = useMemo(
    () => actionQueue.filter((item) => !completedQueueIds.has(item.id)),
    [actionQueue, completedQueueIds]
  );

  useEffect(() => {
    if (!visibleQueue.length) return;
    recordAgentWorkspaceEvent("agent_workspace.priority_queue_render", {
      count: visibleQueue.length,
    });
  }, [visibleQueue.length]);

  usePredatorModuleValidation(
    "Agent Visits",
    currentUser,
    {
      recentVisitsCount: (workspace.recentVisits || []).length,
      todayVisits: Number(workspace.summary?.todayVisits ?? 0),
      assignedLabsCount: (workspace.assignedLabs || []).length,
      actionQueueCount: visibleQueue.length,
      collectionsDueCount: kpis.collectionsDue,
      pendingFollowUpsCount: kpis.pendingFollowUps,
      trackingDrawerOpen: Boolean(snapshotLabId),
    },
    !loading
  );

  const openLabSnapshot = useCallback((item) => {
    const labId = String(item?.labId || "").trim();
    if (!labId) return;
    recordAgentWorkspaceEvent("agent_workspace.lab_drawer_open", { labId });
    setSnapshotLabId(labId);
  }, []);

  const handleStartVisit = useCallback(
    (item) => {
      recordAgentWorkspaceEvent("agent_workspace.start_visit", {
        labId: item.labId,
        queueType: item.queueType,
      });
      startVisitFromWorkspaceItem(item, {
        visitType: item.queueType === "FOLLOW_UP_DUE" ? "Follow-up" : "Field Visit",
        source: "agent_daily_workspace",
      });
      setActivePage?.("visits");
    },
    [setActivePage]
  );

  const handleRecordCollection = useCallback(
    (item) => {
      recordAgentWorkspaceEvent("agent_workspace.collection_logged", {
        labId: item.labId,
        intent: "open_collections",
      });
      startCollectionFromWorkspaceItem(item);
      setActivePage?.("collections");
    },
    [setActivePage]
  );

  const handleAddFollowUp = useCallback(
    (item) => {
      startVisitFromWorkspaceItem(item, {
        visitType: "Follow-up",
        followUpType: "Call",
        source: "agent_daily_workspace",
      });
      setActivePage?.("visits");
    },
    [setActivePage]
  );

  const handleSnapshotAction = useCallback(
    (action, snapshot) => {
      const item = queueItemFromSnapshot(snapshot);
      if (!item) return;
      setSnapshotLabId("");
      if (action === "start_visit") {
        handleStartVisit(item);
        return;
      }
      if (action === "record_payment") {
        handleRecordCollection(item);
        return;
      }
      if (action === "follow_up") {
        handleAddFollowUp(item);
        return;
      }
      if (action === "open_labs") {
        setActivePage?.("labs");
      }
    },
    [handleAddFollowUp, handleRecordCollection, handleStartVisit, setActivePage]
  );

  const handleCompleteTask = useCallback(
    async (task) => {
      if (!task?.taskId || !AGENT_TASK_COMPLETION_ENABLED) return;
      try {
        logAppsScriptFallbackUsed("AgentDashboard.completeTask", {
          primarySourceExpected: "Supabase agent_tasks table",
          fallbackSourceUsed: "Apps Script completeAgentTask",
          riskLevel: "DANGEROUS",
          metricKey: "agentCreditBuckets",
          reason: "Agent tasks table not in Supabase; completeAgentTask uses Apps Script.",
          taskId: task.taskId,
        });
        const res = await completeAgentTask({
          taskId: task.taskId,
          completedBy: currentUser?.name || currentUser?.agentName || "System User",
        });
        const payload = res?.data || res || {};
        if (!payload?.success) {
          throw new Error(payload?.message || "Failed to complete task");
        }
        setWorkspace((prev) => ({
          ...prev,
          tasks: (prev.tasks || []).filter((t) => t.taskId !== task.taskId),
        }));
        notifyAgentWorkspaceRefresh({ source: "task_complete" });
        await loadWorkspace(true);
      } catch (err) {
        console.error(err);
        setError(err.message || "Failed to complete task");
      }
    },
    [currentUser, loadWorkspace]
  );

  if (loading) {
    return (
      <PageSkeleton kpiCount={6} kpiColumns={3} listRows={6} className="max-w-3xl lg:max-w-none" />
    );
  }

  const hasQueue = visibleQueue.length > 0;
  const topPriority = visibleQueue[0] || null;

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-24 lg:max-w-4xl">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Field execution workspace
          </p>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {topPriority
              ? `Next: ${topPriority.labName}`
              : `Today · ${currentUser?.name || "Agent"}`}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {hasQueue
              ? `${visibleQueue.length} prioritized action${visibleQueue.length === 1 ? "" : "s"} · ${kpis.collectionsDue} collections due`
              : "Queue clear — log visits or collections as you work the territory"}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 rounded-xl"
          onClick={() => loadWorkspace(true)}
          disabled={refreshing}
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <TodayKpiStrip kpis={kpis} loading={false} />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Quick actions</h2>
        <QuickActionsBar
          onLogVisit={() => setActivePage?.("visits")}
          onRecordCollection={() => setActivePage?.("collections")}
          onMyLabs={() => setActivePage?.("labs")}
        />
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Priority queue</h2>
          {hasQueue ? (
            <span className="text-xs text-muted-foreground">Highest urgency first</span>
          ) : null}
        </div>
        {hasQueue ? (
          <ul className="space-y-2">
            {visibleQueue.map((item) => (
              <li key={item.id}>
                <ActionQueueCard
                  item={item}
                  onStartVisit={handleStartVisit}
                  onRecordCollection={handleRecordCollection}
                  onOpenLab={openLabSnapshot}
                  onAddFollowUp={handleAddFollowUp}
                />
              </li>
            ))}
          </ul>
        ) : (
          <QueueEmptyState />
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Today&apos;s route</h2>
        <TodaysRouteSection route={todaysRoute} onOpenStop={openLabSnapshot} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Today&apos;s performance</h2>
        <AgentPerformanceStrip metrics={performance} />
      </section>

      {(workspace.tasks || []).length > 0 ? (
        <section className="space-y-2 rounded-xl border border-dashed border-border p-3">
          <h2 className="text-sm font-semibold">Assigned tasks</h2>
          <ul className="space-y-2">
            {workspace.tasks.map((task) => (
              <li
                key={task.taskId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/30 px-3 py-2 text-xs"
              >
                <span>
                  {task.labName} · {task.taskType}
                </span>
                {AGENT_TASK_COMPLETION_ENABLED ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => handleCompleteTask(task)}
                  >
                    Complete
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 px-3 py-2 backdrop-blur md:hidden pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-3xl gap-2">
          <Button
            type="button"
            className="h-10 flex-1 rounded-xl text-xs"
            onClick={() => {
              if (topPriority) handleStartVisit(topPriority);
              else setActivePage?.("visits");
            }}
          >
            {topPriority ? "Start top visit" : "Log visit"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10 flex-1 rounded-xl text-xs"
            onClick={() => {
              if (topPriority) handleRecordCollection(topPriority);
              else setActivePage?.("collections");
            }}
          >
            Collect
          </Button>
        </div>
      </div>

      <AgentLabSnapshotDrawer
        open={Boolean(snapshotLabId)}
        onClose={() => setSnapshotLabId("")}
        labId={snapshotLabId}
        workspace={workspace}
        onAction={handleSnapshotAction}
        currentUser={currentUser}
      />
    </div>
  );
}