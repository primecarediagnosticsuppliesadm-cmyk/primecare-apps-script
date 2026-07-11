import React from "react";
import { StatusBadge } from "@/components/ux";
import { cn } from "@/lib/utils";
import { EMPLOYEE360_OPERATIONAL_STATUS } from "@/peopleOps/employee360/employee360WorkspaceModel.js";

const VARIANT = {
  [EMPLOYEE360_OPERATIONAL_STATUS.READY]: "success",
  [EMPLOYEE360_OPERATIONAL_STATUS.NEEDS_ATTENTION]: "warning",
  [EMPLOYEE360_OPERATIONAL_STATUS.BLOCKED]: "danger",
};

export default function Employee360OperationalStatusCard({ operationalStatus, className }) {
  if (!operationalStatus) return null;

  return (
    <section className={cn("rounded-xl border border-border bg-card p-4", className)} data-testid="employee360-operational-status">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Operational status</p>
        <StatusBadge variant={VARIANT[operationalStatus.status] || "neutral"} label={operationalStatus.label} />
      </div>
      <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
        {(operationalStatus.reasons || []).map((reason) => (
          <li key={reason} className="leading-snug">
            {reason}
          </li>
        ))}
      </ul>
    </section>
  );
}
