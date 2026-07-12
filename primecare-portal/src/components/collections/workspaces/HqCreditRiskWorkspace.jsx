import React from "react";
import CollectionsWorkspaceShell from "@/components/collections/CollectionsWorkspaceShell.jsx";
import CollectionsSearchBar from "@/components/collections/CollectionsSearchBar.jsx";
import HqCreditRiskCommandCenter from "@/components/hq/HqCreditRiskCommandCenter.jsx";
import { COLLECTIONS_WORKSPACES } from "@/collections/collectionsViewMode.js";

export default function HqCreditRiskWorkspace({
  meta,
  hideWorkspaceHeader = false,
  searchValue,
  onSearchChange,
  shownCount = 0,
  totalCount = 0,
  commandCenterProps,
}) {
  const workspaceMeta = meta || {
    title: "Credit & risk operations",
    primaryQuestion: "Which labs need credit intervention or payment follow-up?",
    workspaceLabel: "Credit & risk workspace",
    searchSectionLabel: "Filter labs",
  };

  return (
    <CollectionsWorkspaceShell
      workspaceId={COLLECTIONS_WORKSPACES.HQ_CREDIT_RISK}
      title={workspaceMeta.title}
      primaryQuestion={workspaceMeta.primaryQuestion}
      workspaceLabel={workspaceMeta.workspaceLabel}
      hideHeader={hideWorkspaceHeader}
    >
      <section aria-label={workspaceMeta.searchSectionLabel || "Filter labs"}>
        <CollectionsSearchBar
          sectionLabel={workspaceMeta.searchSectionLabel || "Filter labs"}
          value={searchValue}
          onChange={onSearchChange}
          shownCount={shownCount}
          totalCount={totalCount}
        />
      </section>

      <section aria-label="Credit intervention command center">
        <HqCreditRiskCommandCenter {...commandCenterProps} />
      </section>
    </CollectionsWorkspaceShell>
  );
}
