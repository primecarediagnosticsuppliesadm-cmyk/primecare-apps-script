import React, { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataFetchError, ListSkeleton } from "@/components/ux";
import Employee360Workspace from "@/components/peopleOps/employee360/Employee360Workspace.jsx";
import { cn } from "@/lib/utils";

/**
 * Quick View drawer — compact Today tab. Full Employee Workspace is the canonical surface.
 */
export default function EmployeeCompensation360Drawer({
  open,
  onClose,
  onOpenFullWorkspace,
  employeeName = "",
  model,
  directoryRow = null,
  ownershipContext = null,
  permissions,
  reportingContext = null,
  loading = false,
  error = "",
  onRetry,
  onAction,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Employee quick view">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close employee quick view"
        onClick={onClose}
      />
      <aside
        className={cn(
          "relative flex h-full w-full max-w-lg flex-col border-l border-border bg-background shadow-2xl",
          "animate-in slide-in-from-right duration-200"
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Employee quick view</p>
            <h2 className="truncate text-lg font-semibold text-foreground">{employeeName || "Employee"}</h2>
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? <ListSkeleton rows={6} /> : null}
          {error ? <DataFetchError message={error} onRetry={onRetry} retrying={loading} /> : null}
          {!loading && !error && model ? (
            <Employee360Workspace
              mode="compact"
              model={model}
              directoryRow={directoryRow}
              ownershipContext={ownershipContext}
              permissions={permissions}
              reportingContext={reportingContext}
              onOpenFullWorkspace={onOpenFullWorkspace}
              onAction={onAction}
            />
          ) : null}
        </div>
      </aside>
    </div>
  );
}
