import React from "react";
import CollectionsWorkspaceShell from "@/components/collections/CollectionsWorkspaceShell.jsx";
import CollectionsSearchBar from "@/components/collections/CollectionsSearchBar.jsx";
import { COLLECTIONS_WORKSPACES } from "@/collections/collectionsViewMode.js";

export default function HqReceivablesWorkspace({
  meta,
  summaryMetrics,
  searchValue,
  onSearchChange,
  shownCount = 0,
  totalCount = 0,
  emptyState = null,
  showEmpty = false,
  children,
}) {
  const workspaceMeta = meta || {
    title: "HQ receivables",
    primaryQuestion: "What is our outstanding receivables position by lab?",
    workspaceLabel: "Receivables workspace",
    searchSectionLabel: "Find receivables",
  };

  return (
    <CollectionsWorkspaceShell
      workspaceId={COLLECTIONS_WORKSPACES.HQ_RECEIVABLES}
      title={workspaceMeta.title}
      primaryQuestion={workspaceMeta.primaryQuestion}
      workspaceLabel={workspaceMeta.workspaceLabel}
    >
      <section aria-label="Portfolio summary">{summaryMetrics}</section>

      <section aria-label={workspaceMeta.searchSectionLabel || "Find receivables"}>
        <CollectionsSearchBar
          sectionLabel={workspaceMeta.searchSectionLabel || "Find receivables"}
          value={searchValue}
          onChange={onSearchChange}
          shownCount={shownCount}
          totalCount={totalCount}
        />
      </section>

      <section aria-label="Receivables ledger">
        {showEmpty ? emptyState : <div className="space-y-2" role="list">{children}</div>}
      </section>
    </CollectionsWorkspaceShell>
  );
}
