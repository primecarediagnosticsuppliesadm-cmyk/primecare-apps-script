import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardCheck,
  Wallet,
  Building2,
  PlusCircle,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  RefreshCw,
  CheckCircle2,
  CircleDollarSign,
  Target,
  ShieldAlert,
} from "lucide-react";

import {
  getAgentWorkspace,
  completeAgentTask,
} from "@/api/primecareApi";

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

function QuickStat({ title, value, icon: Icon, subtitle }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {title}
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
          {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
        </div>
        <div className="rounded-xl bg-slate-50 p-2">
          <Icon className="h-5 w-5 text-slate-700" />
        </div>
      </div>
    </div>
  );
}

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString("en-IN")}`;
}

function priorityClass(priority) {
  const value = String(priority || "").toUpperCase();
  if (value === "HIGH" || value === "CRITICAL") return "bg-red-50 text-red-700 border-red-200";
  if (value === "MEDIUM") return "bg-yellow-50 text-yellow-700 border-yellow-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function taskTypeLabel(task) {
  const type = String(task.taskType || "").toUpperCase();

  if (type === "COLLECTION") return "Collection Follow-up";
  if (type === "VISIT") return "Visit Required";
  if (type === "FOLLOW_UP") return "Scheduled Follow-up";
  if (type === "STOCK") return "Stock Action";
  if (type === "DEMO") return "Demo Action";

  return "Action Needed";
}

function taskActionLabel(task) {
  const type = String(task.taskType || "").toUpperCase();

  if (type === "COLLECTION") return "Open Collection";
  if (type === "STOCK") return "Log Stock Follow-up";
  if (type === "FOLLOW_UP") return "Log Follow-up";
  if (type === "VISIT") return "Log Visit";

  return "Open";
}

function taskInsight(task) {
  const type = String(task.taskType || "").toUpperCase();

  if (type === "COLLECTION") {
    return task.taskDescription || "Payment follow-up needed for this lab.";
  }

  if (type === "STOCK") {
    return task.taskDescription || "Stock-related follow-up is pending.";
  }

  if (type === "FOLLOW_UP") {
    return task.taskDescription || "A follow-up is pending for this lab.";
  }

  if (type === "VISIT") {
    return task.taskDescription || "A field visit is required.";
  }

  return task.taskDescription || "Action required.";
}

function taskContextLine(task) {
  const dueDate = task.dueDate ? `Due: ${task.dueDate}` : "";
  const nextAction = task.nextAction ? `Action: ${task.nextAction}` : "";

  if (dueDate && nextAction) return `${dueDate} • ${nextAction}`;
  if (dueDate) return dueDate;
  if (nextAction) return nextAction;

  return "Open this task and update the workflow.";
}

function getCreditStatus(item) {
  const explicit = String(item?.creditStatus || "").trim().toUpperCase();
  if (explicit) return explicit;

  const reason = String(item?.creditReason || "").trim().toUpperCase();
  const hold = String(item?.creditHold || "").trim().toUpperCase();
  const outstanding = Number(item?.outstanding ?? item?.outstandingAmount ?? 0);
  const creditLimit = Number(item?.creditLimit || 0);

  if (reason || hold === "YES" || hold === "HOLD") return "HOLD";
  if (creditLimit > 0 && outstanding / creditLimit >= 0.8) return "NEAR_LIMIT";
  return "OK";
}

function getCreditBadgeClasses(status) {
  switch ((status || "").toUpperCase()) {
    case "HOLD":
      return "bg-red-100 text-red-700 border border-red-200";
    case "NEAR_LIMIT":
      return "bg-yellow-100 text-yellow-700 border border-yellow-200";
    default:
      return "bg-green-100 text-green-700 border border-green-200";
  }
}

function getCreditLabel(status) {
  switch ((status || "").toUpperCase()) {
    case "HOLD":
      return "Credit Hold";
    case "NEAR_LIMIT":
      return "Near Limit";
    default:
      return "OK";
  }
}

function CreditBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${getCreditBadgeClasses(status)}`}
    >
      {getCreditLabel(status)}
    </span>
  );
}

function normalizeLab(lab) {
  const outstanding = Number(lab?.outstanding ?? lab?.outstandingAmount ?? 0);
  const creditLimit = Number(lab?.creditLimit || 0);
  const daysOverdue = Number(lab?.daysOverdue ?? lab?.overdueDays ?? 0);
  const allowedOverdueDays = Number(lab?.allowedOverdueDays || 15);
  const creditStatus = getCreditStatus({
    ...lab,
    outstanding,
    creditLimit,
    daysOverdue,
    allowedOverdueDays,
  });

  return {
    ...lab,
    outstanding,
    outstandingAmount: outstanding,
    creditLimit,
    daysOverdue,
    allowedOverdueDays,
    creditStatus,
    creditReason: lab?.creditReason || "",
    creditHold: lab?.creditHold || "",
  };
}

