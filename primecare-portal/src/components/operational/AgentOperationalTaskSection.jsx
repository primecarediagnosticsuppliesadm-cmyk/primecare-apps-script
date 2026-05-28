import React, { useState } from "react";
import { StatusBadge } from "@/components/ux";
import OperationalTaskCard from "@/components/operational/OperationalTaskCard.jsx";
import OperationalTaskClusterCard from "@/components/operational/OperationalTaskClusterCard.jsx";
import OperationalTaskDrawer from "@/components/operational/OperationalTaskDrawer.jsx";
import { ChevronDown, ChevronUp, ListTodo } from "lucide-react";

export default function AgentOperationalTaskSection({
  taskModel,
  onTaskAction,
  onQuickAction,
  onOpenTask,
}) {
  const [open, setOpen] = useState(true);
  const [drawerTask, setDrawerTask] = useState(null);
  const [tab, setTab] = useState("today");

  if (!taskModel) return null;

  const { clusters, singles, queues, active, resolvedCount } = taskModel;
  const tabItems =
    tab === "today"
      ? queues.today
      : tab === "overdue"
        ? queues.overdue
        : tab === "escalations"
          ? queues.escalations
          : tab === "proof"
            ? queues.proofRequired
            : queues.collections;

  const handleOpen = (task) => {
    setDrawerTask(task);
    onOpenTask?.(task);
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-3 shadow-[var(--pc-shadow-card)]">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2"
        onClick={() => setOpen((v) => !v)}
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ListTodo className="h-4 w-4 text-primary" />
          Operational execution queue
          <StatusBadge variant="info" compact>
            {active.length}
          </StatusBadge>
        </h2>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open ? (
        <>
          <div className="mt-2 flex flex-wrap gap-1">
            {[
              ["today", "Today"],
              ["overdue", "Overdue"],
              ["escalations", "Escalations"],
              ["proof", "Proof"],
              ["collections", "Collections"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  tab === key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <ul className="mt-2 max-h-[min(420px,50vh)] space-y-1.5 overflow-y-auto">
            {tab === "today" && clusters.length ? (
              clusters.map((cluster) => (
                <li key={cluster.id}>
                  <OperationalTaskClusterCard
                    cluster={cluster}
                    variant="agent"
                    onOpen={handleOpen}
                    onAction={onTaskAction}
                    onQuickAction={onQuickAction}
                  />
                </li>
              ))
            ) : null}
            {(tab === "today" ? singles : tabItems).length ? (
              (tab === "today" ? singles : tabItems).map((task) => (
                <li key={task.taskId}>
                  <OperationalTaskCard
                    task={task}
                    variant="agent"
                    onOpen={handleOpen}
                    onAction={onTaskAction}
                    onQuickAction={onQuickAction}
                  />
                </li>
              ))
            ) : (
              <li className="py-6 text-center text-xs text-muted-foreground">
                No {tab} tasks in this window.
              </li>
            )}
          </ul>

          {resolvedCount ? (
            <p className="mt-2 text-[10px] text-muted-foreground">{resolvedCount} completed (hidden)</p>
          ) : null}
        </>
      ) : null}

      <OperationalTaskDrawer
        open={Boolean(drawerTask)}
        onClose={() => setDrawerTask(null)}
        task={drawerTask}
        variant="agent"
        onAction={(action, t) => {
          onTaskAction?.(action, t);
          setDrawerTask(null);
        }}
      />
    </section>
  );
}
