import React, { useState } from "react";
import { Archive, Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EnterpriseDataTable } from "@/components/ux";
import PeopleOpsModuleFrame from "@/components/peopleOps/PeopleOpsModuleFrame.jsx";
import PeopleOpsActionMenu from "@/components/peopleOps/PeopleOpsActionMenu.jsx";
import PeopleOpsTableShell, {
  PeopleOpsTableBody,
  PeopleOpsTableCell,
  PeopleOpsTableHead,
  PeopleOpsTableRow,
} from "@/components/peopleOps/PeopleOpsTableShell.jsx";

export default function WorkforceHeadcountPlanning({
  workspace,
  breadcrumbs = [],
  onAddPosition,
  onDuplicatePosition,
  onArchivePosition,
}) {
  const [draft, setDraft] = useState({ title: "", role: "agent", openCount: 1, monthlyCost: "" });

  if (!workspace) return null;

  return (
    <PeopleOpsModuleFrame
      title="Headcount Planning"
      description="Plan future positions and hiring cost. Session-only — projections do not change payroll."
      breadcrumbs={breadcrumbs}
      actions={
        <Button type="button" size="sm" onClick={() => onAddPosition?.(draft)}>
          <Plus className="mr-1 h-4 w-4" />
          Add Position
        </Button>
      }
    >
      <div className="grid gap-2 rounded-xl border border-border bg-card p-3 md:grid-cols-4">
        <Input placeholder="Position title" value={draft.title} onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))} />
        <select
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm"
          value={draft.role}
          onChange={(e) => setDraft((p) => ({ ...p, role: e.target.value }))}
        >
          {["agent", "hr", "executive", "admin"].map((role) => (
            <option key={role} value={role}>{role}</option>
          ))}
        </select>
        <Input
          type="number"
          min={1}
          placeholder="Open positions"
          value={draft.openCount}
          onChange={(e) => setDraft((p) => ({ ...p, openCount: e.target.value }))}
        />
        <Input
          type="number"
          placeholder="Monthly cost (optional)"
          value={draft.monthlyCost}
          onChange={(e) => setDraft((p) => ({ ...p, monthlyCost: e.target.value }))}
        />
      </div>

      <EnterpriseDataTable
        hasRows={workspace.headcount.length > 0}
        emptyTitle="No headcount rows"
        emptyDescription="Add a position or load employees to begin headcount planning."
        desktop={
          <PeopleOpsTableShell>
            <PeopleOpsTableHead>
              <tr>
                {["Role", "Current", "Target", "Open", "Hiring Cost", "Monthly Cost", "Annual Cost", "Actions"].map((label) => (
                  <PeopleOpsTableCell key={label} header>{label}</PeopleOpsTableCell>
                ))}
              </tr>
            </PeopleOpsTableHead>
            <PeopleOpsTableBody>
              {workspace.headcount.map((row) => (
                <PeopleOpsTableRow key={row.id}>
                  <PeopleOpsTableCell className="font-medium">{row.roleLabel}</PeopleOpsTableCell>
                  <PeopleOpsTableCell>{row.current}</PeopleOpsTableCell>
                  <PeopleOpsTableCell>{row.target}</PeopleOpsTableCell>
                  <PeopleOpsTableCell>{row.open}</PeopleOpsTableCell>
                  <PeopleOpsTableCell className="tabular-nums">{row.hiringCostLabel}</PeopleOpsTableCell>
                  <PeopleOpsTableCell className="tabular-nums">{row.monthlyCostLabel}</PeopleOpsTableCell>
                  <PeopleOpsTableCell className="tabular-nums">{row.annualCostLabel}</PeopleOpsTableCell>
                  <PeopleOpsTableCell>
                    <PeopleOpsActionMenu
                      items={[
                        { id: "duplicate", label: "Duplicate Position", onClick: () => onDuplicatePosition?.(row) },
                        row.source === "session"
                          ? { id: "archive", label: "Archive Position", destructive: true, onClick: () => onArchivePosition?.(row.id) }
                          : null,
                      ]}
                    />
                  </PeopleOpsTableCell>
                </PeopleOpsTableRow>
              ))}
            </PeopleOpsTableBody>
          </PeopleOpsTableShell>
        }
      />
    </PeopleOpsModuleFrame>
  );
}
