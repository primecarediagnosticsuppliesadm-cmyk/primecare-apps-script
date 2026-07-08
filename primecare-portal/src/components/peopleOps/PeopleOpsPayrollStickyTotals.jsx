import React from "react";
import { cn } from "@/lib/utils";
import { enterpriseLayout } from "@/styles/enterpriseLayout.js";

/**
 * RC3 — Sticky payroll run totals bar (presentation only).
 */
export default function PeopleOpsPayrollStickyTotals({ summary }) {
  if (!summary) return null;

  const items = [
    { label: "Employees", value: summary.employeesLabel || String(summary.employees ?? "—") },
    { label: "Gross", value: summary.grossPayrollLabel },
    { label: "Commission", value: summary.commissionLabel },
    { label: "Adjustments", value: summary.adjustmentsLabel },
    { label: "Net Payroll", value: summary.netPayrollLabel },
  ];

  return (
    <div
      className={cn(enterpriseLayout.stickyToolbar, "top-[3.25rem] grid gap-2 sm:grid-cols-3 xl:grid-cols-5")}
      role="region"
      aria-label="Payroll run totals"
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0 rounded-md border border-border/60 bg-background/90 px-2 py-1.5">
          <p className={enterpriseLayout.fieldLabel}>{item.label}</p>
          <p className="truncate text-sm font-semibold tabular-nums">{item.value ?? "—"}</p>
        </div>
      ))}
    </div>
  );
}
