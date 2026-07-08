import React from "react";
import { cn } from "@/lib/utils";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import { GitBranch } from "lucide-react";

export default function PeopleOpsWorkflowProgress({ stages = [] }) {
  if (!stages.length) return null;
  return (
    <PeopleOpsSectionCard title="Workflow Progress" subtitle="Payroll lifecycle for selected period" icon={GitBranch}>
      <ol className="space-y-2" aria-label="Payroll workflow progress">
        {stages.map((stage, index) => (
          <li key={stage.id} className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                stage.state === "complete" && "border-[var(--pc-brand-primary)] bg-[var(--pc-brand-primary)] text-white",
                stage.state === "current" && "border-[var(--pc-brand-primary)] bg-[var(--pc-brand-primary)]/10 text-[var(--pc-brand-primary)]",
                stage.state === "upcoming" && "border-border bg-muted text-muted-foreground"
              )}
              aria-current={stage.state === "current" ? "step" : undefined}
            >
              {index + 1}
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium", stage.state === "current" ? "text-foreground" : "text-muted-foreground")}>
                {stage.label}
              </p>
            </div>
            {index < stages.length - 1 ? <div className="hidden h-px flex-1 bg-border xl:block" aria-hidden /> : null}
          </li>
        ))}
      </ol>
    </PeopleOpsSectionCard>
  );
}
