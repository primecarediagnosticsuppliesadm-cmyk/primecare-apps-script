import React, { useCallback, useEffect, useState } from "react";
import { Columns3, LayoutList, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { enterpriseLayout } from "@/styles/enterpriseLayout.js";

const DENSITY_KEY = "peopleOps.tableDensity";

export function usePeopleOpsTableDensity(defaultDensity = "compact") {
  const [density, setDensity] = useState(() => {
    try {
      return sessionStorage.getItem(DENSITY_KEY) || defaultDensity;
    } catch {
      return defaultDensity;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(DENSITY_KEY, density);
    } catch {
      /* ignore */
    }
  }, [density]);

  return [density, setDensity];
}

/**
 * RC4 — Table chrome: density, column visibility, saved filter presets (UI-only).
 */
export default function PeopleOpsTableToolbar({
  density = "compact",
  onDensityChange,
  columns = [],
  visibleColumnIds = [],
  onToggleColumn,
  savedFilters = [],
  onApplyFilter,
  onSaveFilter,
  className,
}) {
  const [showColumns, setShowColumns] = useState(false);

  const toggleColumn = useCallback(
    (id) => {
      onToggleColumn?.(id);
    },
    [onToggleColumn]
  );

  return (
    <div
      className={cn(
        enterpriseLayout.stickyToolbar,
        "top-[2.75rem] flex flex-wrap items-center justify-between gap-1.5 py-1.5",
        className
      )}
      role="toolbar"
      aria-label="Table options"
    >
      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant={density === "compact" ? "default" : "outline"}
          className="h-7 px-2 text-[10px]"
          onClick={() => onDensityChange?.("compact")}
          aria-pressed={density === "compact"}
        >
          <LayoutList className="mr-1 h-3 w-3" />
          Compact
        </Button>
        <Button
          type="button"
          size="sm"
          variant={density === "comfortable" ? "default" : "outline"}
          className="h-7 px-2 text-[10px]"
          onClick={() => onDensityChange?.("comfortable")}
          aria-pressed={density === "comfortable"}
        >
          Comfortable
        </Button>
        {columns.length ? (
          <div className="relative">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[10px]"
              onClick={() => setShowColumns((v) => !v)}
              aria-expanded={showColumns}
            >
              <Columns3 className="mr-1 h-3 w-3" />
              Columns
            </Button>
            {showColumns ? (
              <div className="absolute left-0 top-full z-30 mt-1 min-w-[10rem] rounded-md border border-border bg-card p-2 shadow-md">
                {columns.map((col) => (
                  <label key={col.id} className="flex cursor-pointer items-center gap-2 py-0.5 text-xs">
                    <input
                      type="checkbox"
                      checked={visibleColumnIds.includes(col.id)}
                      onChange={() => toggleColumn(col.id)}
                      className="h-3.5 w-3.5 rounded border-border"
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {savedFilters.map((preset) => (
          <Button
            key={preset.id}
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[10px]"
            onClick={() => onApplyFilter?.(preset)}
          >
            {preset.label}
          </Button>
        ))}
        {onSaveFilter ? (
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[10px]" onClick={onSaveFilter}>
            <Save className="mr-1 h-3 w-3" />
            Save filter
          </Button>
        ) : null}
      </div>
    </div>
  );
}
