import React from "react";
import { cn } from "@/lib/utils";
import { ListSkeleton } from "@/components/ux";
import CollectionsWorkspaceShell from "@/components/collections/CollectionsWorkspaceShell.jsx";
import CollectionsSearchBar from "@/components/collections/CollectionsSearchBar.jsx";
import { COLLECTIONS_WORKSPACES } from "@/collections/collectionsViewMode.js";

export default function AgentCollectionsWorkspace({
  meta,
  summaryMetrics,
  searchValue,
  onSearchChange,
  shownCount = 0,
  totalCount = 0,
  listRefreshing = false,
  contextStrip = null,
  emptyState = null,
  showEmpty = false,
  children,
}) {
  const workspaceMeta = meta || {
    title: "Collection work queue",
    primaryQuestion: "Who should I collect from today, and how much is owed?",
    workspaceLabel: "Agent collections workspace",
    searchSectionLabel: "Find accounts",
  };

  return (
    <CollectionsWorkspaceShell
      workspaceId={COLLECTIONS_WORKSPACES.AGENT}
      title={workspaceMeta.title}
      primaryQuestion={workspaceMeta.primaryQuestion}
      workspaceLabel={workspaceMeta.workspaceLabel}
    >
      <section aria-label="Queue summary">{summaryMetrics}</section>

      <section aria-label={workspaceMeta.searchSectionLabel || "Find accounts"}>
        <CollectionsSearchBar
          sectionLabel={workspaceMeta.searchSectionLabel || "Find accounts"}
          value={searchValue}
          onChange={onSearchChange}
          shownCount={shownCount}
          totalCount={totalCount}
          refreshing={listRefreshing}
          refreshingLabel="Refreshing queue…"
        />
      </section>

      {contextStrip}

      <section aria-label="Accounts due" className="relative">
        {listRefreshing && totalCount > 0 ? (
          <div className="mb-2 rounded-lg border border-border bg-card p-2">
            <ListSkeleton rows={3} />
          </div>
        ) : null}
        {showEmpty ? (
          emptyState
        ) : (
          <div className={cn("grid gap-3", listRefreshing && totalCount > 0 && "opacity-60")} role="list">
            {children}
          </div>
        )}
      </section>
    </CollectionsWorkspaceShell>
  );
}
