import React from "react";
import { StatusBadge } from "@/components/ux";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import PeopleOpsWorkflowProgress from "@/components/peopleOps/productivity/PeopleOpsWorkflowProgress.jsx";
import { PEOPLE_OPS_PAYROLL_STATUS_VARIANT } from "@/components/peopleOps/peopleOpsStatusTokens.js";
import { PanelRight } from "lucide-react";

export default function PeopleOpsContextPanel({
  contextSummary,
  workflowProgress = [],
  selectedEmployee = null,
  selectedPlan = null,
  selectedExport = null,
}) {
  const reporting = contextSummary?.reportingContext;
  return (
    <div className="space-y-4">
      <PeopleOpsSectionCard title="Context" subtitle="Current selection and reporting state" icon={PanelRight}>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Reporting period</dt>
            <dd className="mt-1 font-medium">{contextSummary?.periodLabel || reporting?.periodLabel || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Payroll version</dt>
            <dd className="mt-1 font-medium">{contextSummary?.runVersionLabel || reporting?.runVersionLabel || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Payroll status</dt>
            <dd className="mt-1">
              <StatusBadge
                variant={PEOPLE_OPS_PAYROLL_STATUS_VARIANT[contextSummary?.payrollStatus] || "neutral"}
                label={String(contextSummary?.payrollStatus || reporting?.statusLabel || "—")}
              />
            </dd>
          </div>
          {contextSummary?.netPayrollLabel ? (
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">Current payroll</dt>
              <dd className="mt-1 font-medium">{contextSummary.netPayrollLabel}</dd>
            </div>
          ) : null}
        </dl>
      </PeopleOpsSectionCard>

      <PeopleOpsWorkflowProgress stages={workflowProgress} />

      {selectedEmployee ? (
        <PeopleOpsSectionCard title="Selected Employee">
          <p className="text-sm font-medium">{selectedEmployee.employeeName}</p>
          <p className="text-xs text-muted-foreground capitalize">{selectedEmployee.role}</p>
        </PeopleOpsSectionCard>
      ) : null}

      {selectedPlan ? (
        <PeopleOpsSectionCard title="Selected Plan">
          <p className="text-sm font-medium">{selectedPlan.planCode || selectedPlan.label}</p>
          <p className="text-xs text-muted-foreground">{selectedPlan.meta || selectedPlan.status}</p>
        </PeopleOpsSectionCard>
      ) : null}

      {selectedExport ? (
        <PeopleOpsSectionCard title="Selected Export">
          <p className="text-sm font-medium">{selectedExport.label}</p>
          <p className="text-xs text-muted-foreground">{selectedExport.meta}</p>
        </PeopleOpsSectionCard>
      ) : null}
    </div>
  );
}
