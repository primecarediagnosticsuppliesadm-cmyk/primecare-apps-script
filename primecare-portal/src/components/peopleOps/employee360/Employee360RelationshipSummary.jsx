import React from "react";
import { cn } from "@/lib/utils";

function Row({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-sm text-foreground">{value ?? "—"}</p>
    </div>
  );
}

export default function Employee360RelationshipSummary({ relationship, className }) {
  if (!relationship) return null;

  return (
    <section className={cn("rounded-xl border border-border bg-card p-4", className)} data-testid="employee360-relationship">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Relationship summary</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Row label="Manager" value={relationship.manager} />
        <Row label="Direct reports" value={relationship.directReports} />
        <Row label="Territory" value={relationship.territory} />
        <Row label="Labs" value={relationship.labs} />
        <Row label="Compensation" value={relationship.compensation} />
        <Row label="Payroll" value={relationship.payroll} />
        <Row label="Ownership" value={relationship.ownership} />
      </div>
    </section>
  );
}
