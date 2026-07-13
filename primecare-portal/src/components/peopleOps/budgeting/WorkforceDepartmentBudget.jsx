import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { EnterpriseDataTable, StatusBadge } from "@/components/ux";
import PeopleOpsModuleFrame from "@/components/peopleOps/PeopleOpsModuleFrame.jsx";
import PeopleOpsFilterBar from "@/components/peopleOps/PeopleOpsFilterBar.jsx";
import PeopleOpsTableShell, {
  PeopleOpsTableBody,
  PeopleOpsTableCell,
  PeopleOpsTableHead,
  PeopleOpsTableRow,
} from "@/components/peopleOps/PeopleOpsTableShell.jsx";

const STATUS_VARIANT = { on_track: "success", over_budget: "warning" };

export default function WorkforceDepartmentBudget({ workspace, breadcrumbs = [] }) {
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState("");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (workspace?.departments || []).filter((row) => !q || row.department.toLowerCase().includes(q));
  }, [search, workspace]);

  if (!workspace) return null;

  return (
    <PeopleOpsModuleFrame
      title="Department Budget"
      description="Department payroll rollups from the selected reporting run. Expand rows for employee detail."
      breadcrumbs={breadcrumbs}
      filters={
        <PeopleOpsFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search department"
          resultCount={rows.length}
          totalCount={workspace.departments.length}
          onClear={() => setSearch("")}
        />
      }
    >
      <EnterpriseDataTable
        hasRows={rows.length > 0}
        emptyTitle="No department data"
        emptyDescription="Employees appear in department rows once the directory and payroll preview are loaded."
        desktop={
          <PeopleOpsTableShell>
            <PeopleOpsTableHead>
              <tr>
                {["", "Department", "Employees", "Budget", "Current Payroll", "Forecast Payroll", "Variance", "Status"].map(
                  (label) => (
                    <PeopleOpsTableCell key={label || "expand"} header>
                      {label}
                    </PeopleOpsTableCell>
                  )
                )}
              </tr>
            </PeopleOpsTableHead>
            <PeopleOpsTableBody>
              {rows.map((row) => {
                const expanded = expandedId === row.id;
                return (
                  <React.Fragment key={row.id}>
                    <PeopleOpsTableRow>
                      <PeopleOpsTableCell>
                        <button
                          type="button"
                          className="rounded p-1 hover:bg-muted"
                          aria-label={expanded ? "Collapse department" : "Expand department"}
                          onClick={() => setExpandedId(expanded ? "" : row.id)}
                        >
                          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </PeopleOpsTableCell>
                      <PeopleOpsTableCell className="font-medium">{row.department}</PeopleOpsTableCell>
                      <PeopleOpsTableCell>{row.employees}</PeopleOpsTableCell>
                      <PeopleOpsTableCell className="tabular-nums">{row.budgetLabel}</PeopleOpsTableCell>
                      <PeopleOpsTableCell className="tabular-nums">{row.currentPayrollLabel}</PeopleOpsTableCell>
                      <PeopleOpsTableCell className="tabular-nums">{row.forecastPayrollLabel}</PeopleOpsTableCell>
                      <PeopleOpsTableCell className="tabular-nums">{row.varianceLabel}</PeopleOpsTableCell>
                      <PeopleOpsTableCell>
                        <StatusBadge variant={STATUS_VARIANT[row.status] || "neutral"} label={row.statusLabel} />
                      </PeopleOpsTableCell>
                    </PeopleOpsTableRow>
                    {expanded ? (
                      <tr>
                        <td colSpan={8} className="bg-muted/20 px-3 py-3">
                          <ul className="grid gap-1 text-sm md:grid-cols-2">
                            {row.employeeRows.map((employee) => (
                              <li key={employee.profileUserId} className="rounded border border-border px-2 py-1">
                                {employee.employeeName} · {employee.role} · {employee.planName || employee.planCode || "No plan"}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </PeopleOpsTableBody>
          </PeopleOpsTableShell>
        }
      />
    </PeopleOpsModuleFrame>
  );
}
