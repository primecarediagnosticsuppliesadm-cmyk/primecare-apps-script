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
import {
  TodayKpiStrip,
  ActionQueueCard,
  LabPriorityRow,
  QuickActionsBar,
  QueueEmptyState,
} from "@/pages/AgentDailyWorkspaceSections.jsx";
import { buildAgentDailyWorkspaceModel } from "@/pages/agentDailyWorkspace.js";
import {
  recordAgentDailyWorkspaceEvent,
  traceAgentDailyWorkspaceLoad,
} from "@/pages/agentDailyWorkspacePredator.js";
import {
  startVisitFromWorkspaceItem,
  startCollectionFromWorkspaceItem,
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

const LAB_PREVIEW_COUNT = 8;

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

export default function AgentDashboard({ currentUser, setActivePage }) {
  const [workspace, setWorkspace] = useState(EMPTY_WORKSPACE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [showAllLabs, setShowAllLabs] = useState(false);

  const loadWorkspace = useCallback(
    async (showRefreshState = false) => {
      try {
        if (showRefreshState) setRefreshing(true);
        else setLoading(true);
        setError("");

        recordAgentDailyWorkspaceEvent("agent_daily_workspace.load_start");

        await traceAgentDailyWorkspaceLoad(async () => {
          const apiRes = await getAgentWorkspaceRead(currentUser);
          if (!apiRes?.success) {
            throw new Error(apiRes?.error || "Failed to load agent workspace");
          }
          const normalized = normalizeWorkspacePayload(apiRes.data || EMPTY_WORKSPACE);
          const model = buildAgentDailyWorkspaceModel(normalized);
          setWorkspace(normalized);
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

  const dailyModel = useMemo(
    () => buildAgentDailyWorkspaceModel(workspace),
    [workspace]
  );

  const { kpis, actionQueue, labPriorityList } = dailyModel;

  const visibleLabs = useMemo(() => {
    if (showAllLabs) return labPriorityList;
    return labPriorityList.slice(0, LAB_PREVIEW_COUNT);
  }, [labPriorityList, showAllLabs]);

  usePredatorModuleValidation(
    "Agent Visits",
    currentUser,
    {
      recentVisitsCount: (workspace.recentVisits || []).length,
      todayVisits: Number(workspace.summary?.todayVisits ?? 0),
      assignedLabsCount: (workspace.assignedLabs || []).length,
      actionQueueCount: actionQueue.length,
      collectionsDueCount: kpis.collectionsDue,
      pendingFollowUpsCount: kpis.pendingFollowUps,
    },
    !loading
  );

  const handleStartVisit = useCallback(
    (item) => {
      recordAgentDailyWorkspaceEvent("agent_daily_workspace.start_visit_clicked", {
        labId: item.labId,
        queueType: item.queueType,
      });
      startVisitFromWorkspaceItem(item, {
        visitType: item.queueType === "FOLLOW_UP_DUE" ? "Follow-up" : "Field Visit",
      });
      setActivePage?.("visits");
    },
    [setActivePage]
  );

  const handleRecordCollection = useCallback(
    (item) => {
      startCollectionFromWorkspaceItem(item);
      setActivePage?.("collections");
    },
    [setActivePage]
  );

  const handleViewLab = useCallback(() => {
    setActivePage?.("labs");
  }, [setActivePage]);

  const handleAddFollowUp = useCallback(
    (item) => {
      startVisitFromWorkspaceItem(item, {
        visitType: "Follow-up",
        followUpType: "Call",
      });
      setActivePage?.("visits");
    },
    [setActivePage]
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
      <PageSkeleton kpiCount={6} kpiColumns={6} listRows={5} className="max-w-3xl lg:max-w-none" />
    );
  }

  const hasQueue = actionQueue.length > 0;
  const hasRisk = kpis.overdueRiskLabs > 0;
  const hasCollections = kpis.collectionsDue > 0;
  const hasFollowUps = kpis.pendingFollowUps > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-6 lg:max-w-4xl">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Daily field workspace
          </p>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Today · {currentUser?.name || "Agent"}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {hasQueue
              ? `${actionQueue.length} prioritized action${actionQueue.length === 1 ? "" : "s"} ready`
              : "You're clear — log visits or collections as the day unfolds"}
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
          <h2 className="text-sm font-semibold">Today&apos;s action queue</h2>
          {hasQueue ? (
            <span className="text-xs text-muted-foreground">Highest priority first</span>
          ) : null}
        </div>
        {hasQueue ? (
          <ul className="space-y-2">
            {actionQueue.map((item) => (
              <li key={item.id}>
                <ActionQueueCard
                  item={item}
                  onStartVisit={handleStartVisit}
                  onRecordCollection={handleRecordCollection}
                  onViewLab={handleViewLab}
                  onAddFollowUp={handleAddFollowUp}
                />
              </li>
            ))}
          </ul>
        ) : (
          <QueueEmptyState />
        )}
      </section>

      {!hasQueue && !hasCollections && !hasFollowUps && !hasRisk ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <QueueEmptyState type="visits" />
          <QueueEmptyState type="collections" />
        </div>
      ) : null}

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

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Assigned labs</h2>
          {labPriorityList.length > LAB_PREVIEW_COUNT ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setShowAllLabs((v) => !v)}
            >
              {showAllLabs ? "Show less" : `Show all (${labPriorityList.length})`}
            </Button>
          ) : null}
        </div>
        {visibleLabs.length === 0 ? (
          <QueueEmptyState type="visits" />
        ) : (
          <ul className="space-y-2">
            {visibleLabs.map((lab) => (
              <li key={lab.labId || lab.labName}>
                <LabPriorityRow
                  lab={lab}
                  onStartVisit={handleStartVisit}
                  onRecordCollection={handleRecordCollection}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
