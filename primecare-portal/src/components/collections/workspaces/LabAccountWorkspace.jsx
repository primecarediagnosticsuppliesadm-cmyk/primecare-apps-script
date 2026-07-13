import React from "react";
import CollectionsWorkspaceShell from "@/components/collections/CollectionsWorkspaceShell.jsx";
import { COLLECTIONS_WORKSPACES } from "@/collections/collectionsViewMode.js";

export default function LabAccountWorkspace({
  meta,
  summaryMetrics,
  emptyState = null,
  showEmpty = false,
  children,
}) {
  const workspaceMeta = meta || {
    title: "Payments & account",
    primaryQuestion: "What is my account health, balance, and payment activity?",
    workspaceLabel: "Lab account workspace",
  };

  return (
    <CollectionsWorkspaceShell
      workspaceId={COLLECTIONS_WORKSPACES.LAB_ACCOUNT}
      title={workspaceMeta.title}
      primaryQuestion={workspaceMeta.primaryQuestion}
      workspaceLabel={workspaceMeta.workspaceLabel}
      className="mx-auto max-w-7xl"
    >
      <section aria-label="Account summary">{summaryMetrics}</section>

      <section aria-label="Account activity and invoices">
        {showEmpty ? emptyState : <div className="space-y-4" role="list">{children}</div>}
      </section>
    </CollectionsWorkspaceShell>
  );
}
