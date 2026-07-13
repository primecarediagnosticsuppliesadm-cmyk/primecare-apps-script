import React, { useEffect, useMemo, useRef } from "react";
import { Search, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { filterGlobalSearch } from "@/peopleOps/productivity/peopleOpsProductivityModel.js";
import { cn } from "@/lib/utils";

const GROUP_LABELS = {
  employees: "Employees",
  plans: "Plans",
  assignments: "Assignments",
  payrollPeriods: "Payroll Periods",
  payrollRuns: "Payroll Runs",
  exports: "Exports",
  reports: "Reports",
};

export default function PeopleOpsGlobalSearch({
  open = false,
  query = "",
  onQueryChange,
  onClose,
  onToggle,
  searchIndex,
  onSelectResult,
  onToggleFavorite,
  isFavorite,
}) {
  const inputRef = useRef(null);
  const results = useMemo(() => filterGlobalSearch(searchIndex, query), [searchIndex, query]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onToggle?.();
      }
      if (event.key === "Escape" && open) {
        event.preventDefault();
        onClose?.(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, onQueryChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-20" role="dialog" aria-label="People Operations search">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-xl">
        <div className="border-b border-border p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => onQueryChange?.(event.target.value)}
              placeholder="Search employees, plans, payroll periods, exports…"
              className="h-11 pl-9"
              aria-label="Search People Operations"
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Press Esc to close · ⌘K / Ctrl+K to toggle</p>
        </div>
        <div className="max-h-[24rem] overflow-y-auto p-2">
          {query.trim() && !results.length ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches in loaded People Operations data.</p>
          ) : null}
          {results.map((row) => (
            <div key={`${row.group}-${row.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50">
              <button
                type="button"
                className="min-w-0 flex-1 rounded-md px-2 py-2 text-left"
                onClick={() => onSelectResult?.(row)}
              >
                <p className="truncate text-sm font-medium text-foreground">{row.label}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {GROUP_LABELS[row.group] || row.group} · {row.meta}
                </p>
              </button>
              {row.favoriteKey ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className={cn("h-8 w-8 shrink-0", isFavorite?.(row.favoriteKey) && "text-amber-600")}
                  aria-label={isFavorite?.(row.favoriteKey) ? "Remove favorite" : "Add favorite"}
                  onClick={() => onToggleFavorite?.(row)}
                >
                  <Star className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
