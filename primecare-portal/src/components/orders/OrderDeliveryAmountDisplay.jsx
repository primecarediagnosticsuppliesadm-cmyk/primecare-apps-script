import React from "react";
import {
  DELIVERY_CHARGE_PLANNING_NOTE,
  OPERATIONAL_DELIVERY_QUOTE_LABEL,
  formatOrderInr,
  resolveOrderAmountBreakdown,
} from "@/logistics/deliveryChargeEngine.js";
import { cn } from "@/lib/utils";

function useBreakdown(order) {
  return resolveOrderAmountBreakdown(order || {});
}

export function OrderAmountTableCells({
  order,
  formatCurrency = formatOrderInr,
  showDeliveryColumns = false,
  className = "",
}) {
  const b = useBreakdown(order);
  return (
    <>
      <td className={cn("px-2 py-2 text-right tabular-nums font-medium text-slate-900", className)}>
        {formatCurrency(b.merchandiseSubtotal)}
      </td>
      {showDeliveryColumns ? (
        <>
          <td className={cn("px-2 py-2 text-right tabular-nums text-slate-700", className)}>
            {b.hasDeliveryEstimate ? formatCurrency(b.deliveryChargeAmount) : "—"}
          </td>
          <td className={cn("px-2 py-2 text-right tabular-nums font-semibold text-slate-900", className)}>
            {b.hasDeliveryEstimate ? formatCurrency(b.estimatedTotal) : "—"}
          </td>
        </>
      ) : null}
    </>
  );
}

export function OrderAmountListStack({ order, formatCurrency = formatOrderInr, className = "" }) {
  const b = useBreakdown(order);
  if (!b.hasDeliveryEstimate) {
    return (
      <span className={cn("font-semibold tabular-nums", className)}>
        {formatCurrency(b.merchandiseSubtotal)}
      </span>
    );
  }
  return (
    <div className={cn("space-y-0.5 text-right tabular-nums", className)}>
      <p className="text-slate-900">
        <span className="text-[10px] font-normal text-slate-500">Amount </span>
        {formatCurrency(b.merchandiseSubtotal)}
      </p>
      <p className="text-slate-700">
        <span className="text-[10px] font-normal text-slate-500">Delivery est. </span>
        {formatCurrency(b.deliveryChargeAmount)}
      </p>
      <p className="font-semibold text-slate-900">
        <span className="text-[10px] font-normal text-slate-500">Est. total </span>
        {formatCurrency(b.estimatedTotal)}
      </p>
    </div>
  );
}

export function OrderAmountDetailBreakdown({
  order,
  formatCurrency = formatOrderInr,
  showPlanningNote = true,
  className = "",
}) {
  const b = useBreakdown(order);
  return (
    <section className={cn("space-y-2", className)}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Order Amounts
      </h3>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
        <dt className="text-slate-500">Merchandise subtotal</dt>
        <dd className="text-right tabular-nums text-slate-900">
          {formatCurrency(b.merchandiseSubtotal)}
        </dd>
        {b.hasDeliveryEstimate ? (
          <>
            <dt className="text-slate-500">Delivery estimate</dt>
            <dd className="text-right tabular-nums text-slate-900">
              {formatCurrency(b.deliveryChargeAmount)}
            </dd>
            <dt className="text-slate-500 font-medium">Estimated total</dt>
            <dd className="text-right tabular-nums font-semibold text-slate-900">
              {formatCurrency(b.estimatedTotal)}
            </dd>
          </>
        ) : null}
      </dl>
      {showPlanningNote && b.hasDeliveryEstimate ? (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] leading-relaxed text-slate-600">
          {DELIVERY_CHARGE_PLANNING_NOTE}
        </p>
      ) : null}
    </section>
  );
}

export function OrderAmountLabBreakdown({
  order,
  formatCurrency = formatOrderInr,
  compact = false,
  className = "",
}) {
  const b = useBreakdown(order);
  if (!b.hasDeliveryEstimate) {
    return (
      <div className={cn("text-right tabular-nums font-semibold", className)}>
        {formatCurrency(b.merchandiseSubtotal)}
      </div>
    );
  }
  return (
    <div className={cn("space-y-0.5 text-right tabular-nums", className)}>
      <p className={compact ? "text-[11px] text-slate-700" : "text-xs text-slate-700"}>
        <span className="text-slate-500">Order amount </span>
        {formatCurrency(b.merchandiseSubtotal)}
      </p>
      <p className={compact ? "text-[11px] text-slate-700" : "text-xs text-slate-700"}>
        <span className="text-slate-500">Delivery est. </span>
        {formatCurrency(b.deliveryChargeAmount)}
      </p>
      <p className={compact ? "text-[11px] font-semibold text-slate-900" : "text-xs font-semibold text-slate-900"}>
        <span className="font-normal text-slate-500">Est. total </span>
        {formatCurrency(b.estimatedTotal)}
      </p>
      <p className="text-[10px] leading-snug text-slate-500">
        Invoice may reflect merchandise only until delivery billing is enabled.
      </p>
    </div>
  );
}

export function OperationalDeliveryQuoteLabel({ className = "" }) {
  return (
    <p className={cn("text-[10px] font-medium text-slate-500", className)}>
      {OPERATIONAL_DELIVERY_QUOTE_LABEL}
    </p>
  );
}
