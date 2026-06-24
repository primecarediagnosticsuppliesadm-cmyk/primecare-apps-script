import React from "react";
import { cn } from "@/lib/utils";
import EmptyState from "./EmptyState.jsx";
import ListSkeleton from "./ListSkeleton.jsx";
import DataFetchError from "./DataFetchError.jsx";

/**
 * Shared table shell — desktop table + optional mobile fallback.
 * Does not own sorting/filtering logic (passed via toolbar / children).
 */
export default function EnterpriseDataTable({
  loading = false,
  error = "",
  onRetry,
  retrying = false,
  hasRows = false,
  emptyTitle = "No records",
  emptyDescription = "",
  emptyAction = null,
  toolbar = null,
  desktop = null,
  mobile = null,
  stickyHeaderClassName = "sticky top-0 z-10",
  className,
}) {
  const showStaleBanner = Boolean(error) && hasRows;

  if (loading && !hasRows) {
    return (
      <div className={cn("space-y-2", className)}>
        {toolbar}
        <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
          <ListSkeleton rows={6} />
        </div>
      </div>
    );
  }

  if (error && !hasRows) {
    return (
      <div className={cn("space-y-2", className)}>
        {toolbar}
        <DataFetchError message={error} onRetry={onRetry} retrying={retrying} />
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {showStaleBanner ? (
        <DataFetchError
          message={error}
          onRetry={onRetry}
          retrying={retrying}
          staleDataNote="Showing the last data loaded successfully."
        />
      ) : null}
      {toolbar}
      {!hasRows && !loading ? (
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      ) : null}
      {hasRows ? (
        <>
          <div className={cn("hidden xl:block", stickyHeaderClassName)}>{desktop}</div>
          <div className="xl:hidden">{mobile ?? desktop}</div>
        </>
      ) : null}
    </div>
  );
}
