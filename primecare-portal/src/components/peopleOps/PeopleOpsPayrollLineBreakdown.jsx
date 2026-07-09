import React, { useState } from "react";
import { ChevronDown, ChevronRight, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ux";
import { cn } from "@/lib/utils";

const STATUS_VARIANT = {
  draft: "neutral",
  previewed: "info",
  submitted: "warning",
  approved: "info",
  locked: "warning",
  exported: "success",
  paid: "success",
};

function BreakdownRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/60 py-1 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums text-foreground">{value ?? "—"}</span>
    </div>
  );
}

/**
 * RC5 — Expandable employee payroll line with calculation guidance (UI only).
 */
export default function PeopleOpsPayrollLineBreakdown({
  row,
  onViewEmployee,
  defaultOpen = false,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [showHow, setShowHow] = useState(false);

  if (!row) return null;

  return (
    <div className="rounded-lg border border-border bg-background">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pc-brand-primary)]"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-foreground">{row.agentName}</p>
          <p className="truncate text-[10px] text-muted-foreground">
            {row.planCode || "No Compensation Plan"} · Net {row.netPreviewLabel || "—"}
          </p>
        </div>
        <StatusBadge variant={STATUS_VARIANT[row.lifecycleStatus] || "neutral"} label={row.lifecycleStatus || "—"} />
      </button>

      {open ? (
        <div className="space-y-2 border-t border-border px-2.5 py-2 text-xs">
          <div className="grid gap-x-4 gap-y-0 sm:grid-cols-2">
            <BreakdownRow label="Salary" value={row.salaryLabel} />
            <BreakdownRow label="Fuel" value={row.fuelLabel} />
            <BreakdownRow label="Mobile" value={row.mobileLabel} />
            <BreakdownRow label="Commission" value={row.commissionLabel} />
            <BreakdownRow label="Adjustments" value={row.adjustmentsLabel} />
            <BreakdownRow label="Recoveries" value={row.recoveriesLabel} />
            <BreakdownRow label="Bonuses" value={row.bonusesLabel} />
            <BreakdownRow label="Net Payroll" value={row.netPreviewLabel} />
          </div>

          <div className="rounded-md border border-dashed border-border bg-muted/20 px-2 py-1.5">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--pc-brand-primary)]"
              onClick={() => setShowHow((value) => !value)}
            >
              <HelpCircle className="h-3 w-3" aria-hidden />
              How was this calculated?
            </button>
            {showHow ? (
              <ul className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
                <li>
                  <span className="font-medium text-foreground">Salary</span> ← Compensation Plan
                </li>
                <li>
                  <span className="font-medium text-foreground">Commission</span> ← Collections (cash collected)
                </li>
                <li>
                  <span className="font-medium text-foreground">Override path</span> ← Business Ownership
                </li>
                <li>
                  <span className="font-medium text-foreground">Adjustments</span> ← Payroll Review
                </li>
              </ul>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-1">
            <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => onViewEmployee?.(row)}>
              View Employee
            </Button>
            <span className={cn("self-center text-[10px] text-muted-foreground")}>
              Collected cash {row.collectedCashLabel || "—"}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
