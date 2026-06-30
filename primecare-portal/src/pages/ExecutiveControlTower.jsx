import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, PageSkeleton, KpiCard, KpiCardGrid, DataFreshnessLabel, DataFetchError, PageHeader } from "@/components/ux";
import {
  loadOperationsCommandCenterData,
  invalidateOperationsCommandCenterCache,
  peekOperationsCommandCenterCache,
} from "@/operations/operationsCommandCenterLoader.js";
import { readPageUiCache, writePageUiCache } from "@/utils/hqPageUiCache.js";
import { usePortalToast } from "@/components/ux";
import { useActionSubmit } from "@/hooks/useActionSubmit.js";
import { formatPilotKpi, formatPilotCount } from "@/utils/pilotDisplay.js";
import { usePredatorBatchValidation } from "@/predator/usePredatorBatchValidation.js";
import {
  buildExecutiveInterventionModel,
  buildInterventionQueues,
} from "@/operations/executiveInterventionModel.js";
import { applyInterventionAction } from "@/operations/executiveInterventionStateStore.js";
import { applyOperationalTaskAction } from "@/operations/operationalTaskStateStore.js";
import {
  buildExecutiveOperationalTaskModel,
  syncTaskFromInterventionAction,
} from "@/operations/operationalTaskModel.js";
import {
  backfillOperationalLedgerFromPayload,
  flushPendingOperationalEvents,
  emitInterventionLedgerEvent,
  emitTaskLedgerEvent,
} from "@/operations/operationalEventBridge.js";
import { readOperationalLedger } from "@/operations/operationalEventLedger.js";
import { buildOperationalAuditReplay } from "@/operations/operationalEventTimeline.js";
import ExecutiveOperationalResolutionSection from "@/components/operational/ExecutiveOperationalResolutionSection.jsx";
import OperationalAuditPanel from "@/components/operational/OperationalAuditPanel.jsx";
import { traceOperationsCenterLoad } from "@/operations/operationsCommandCenterPredator.js";
import OperationalLabDrawer from "@/components/operations/OperationalLabDrawer.jsx";
import ExecutiveInterventionDrawer from "@/components/executive/ExecutiveInterventionDrawer.jsx";
import ExecutiveWorkflowDrawer from "@/components/executive/ExecutiveWorkflowDrawer.jsx";
import InterventionQueueCard from "@/components/executive/InterventionQueueCard.jsx";
import InterventionClusterCard from "@/components/executive/InterventionClusterCard.jsx";
import ExecutiveIntelligenceLayer from "@/components/executive/ExecutiveIntelligenceLayer.jsx";
import { buildExecutiveIntelligenceModel } from "@/operations/executiveIntelligenceModel.js";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import { presetDistributorOsTab } from "@/tenant/tenantFoundationStore.js";
import ExecutiveActionQueuePanel from "@/components/executive/ExecutiveActionQueuePanel.jsx";
import ExecutiveQualActionModal from "@/components/executive/ExecutiveQualActionModal.jsx";
import ExecutiveContractRenewalModal from "@/components/executive/ExecutiveContractRenewalModal.jsx";
import ExecutiveCommissionApproveModal from "@/components/executive/ExecutiveCommissionApproveModal.jsx";
import { loadExecutiveActionQueueBundle } from "@/operations/executiveActionQueueData.js";
import { buildExecutiveActionQueue } from "@/operations/executiveActionQueueEngine.js";
import { executeExecutiveActionPlan } from "@/operations/executiveActionQueueHandlers.js";
import { ACTION_PLAN_TYPES, ACTION_QUEUE_SOURCE_MODULES } from "@/operations/executiveActionQueueTypes.js";
import { labIdKey } from "@/utils/labId.js";
import { getInvoiceTenantKpisRead } from "@/api/invoiceSupabaseApi.js";
import LogisticsKpiWidget from "@/components/logistics/LogisticsKpiWidget.jsx";

const INTERVENTION_TOAST = {
  assign_owner: "Owner assigned",
  escalate: "Escalated to executive queue",
  mark_reviewed: "Marked reviewed",
  request_followup: "Follow-up requested",
  require_proof: "Proof required on next visit",
  snooze: "Snoozed for 24 hours",
  resolve: "Intervention resolved",
  reopen: "Intervention reopened",
};

