import React from "react";
import { CheckCircle2, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import PeopleOpsPageHelp from "@/components/peopleOps/PeopleOpsPageHelp.jsx";
import { getPayrollCycleCopy } from "@/peopleOps/peopleOpsBusinessCopy.js";

/**
 * RC6 — Current Payroll Cycle with status, explanation, and primary CTA.
 */
export default function PeopleOpsWorkflowProgress({
  stages = [],
  compact = false,
  periodLabel = "",
  status = "",
  onPrimaryAction,
  showFounderCard = true,
}) {
  if (!stages.length) return null;

  const cycle = getPayrollCycleCopy(status || stages.find((row) => row.state === "current")?.id || "draft");
  const currentStage = stages.find((row) => row.state === "current");

  const founderCard = showFounderCard ? (
    <div className="mb-2 rounded-lg border border-border bg-background px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Current Payroll Cycle</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{periodLabel || "Selected period"}</p>
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
            {cycle.done ? <CheckCircle2 className="h-3.5 w-3.5 text-[var(--pc-success)]" aria-hidden /> : null}
            {cycle.statusLabel}
            {currentStage ? <span className="font-normal text-muted-foreground">· step {stages.findIndex((s) => s.id === currentStage.id) + 1} of {stages.length}</span> : null}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{cycle.explanation}</p>
          {cycle.idleNote ? <p className="mt-0.5 text-[11px] text-muted-foreground">{cycle.idleNote}</p> : null}
        </div>
        <div className="flex items-center gap-1">
          <PeopleOpsPageHelp sectionId="payrollCycle" compact />
          {cycle.actionLabel && onPrimaryAction ? (
            <Button type="button" size="sm" className="h-7 text-[10px]" onClick={() => onPrimaryAction(cycle)}>
              {cycle.actionLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  ) : null;

  if (compact) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 px-2.5 py-2" aria-label="Current payroll cycle">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Current Payroll Cycle</p>
            <p className="text-[10px] text-muted-foreground">Status of this month&apos;s payroll processing.</p>
          </div>
          <PeopleOpsPageHelp sectionId="payrollCycle" compact />
        </div>
        {founderCard}
        <ol className="flex flex-wrap gap-2">
          {stages.map((stage, index) => (
            <li
              key={stage.id}
              className={cn(
                "rounded-md border px-2 py-1 text-[10px] font-medium",
                stage.state === "complete" && "border-[var(--pc-brand-primary)] bg-[var(--pc-brand-primary)]/10 text-[var(--pc-brand-primary)]",
                stage.state === "current" && "border-[var(--pc-brand-primary)] bg-[var(--pc-brand-primary)] text-white",
                stage.state === "upcoming" && "border-border text-muted-foreground"
              )}
              aria-current={stage.state === "current" ? "step" : undefined}
              title={getPayrollCycleCopy(stage.id).explanation}
            >
              {index + 1}. {stage.label}
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <PeopleOpsSectionCard
      title="Current Payroll Cycle"
      subtitle="Status of this month's payroll processing."
      icon={GitBranch}
      rightAction={<PeopleOpsPageHelp sectionId="payrollCycle" compact />}
    >
      {founderCard}
      <ol className="space-y-2" aria-label="Current payroll cycle">
        {stages.map((stage, index) => {
          const copy = getPayrollCycleCopy(stage.id);
          return (
            <li key={stage.id} className="flex items-start gap-3">
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
                {stage.state === "current" ? (
                  <p className="text-xs text-muted-foreground">{copy.explanation}</p>
                ) : null}
              </div>
              {index < stages.length - 1 ? <div className="hidden h-px flex-1 bg-border xl:block" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </PeopleOpsSectionCard>
  );
}
