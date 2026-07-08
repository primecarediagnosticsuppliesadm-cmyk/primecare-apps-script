import React, { useMemo, useState } from "react";
import PeopleOpsBreadcrumbs from "@/components/peopleOps/PeopleOpsBreadcrumbs.jsx";
import PeopleOpsFilterBar from "@/components/peopleOps/PeopleOpsFilterBar.jsx";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import { EnterpriseDataTable, StatusBadge } from "@/components/ux";
import { MapPin } from "lucide-react";

export default function OwnershipTerritoryDashboard({ workspace, breadcrumbs = [], onOpenTerritory }) {
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState("all");

  const rows = useMemo(() => {
    return (workspace?.territories || []).filter((row) => {
      if (healthFilter !== "all" && row.healthStatus !== healthFilter) return false;
      if (!search) return true;
      const haystack = [
        row.territoryName,
        row.executiveName,
        row.adminName,
        row.primaryAgentName,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search.toLowerCase());
    });
  }, [healthFilter, search, workspace]);

  return (
    <div className="space-y-4">
      <PeopleOpsBreadcrumbs items={breadcrumbs} />
      <PeopleOpsSectionCard
        title="Territory Management"
        subtitle="Dashboard-only territory ownership. No routing engine."
        icon={MapPin}
      >
        <PeopleOpsFilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search territory, executive, admin, agent…"
          filters={[
            {
              id: "health",
              label: "Health",
              value: healthFilter,
              options: [
                { value: "all", label: "All" },
                { value: "healthy", label: "Healthy" },
                { value: "attention", label: "Needs attention" },
              ],
              onChange: setHealthFilter,
            },
          ]}
        />
        <EnterpriseDataTable
          hasRows={rows.length > 0}
          emptyTitle="No territories"
          emptyDescription="Territories are derived from lab area labels in the compensation read bundle."
          desktop={
            <div className="overflow-x-auto rounded-lg border">
              <table className="min-w-full text-left text-[11px]">
                <thead className="border-b bg-muted/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    {[
                      "Territory",
                      "Executive",
                      "Admin",
                      "Primary Agent",
                      "Labs",
                      "Collections",
                      "Potential Compensation",
                      "Health",
                    ].map((label) => (
                      <th key={label} className="px-2 py-2">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.territoryId}
                      className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-muted/30"
                      onClick={() => onOpenTerritory?.(row)}
                    >
                      <td className="px-2 py-2 font-medium">{row.territoryName}</td>
                      <td className="px-2 py-2">{row.executiveName}</td>
                      <td className="px-2 py-2">{row.adminName}</td>
                      <td className="px-2 py-2">{row.primaryAgentName}</td>
                      <td className="px-2 py-2 tabular-nums">{row.labCount}</td>
                      <td className="px-2 py-2 tabular-nums">{row.collectionsLabel}</td>
                      <td className="px-2 py-2 tabular-nums">{row.potentialCompensationLabel}</td>
                      <td className="px-2 py-2">
                        <StatusBadge
                          variant={row.healthStatus === "healthy" ? "success" : "warning"}
                          label={row.healthStatus}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        />
      </PeopleOpsSectionCard>
    </div>
  );
}
