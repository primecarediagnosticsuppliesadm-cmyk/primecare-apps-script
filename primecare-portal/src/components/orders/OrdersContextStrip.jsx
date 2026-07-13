import React from "react";
import { cn } from "@/lib/utils";

/**
 * Compact Orders orientation strip — queue, order, lab, search, freeze.
 */
export default function OrdersContextStrip({ parts = [], warning = "", className }) {
  const visible = (parts || []).filter(Boolean);
  if (!visible.length && !warning) return null;

  return (
    <div className={cn("space-y-1.5", className)}>
      {visible.length ? (
        <p
          className="rounded-lg border border-border/70 bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <span className="font-semibold text-foreground">Viewing:</span>{" "}
          <span className="inline-flex flex-wrap gap-x-0">{visible.join(" · ")}</span>
        </p>
      ) : null}
      {warning ? (
        <p
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900"
          role="status"
          aria-live="polite"
        >
          {warning}
        </p>
      ) : null}
    </div>
  );
}
