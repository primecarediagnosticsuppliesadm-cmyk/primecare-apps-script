import React from "react";
import { cn } from "@/lib/utils";

/**
 * Compact orientation strip — workspace, filter, and selected lab context.
 */
export default function CollectionsContextStrip({ parts = [], className }) {
  const visible = (parts || []).filter(Boolean);
  if (!visible.length) return null;

  return (
    <p
      className={cn("rounded-lg border border-border/70 bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground", className)}
      role="status"
      aria-live="polite"
    >
      <span className="font-semibold text-foreground">Viewing:</span> {visible.join(" · ")}
    </p>
  );
}
