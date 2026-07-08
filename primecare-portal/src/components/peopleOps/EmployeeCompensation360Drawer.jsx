import React, { useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataFetchError, ListSkeleton } from "@/components/ux";
import EmployeeCompensation360Panel from "@/components/compensation/EmployeeCompensation360Panel.jsx";
import { cn } from "@/lib/utils";

/**
 * Slide-over drawer for Employee 360 — keeps directory visible underneath.
 */
export default function EmployeeCompensation360Drawer({
  open,
  onClose,
  employeeName = "",
  model,
  ownershipContext = null,
  permissions,
  loading = false,
  error = "",
  busy = false,
  selectablePlans = [],
  onChangePlan,
  onAssignPlan,
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
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Employee 360">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close employee drawer"
        onClick={onClose}
      />
      <aside
        className={cn(
          "relative flex h-full w-full max-w-3xl flex-col border-l border-border bg-background shadow-2xl",
          "animate-in slide-in-from-right duration-200"
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Employee 360</p>
            <h2 className="truncate text-lg font-semibold text-foreground">{employeeName || "Employee"}</h2>
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {loading ? <ListSkeleton rows={8} /> : null}
          {error ? <DataFetchError message={error} onRetry={null} /> : null}
          {!loading && !error && model ? (
            <EmployeeCompensation360Panel
              model={model}
              ownershipContext={ownershipContext}
              permissions={permissions}
              loading={loading}
              error={error}
              busy={busy}
              selectablePlans={selectablePlans}
              onChangePlan={onChangePlan}
              onAssignPlan={onAssignPlan}
              embedded
            />
          ) : null}
        </div>
      </aside>
    </div>
  );
}