export default function AgentDashboard({ currentUser, setActivePage, authToken }) {
  const [workspace, setWorkspace] = useState(EMPTY_WORKSPACE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [completingTaskId, setCompletingTaskId] = useState("");
  const [error, setError] = useState("");

  const loadWorkspace = useCallback(
    async (showRefreshState = false) => {
      try {
        if (showRefreshState) setRefreshing(true);
        else setLoading(true);

        setError("");

        const params = authToken ? { sessionToken: authToken } : {};
        const res = await getAgentWorkspace(params);

        if (!res?.success) {
          throw new Error(res?.error || "Failed to load agent workspace");
        }

        const payload = res.data || EMPTY_WORKSPACE;
        setWorkspace({
          ...EMPTY_WORKSPACE,
          ...payload,
          assignedLabs: Array.isArray(payload.assignedLabs)
            ? payload.assignedLabs.map(normalizeLab)
            : [],
          pendingCollections: Array.isArray(payload.pendingCollections)
            ? payload.pendingCollections.map(normalizeLab)
            : [],
        });
      } catch (err) {
        console.error(err);
        setError(err.message || "Failed to load dashboard");
        setWorkspace(EMPTY_WORKSPACE);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [authToken]
  );

  useEffect(() => {
    loadWorkspace(false);
  }, [loadWorkspace]);

  const handleTaskAction = useCallback(
    (task) => {
      const type = String(task.taskType || "").toUpperCase();

      if (type === "COLLECTION") {
        sessionStorage.setItem(
          "primecare_pending_collection_task",
          JSON.stringify({
            taskId: task.taskId || "",
            labId: task.labId || "",
            labName: task.labName || "",
            nextAction: task.nextAction || task.taskDescription || "",
          })
        );
        setActivePage?.("collections");
        return;
      }

      const visitTypeSuggestion =
        type === "STOCK"
          ? "Support Visit"
          : type === "VISIT"
          ? "Follow-up"
          : type === "FOLLOW_UP"
          ? "Follow-up"
          : "Follow-up";

      const followUpTypeSuggestion =
        type === "STOCK"
          ? "Visit"
          : type === "DEMO"
          ? "Demo"
          : "Call";

      sessionStorage.setItem(
        "primecare_pending_visit_task",
        JSON.stringify({
          taskId: task.taskId || "",
          taskType: type,
          labId: task.labId || "",
          labName: task.labName || "",
          nextAction: task.nextAction || task.taskDescription || "",
          followUpType: followUpTypeSuggestion,
          followUpDate: task.dueDate || "",
          visitType: visitTypeSuggestion,
          priority: task.priority || "MEDIUM",
        })
      );

      setActivePage?.("visits");
    },
    [setActivePage]
  );

  const handleCompleteTask = useCallback(
    async (task) => {
      if (!task?.taskId) return;

      try {
        setCompletingTaskId(task.taskId);
        setError("");

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
          summary: {
            ...prev.summary,
            openTasks: Math.max(Number(prev.summary?.openTasks || 0) - 1, 0),
            highPriorityTasks:
              String(task.priority || "").toUpperCase() === "HIGH"
                ? Math.max(Number(prev.summary?.highPriorityTasks || 0) - 1, 0)
                : Number(prev.summary?.highPriorityTasks || 0),
          },
          tasks: (prev.tasks || []).filter((t) => t.taskId !== task.taskId),
        }));
      } catch (err) {
        console.error(err);
        setError(err.message || "Failed to complete task");
      } finally {
        setCompletingTaskId("");
      }
    },
    [currentUser]
  );

  const summary = workspace.summary || EMPTY_WORKSPACE.summary;
  const tasks = workspace.tasks || [];
  const assignedLabs = workspace.assignedLabs || [];
  const recentVisits = workspace.recentVisits || [];
  const pendingCollections = workspace.pendingCollections || [];

  const topCollections = useMemo(() => {
    return [...pendingCollections]
      .sort((a, b) => {
        if (getCreditStatus(a) !== getCreditStatus(b)) {
          const rank = { HOLD: 1, NEAR_LIMIT: 2, OK: 3 };
          return (rank[getCreditStatus(a)] || 9) - (rank[getCreditStatus(b)] || 9);
        }
        if (Number(b.daysOverdue || 0) !== Number(a.daysOverdue || 0)) {
          return Number(b.daysOverdue || 0) - Number(a.daysOverdue || 0);
        }
        return Number(b.outstanding || 0) - Number(a.outstanding || 0);
      })
      .slice(0, 4);
  }, [pendingCollections]);

  const creditRiskSummary = useMemo(() => {
    const labs = assignedLabs || [];
    return {
      hold: labs.filter((lab) => getCreditStatus(lab) === "HOLD").length,
      nearLimit: labs.filter((lab) => getCreditStatus(lab) === "NEAR_LIMIT").length,
      ok: labs.filter((lab) => getCreditStatus(lab) === "OK").length,
      withOutstanding: labs.filter((lab) => Number(lab.outstanding || 0) > 0).length,
    };
  }, [assignedLabs]);

  const todayFocus = useMemo(() => {
    const highPriority = tasks.filter(
      (task) => String(task.priority || "").toUpperCase() === "HIGH"
    ).length;

    const collectionTasks = tasks.filter(
      (task) => String(task.taskType || "").toUpperCase() === "COLLECTION"
    ).length;

    return {
      highPriority,
      collectionTasks,
    };
  }, [tasks]);

  if (loading) {
    return (
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <p className="text-sm text-slate-600">Loading agent dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome, {currentUser?.name || "Agent"}
          </h1>
          <p className="text-sm text-slate-500">
            Focus on the next best action and keep field execution moving.
          </p>
        </div>

        <Button
          variant="outline"
          className="rounded-xl"
          onClick={() => loadWorkspace(true)}
          disabled={refreshing}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <QuickStat
          title="Today Visits"
          value={summary.todayVisits || 0}
          icon={ClipboardCheck}
          subtitle="Visits logged today"
        />
        <QuickStat
          title="Open Tasks"
          value={summary.openTasks || 0}
          icon={Target}
          subtitle={`${summary.highPriorityTasks || 0} high priority`}
        />
        <QuickStat
          title="My Labs"
          value={summary.activeLabs || assignedLabs.length || 0}
          icon={Building2}
          subtitle="Mapped to this agent"
        />
        <QuickStat
          title="Outstanding"
          value={formatCurrency(summary.totalOutstanding || 0)}
          icon={AlertTriangle}
          subtitle={`${summary.pendingCollections || pendingCollections.length || 0} labs need collection`}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <QuickStat
          title="Credit Hold"
          value={creditRiskSummary.hold}
          icon={ShieldAlert}
          subtitle="Labs blocked from ordering"
        />
        <QuickStat
          title="Near Limit"
          value={creditRiskSummary.nearLimit}
          icon={AlertTriangle}
          subtitle="Labs approaching limit"
        />
        <QuickStat
          title="Credit OK"
          value={creditRiskSummary.ok}
          icon={ClipboardCheck}
          subtitle="Labs cleared for ordering"
        />
        <QuickStat
          title="With Outstanding"
          value={creditRiskSummary.withOutstanding}
          icon={Wallet}
          subtitle="Labs needing collections visibility"
        />
      </div>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Today Focus</CardTitle>
          <CardDescription>
            Quick direction before you start actioning the queue
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="text-sm font-medium text-slate-900">
              {todayFocus.highPriority} high-priority task
              {todayFocus.highPriority === 1 ? "" : "s"}
            </div>
            <div className="mt-1 text-sm text-slate-500">
              Start with urgent stock, collection, or follow-up actions first.
            </div>
          </div>

          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="text-sm font-medium text-slate-900">
              {todayFocus.collectionTasks} collection-related task
              {todayFocus.collectionTasks === 1 ? "" : "s"}
            </div>
            <div className="mt-1 text-sm text-slate-500">
              Prioritize receivables where payment follow-up is pending.
            </div>
          </div>

          <div className="rounded-2xl border bg-slate-50 p-4">
            <div className="text-sm font-medium text-slate-900">
              {creditRiskSummary.hold + creditRiskSummary.nearLimit} credit-risk lab
              {creditRiskSummary.hold + creditRiskSummary.nearLimit === 1 ? "" : "s"}
            </div>
            <div className="mt-1 text-sm text-slate-500">
              Protect cash flow by following up hold and near-limit labs early.
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Quick Actions</CardTitle>
          <CardDescription>Fast execution shortcuts for the field team</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Button
            className="h-12 rounded-xl"
            onClick={() => setActivePage?.("visits")}
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Log Visit
          </Button>

          <Button
            variant="outline"
            className="h-12 rounded-xl"
            onClick={() => setActivePage?.("collections")}
          >
            <CircleDollarSign className="mr-2 h-4 w-4" />
            Record Collection
          </Button>

          <Button
            variant="outline"
            className="h-12 rounded-xl"
            onClick={() => setActivePage?.("labs")}
          >
            <Building2 className="mr-2 h-4 w-4" />
            My Labs
          </Button>

          <Button
            variant="outline"
            className="h-12 rounded-xl"
            onClick={() => setActivePage?.("visits")}
          >
            <CalendarClock className="mr-2 h-4 w-4" />
            Follow-up Update
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-slate-200 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Today’s Action Queue</CardTitle>
          <CardDescription>
            Open work items with context so the agent knows what to do next
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-5 text-sm text-slate-500">
              No open tasks right now. Use Quick Actions to log new work or update field activity.
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map((task, idx) => (
                <div
                  key={`${task.taskId || task.labId || "task"}-${idx}`}
                  className="rounded-2xl border bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-semibold text-slate-900">
                            {task.labName || "-"}
                          </div>
                          <Badge className={`border ${priorityClass(task.priority)}`}>
                            {task.priority || "LOW"}
                          </Badge>
                          <Badge variant="outline">{taskTypeLabel(task)}</Badge>
                        </div>

                        <div className="text-sm font-medium text-slate-800">
                          {taskInsight(task)}
                        </div>

                        <div className="text-sm text-slate-500">
                          {taskContextLine(task)}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          className="rounded-xl"
                          onClick={() => handleTaskAction(task)}
                        >
                          {taskActionLabel(task)}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>

                        <Button
                          variant="outline"
                          className="rounded-xl"
                          disabled={completingTaskId === task.taskId}
                          onClick={() => handleCompleteTask(task)}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          {completingTaskId === task.taskId ? "Completing..." : "Mark Complete"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Priority Collections & Credit Risk</CardTitle>
            <CardDescription>Top items by urgency, overdue days, and credit risk</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topCollections.length === 0 ? (
                <div className="text-sm text-slate-500">No pending collection tasks.</div>
              ) : (
                topCollections.map((item, idx) => {
                  const creditStatus = getCreditStatus(item);
                  return (
                    <div key={`${item.labId}-${idx}`} className="rounded-2xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold text-slate-900">{item.labName || "-"}</div>
                          <div className="mt-1 text-sm text-slate-500">
                            {formatCurrency(item.outstanding || item.outstandingAmount || 0)} • Overdue{" "}
                            {Number(item.daysOverdue || item.overdueDays || 0)}d
                          </div>
                          {item.creditReason ? (
                            <div className="mt-2 text-xs text-red-600">
                              {item.creditReason}
                            </div>
                          ) : null}
                        </div>
                        <CreditBadge status={creditStatus} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Recent Activity</CardTitle>
            <CardDescription>Your latest visible visit activity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentVisits.length === 0 ? (
                <div className="text-sm text-slate-500">No recent visits found.</div>
              ) : (
                recentVisits.slice(0, 4).map((visit, idx) => (
                  <div key={`${visit.visitId || visit.labName}-${idx}`} className="rounded-2xl border p-4">
                    <div className="font-semibold text-slate-900">{visit.labName || "-"}</div>
                    <div className="mt-1 text-sm text-slate-500">
                      {visit.area || "-"} • {visit.visitDate || "-"}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge>{visit.visitType || "-"}</Badge>
                      <Badge variant="secondary">{visit.labResponse || "-"}</Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Assigned Labs Snapshot</CardTitle>
          <CardDescription>Labs currently mapped to this agent with credit visibility</CardDescription>
        </CardHeader>
        <CardContent>
          {assignedLabs.length === 0 ? (
            <div className="text-sm text-slate-500">No labs assigned yet.</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {assignedLabs.slice(0, 6).map((lab, idx) => (
                <div key={`${lab.labId}-${idx}`} className="rounded-2xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-900">{lab.labName || "-"}</div>
                      <div className="mt-1 text-sm text-slate-500">
                        {lab.city || lab.area || "-"} • {lab.phone || "-"}
                      </div>
                    </div>
                    <CreditBadge status={getCreditStatus(lab)} />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="outline">{lab.status || "Active"}</Badge>
                    {Number(lab.outstanding || 0) > 0 ? (
                      <Badge variant="outline">
                        {formatCurrency(lab.outstanding)}
                      </Badge>
                    ) : null}
                    {Number(lab.daysOverdue || 0) > 0 ? (
                      <Badge variant="outline">
                        Overdue {lab.daysOverdue}d
                      </Badge>
                    ) : null}
                  </div>

                  {lab.creditReason ? (
                    <div className="mt-2 text-xs text-red-600">{lab.creditReason}</div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
