import React from "react";
import { cn } from "@/lib/utils";

const SEVERITY_DOT = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

export default function Employee360CurrentTasksList({ tasks = [], onTaskAction, className }) {
  if (!tasks.length) {
    return (
      <section className={cn("rounded-xl border border-border bg-card p-4", className)} data-testid="employee360-tasks">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Current tasks</p>
        <p className="mt-2 text-sm text-muted-foreground">No open tasks for this employee.</p>
      </section>
    );
  }

  return (
    <section className={cn("rounded-xl border border-border bg-card p-4", className)} data-testid="employee360-tasks">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Current tasks</p>
      <ul className="mt-3 space-y-2">
        {tasks.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              className="flex w-full items-start gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left transition hover:bg-muted/40"
              onClick={() => onTaskAction?.(task.actionKey, task)}
            >
              <span
                className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", SEVERITY_DOT[task.severity] || SEVERITY_DOT.info)}
                aria-hidden
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{task.label}</span>
                <span className="block text-xs text-muted-foreground">{task.detail}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
