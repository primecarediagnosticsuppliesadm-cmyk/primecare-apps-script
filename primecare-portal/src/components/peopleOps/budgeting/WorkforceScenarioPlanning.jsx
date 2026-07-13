import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EnterpriseDataTable, StatusBadge } from "@/components/ux";
import PeopleOpsModuleFrame from "@/components/peopleOps/PeopleOpsModuleFrame.jsx";
import PeopleOpsFilterBar from "@/components/peopleOps/PeopleOpsFilterBar.jsx";
import PeopleOpsTableShell, {
  PeopleOpsTableBody,
  PeopleOpsTableCell,
  PeopleOpsTableHead,
  PeopleOpsTableRow,
} from "@/components/peopleOps/PeopleOpsTableShell.jsx";

export default function WorkforceScenarioPlanning({
  workspace,
  breadcrumbs = [],
  onSaveScenario,
  onAddCustomScenario,
}) {
  const [search, setSearch] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [customPayroll, setCustomPayroll] = useState("");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (workspace?.scenarios || []).filter((row) => !q || row.label.toLowerCase().includes(q));
  }, [search, workspace]);

  if (!workspace) return null;

  return (
    <PeopleOpsModuleFrame
      title="Scenario Planning"
      description="What-if workforce scenarios using forecast engine outputs. Calculations are instant and preview-only."
      breadcrumbs={breadcrumbs}
      filters={
        <PeopleOpsFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search scenarios"
          resultCount={rows.length}
          totalCount={workspace.scenarios.length}
          onClear={() => setSearch("")}
        />
      }
    >
      <div className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-card p-3">
        <div className="min-w-[12rem] flex-1">
          <label className="text-xs font-medium text-muted-foreground">Custom scenario label</label>
          <Input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="e.g. +3 Territory Agents" />
        </div>
        <div className="w-40">
          <label className="text-xs font-medium text-muted-foreground">Monthly payroll</label>
          <Input type="number" value={customPayroll} onChange={(e) => setCustomPayroll(e.target.value)} placeholder="₹" />
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            const entry = onAddCustomScenario?.({
              label: customLabel || "Custom scenario",
              monthlyPayroll: Number(customPayroll) || 0,
            });
            if (entry) {
              setCustomLabel("");
              setCustomPayroll("");
            }
          }}
        >
          Add Scenario
        </Button>
      </div>

      <EnterpriseDataTable
        hasRows={rows.length > 0}
        emptyTitle="No scenarios"
        emptyDescription="Forecast scenarios appear once reporting context payroll is loaded."
        desktop={
          <PeopleOpsTableShell>
            <PeopleOpsTableHead>
              <tr>
                {["Scenario", "Monthly Payroll", "Annual Payroll", "Budget Remaining", "Headcount", "Variance", ""].map((label) => (
                  <PeopleOpsTableCell key={label || "actions"} header>{label}</PeopleOpsTableCell>
                ))}
              </tr>
            </PeopleOpsTableHead>
            <PeopleOpsTableBody>
              {rows.map((row) => (
                <PeopleOpsTableRow key={row.id}>
                  <PeopleOpsTableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{row.label}</span>
                      <StatusBadge variant="info" compact>Preview</StatusBadge>
                    </div>
                  </PeopleOpsTableCell>
                  <PeopleOpsTableCell className="tabular-nums">{row.monthlyPayrollLabel}</PeopleOpsTableCell>
                  <PeopleOpsTableCell className="tabular-nums">{row.annualPayrollLabel}</PeopleOpsTableCell>
                  <PeopleOpsTableCell className="tabular-nums">{row.budgetRemainingLabel}</PeopleOpsTableCell>
                  <PeopleOpsTableCell>{row.headcount ?? "—"}</PeopleOpsTableCell>
                  <PeopleOpsTableCell className="tabular-nums">{row.varianceLabel}</PeopleOpsTableCell>
                  <PeopleOpsTableCell>
                    <Button type="button" size="sm" variant="outline" onClick={() => onSaveScenario?.(row)}>
                      Save to History
                    </Button>
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
