import React from "react";
import { CheckCircle2, CircleDot, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import PeopleOpsPageHelp from "@/components/peopleOps/PeopleOpsPageHelp.jsx";

function DayColumn({ title, icon: Icon, items = [], emptyLabel, onOpenRoute, tone = "neutral" }) {
  const toneClass =
    tone === "warning"
      ? "border-[var(--pc-warning-border)]/60"
      : tone === "success"
        ? "border-[var(--pc-success)]/30"
        : "border-border";

  return (
    <div className={`rounded-lg border bg-background ${toneClass} p-2.5`}>
      <div className="mb-2 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{title}</p>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">{items.length}</span>
      </div>
      {items.length ? (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item.id} className="rounded-md border border-border bg-muted/10 px-2 py-1.5">
              <p className="text-xs font-semibold text-foreground">{item.title}</p>
              {item.detail ? <p className="mt-0.5 text-[11px] text-muted-foreground">{item.detail}</p> : null}
              {item.actionLabel && item.route ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-1.5 h-6 px-2 text-[10px]"
                  onClick={() => onOpenRoute?.(item.route, item)}
                >
                  {item.actionLabel}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground">{emptyLabel}</p>
      )}
    </div>
  );
}

/**
 * RC6 — Founder day board answering "What needs my attention today?"
 */
export default function PeopleOpsFounderDayBoard({ dayBoard, onOpenRoute }) {
  if (!dayBoard) return null;

  return (
    <PeopleOpsSectionCard
      title="What needs my attention today?"
      subtitle="Needs Attention · In Progress · Completed"
      icon={AlertTriangle}
      dense
      rightAction={<PeopleOpsPageHelp sectionId="dayBoard" compact />}
    >
      <div className="grid gap-2 lg:grid-cols-3">
        <DayColumn
          title="Needs Attention"
          icon={AlertTriangle}
          items={dayBoard.needsAttention}
          emptyLabel="Nothing urgent — you are clear."
          onOpenRoute={onOpenRoute}
          tone="warning"
        />
        <DayColumn
          title="In Progress"
          icon={CircleDot}
          items={dayBoard.inProgress}
          emptyLabel="No payroll cycle in progress."
          onOpenRoute={onOpenRoute}
        />
        <DayColumn
          title="Completed"
          icon={CheckCircle2}
          items={dayBoard.completed}
          emptyLabel="Completed items will appear as work finishes."
          onOpenRoute={onOpenRoute}
          tone="success"
        />
      </div>
    </PeopleOpsSectionCard>
  );
}
