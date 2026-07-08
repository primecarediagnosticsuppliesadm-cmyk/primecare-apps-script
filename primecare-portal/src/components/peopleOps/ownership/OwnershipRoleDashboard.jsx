import React from "react";
import PeopleOpsBreadcrumbs from "@/components/peopleOps/PeopleOpsBreadcrumbs.jsx";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import { EnterpriseDataTable, StatusBadge } from "@/components/ux";
import { LayoutDashboard } from "lucide-react";

export default function OwnershipRoleDashboard({ workspace, breadcrumbs = [] }) {
  const dashboard = workspace?.dashboard;
  if (!dashboard) return null;

  const gaps = dashboard.ownershipGaps || [];

  return (
    <div className="space-y-4">
      {breadcrumbs?.length ? <PeopleOpsBreadcrumbs items={breadcrumbs} /> : null}
      <PeopleOpsSectionCard
        title="Business Ownership Dashboard"
        subtitle={`Founder visibility (${dashboard.role}). Canonical SoT: lab_ownership. Operational only — no payroll.`}
        icon={LayoutDashboard}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {dashboard.kpis.map((kpi) => (
            <div key={kpi.id} className="rounded-xl border border-border bg-muted/20 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{kpi.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                {kpi.valueLabel ?? kpi.value}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border px-3 py-2 text-sm">
            <p className="text-muted-foreground">Coverage</p>
            <p className="font-semibold">{dashboard.coveragePct}% labs with ownership</p>
          </div>
          <div className="rounded-lg border border-border px-3 py-2 text-sm">
            <p className="text-muted-foreground">Unassigned labs</p>
            <p className="font-semibold">{dashboard.unassignedLabs}</p>
          </div>
          <div className="rounded-lg border border-border px-3 py-2 text-sm">
            <p className="text-muted-foreground">Reporting period</p>
            <p className="font-semibold">
              {workspace.reportingContext?.periodYm || workspace.reportingContext?.periodLabel || "Current"}
            </p>
          </div>
        </div>

        {dashboard.roleRollups ? (
          <div className="mt-4 rounded-lg border border-border bg-muted/10 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Role rollups</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {Object.entries(dashboard.roleRollups)
                .filter(([key]) => !key.endsWith("Label") && key !== "visitsNote")
                .map(([key, value]) => (
                  <div key={key} className="text-sm">
                    <p className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1")}</p>
                    <p className="font-semibold tabular-nums">
                      {dashboard.roleRollups[`${key}Label`] ?? value}
                    </p>
                  </div>
                ))}
            </div>
            {dashboard.roleRollups.visitsNote ? (
              <p className="mt-2 text-xs text-muted-foreground">{dashboard.roleRollups.visitsNote}</p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4">
          <div className="mb-2 flex items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Ownership gaps</p>
            <StatusBadge variant={gaps.length ? "warning" : "success"} label={gaps.length ? String(gaps.length) : "None"} />
          </div>
          <EnterpriseDataTable
            hasRows={gaps.length > 0}
            emptyTitle="No ownership gaps"
            emptyDescription="Every scoped lab has a primary agent and reporting admin."
            desktop={
              <div className="overflow-x-auto rounded-lg border">
                <table className="min-w-full text-left text-[11px]">
                  <thead className="border-b bg-muted/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <tr>
                      {["Lab", "Gap"].map((label) => (
                        <th key={label} className="px-2 py-2">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gaps.map((row) => (
                      <tr key={row.labId} className="border-b border-border/60 last:border-0">
                        <td className="px-2 py-2 font-medium">{row.labName}</td>
                        <td className="px-2 py-2">{row.gap}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }
          />
        </div>
      </PeopleOpsSectionCard>
    </div>
  );
}
