import React from "react";
import PeopleOpsBreadcrumbs from "@/components/peopleOps/PeopleOpsBreadcrumbs.jsx";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import OwnershipCoveragePanel from "@/components/peopleOps/ownership/OwnershipCoveragePanel.jsx";
import { EnterpriseDataTable, KpiCard, KpiCardGrid, StatusBadge } from "@/components/ux";
import { LayoutDashboard } from "lucide-react";

export default function OwnershipRoleDashboard({ workspace, breadcrumbs = [] }) {
  const dashboard = workspace?.dashboard;
  if (!dashboard) return null;

  const gaps = dashboard.ownershipGaps || [];

  return (
    <div className="space-y-2">
      {breadcrumbs?.length ? <PeopleOpsBreadcrumbs items={breadcrumbs} className="mb-0.5" /> : null}
      <KpiCardGrid columns={4} dense>
        {dashboard.kpis.map((kpi) => (
          <KpiCard
            key={kpi.id}
            dense
            title={kpi.label}
            value={kpi.valueLabel ?? kpi.value ?? "—"}
            subtitle={kpi.hint}
            icon={LayoutDashboard}
          />
        ))}
      </KpiCardGrid>
      <OwnershipCoveragePanel dashboard={dashboard} workspace={workspace} />
      <PeopleOpsSectionCard
        title="Business Ownership Dashboard"
        subtitle={`Founder visibility (${dashboard.role}). Canonical SoT: lab_ownership.`}
        icon={LayoutDashboard}
        dense
      >
        {dashboard.roleRollups ? (
          <div className="mb-2 rounded-lg border border-border bg-muted/10 p-2">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Role rollups</p>
            <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">
              {Object.entries(dashboard.roleRollups)
                .filter(([key]) => !key.endsWith("Label") && key !== "visitsNote")
                .map(([key, value]) => (
                  <div key={key} className="text-xs">
                    <p className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1")}</p>
                    <p className="font-semibold tabular-nums">{dashboard.roleRollups[`${key}Label`] ?? value}</p>
                  </div>
                ))}
            </div>
            {dashboard.roleRollups.visitsNote ? (
              <p className="mt-1.5 text-[10px] text-muted-foreground">{dashboard.roleRollups.visitsNote}</p>
            ) : null}
          </div>
        ) : null}

        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Ownership gaps</p>
            <StatusBadge variant={gaps.length ? "warning" : "success"} label={gaps.length ? String(gaps.length) : "None"} />
          </div>
          <EnterpriseDataTable
            hasRows={gaps.length > 0}
            emptyTitle="No ownership gaps"
            emptyDescription="Every scoped lab has a primary agent and reporting admin."
            desktop={
              <div className="overflow-x-auto rounded-lg border">
                <table className="min-w-full text-left text-[11px]">
                  <thead className="sticky top-0 z-10 border-b bg-muted/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <tr>
                      {["Lab", "Gap"].map((label) => (
                        <th key={label} className="px-2 py-1.5">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {gaps.map((row) => (
                      <tr key={row.labId} className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/30">
                        <td className="px-2 py-1.5 font-medium">{row.labName}</td>
                        <td className="px-2 py-1.5">{row.gap}</td>
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
