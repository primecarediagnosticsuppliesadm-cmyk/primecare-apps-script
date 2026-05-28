import React, { useState } from "react";
import { StatusBadge, KpiCard, KpiCardGrid } from "@/components/ux";
import OperationalTaskCard from "@/components/operational/OperationalTaskCard.jsx";
import OperationalTaskClusterCard from "@/components/operational/OperationalTaskClusterCard.jsx";
import OperationalTaskDrawer from "@/components/operational/OperationalTaskDrawer.jsx";
import { ChevronDown, ChevronUp, Gauge, ListChecks } from "lucide-react";

export default function ExecutiveOperationalResolutionSection({
  taskModel,
  opsPayload,
  onTaskAction,
  onOpenIntervention,
  onOpenLab,
}) {
  const [open, setOpen] = useState(true);
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

      {open ? (
        <>
          <KpiCardGrid columns={4} className="mt-2 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard title="Critical open" value={governance.criticalOpen} className="!rounded-lg !p-2.5" />
            <KpiCard title="SLA breaches" value={governance.slaBreaches} className="!rounded-lg !p-2.5" />
            <KpiCard title="Escalated" value={governance.escalated} className="!rounded-lg !p-2.5" />
            <KpiCard title="Blocked" value={governance.blocked} className="!rounded-lg !p-2.5" />
          </KpiCardGrid>

          <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-600">
            <span>Aging · {governance.aging}</span>
            <span>Reopened · {governance.reopened}</span>
            <span>Stale owners · {governance.staleOwners}</span>
            <span>Inactive assignees · {governance.inactiveOwners}</span>
          </div>

          {accountability.length ? (
            <div className="mt-3">
              <h3 className="text-xs font-semibold text-slate-800">Execution accountability</h3>
              <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                {accountability.slice(0, 4).map((row) => (
                  <li key={row.agent} className="rounded border bg-white px-2 py-1.5 text-[10px]">
                    <span className="font-semibold">{row.agent}</span>
                    <span className="text-slate-500">
                      {" "}
                      · {row.assigned} assigned · {row.overdue} overdue
                      {row.avgCompletionHours != null ? ` · ~${row.avgCompletionHours}h avg` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-3">
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
            <ul className="mt-2 max-h-[min(360px,45vh)] space-y-1.5 overflow-y-auto">
              {queueTab === "critical" && clusters.length
                ? clusters.map((cluster) => (
                    <li key={cluster.id}>
                      <OperationalTaskClusterCard
                        cluster={cluster}
                        onOpen={setDrawerTask}
                        onAction={onTaskAction}
                      />
                    </li>
                  ))
                : null}
              {(queueTab === "critical" ? singles : queueItems).length ? (
                (queueTab === "critical" ? singles : queueItems).map((task) => (
                  <li key={task.taskId}>
                    <OperationalTaskCard task={task} onOpen={setDrawerTask} onAction={onTaskAction} />
                  </li>
                ))
              ) : (
                <li className="py-4 text-center text-xs text-slate-500">No tasks in this queue.</li>
              )}
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
