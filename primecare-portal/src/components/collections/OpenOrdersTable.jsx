import { normalizeOrderStatusLabel } from "@/orders/ordersMonitorEngine.js";
import {
  UNALLOCATED_AR_REF_ID,
  computeUnallocatedArAmount,
  orderPaymentDisplayLabel,
  sumOpenOrderAmounts,
} from "@/collections/collectionsOpenOrders.js";
import { cn } from "@/lib/utils";

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `₹${n.toLocaleString("en-IN")}`;
}

function formatShortDate(value) {
  if (!value) return "—";
  const s = String(value).slice(0, 10);
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function OrderMobileCard({ order, selectable, selected, onToggleOrder }) {
  const orderId = String(order.orderId || "");
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {selectable ? (
            <label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                checked={selected}
                onChange={() => onToggleOrder?.(orderId)}
                aria-label={`Reference order ${orderId}`}
              />
              Reference this order
            </label>
          ) : null}
          <p className="font-mono text-sm font-semibold text-slate-900">{orderId || "—"}</p>
          <p className="mt-0.5 text-xs text-slate-600">
            {formatShortDate(order.orderDate || order.createdAt)}
          </p>
        </div>
        <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
          {formatMoney(order.orderTotal)}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <span className="rounded bg-muted px-2 py-0.5 text-slate-700">
          {normalizeOrderStatusLabel(order.orderStatus)}
        </span>
        <span className="rounded bg-muted px-2 py-0.5 text-slate-700">
          {orderPaymentDisplayLabel(order)}
        </span>
      </div>
    </div>
  );
}

export default function OpenOrdersTable({
  orders = [],
  outstandingAmount = 0,
  loading = false,
  selectable = false,
  selectedOrderIds = [],
  onToggleOrder,
  className,
}) {
  const openSum = sumOpenOrderAmounts(orders);
  const outstanding = Number(outstandingAmount || 0);
  const unallocatedAmount = computeUnallocatedArAmount(outstanding, orders);
  const showUnallocatedRow = unallocatedAmount > 0.01;
  const unallocatedSelected = selectedOrderIds.includes(UNALLOCATED_AR_REF_ID);
  const hasOrderRows = orders.length > 0;
  const hasAnyRows = hasOrderRows || showUnallocatedRow;

  if (loading) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>Loading open orders…</p>
    );
  }

  if (!hasAnyRows) {
    return (
      <div
        className={cn(
          "rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground",
          className
        )}
      >
        No fulfilled payment-pending orders found for this lab.
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-card xl:block">
        <table className="w-full min-w-[520px] text-xs">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {selectable ? <th className="w-8 px-2 py-2" /> : null}
              <th className="px-2 py-2">Order ID</th>
              <th className="px-2 py-2">Date</th>
              <th className="px-2 py-2 text-right">Amount</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Payment</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => {
              const orderId = String(order.orderId || "");
              const selected = selectedOrderIds.includes(orderId);
              return (
                <tr key={orderId} className="border-b border-border/60">
                  {selectable ? (
                    <td className="px-2 py-2 align-middle">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-input"
                        checked={selected}
                        onChange={() => onToggleOrder?.(orderId)}
                        aria-label={`Reference order ${orderId}`}
                      />
                    </td>
                  ) : null}
                  <td className="px-2 py-2 font-mono font-medium text-slate-900">{orderId || "—"}</td>
                  <td className="px-2 py-2 text-slate-600">
                    {formatShortDate(order.orderDate || order.createdAt)}
                  </td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">
                    {formatMoney(order.orderTotal)}
                  </td>
                  <td className="px-2 py-2 text-slate-700">
                    {normalizeOrderStatusLabel(order.orderStatus)}
                  </td>
                  <td className="px-2 py-2 text-slate-700">{orderPaymentDisplayLabel(order)}</td>
                </tr>
              );
            })}
            {showUnallocatedRow ? (
              <tr
                key={UNALLOCATED_AR_REF_ID}
                className="border-b border-border/60 bg-amber-50/40 last:border-b-0"
              >
                {selectable ? (
                  <td className="px-2 py-2 align-middle">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-input"
                      checked={unallocatedSelected}
                      onChange={() => onToggleOrder?.(UNALLOCATED_AR_REF_ID)}
                      aria-label="Reference unallocated AR balance"
                    />
                  </td>
                ) : null}
                <td className="px-2 py-2 text-slate-900">
                  <p className="font-medium">Unallocated AR Balance</p>
                  <p className="mt-0.5 text-[10px] font-normal text-muted-foreground">
                    Balance exists in lab AR but is not tied to an open fulfilled order.
                  </p>
                </td>
                <td className="px-2 py-2 text-slate-600">—</td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums text-amber-900">
                  {formatMoney(unallocatedAmount)}
                </td>
                <td className="px-2 py-2 text-slate-700">Account balance</td>
                <td className="px-2 py-2 text-slate-700">Pending</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 xl:hidden">
        {orders.map((order) => {
          const orderId = String(order.orderId || "");
          return (
            <OrderMobileCard
              key={orderId}
              order={order}
              selectable={selectable}
              selected={selectedOrderIds.includes(orderId)}
              onToggleOrder={onToggleOrder}
            />
          );
        })}
        {showUnallocatedRow ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3">
            {selectable ? (
              <label className="mb-2 flex items-center gap-2 text-xs text-amber-900">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-input"
                  checked={unallocatedSelected}
                  onChange={() => onToggleOrder?.(UNALLOCATED_AR_REF_ID)}
                  aria-label="Reference unallocated AR balance"
                />
                Reference unallocated balance
              </label>
            ) : null}
            <p className="text-sm font-medium text-amber-950">Unallocated AR Balance</p>
            <p className="mt-1 text-xs text-amber-900">
              Balance exists in lab AR but is not tied to an open fulfilled order.
            </p>
            <p className="mt-2 text-sm font-semibold tabular-nums text-amber-900">
              {formatMoney(unallocatedAmount)}
            </p>
          </div>
        ) : null}
      </div>

      {showUnallocatedRow ? (
        <p className="text-[11px] text-amber-800">
          Open orders total {formatMoney(openSum)}; {formatMoney(unallocatedAmount)} is unallocated AR
          balance (reference only).
        </p>
      ) : openSum > 0 && outstanding > 0 ? (
        <p className="text-[11px] text-emerald-800">
          Open orders total {formatMoney(openSum)} matches outstanding balance.
        </p>
      ) : null}
    </div>
  );
}
