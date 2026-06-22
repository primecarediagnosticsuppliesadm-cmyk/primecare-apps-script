import { Button } from "@/components/ui/button";
import CollectionHealthIndicator from "@/components/collections/CollectionHealthIndicator.jsx";
import { cn } from "@/lib/utils";
import { IndianRupee } from "lucide-react";

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `₹${n.toLocaleString("en-IN")}`;
}

export default function CollectionsAttentionQueue({
  queue = [],
  onRecordPayment,
  onViewDetails,
  className,
}) {
  if (!queue.length) return null;

  return (
    <section className={cn("space-y-2", className)} aria-label="Needs attention">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-700">
          Needs attention
        </h2>
        <span className="text-[10px] text-muted-foreground">{queue.length} prioritized</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {queue.map((entry) => (
          <article
            key={entry.labId}
            className="min-w-[240px] max-w-[280px] shrink-0 rounded-lg border border-border bg-card p-2.5 shadow-sm"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <CollectionHealthIndicator tier={entry.healthTier} compact />
              <span className="text-right text-[10px] text-muted-foreground">
                {entry.lastPaymentAge}
              </span>
            </div>
            <h3 className="truncate text-sm font-semibold text-slate-900">{entry.labName}</h3>
            <p className="mt-0.5 text-base font-bold tabular-nums text-slate-900">
              {formatMoney(entry.outstanding)}
            </p>
            <p className="mt-1 text-[11px] text-slate-600">
              <span className="font-medium">{entry.reason.headline}</span>
              {entry.reason.detail ? ` · ${entry.reason.detail}` : ""}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                className="h-8 flex-1 rounded-md px-2 text-[11px] font-semibold"
                onClick={() => onRecordPayment?.(entry.labId)}
              >
                <IndianRupee className="mr-1 h-3 w-3" />
                Record Payment
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-md px-2 text-[11px]"
                onClick={() => onViewDetails?.(entry.labId)}
              >
                View Details
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
