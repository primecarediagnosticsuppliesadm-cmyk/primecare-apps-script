import React from "react";
import { cn } from "@/lib/utils";
import { Package, CreditCard, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ORDER_QUEUE_KEYS,
  buildOrdersOperationsQueue,
} from "@/orders/ordersOperationsQueueEngine.js";

const QUEUE_ICONS = {
  [ORDER_QUEUE_KEYS.AWAITING_FULFILLMENT]: Package,
  [ORDER_QUEUE_KEYS.PENDING_PAYMENT]: CreditCard,
  [ORDER_QUEUE_KEYS.EXCEPTIONS]: AlertCircle,
  [ORDER_QUEUE_KEYS.RECENTLY_FULFILLED]: CheckCircle2,
};

const SEVERITY_STYLES = {
  attention: "border-amber-200 bg-amber-50/70 hover:border-amber-300",
  monitor: "border-slate-200 bg-slate-50/80 hover:border-slate-300",
  healthy: "border-emerald-200 bg-emerald-50/50 hover:border-emerald-300",
};

/**
 * Action-first order operations queue for HQ Orders Monitor.
 * Start Here uses existing awaiting-fulfillment queue data only — no new prioritization.
 */
export default function HqOrdersOperationsQueue({
  orders = [],
  kpis = {},
  activeQueueKey = "",
  onSelectQueue,
  onReviewNextOrder,
  loading = false,
}) {
  const queue = buildOrdersOperationsQueue(orders, kpis);
  const startHere = queue.find((item) => item.id === ORDER_QUEUE_KEYS.AWAITING_FULFILLMENT);
  const startCount = Number(startHere?.count || 0);
  const nextOrderId = str(startHere?.orderIds?.[0]);

  function handleReviewNext() {
    onSelectQueue?.(ORDER_QUEUE_KEYS.AWAITING_FULFILLMENT);
    if (nextOrderId) onReviewNextOrder?.(nextOrderId);
  }

  return (
    <div className="space-y-2">
      {startHere ? (
        <section
          aria-label="Start here — awaiting fulfillment"
          className="rounded-xl border border-amber-300 bg-amber-50/60 p-3 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                Start here
              </p>
              <p className="mt-0.5 text-sm font-semibold text-amber-950">
                {startCount === 1
                  ? "1 order is awaiting fulfillment."
                  : `${loading ? "—" : startCount} orders are awaiting fulfillment.`}
              </p>
              <p className="mt-1 text-[11px] text-amber-900/80">
                {startHere.description || "Placed or processing — needs pick/pack/ship"}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0 text-xs"
              disabled={loading || startCount === 0 || !nextOrderId}
              onClick={handleReviewNext}
            >
              Review Next Order
            </Button>
          </div>
        </section>
      ) : null}

      <p className="text-xs text-slate-500">Queue buckets filter and highlight matching orders.</p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {queue.map((item) => {
          const Icon = QUEUE_ICONS[item.id] || Package;
          const isActive = activeQueueKey === item.id;
          const isStartBucket = item.id === ORDER_QUEUE_KEYS.AWAITING_FULFILLMENT;
          return (
            <button
              key={item.id}
              type="button"
              disabled={loading}
              onClick={() => onSelectQueue?.(isActive ? "" : item.id)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-left transition",
                SEVERITY_STYLES[item.severity] || SEVERITY_STYLES.monitor,
                isActive && "ring-2 ring-indigo-400 ring-offset-1",
                isStartBucket && !isActive && "border-amber-300",
                loading && "opacity-60"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                  <span className="text-[11px] font-semibold text-slate-800">{item.label}</span>
                </div>
                <span className="text-lg font-bold tabular-nums text-slate-900">
                  {loading ? "—" : item.count}
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-snug text-slate-500">{item.description}</p>
            </button>
          );
        })}
      </div>
      {activeQueueKey ? (
        <p className="text-[11px] text-indigo-700">
          Queue filter active — click the same bucket again to clear.
        </p>
      ) : null}
    </div>
  );
}

function str(v) {
  return String(v ?? "").trim();
}
