import React from "react";
import { AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SEVERITY = {
  critical: "border-[var(--pc-danger-border)] bg-[var(--pc-danger-bg)] text-[var(--pc-danger)]",
  warning: "border-[var(--pc-warning-border)] bg-[var(--pc-warning-bg)] text-[var(--pc-warning)]",
  attention: "border-[var(--pc-info-border)] bg-[var(--pc-info-bg)] text-[var(--pc-info)]",
  info: "border-border bg-muted/30 text-muted-foreground",
};

export default function PeopleOpsDataQualityBanner({ warnings = [], onNavigate }) {
  if (!warnings.length) return null;

  return (
    <div className="space-y-1.5" role="region" aria-label="Data quality notices">
      {warnings.slice(0, 4).map((row) => (
        <div
          key={row.id}
          className={cn("flex flex-wrap items-start justify-between gap-2 rounded-lg border px-3 py-2 text-xs", SEVERITY[row.severity] || SEVERITY.info)}
        >
          <div className="flex min-w-0 items-start gap-2">
            {row.severity === "warning" || row.severity === "critical" ? (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : (
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            <div>
              <p className="font-semibold">{row.title}</p>
              {row.detail ? <p className="mt-0.5 opacity-90">{row.detail}</p> : null}
            </div>
          </div>
          {row.actionRoute && onNavigate ? (
            <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => onNavigate(row.actionRoute)}>
              {row.actionLabel || "Open"}
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
