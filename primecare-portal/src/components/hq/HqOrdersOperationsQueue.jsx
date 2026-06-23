import React from "react";
import { cn } from "@/lib/utils";
import { Package, CreditCard, AlertCircle, CheckCircle2 } from "lucide-react";
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
 */
export default function HqOrdersOperationsQueue({
  orders = [],
  kpis = {},
  activeQueueKey = "",
  onSelectQueue,
  loading = false,
}) {
  const queue = buildOrdersOperationsQueue(orders, kpis);

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        Click a queue bucket to filter and highlight matching orders.
      </p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {queue.map((item) => {
          const Icon = QUEUE_ICONS[item.id] || Package;
          const isActive = activeQueueKey === item.id;
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
