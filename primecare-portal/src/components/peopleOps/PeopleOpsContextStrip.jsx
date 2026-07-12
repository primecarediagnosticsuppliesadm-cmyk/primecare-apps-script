import React from "react";
import { cn } from "@/lib/utils";

/**
 * Compact orientation strip — what period, run, or employee context is active.
 */
export default function PeopleOpsContextStrip({ parts = [], className }) {
  const visible = parts.filter(Boolean);
  if (!visible.length) return null;

  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      <span className="font-semibold text-foreground">Viewing:</span> {visible.join(" · ")}
    </p>
  );
}
