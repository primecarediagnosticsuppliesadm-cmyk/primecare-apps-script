import React from "react";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** RC4 — Compact inline quick actions toolbar (not a section card). */
export default function PeopleOpsQuickActions({ actions = [], onAction, busy = false, className }) {
  const enabled = actions.filter((row) => row.enabled !== false);
  if (!enabled.length) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1 rounded-md border border-border bg-muted/20 px-2 py-1",
        className
      )}
      role="toolbar"
      aria-label="Quick actions"
    >
      <Zap className="mr-0.5 h-3 w-3 shrink-0 text-[var(--pc-brand-primary)]" aria-hidden />
      {enabled.map((action) => (
        <Button
          key={action.id}
          type="button"
          size="sm"
          variant={action.kind === "workflow" ? "default" : "ghost"}
          className="h-6 px-2 text-[10px]"
          disabled={busy}
          onClick={() => onAction?.(action)}
        >
          {action.label}
        </Button>
      ))}
    </div>
  );
}
