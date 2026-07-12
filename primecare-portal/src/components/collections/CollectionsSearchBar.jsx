import React from "react";
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";

/**
 * Shared collections search chrome — filter only, no data mutation.
 */
export default function CollectionsSearchBar({
  sectionLabel = "Search",
  value = "",
  onChange,
  shownCount = 0,
  totalCount = 0,
  refreshing = false,
  refreshingLabel = "Refreshing…",
  placeholder = "Search lab, agent, area…",
}) {
  return (
    <div className="sticky top-0 z-20 -mx-1 border-b border-border bg-background/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/90">
      <div className="space-y-2 rounded-lg border border-border bg-card p-2 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-slate-700">{sectionLabel}</div>
          <div className="text-[11px] text-muted-foreground">
            {shownCount} of {totalCount} shown
            {refreshing ? (
              <span className="ml-2 inline-flex items-center gap-1 text-[var(--pc-brand-primary)]">
                <Loader2 className="h-3 w-3 animate-spin" />
                {refreshingLabel}
              </span>
            ) : null}
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder={placeholder}
            value={value}
            onChange={onChange}
            className="h-9 rounded-lg pl-8 text-sm"
            aria-label="Search collections"
          />
        </div>
      </div>
    </div>
  );
}
