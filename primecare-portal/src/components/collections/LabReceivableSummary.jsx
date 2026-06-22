import { StatusBadge } from "@/components/ux";
import { collectionRiskToVariant, paymentStatusToVariant } from "@/utils/statusTokens.js";
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

export default function LabReceivableSummary({
  collection,
  lastPaymentDate = "",
  paymentStatusLabel = "Pending",
  openOrdersCount = null,
  className,
}) {
  const outstanding = Number(collection?.outstandingAmount || 0);
  const totalPaid = Number(collection?.totalPaid || 0);
  const ordersLabel =
    openOrdersCount === null || openOrdersCount === undefined
      ? "—"
      : String(openOrdersCount);

  return (
    <section
      className={cn(
        "grid gap-2 rounded-lg border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-6",
        className
      )}
    >
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Outstanding
        </p>
        <p className="text-base font-bold tabular-nums">{formatMoney(outstanding)}</p>
      </div>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Total paid
        </p>
        <p className="text-base font-bold tabular-nums">{formatMoney(totalPaid)}</p>
      </div>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Last payment
        </p>
        <p className="text-sm font-semibold">{formatShortDate(lastPaymentDate)}</p>
      </div>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Open orders
        </p>
        <p className="text-sm font-semibold tabular-nums">{ordersLabel}</p>
      </div>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Risk</p>
        <StatusBadge variant={collectionRiskToVariant(collection?.riskStatus)} compact>
          {collection?.riskStatus || "Low"}
        </StatusBadge>
      </div>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Status
        </p>
        <StatusBadge variant={paymentStatusToVariant(paymentStatusLabel)} compact>
          {paymentStatusLabel}
        </StatusBadge>
      </div>
    </section>
  );
}
