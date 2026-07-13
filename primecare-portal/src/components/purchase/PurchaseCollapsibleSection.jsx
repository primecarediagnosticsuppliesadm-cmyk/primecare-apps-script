import React from "react";
import { cn } from "@/lib/utils";

/**
 * Secondary Purchase information — collapsed by default to protect page budget.
 */
export default function PurchaseCollapsibleSection({
  title,
  children,
  defaultOpen = false,
  className,
  "data-testid": dataTestId,
}) {
  return (
    <details
      className={cn("rounded-lg border border-slate-200 bg-white", className)}
      open={defaultOpen ? true : undefined}
      data-purchase-collapsible={title}
      data-testid={dataTestId}
    >
      <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="text-slate-400">
            ▸
          </span>
          {title}
        </span>
      </summary>
      <div className="border-t border-slate-100 px-3 py-2.5">{children}</div>
    </details>
  );
}