const TASK_TOAST = {
  assign: "Task assigned",
  escalate: "Task escalated",
  request_evidence: "Proof requested",
  require_followup: "Follow-up required",
  complete: "Task completed",
  reopen: "Task reopened",
  acknowledge: "Task acknowledged",
  start: "Task started",
};
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

const FOUNDER_PREVIEW = 4;
const QUEUE_SINGLES_PREVIEW = 5;
const FEED_PREVIEW = 8;

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
  const tenantId = currentUser?.tenantId || "";
  const executiveCacheKey = `executive:dashboard:${tenantId}`;

  const [model, setModel] = useState(() => {
    const ui = readPageUiCache(executiveCacheKey);
    if (ui?.model) return ui.model;
    const payload = peekOperationsCommandCenterCache(currentUser);
    if (!payload) return null;
    return buildExecutiveInterventionModel(payload, { tenantId });
  });
  const hadCacheOnMount = useRef(Boolean(model));
  const [loading, setLoading] = useState(() => !model);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [labDrawerId, setLabDrawerId] = useState("");
  const [drawerContext, setDrawerContext] = useState(null);
  const [healthOpen, setHealthOpen] = useState(false);
  const [founderOpen, setFounderOpen] = useState(false);
  const [prioritiesOpen, setPrioritiesOpen] = useState(false);
  const [feedOpen, setFeedOpen] = useState(false);
  const [founderShowAll, setFounderShowAll] = useState(false);
  const [queueShowAll, setQueueShowAll] = useState(false);
  const [feedShowAll, setFeedShowAll] = useState(false);
  const [workflowIssue, setWorkflowIssue] = useState(null);
  const [workflowTick, setWorkflowTick] = useState(0);
  const [taskTick, setTaskTick] = useState(0);
  const [actionQueueBundle, setActionQueueBundle] = useState(null);
  const [actionQueueLoading, setActionQueueLoading] = useState(false);
  const [writeModal, setWriteModal] = useState(null);
  const [dataLoadedAt, setDataLoadedAt] = useState(null);
  const [invoiceKpis, setInvoiceKpis] = useState(null);
  const [invoiceKpisLoading, setInvoiceKpisLoading] = useState(false);

  const { showToast } = usePortalToast();
  const actionSubmit = useActionSubmit();

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else if (!hadCacheOnMount.current || !model) setLoading(true);
      else setRefreshing(true);
      setError("");
      const built = await traceOperationsCenterLoad(async () => {
        if (isRefresh && tenantId) invalidateOperationsCommandCenterCache(tenantId);
        const payload = await loadOperationsCommandCenterData(currentUser, {
          force: isRefresh,
        });
        const tid = currentUser?.tenantId || "";
        if (tid) {
          backfillOperationalLedgerFromPayload(tid, payload);
          await flushPendingOperationalEvents(tid);
        }
        const interventionModel = buildExecutiveInterventionModel(payload, { tenantId: tid });
        return { interventionModel, opsPayload: payload };
      });
      setModel(built.interventionModel);
      setDataLoadedAt(Date.now());
      writePageUiCache(executiveCacheKey, { model: built.interventionModel });
      if (!isRefresh) {
        setLoading(false);
      }

      setActionQueueLoading(true);
      void (async () => {
        try {
          const bundle = await loadExecutiveActionQueueBundle(currentUser, {
            force: isRefresh,
            payload: built.opsPayload,
          });
          setActionQueueBundle(bundle);
        } catch (queueErr) {
          console.warn("[Control Tower] action queue load failed", queueErr);
          setActionQueueBundle({
            queue: buildExecutiveActionQueue({
              payload: built.opsPayload,
              contracts: [],
              pendingCommissions: [],
              tenantId,
            }),
          });
        } finally {
          setActionQueueLoading(false);
        }
      })();
    } catch (err) {
      setError(err?.message || "Failed to load executive workspace");
      if (!isRefresh) setModel(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUser, tenantId]);

  useEffect(() => {
    void load(false);
  }, [load]);

  useEffect(() => {
    if (!tenantId) {
      setInvoiceKpis(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setInvoiceKpisLoading(true);
      try {
        const res = await getInvoiceTenantKpisRead(tenantId);
        if (!cancelled) {
          setInvoiceKpis(res.success ? res.kpis : null);
        }
      } catch {
        if (!cancelled) setInvoiceKpis(null);
      } finally {
        if (!cancelled) setInvoiceKpisLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenantId, dataLoadedAt]);

  const interventionQueues = useMemo(() => {
    if (!model) return { clusters: [], singles: [], founderActive: [], resolvedCount: 0 };
    void workflowTick;
    return (
      model.interventionQueues ||
      buildInterventionQueues(model.priorities, model.founderQueue, tenantId, model.payload)
    );
  }, [model, tenantId, workflowTick]);

  const actionQueue = useMemo(() => {
    void workflowTick;
    if (actionQueueBundle?.queue) return actionQueueBundle.queue;
    if (!model?.payload) return null;
    return buildExecutiveActionQueue({
      payload: model.payload,
      contracts: actionQueueBundle?.contracts || [],
      pendingCommissions: actionQueueBundle?.pendingCommissions || [],
      tenantId,
    });
  }, [actionQueueBundle, model?.payload, tenantId, workflowTick]);

  const refreshActionQueue = useCallback(
    async (force = true) => {
      if (!currentUser) return;
      if (force && tenantId) invalidateOperationsCommandCenterCache(tenantId);
      setActionQueueLoading(true);
      try {
        let opsPayload = model?.payload;
        if (force) {
          opsPayload = await loadOperationsCommandCenterData(currentUser, { force: true });
          setModel(buildExecutiveInterventionModel(opsPayload, { tenantId }));
        }
        const bundle = await loadExecutiveActionQueueBundle(currentUser, {
          force: true,
          payload: opsPayload,
        });
        setActionQueueBundle(bundle);
        setWorkflowTick((n) => n + 1);
      } catch (err) {
        console.warn("[Control Tower] action queue refresh failed", err);
      } finally {
        setActionQueueLoading(false);
      }
    },
    [currentUser, tenantId, model?.payload]
  );

  const qualificationRowForModal = useMemo(() => {
    if (!writeModal?.item || writeModal.type !== ACTION_QUEUE_SOURCE_MODULES.QUALIFICATION) {
      return null;
    }
    const target = labIdKey(writeModal.item.entityRefs?.labId);
    if (!target) return null;
    return (model?.payload?.qualifications || []).find(
      (row) => labIdKey(row.labId ?? row.lab_id) === target
    );
  }, [writeModal, model?.payload?.qualifications]);

  const operationalTaskModel = useMemo(() => {
    if (!model) return null;
    void taskTick;
    return buildExecutiveOperationalTaskModel(interventionQueues, tenantId, model.payload);
  }, [model, interventionQueues, tenantId, taskTick]);

  const intelligence = useMemo(() => {
    if (!model) return null;
    void workflowTick;
    void taskTick;
    return buildExecutiveIntelligenceModel({
      payload: model.payload,
      opsModel: model,
      tenantId,
      interventionQueues,
    });
  }, [model, tenantId, interventionQueues, workflowTick, taskTick]);

  const handleInterventionAction = useCallback(
    async (action, issue) => {
      if (!issue?.id) return;
      const key = `intervention:${issue.id}:${action}`;
      const result = await actionSubmit.run(key, async () => {
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
        syncTaskFromInterventionAction({
          tenantId,
          issue,
          action,
          actor,
          assignTo,
        });
        try {
          await emitInterventionLedgerEvent({
            tenantId,
            issue,
            action,
            actor,
            actorRole: currentUser?.role || "executive",
            assignTo,
          });
        } catch (ledgerErr) {
          console.warn("[Control Tower] ledger emit failed", ledgerErr);
        }
        setWorkflowTick((n) => n + 1);
        setTaskTick((n) => n + 1);
        if (workflowIssue?.id === issue.id) {
          const refreshed = buildInterventionQueues(
            model?.priorities,
            model?.founderQueue,
            tenantId,
            model?.payload
          );
          const updated =
            actionQueue?.items?.find((i) => i.id === issue.id) ||
            refreshed.allIssues?.find((i) => i.id === issue.id) ||
            refreshed.singles.find((i) => i.id === issue.id) ||
            refreshed.founderActive.find((i) => i.id === issue.id);
          if (updated) setWorkflowIssue(updated);
        }
        return true;
      });
      if (result.skipped) return;
      if (result.ok) {
        showToast("success", INTERVENTION_TOAST[action] || "Intervention updated");
      } else {
        showToast("error", result.error?.message || "Could not apply intervention action");
      }
    },
    [tenantId, currentUser, workflowIssue?.id, model, actionSubmit, showToast, actionQueue?.items]
  );

  const openIntervention = useCallback((item) => {
    setWorkflowIssue(item);
    setDrawerContext(null);
  }, []);

  const handleOpenWriteModal = useCallback((type, item) => {
    setWriteModal({ type, item });
    setWorkflowIssue(null);
  }, []);

  const handleExecuteActionPlan = useCallback(
    (plan, item) => {
      const result = executeExecutiveActionPlan({
        plan,
        item,
        setActivePage,
        onWorkflowAction: handleInterventionAction,
        onOpenWriteModal: handleOpenWriteModal,
      });
      if (result.message) {
        showToast(result.type === "write_navigate" ? "info" : "success", result.message);
      }
    },
    [setActivePage, handleInterventionAction, handleOpenWriteModal, showToast]
  );

  const openQueueItem = useCallback(
    (item) => {
      if (item?.sourceModule === ACTION_QUEUE_SOURCE_MODULES.QUALIFICATION) {
        handleOpenWriteModal(ACTION_QUEUE_SOURCE_MODULES.QUALIFICATION, item);
        return;
      }
      if (item?.sourceModule === ACTION_QUEUE_SOURCE_MODULES.CONTRACT_RENEWAL) {
        handleOpenWriteModal(ACTION_QUEUE_SOURCE_MODULES.CONTRACT_RENEWAL, item);
        return;
      }
      if (item?.sourceModule === ACTION_QUEUE_SOURCE_MODULES.COMMISSION) {
        handleOpenWriteModal(ACTION_QUEUE_SOURCE_MODULES.COMMISSION, item);
        return;
      }
      if (item?.sourceModule === ACTION_QUEUE_SOURCE_MODULES.OWNERSHIP) {
        const plan = (item.actionPlan || []).find((p) => p.type === ACTION_PLAN_TYPES.NAVIGATE);
        if (plan) {
          handleExecuteActionPlan(plan, item);
          return;
        }
      }
      openIntervention(item);
    },
    [handleOpenWriteModal, openIntervention, handleExecuteActionPlan]
  );

  const handleWriteModalSuccess = useCallback(
    (label, opts = {}) => {
      showToast("success", label || "Action completed");
      if (opts?.warning) showToast("info", opts.warning);
      setWriteModal(null);
    },
    [showToast]
  );

  const openInterventionById = useCallback(
    (interventionId) => {
      const issue = interventionQueues.allIssues?.find((i) => i.id === interventionId);
      if (issue) openIntervention(issue);
    },
    [interventionQueues.allIssues, openIntervention]
  );

  const handleTaskAction = useCallback(
    async (action, task) => {
      if (!task?.taskId) return;
      const key = `task:${task.taskId}:${action}`;
      const result = await actionSubmit.run(key, async () => {
        const actor = currentUser?.name || currentUser?.email || "Executive";
        const assignTo =
          action === "assign" || action === "reassign"
            ? task.assignee || task.owner || "Collections Team"
            : "";
        applyOperationalTaskAction({
          tenantId,
          taskId: task.taskId,
          action,
          actor,
          actorRole: currentUser?.role || "executive",
          assignTo,
          urgency: action === "set_urgency" ? "high" : "",
        });
        try {
          await emitTaskLedgerEvent({
            tenantId,
            task,
            action,
            actor,
            actorRole: currentUser?.role || "executive",
            assignTo,
          });
        } catch (ledgerErr) {
          console.warn("[Control Tower] task ledger emit failed", ledgerErr);
        }
        setTaskTick((n) => n + 1);
        return true;
      });
      if (result.skipped) return;
      if (result.ok) {
        showToast("success", TASK_TOAST[action] || "Task updated");
      } else {
        showToast("error", result.error?.message || "Could not update task");
      }
    },
    [tenantId, currentUser, actionSubmit, showToast]
  );

  const opsLedgerPredatorSnapshot = useMemo(() => {
    if (loading || !model || !tenantId) return null;
    return {
      feedUiReady: true,
      feedMounted: true,
      feedRenderedCount: model.feed?.length ?? null,
      ledgerUiReady: true,
      ledgerStoreCount: readOperationalLedger(tenantId).length,
      auditReplayCount: buildOperationalAuditReplay(tenantId, model.payload, 40).length,
      capturedAt: Date.now(),
    };
  }, [loading, model, tenantId, workflowTick, taskTick]);

  usePredatorModuleValidation(
    "Operational Event Ledger",
    currentUser,
    opsLedgerPredatorSnapshot ?? {},
    Boolean(opsLedgerPredatorSnapshot)
  );

  const executivePredatorBatch = useMemo(() => {
    if (loading || !model || !operationalTaskModel) return null;
    return {
      executiveIntervention: {
        prioritiesCount: model.priorities?.length ?? 0,
        founderQueueCount: model.founderQueue?.length ?? 0,
        feedCount: model.feed?.length ?? 0,
        healthTileCount: model.healthStrip?.length ?? 0,
        clusterCount: interventionQueues.clusters?.length ?? 0,
        activeInterventionCount:
          (interventionQueues.singles?.length ?? 0) +
          (interventionQueues.clusters?.reduce((s, c) => s + c.count, 0) ?? 0),
        resolvedCount: interventionQueues.resolvedCount ?? 0,
        executiveIntervention: true,
      },
      operationalTasks: {
        activeTaskCount: operationalTaskModel.active?.length ?? 0,
        clusterCount: operationalTaskModel.clusters?.length ?? 0,
        criticalOpen: operationalTaskModel.governance?.criticalOpen ?? 0,
        slaBreaches: operationalTaskModel.governance?.slaBreaches ?? 0,
      },
      operationalEventLedger: opsLedgerPredatorSnapshot ?? {},
      executiveIntelligence: intelligence
        ? {
            intelligenceUiReady: true,
            driftCount: intelligence.driftSignals?.length ?? 0,
            driftCriticalCount: intelligence.driftSignals?.filter(
              (d) => d.severity === "CRITICAL"
            ).length,
            agentAtRiskCount: intelligence.agents?.filter((a) => a.atRisk).length ?? 0,
            reliabilityOverall: intelligence.reliability?.overall ?? null,
            escalationCount: intelligence.escalationInsights?.length ?? 0,
            trendStripCount: intelligence.trendStrips?.length ?? 0,
            executiveIntelligence: true,
          }
        : null,
    };
  }, [
    loading,
    model,
    operationalTaskModel,
    interventionQueues,
    opsLedgerPredatorSnapshot,
    intelligence,
  ]);

  usePredatorBatchValidation(currentUser, executivePredatorBatch ?? {}, Boolean(executivePredatorBatch));

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

  if (!model) {
    return (
      <div className="mx-auto max-w-6xl space-y-3 p-4 pb-10 lg:p-5">
        <PageHeader
          title="Control Tower"
          subtitle="Acknowledge, assign, escalate, and resolve operational issues without leaving this workspace."
          icon={Crown}
          freshness={
            <DataFreshnessLabel
              loadedAt={dataLoadedAt}
              refreshing={loading || refreshing}
              className="mt-1 block"
            />
          }
          actions={
            <Button type="button" variant="outline" size="sm" disabled={refreshing || loading} onClick={() => void load(true)}>
              <RefreshCw className={cn("mr-2 h-4 w-4", (refreshing || loading) && "animate-spin")} />
              Refresh
            </Button>
          }
        />
        {error ? (
          <DataFetchError
            message={error}
            onRetry={() => void load(true)}
            retrying={refreshing || loading}
            staleDataNote={model ? "Showing the last workspace loaded successfully." : ""}
          />
        ) : null}
        <PageSkeleton kpiCount={5} kpiColumns={3} listRows={6} />
      </div>
    );
  }

  const { snapshot, feed, healthStrip } = model;
  const { clusters, singles, founderActive, resolvedCount, snoozedCount } = interventionQueues;
  const activeCount =
    singles.length + clusters.reduce((s, c) => s + c.count, 0);
  const healthRiskCount = healthStrip.filter((t) => t.status === "risk").length;
  const healthWatchCount = healthStrip.filter((t) => t.status === "watch").length;
  const visibleFounder = founderShowAll
    ? founderActive
    : founderActive.slice(0, FOUNDER_PREVIEW);
  const visibleSingles = queueShowAll ? singles : singles.slice(0, QUEUE_SINGLES_PREVIEW);
  const visibleFeed = feedShowAll ? feed : feed.slice(0, FEED_PREVIEW);

  return (
    <div className="mx-auto max-w-6xl space-y-3 p-4 pb-10 lg:p-5">
      <PageHeader
        title="Control Tower"
        subtitle="Acknowledge, assign, escalate, and resolve operational issues without leaving this workspace."
        icon={Crown}
        freshness={
          <DataFreshnessLabel
            loadedAt={dataLoadedAt}
            refreshing={refreshing}
            className="mt-1 block"
          />
        }
        actions={
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
        }
      />

      {error ? (
        <DataFetchError
          message={error}
          onRetry={() => void load(true)}
          retrying={refreshing || loading}
          staleDataNote="Showing the last workspace loaded successfully."
        />
      ) : null}

      <section
        className="sticky top-0 z-20 -mx-4 border-b border-slate-200/80 bg-white/95 px-4 py-2 backdrop-blur-sm lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0"
        aria-label="Executive KPI strip"
      >
        <KpiCardGrid columns={3} className="sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard
            title="Revenue today"
            value={formatPilotKpi(
              snapshot.revenueToday,
              snapshot.revenueTodayRaw,
              snapshot.hasRevenueActivity
            )}
            subtitle={snapshot.hasRevenueActivity ? "Fulfilled orders" : "No activity today"}
            className="!rounded-xl !p-3"
          />
          <KpiCard
            title="Collections exposure"
            value={formatPilotKpi(
              snapshot.collectionsExposure,
              null,
              snapshot.hasCollections
            )}
            subtitle={
              snapshot.hasCollections
                ? `${snapshot.collectionsPending} overdue accounts`
                : "No AR loaded"
            }
            className="!rounded-xl !p-3"
          />
          <KpiCard
            title="High-risk labs"
            value={formatPilotCount(snapshot.highRiskLabs, snapshot.hasCollections)}
            subtitle="Credit & overdue flags"
            className="!rounded-xl !p-3"
          />
          <KpiCard
            title="Field activity"
            value={formatPilotCount(snapshot.visitsToday, snapshot.hasVisits)}
            subtitle={
              snapshot.hasVisits
                ? `${snapshot.activeAgentsToday} agents active`
                : "No visits logged"
            }
            className="!rounded-xl !p-3"
          />
          <KpiCard
            title="Supply pressure"
            value={formatPilotCount(
              snapshot.lowStockSkus,
              snapshot.lowStockSkus > 0 || snapshot.ordersPendingFulfillment > 0
            )}
            subtitle={`${snapshot.ordersPendingFulfillment} orders open`}
            className="!rounded-xl !p-3"
          />
        </KpiCardGrid>
      </section>

      <section aria-label="Invoice visibility" className="rounded-lg border border-slate-200 bg-white px-3 py-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <FileCheck className="h-4 w-4 text-slate-500" />
            Invoice visibility
          </h2>
          <span className="text-[10px] text-slate-500">Read-only · invoice entity</span>
        </div>
        <KpiCardGrid columns={3} className="sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard
            title="Total Invoices"
            value={invoiceKpisLoading ? "…" : formatPilotCount(invoiceKpis?.totalInvoices ?? 0, Boolean(invoiceKpis))}
            subtitle="Issued invoices"
            className="!rounded-xl !p-3"
          />
          <KpiCard
            title="Invoice Value"
            value={
              invoiceKpisLoading
                ? "…"
                : formatPilotKpi(invoiceKpis?.invoiceValue ?? 0, invoiceKpis?.invoiceValue ?? 0, Boolean(invoiceKpis))
            }
            subtitle="Gross invoice total"
            className="!rounded-xl !p-3"
          />
          <KpiCard
            title="Paid"
            value={
              invoiceKpisLoading
                ? "…"
                : formatPilotKpi(invoiceKpis?.paidValue ?? 0, invoiceKpis?.paidValue ?? 0, Boolean(invoiceKpis))
            }
            subtitle={`${invoiceKpis?.paidCount ?? 0} invoices`}
            className="!rounded-xl !p-3"
          />
          <KpiCard
            title="Outstanding"
            value={
              invoiceKpisLoading
                ? "…"
                : formatPilotKpi(
                    invoiceKpis?.outstandingValue ?? 0,
                    invoiceKpis?.outstandingValue ?? 0,
                    Boolean(invoiceKpis)
                  )
            }
            subtitle={`${invoiceKpis?.outstandingCount ?? 0} sent`}
            className="!rounded-xl !p-3"
          />
          <KpiCard
            title="Overdue"
            value={
              invoiceKpisLoading
                ? "…"
                : formatPilotKpi(
                    invoiceKpis?.overdueValue ?? 0,
                    invoiceKpis?.overdueValue ?? 0,
                    Boolean(invoiceKpis)
                  )
            }
            subtitle={`${invoiceKpis?.overdueCount ?? 0} invoices`}
            className="!rounded-xl !p-3"
          />
        </KpiCardGrid>
        <KpiCardGrid columns={2} className="mt-2 sm:grid-cols-2">
          <KpiCard
            title="Collection %"
            value={
              invoiceKpisLoading
                ? "…"
                : `${Number(invoiceKpis?.collectionPct ?? 0).toFixed(1)}%`
            }
            subtitle="Paid value / invoice value"
            className="!rounded-xl !p-3"
          />
          <KpiCard
            title="Unallocated Cash"
            value={
              invoiceKpisLoading
                ? "…"
                : formatPilotKpi(
                    invoiceKpis?.unallocatedCash ?? 0,
                    invoiceKpis?.unallocatedCash ?? 0,
                    Boolean(invoiceKpis)
                  )
            }
            subtitle="Payments not linked to invoices"
            className="!rounded-xl !p-3"
          />
        </KpiCardGrid>
      </section>

      <LogisticsKpiWidget
        tenantId={currentUser?.tenantId ?? currentUser?.tenant_id ?? null}
        setActivePage={setActivePage}
      />

      <section aria-label="Operational health" className="rounded-lg border border-slate-200 bg-white px-3 py-2">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 text-left"
          onClick={() => setHealthOpen((v) => !v)}
        >
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Shield className="h-4 w-4" />
            Operational health
            {healthRiskCount > 0 ? (
              <StatusBadge variant="danger" compact>
                {healthRiskCount} risk
              </StatusBadge>
            ) : healthWatchCount > 0 ? (
              <StatusBadge variant="warning" compact>
                {healthWatchCount} watch
              </StatusBadge>
            ) : (
              <StatusBadge variant="success" compact>
                OK
              </StatusBadge>
            )}
          </h2>
          {healthOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {healthOpen ? (
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
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
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-[10px] text-slate-500">
            {healthStrip
              .filter((t) => t.status !== "healthy")
              .slice(0, 3)
              .map((t) => t.title)
              .join(" · ") || "All domains within normal range"}
          </p>
        )}
      </section>

      <ExecutiveActionQueuePanel
        queue={actionQueue}
        loading={actionQueueLoading}
        onOpen={openQueueItem}
        onWorkflowAction={handleInterventionAction}
        onExecutePlan={handleExecuteActionPlan}
        busyAction={actionSubmit.busyKey}
        actionsDisabled={actionSubmit.isAnyBusy}
      />

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
        {!founderOpen && founderActive.length > 0 ? (
          <p className="mt-1 line-clamp-2 text-[10px] text-slate-600">
            {founderActive
              .slice(0, 2)
              .map((i) => i.title)
              .join(" · ")}
            {founderActive.length > 2 ? ` · +${founderActive.length - 2} more` : ""}
          </p>
        ) : null}
        {founderOpen ? (
          <ul className="mt-2 space-y-1.5">
            {founderActive.length ? (
              <>
                {visibleFounder.map((item) => (
                  <li key={item.id}>
                    <InterventionQueueCard
                      item={item}
                      founder
                      compact
                      busyAction={actionSubmit.busyKey}
                      actionsDisabled={actionSubmit.isAnyBusy}
                      onOpen={openIntervention}
                      onAction={handleInterventionAction}
                    />
                  </li>
                ))}
                {founderActive.length > FOUNDER_PREVIEW ? (
                  <li>
                    <button
                      type="button"
                      className="text-[10px] font-medium text-amber-900 underline"
                      onClick={() => setFounderShowAll((v) => !v)}
                    >
                      {founderShowAll
                        ? "Show fewer"
                        : `Show ${founderActive.length - FOUNDER_PREVIEW} more`}
                    </button>
                  </li>
                ) : null}
              </>
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
            <ul className="max-h-[min(320px,40vh)] space-y-1.5 overflow-y-auto pr-0.5">
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
                  {visibleSingles.map((item) => (
                    <li key={item.id}>
                      <InterventionQueueCard
                        item={item}
                        compact
                        busyAction={actionSubmit.busyKey}
                        actionsDisabled={actionSubmit.isAnyBusy}
                        onOpen={openIntervention}
                        onAction={handleInterventionAction}
                      />
                    </li>
                  ))}
                  {singles.length > QUEUE_SINGLES_PREVIEW ? (
                    <li>
                      <button
                        type="button"
                        className="text-[10px] font-medium text-indigo-700 underline"
                        onClick={() => setQueueShowAll((v) => !v)}
                      >
                        {queueShowAll
                          ? "Show fewer items"
                          : `Show ${singles.length - QUEUE_SINGLES_PREVIEW} more items`}
                      </button>
                    </li>
                  ) : null}
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
          <button
            type="button"
            className="mb-2 flex w-full items-center justify-between gap-2"
            onClick={() => setFeedOpen((v) => !v)}
          >
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Radio className="h-4 w-4" />
              Live operations feed
              <span className="text-[10px] font-normal text-slate-500">{feed.length} events</span>
            </h2>
            {feedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {feedOpen ? (
          <ul className="max-h-[min(280px,35vh)] space-y-0.5 overflow-y-auto rounded-lg border bg-white p-1">
            {feed.length ? (
              <>
              {visibleFeed.map((row) => (
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
              ))}
              {feed.length > FEED_PREVIEW ? (
                <li className="py-1 text-center">
                  <button
                    type="button"
                    className="text-[10px] font-medium text-indigo-700 underline"
                    onClick={() => setFeedShowAll((v) => !v)}
                  >
                    {feedShowAll ? "Show fewer" : `Show ${feed.length - FEED_PREVIEW} more`}
                  </button>
                </li>
              ) : null}
              </>
            ) : (
              <li className="py-6 text-center text-sm text-slate-500">
                No operational events in the current window.
              </li>
            )}
          </ul>
          ) : (
            <p className="text-[10px] text-slate-500">
              {feed[0]
                ? `Latest: ${feed[0].eventType || "Event"}${feed[0].labName ? ` · ${feed[0].labName}` : ""}`
                : "No events in the current window."}
            </p>
          )}
        </section>
      </div>

      <ExecutiveIntelligenceLayer
        intelligence={intelligence}
        onOpenLab={(id) => setLabDrawerId(String(id))}
      />

      <ExecutiveOperationalResolutionSection
        taskModel={operationalTaskModel}
        opsPayload={model.payload}
        tenantId={tenantId}
        onTaskAction={handleTaskAction}
        onOpenIntervention={openInterventionById}
        onOpenLab={(id) => setLabDrawerId(String(id))}
      />

      <OperationalAuditPanel
        tenantId={tenantId}
        payload={model.payload}
        onSelectLab={(id) => setLabDrawerId(String(id))}
      />

      <section className="rounded-lg border border-slate-200 bg-white p-3">
        <h2 className="mb-2 text-sm font-semibold">Quick intervention</h2>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => navigate("operationsCenter")}>
            Operations center
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => navigate("risk")}>
            <Wallet className="mr-1 h-3.5 w-3.5" />
            Collections
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => navigate("operationsCenter")}>
            <User className="mr-1 h-3.5 w-3.5" />
            Field visits
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => navigate("qualificationReview")}>
            <FileCheck className="mr-1 h-3.5 w-3.5" />
            Qualifications
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => {
              presetDistributorOsTab("labs");
              navigate("distributorOs");
            }}
          >
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
        tenantId={tenantId}
        onAction={handleInterventionAction}
        onOpenLab={(id) => {
          setWorkflowIssue(null);
          setLabDrawerId(String(id));
        }}
      />

      <ExecutiveQualActionModal
        open={writeModal?.type === ACTION_QUEUE_SOURCE_MODULES.QUALIFICATION}
        item={writeModal?.item}
        qualificationRow={qualificationRowForModal}
        currentUser={currentUser}
        tenantId={tenantId}
        onClose={() => setWriteModal(null)}
        onSuccess={handleWriteModalSuccess}
        onRefresh={refreshActionQueue}
      />

      <ExecutiveContractRenewalModal
        open={writeModal?.type === ACTION_QUEUE_SOURCE_MODULES.CONTRACT_RENEWAL}
        item={writeModal?.item}
        currentUser={currentUser}
        tenantId={tenantId}
        onClose={() => setWriteModal(null)}
        onSuccess={handleWriteModalSuccess}
        onRefresh={refreshActionQueue}
      />

      <ExecutiveCommissionApproveModal
        open={writeModal?.type === ACTION_QUEUE_SOURCE_MODULES.COMMISSION}
        item={writeModal?.item}
        visibleQueueItems={actionQueue?.items || []}
        currentUser={currentUser}
        tenantId={tenantId}
        onClose={() => setWriteModal(null)}
        onSuccess={handleWriteModalSuccess}
        onRefresh={refreshActionQueue}
      />
    </div>
  );
}
