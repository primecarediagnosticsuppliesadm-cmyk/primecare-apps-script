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

/**
 * RC5 — Problem → Why → Action business validation banners.
 */
export default function PeopleOpsDataQualityBanner({ warnings = [], onNavigate }) {
  if (!warnings.length) return null;

  return (
    <div className="space-y-1.5" role="region" aria-label="Business validation notices">
      {warnings.slice(0, 5).map((row) => (
        <div
          key={row.id}
          className={cn("flex flex-wrap items-start justify-between gap-2 rounded-lg border px-3 py-2.5 text-xs", SEVERITY[row.severity] || SEVERITY.info)}
        >
          <div className="flex min-w-0 items-start gap-2">
            {row.severity === "warning" || row.severity === "critical" ? (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            ) : (
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            )}
            <div className="min-w-0 space-y-1">
              {row.blockerLabel ? (
                <p className="text-[10px] font-bold uppercase tracking-wide opacity-90">{row.blockerLabel}</p>
              ) : null}
              <p className="font-semibold text-foreground">{row.title}</p>
              {row.detail ? (
                <p className="opacity-95">
                  <span className="font-medium">Reason:</span> {row.detail}
                </p>
              ) : null}
              {row.why ? <p className="opacity-80">{row.why}</p> : null}
            </div>
          </div>
          {row.actionRoute && onNavigate ? (
            <Button type="button" size="sm" variant="default" className="h-7 shrink-0 text-[10px]" onClick={() => onNavigate(row.actionRoute)}>
              {row.actionLabel || "Fix this →"}
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
