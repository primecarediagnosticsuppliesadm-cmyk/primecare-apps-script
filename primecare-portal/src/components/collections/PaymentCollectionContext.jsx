import OpenOrdersTable from "@/components/collections/OpenOrdersTable.jsx";
import { cn } from "@/lib/utils";

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `₹${n.toLocaleString("en-IN")}`;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v) {
  return String(v ?? "").trim();
}

/** Preview payment for After Entry: entered amount wins; else selected ref total. */
function previewPaymentAmount(amountCollected, selectedRefAmount) {
  if (str(amountCollected) !== "") {
    return num(amountCollected);
  }
  if (selectedRefAmount > 0) {
    return selectedRefAmount;
  }
  return 0;
}

export default function PaymentCollectionContext({
  outstandingAmount = 0,
  openOrders = [],
  ordersLoading = false,
  amountCollected = "",
  selectedOrderIds = [],
  onToggleOrder,
  className,
}) {
  const outstanding = num(outstandingAmount);
  const selectedSum = (openOrders || [])
    .filter((o) => selectedOrderIds.includes(String(o.orderId || "")))
    .reduce((s, o) => s + num(o.orderTotal), 0);
  const previewAmount = previewPaymentAmount(amountCollected, selectedSum);
  const remaining = Math.max(0, outstanding - previewAmount);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="rounded-lg border border-[var(--pc-brand-primary)]/20 bg-[var(--pc-brand-primary)]/5 px-3 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Collecting against
        </p>
        <p className="text-lg font-bold tabular-nums text-slate-900">{formatMoney(outstanding)}</p>
        <p className="text-[11px] text-muted-foreground">
          Payment reduces lab outstanding (account-level). Order checkboxes are reference only.
        </p>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-slate-700">Open orders (reference)</p>
        <OpenOrdersTable
          orders={openOrders}
          outstandingAmount={outstanding}
          loading={ordersLoading}
          selectable
          selectedOrderIds={selectedOrderIds}
          onToggleOrder={onToggleOrder}
        />
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-muted/20 px-2.5 py-2 text-center text-[11px]">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Outstanding</p>
          <p className="font-semibold tabular-nums">{formatMoney(outstanding)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Selected ref.</p>
          <p className="font-semibold tabular-nums">
            {selectedOrderIds.length ? formatMoney(selectedSum) : "—"}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">After entry</p>
          <p className="font-semibold tabular-nums">{formatMoney(remaining)}</p>
        </div>
      </div>
    </div>
  );
}
