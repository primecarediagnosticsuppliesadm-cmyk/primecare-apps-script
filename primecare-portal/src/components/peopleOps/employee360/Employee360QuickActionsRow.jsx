import React from "react";
import { Button } from "@/components/ui/button";

export default function Employee360QuickActionsRow({
  permissions,
  directoryRow,
  hasActiveAssignment,
  commissionEligible,
  onAction,
  className,
}) {
  const actions = [
    permissions?.canAssignPlan && !hasActiveAssignment
      ? { id: "assign_plan", label: "Assign Plan" }
      : null,
    permissions?.canChangePlan && hasActiveAssignment
      ? { id: "change_plan", label: "Change Plan" }
      : null,
    { id: "view_payroll", label: "View Payroll" },
    commissionEligible ? { id: "open_ownership", label: "Open Ownership" } : null,
    commissionEligible ? { id: "open_lab", label: "Open Lab" } : null,
    permissions?.canChangePlan || permissions?.role === "executive"
      ? { id: "deactivate", label: "Deactivate" }
      : null,
  ].filter(Boolean);

  return (
    <div className={className} data-testid="employee360-quick-actions">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Quick actions</p>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button key={action.id} type="button" size="sm" variant="outline" onClick={() => onAction?.(action.id)}>
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
