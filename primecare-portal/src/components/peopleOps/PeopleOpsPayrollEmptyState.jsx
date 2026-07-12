import React from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ux";
import { buildPayrollEmptyGuidance } from "@/peopleOps/peopleOpsBusinessCopy.js";

/**
 * RC5 — Business-language empty payroll guidance with CTAs.
 */
export default function PeopleOpsPayrollEmptyState({
  hasEmployees = true,
  hasAssignments = true,
  hasRun = false,
  reportingPeriodLabel = null,
  onGeneratePreview,
  onOpenEmployees,
  onOpenCompensation,
  onOpenOwnership,
}) {
  const guidance = buildPayrollEmptyGuidance({
    hasEmployees,
    hasAssignments,
    hasRun,
    hasCollectionsHint: true,
  });
  const periodHint = reportingPeriodLabel ? ` for ${reportingPeriodLabel}` : "";

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4">
      <EmptyState
        title={guidance.title}
        description={
          reportingPeriodLabel
            ? `No payroll lines${periodHint}. Check the reasons below, then take the next action.`
            : "Select a pay period or check the reasons below, then take the next action."
        }
      />
      <ul className="space-y-1.5 text-xs">
        {guidance.reasons.map((reason) => (
          <li
            key={reason.id}
            className="flex items-start gap-2 rounded-md border border-border bg-background px-2.5 py-1.5"
          >
            <span className={reason.ok ? "text-[var(--pc-success)]" : "text-[var(--pc-warning)]"} aria-hidden>
              {reason.ok ? "✓" : "!"}
            </span>
            <span className={reason.ok ? "text-muted-foreground" : "font-medium text-foreground"}>
              {reason.label}
              {reason.ok ? " — OK" : " — needs attention"}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-1.5">
        {onGeneratePreview ? (
          <Button type="button" size="sm" className="h-8 text-[11px]" onClick={onGeneratePreview}>
            Generate Payroll Preview →
          </Button>
        ) : null}
        {onOpenEmployees ? (
          <Button type="button" size="sm" variant="outline" className="h-8 text-[11px]" onClick={onOpenEmployees}>
            Assign Employees →
          </Button>
        ) : null}
        {onOpenCompensation ? (
          <Button type="button" size="sm" variant="outline" className="h-8 text-[11px]" onClick={onOpenCompensation}>
            Create Compensation Plan →
          </Button>
        ) : null}
        {onOpenOwnership ? (
          <Button type="button" size="sm" variant="ghost" className="h-8 text-[11px]" onClick={onOpenOwnership}>
            Open Business Ownership →
          </Button>
        ) : null}
      </div>
    </div>
  );
}
