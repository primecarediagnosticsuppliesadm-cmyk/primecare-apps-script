import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ux";
import CollectionHealthIndicator from "@/components/collections/CollectionHealthIndicator.jsx";
import {
  HEALTH_TIER_META,
  deriveCollectionHealthTier,
  formatArAgeBucket,
} from "@/collections/collectionsCockpitMetrics.js";
import { collectionRiskToVariant, paymentStatusToVariant } from "@/utils/statusTokens";
import { labIdKey } from "@/utils/labId.js";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, IndianRupee } from "lucide-react";

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
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const GRID_COLUMNS =
  "grid-cols-[minmax(5.5rem,6.5rem)_minmax(8rem,1.4fr)_minmax(4.5rem,5.5rem)_minmax(4.5rem,5rem)_minmax(4.5rem,5.5rem)_minmax(3.5rem,4rem)_minmax(4rem,4.5rem)_minmax(4.5rem,5rem)_minmax(3rem,3.5rem)_minmax(9rem,11rem)]";

export default function CollectionsReceivablesGrid({
  items = [],
  expandedLabId = "",
  onToggleExpand,
  lastPaymentByLabId = {},
  labOrdersByLabId = {},
  getPaymentStatusLabel,
  onRecordPayment,
  onViewDetails,
  onAddFollowUp,
  renderExpandedPanel,
  className,
}) {
  const [focusIndex, setFocusIndex] = useState(0);
  const rowRefs = useRef([]);

  useEffect(() => {
    rowRefs.current = rowRefs.current.slice(0, items.length);
  }, [items.length]);

  const handleRowKeyDown = useCallback(
    (event, index, labId) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        const next = Math.min(index + 1, items.length - 1);
        setFocusIndex(next);
        rowRefs.current[next]?.focus();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        const prev = Math.max(index - 1, 0);
        setFocusIndex(prev);
        rowRefs.current[prev]?.focus();
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onToggleExpand?.(labId);
      }
    },
    [items.length, onToggleExpand]
  );

  if (!items.length) return null;

  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-card shadow-sm", className)}>
      <div
        className={cn(
          "sticky top-0 z-10 hidden border-b border-border bg-muted/50 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground lg:grid",
          GRID_COLUMNS
        )}
        role="row"
      >
        <div className="px-2 py-2" role="columnheader">
          Health
        </div>
        <div className="px-2 py-2" role="columnheader">
          Lab
        </div>
        <div className="px-2 py-2 text-right" role="columnheader">
          Outstanding
        </div>
        <div className="px-2 py-2" role="columnheader">
          Age
        </div>
        <div className="px-2 py-2" role="columnheader">
          Last payment
        </div>
        <div className="px-2 py-2" role="columnheader">
          Risk
        </div>
        <div className="px-2 py-2" role="columnheader">
          Status
        </div>
        <div className="px-2 py-2" role="columnheader">
          Next F/U
        </div>
        <div className="px-2 py-2 text-center" role="columnheader">
          Orders
        </div>
        <div className="px-2 py-2" role="columnheader">
          Actions
        </div>
      </div>

      <div role="rowgroup">
        {items.map((item, index) => {
          const key = labIdKey(item.labId);
          const expanded = expandedLabId === key;
          const lastPaymentDate = lastPaymentByLabId[key] || "";
          const healthTier = deriveCollectionHealthTier(item, lastPaymentDate);
          const tierMeta = HEALTH_TIER_META[healthTier];
          const paymentLabel = getPaymentStatusLabel?.(item) || "Pending";
          const openOrders = labOrdersByLabId[key];
          const openOrdersCount =
            Array.isArray(openOrders) ? String(openOrders.length) : "—";

          return (
            <div key={key} className="border-b border-border/60 last:border-b-0">
              <div
                ref={(el) => {
                  rowRefs.current[index] = el;
                }}
                role="row"
                tabIndex={focusIndex === index ? 0 : -1}
                aria-expanded={expanded}
                className={cn(
                  "border-l-4 bg-card transition-colors hover:bg-muted/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pc-brand-primary)]/40",
                  tierMeta.rowClass,
                  expanded && "bg-muted/25"
                )}
                onKeyDown={(e) => handleRowKeyDown(e, index, item.labId)}
              >
                {/* Desktop grid row */}
                <div className={cn("hidden lg:grid lg:items-center", GRID_COLUMNS)}>
                  <div className="px-2 py-1.5" role="gridcell">
                    <CollectionHealthIndicator tier={healthTier} compact />
                  </div>
                  <div className="min-w-0 px-2 py-1.5" role="gridcell">
                    <button
                      type="button"
                      className="flex w-full min-w-0 items-center gap-1 text-left"
                      onClick={() => onToggleExpand?.(item.labId)}
                      aria-label={`${expanded ? "Collapse" : "Expand"} ${item.labName || item.labId}`}
                    >
                      {expanded ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate text-xs font-semibold text-slate-900">
                        {item.labName || item.labId}
                      </span>
                    </button>
                    {item.area ? (
                      <p className="truncate pl-5 text-[10px] text-muted-foreground">{item.area}</p>
                    ) : null}
                  </div>
                  <div
                    className="px-2 py-1.5 text-right text-xs font-bold tabular-nums"
                    role="gridcell"
                  >
                    {formatMoney(item.outstandingAmount)}
                  </div>
                  <div className="px-2 py-1.5 text-[11px] text-slate-700" role="gridcell">
                    {formatArAgeBucket(item, lastPaymentDate)}
                  </div>
                  <div className="px-2 py-1.5 text-[11px] text-slate-700" role="gridcell">
                    {formatShortDate(lastPaymentDate)}
                  </div>
                  <div className="px-2 py-1.5" role="gridcell">
                    <StatusBadge variant={collectionRiskToVariant(item.riskStatus)} compact>
                      {item.riskStatus || "Low"}
                    </StatusBadge>
                  </div>
                  <div className="px-2 py-1.5" role="gridcell">
                    <StatusBadge variant={paymentStatusToVariant(paymentLabel)} compact>
                      {paymentLabel}
                    </StatusBadge>
                  </div>
                  <div className="px-2 py-1.5 text-[11px] text-slate-700" role="gridcell">
                    {formatShortDate(item.nextFollowUp)}
                  </div>
                  <div
                    className="px-2 py-1.5 text-center text-[11px] font-medium tabular-nums"
                    role="gridcell"
                  >
                    {openOrdersCount}
                  </div>
                  <div className="flex flex-wrap gap-1 px-2 py-1" role="gridcell">
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 rounded-md px-2 text-[10px] font-semibold"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRecordPayment?.(item.labId);
                      }}
                    >
                      <IndianRupee className="mr-0.5 h-3 w-3" />
                      Pay
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-md px-2 text-[10px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewDetails?.(item.labId);
                      }}
                    >
                      Details
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 rounded-md px-1.5 text-[10px] text-muted-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddFollowUp?.(item.labId);
                      }}
                    >
                      F/U
                    </Button>
                  </div>
                </div>

                {/* Mobile stacked row */}
                <div className="space-y-2 p-2.5 lg:hidden">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <CollectionHealthIndicator tier={healthTier} compact />
                        <button
                          type="button"
                          className="truncate text-left text-sm font-semibold text-slate-900"
                          onClick={() => onToggleExpand?.(item.labId)}
                        >
                          {item.labName || item.labId}
                        </button>
                      </div>
                      <p className="mt-1 text-lg font-bold tabular-nums">
                        {formatMoney(item.outstandingAmount)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Age {formatArAgeBucket(item, lastPaymentDate)} · Last pay{" "}
                        {formatShortDate(lastPaymentDate)}
                      </p>
                    </div>
                    <StatusBadge variant={collectionRiskToVariant(item.riskStatus)} compact>
                      {item.riskStatus || "Low"}
                    </StatusBadge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      className="h-9 flex-1 rounded-lg text-xs font-semibold"
                      onClick={() => onRecordPayment?.(item.labId)}
                    >
                      Record Payment
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 rounded-lg text-xs"
                      onClick={() => onViewDetails?.(item.labId)}
                    >
                      Details
                    </Button>
                  </div>
                </div>
              </div>

              {expanded && renderExpandedPanel ? (
                <div className="border-t border-border bg-slate-50/80">{renderExpandedPanel(item)}</div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
