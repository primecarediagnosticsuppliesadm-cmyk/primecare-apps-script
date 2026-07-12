import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { buildPurchaseStartHereActions } from "@/purchase/purchaseContextUi.js";

/**
 * Action-oriented Start Here for Purchase — existing counts only.
 */
export default function PurchaseStartHere({
  pendingReceiptCount = 0,
  criticalCount = 0,
  blockedCount = 0,
  purchaseOrderCount = 0,
  loading = false,
  onAction,
}) {
  const actions = useMemo(
    () =>
      buildPurchaseStartHereActions({
        pendingReceiptCount,
        criticalCount,
        blockedCount,
        purchaseOrderCount,
      }),
    [pendingReceiptCount, criticalCount, blockedCount, purchaseOrderCount]
  );

  const primary = actions.find((a) => a.primary) || actions[0];
  const secondary = actions.filter((a) => a.id !== primary?.id);

  if (!primary) return null;

  return (
    <section
      aria-label="Start here — purchase work"
      className="rounded-xl border border-amber-300 bg-amber-50/60 p-3 shadow-sm"
      data-purchase-start-here="true"
      data-purchase-start-here-region="true"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900">
            Start here
          </p>
          <p className="mt-0.5 text-sm font-semibold text-amber-950">{primary.label}</p>
          <p className="mt-1 text-[11px] text-amber-900/80">{primary.description}</p>
        </div>
        <Button
          type="button"
          size="sm"
          className="h-8 shrink-0 text-xs"
          disabled={loading}
          onClick={() => onAction?.(primary)}
        >
          {primary.label}
        </Button>
      </div>

      {secondary.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-amber-200/80 pt-2">
          {secondary.map((action) => (
            <Button
              key={action.id}
              type="button"
              size="sm"
              variant="outline"
              className="h-7 border-amber-200 bg-white text-[11px] text-amber-950 hover:bg-amber-50"
              disabled={loading}
              onClick={() => onAction?.(action)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
