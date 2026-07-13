import React, { useState } from "react";
import { ChevronDown, ChevronUp, PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import PeopleOpsReportingContextBar from "@/components/peopleOps/PeopleOpsReportingContextBar.jsx";
import { enterpriseLayout } from "@/styles/enterpriseLayout.js";
import { cn } from "@/lib/utils";

/**
 * RC4 — Universal sticky collapsible context widget (single source for period/version/status).
 */
export default function PeopleOpsContextWidget({
  contextSummary,
  selectedEmployee = null,
  selectedPlan = null,
  selectedExport = null,
  periodOptions = [],
  runOptions = [],
  selectedPeriodId,
  selectedRunId,
  onPeriodChange,
  onRunChange,
  lastRefreshLabel = "",
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className={cn(enterpriseLayout.stickyToolbar, "top-2 space-y-0 p-0")}>
      <div className="flex items-center justify-between gap-1 px-2 py-1.5">
        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <PanelRight className="h-3.5 w-3.5" aria-hidden />
          Current Reporting Period
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? "Collapse context" : "Expand context"}
        >
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {open ? (
        <div className="space-y-1.5 border-t border-border px-2 pb-2 pt-1.5">
          <PeopleOpsReportingContextBar
            contextSummary={contextSummary}
            periodOptions={periodOptions}
            runOptions={runOptions}
            selectedPeriodId={selectedPeriodId}
            selectedRunId={selectedRunId}
            onPeriodChange={onPeriodChange}
            onRunChange={onRunChange}
            lastRefreshLabel={lastRefreshLabel}
            compact
          />
          {selectedEmployee ? (
            <div className="rounded-md border border-border bg-muted/20 px-2 py-1">
              <p className={enterpriseLayout.fieldLabel}>Selected employee</p>
              <p className="text-xs font-medium">{selectedEmployee.employeeName}</p>
            </div>
          ) : null}
          {selectedPlan ? (
            <div className="rounded-md border border-border bg-muted/20 px-2 py-1">
              <p className={enterpriseLayout.fieldLabel}>Selected plan</p>
              <p className="text-xs font-medium">{selectedPlan.planCode || selectedPlan.label}</p>
            </div>
          ) : null}
          {selectedExport ? (
            <div className="rounded-md border border-border bg-muted/20 px-2 py-1">
              <p className={enterpriseLayout.fieldLabel}>Selected export</p>
              <p className="text-xs font-medium">{selectedExport.label}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
