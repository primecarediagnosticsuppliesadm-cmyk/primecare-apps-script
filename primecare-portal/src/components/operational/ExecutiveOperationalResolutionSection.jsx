import React, { useState } from "react";
import { StatusBadge } from "@/components/ux";
import OperationalTaskCard from "@/components/operational/OperationalTaskCard.jsx";
import OperationalTaskClusterCard from "@/components/operational/OperationalTaskClusterCard.jsx";
import OperationalTaskDrawer from "@/components/operational/OperationalTaskDrawer.jsx";
import { ChevronDown, ChevronUp, Gauge, ListChecks } from "lucide-react";

export default function ExecutiveOperationalResolutionSection({
  taskModel,
  opsPayload,
  tenantId = "",
  onTaskAction,
  onOpenIntervention,
  onOpenLab,
}) {
  const [open, setOpen] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [drawerTask, setDrawerTask] = useState(null);
  const [queueTab, setQueueTab] = useState("critical");

  if (!taskModel) return null;

  const { governance, accountability, clusters, singles, queues, active, resolvedCount } = taskModel;

  const queueItems =
    queueTab === "critical"
      ? queues.today.filter((t) => (t.displaySeverity || t.severity) === "CRITICAL")
      : queueTab === "overdue"
        ? queues.overdue
        : queueTab === "blocked"
          ? active.filter((t) => t.resolutionStatus === "BLOCKED")
          : queueTab === "escalations"
            ? queues.escalations
            : queues.proofRequired;

  const TASK_PREVIEW = 4;
  const listSource = queueTab === "critical" ? singles : queueItems;
  const visibleTasks = showAllTasks ? listSource : listSource.slice(0, TASK_PREVIEW);

  return (
    <section
      className="rounded-xl border border-indigo-200/80 bg-indigo-50/30 p-3"
      aria-label="Operational resolution"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2"
        onClick={() => setOpen((v) => !v)}
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Gauge className="h-4 w-4 text-indigo-700" />
          Operational resolution
          <StatusBadge variant="info" compact>
            {active.length} active
          </StatusBadge>
        </h2>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {!open ? (
        <p className="mt-1 text-[10px] text-slate-600">
          {governance.criticalOpen} critical · {governance.slaBreaches} SLA breach · tap to manage tasks
        </p>
      ) : null}

      {open ? (
        <>
          <p className="mt-1 text-[10px] text-slate-600">
            {governance.criticalOpen} critical · {governance.slaBreaches} SLA · {governance.escalated}{" "}
            escalated · {active.length} active tasks
          </p>

          <div className="mt-2">
            <h3 className="mb-1 flex items-center gap-1 text-xs font-semibold">
              <ListChecks className="h-3.5 w-3.5" />
              Execution queues
            </h3>
            <div className="flex flex-wrap gap-1">
              {[
                ["critical", "Critical"],
                ["overdue", "Overdue"],
                ["escalations", "Escalations"],
                ["blocked", "Blocked"],
                ["proof", "Proof"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    queueTab === key ? "bg-indigo-600 text-white" : "bg-white text-slate-600"
                  }`}
                  onClick={() => setQueueTab(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <ul className="mt-2 max-h-[min(240px,32vh)] space-y-1.5 overflow-y-auto">
              {queueTab === "critical" && clusters.length
                ? clusters.slice(0, 3).map((cluster) => (
                    <li key={cluster.id}>
                      <OperationalTaskClusterCard
                        cluster={cluster}
                        onOpen={setDrawerTask}
                        onAction={onTaskAction}
                      />
                    </li>
                  ))
                : null}
              {visibleTasks.length ? (
                visibleTasks.map((task) => (
                  <li key={task.taskId}>
                    <OperationalTaskCard task={task} onOpen={setDrawerTask} onAction={onTaskAction} />
                  </li>
                ))
              ) : (
                <li className="py-4 text-center text-xs text-slate-500">No tasks in this queue.</li>
              )}
              {listSource.length > TASK_PREVIEW ? (
                <li>
                  <button
                    type="button"
                    className="text-[10px] font-medium text-indigo-700 underline"
                    onClick={() => setShowAllTasks((v) => !v)}
                  >
                    {showAllTasks ? "Show fewer" : `Show ${listSource.length - TASK_PREVIEW} more`}
                  </button>
                </li>
              ) : null}
            </ul>
            {resolvedCount ? (
              <p className="mt-1 text-[10px] text-slate-500">{resolvedCount} completed (hidden)</p>
            ) : null}
          </div>
        </>
      ) : null}

      <OperationalTaskDrawer
        open={Boolean(drawerTask)}
        onClose={() => setDrawerTask(null)}
        task={drawerTask}
        opsPayload={opsPayload}
        tenantId={tenantId}
        onAction={(action, t) => {
          onTaskAction?.(action, t);
          setDrawerTask(null);
        }}
        onOpenIntervention={onOpenIntervention}
        onOpenLab={onOpenLab}
      />
    </section>
  );
}
