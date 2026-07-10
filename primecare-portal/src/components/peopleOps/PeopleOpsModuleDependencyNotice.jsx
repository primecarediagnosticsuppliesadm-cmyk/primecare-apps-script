import React from "react";
import { ArrowRight, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Compact cross-module dependency card — contextual bridge, not a full enterprise blocker.
 */
export default function PeopleOpsModuleDependencyNotice({ notices = [], onNavigate }) {
  if (!notices.length) return null;

  return (
    <div className="space-y-1.5" role="region" aria-label="Related module dependencies">
      {notices.map((row) => (
        <div
          key={row.id}
          className={cn(
            "flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--pc-info-border)] bg-[var(--pc-info-bg)] px-3 py-2 text-xs text-[var(--pc-info)]"
          )}
        >
          <div className="flex min-w-0 items-start gap-2">
            <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <p className="font-medium text-foreground">{row.title}</p>
          </div>
          {row.actionRoute && onNavigate ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 border-[var(--pc-info-border)] bg-background text-[10px]"
              onClick={() => onNavigate(row.actionRoute)}
            >
              {row.actionLabel || "Go →"}
              <ArrowRight className="ml-1 h-3 w-3" aria-hidden />
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
