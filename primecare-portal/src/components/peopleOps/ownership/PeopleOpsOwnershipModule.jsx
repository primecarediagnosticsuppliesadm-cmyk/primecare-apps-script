import React, { useMemo, useState } from "react";
import PeopleOpsBreadcrumbs from "@/components/peopleOps/PeopleOpsBreadcrumbs.jsx";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import OwnershipExplorerTree from "@/components/peopleOps/ownership/OwnershipExplorerTree.jsx";
import OwnershipTerritoryDashboard from "@/components/peopleOps/ownership/OwnershipTerritoryDashboard.jsx";
import OwnershipRoleDashboard from "@/components/peopleOps/ownership/OwnershipRoleDashboard.jsx";
import OwnershipTimelinePanel from "@/components/peopleOps/ownership/OwnershipTimelinePanel.jsx";
import HierarchicalCompensationPanel from "@/components/peopleOps/ownership/HierarchicalCompensationPanel.jsx";
import { GitBranch, MapPin, History } from "lucide-react";

export default function PeopleOpsOwnershipModule({
  screenId,
  workspace,
  hierarchicalCompensation = null,
  breadcrumbs = [],
  onOpenLab,
  onOpenEmployee,
}) {
  const labs = workspace?.enrichedLabs || [];
  const [timelineLabId, setTimelineLabId] = useState(() => labs[0]?.labId || "");
  const activeTimelineLabId = timelineLabId || labs[0]?.labId || "";
  const timelineEvents = useMemo(() => {
    if (!workspace || !activeTimelineLabId) return [];
    return workspace.buildOwnershipTimelineForLab(activeTimelineLabId);
  }, [activeTimelineLabId, workspace]);

  if (!workspace) return null;

  if (screenId === "territories") {
    return (
      <OwnershipTerritoryDashboard
        workspace={workspace}
        breadcrumbs={breadcrumbs}
        onOpenTerritory={() => {}}
      />
    );
  }

  if (screenId === "dashboard") {
    return <OwnershipRoleDashboard workspace={workspace} breadcrumbs={breadcrumbs} />;
  }

  if (screenId === "timeline") {
    return (
      <div className="space-y-4">
        <PeopleOpsBreadcrumbs items={breadcrumbs} />
        <PeopleOpsSectionCard
          title="Ownership Timeline"
          subtitle="Assigned · Changed · Transferred · Ended · Current — for future payment-date attribution. Read only. SoT: lab_ownership."
          icon={History}
        >
          <label className="mb-3 block text-xs">
            <span className="mb-1 block font-semibold uppercase tracking-wide text-muted-foreground">Lab</span>
            <select
              className="h-9 w-full max-w-md rounded-md border border-border bg-background px-2 text-sm"
              value={activeTimelineLabId}
              onChange={(event) => setTimelineLabId(event.target.value)}
            >
              {labs.map((lab) => (
                <option key={lab.labId} value={lab.labId}>
                  {lab.labName || lab.labId}
                </option>
              ))}
            </select>
          </label>
          <OwnershipTimelinePanel events={timelineEvents} />
        </PeopleOpsSectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <PeopleOpsBreadcrumbs items={breadcrumbs} />
      <OwnershipRoleDashboard workspace={workspace} breadcrumbs={[]} />
      <PeopleOpsSectionCard
        title="Business Ownership Explorer"
        subtitle="Canonical sales chain from lab_ownership: Executive → Admin → Agent → Labs. Writes stay in Operations Center."
        icon={GitBranch}
      >
        <OwnershipExplorerTree
          orgTree={workspace.orgTree}
          onOpenLab={onOpenLab}
          onOpenEmployee={onOpenEmployee}
        />
      </PeopleOpsSectionCard>
      {hierarchicalCompensation ? <HierarchicalCompensationPanel model={hierarchicalCompensation} /> : null}
      <div className="grid gap-2 lg:grid-cols-2">
        <PeopleOpsSectionCard title="Territories snapshot" icon={MapPin} subtitle="Top territories by collections">
          <div className="space-y-1.5">
            {(workspace.territories || []).slice(0, 6).map((row) => (
              <div key={row.territoryId} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs">
                <span className="font-medium">{row.territoryName}</span>
                <span className="tabular-nums text-muted-foreground">{row.collectionsLabel}</span>
              </div>
            ))}
            {!(workspace.territories || []).length ? (
              <p className="text-sm text-muted-foreground">No territory collections in the current reporting period.</p>
            ) : null}
          </div>
        </PeopleOpsSectionCard>
      </div>
    </div>
  );
}
