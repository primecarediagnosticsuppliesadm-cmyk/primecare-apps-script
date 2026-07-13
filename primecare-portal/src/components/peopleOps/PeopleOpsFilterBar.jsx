import React from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { typography } from "@/styles/designTokens";

/**
 * Unified filter toolbar for People Operations list screens.
 */
export default function PeopleOpsFilterBar({
  search = "",
  onSearchChange,
  searchPlaceholder = "Search…",
  filters = [],
  resultCount = null,
  totalCount = null,
  onClear,
  onRefresh,
  refreshing = false,
  className,
}) {
  const hasActiveFilters =
    Boolean(search.trim()) || filters.some((filter) => filter.value && filter.value !== filter.clearValue);

  return (
    <div
      className={cn(
        "sticky top-0 z-20 -mx-1 rounded-xl border border-border bg-card/95 px-3 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/80",
        className
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {onSearchChange ? (
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-10 pl-9"
              aria-label={searchPlaceholder}
            />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((filter) => (
            <select
              key={filter.id}
              value={filter.value}
              onChange={(event) => filter.onChange?.(event.target.value)}
              className="h-10 min-w-[9rem] rounded-lg border border-border bg-background px-3 text-sm"
              aria-label={filter.label}
            >
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ))}
          {onClear && hasActiveFilters ? (
            <Button type="button" variant="ghost" size="sm" onClick={onClear} className="h-10">
              <X className="mr-1 h-4 w-4" aria-hidden />
              Clear
            </Button>
          ) : null}
          {onRefresh ? (
            <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={refreshing} className="h-10">
              Refresh
            </Button>
          ) : null}
        </div>
      </div>
      {resultCount != null ? (
        <p className={cn(typography.caption, "mt-2")}>
          Showing {resultCount}
          {totalCount != null ? ` of ${totalCount}` : ""} records
        </p>
      ) : null}
    </div>
  );
}
