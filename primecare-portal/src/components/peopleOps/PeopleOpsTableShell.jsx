import React from "react";
import { cn } from "@/lib/utils";

/**
 * Consistent table chrome for People Operations data grids.
 */
export default function PeopleOpsTableShell({ children, className }) {
  return (
    <div className={cn("overflow-x-auto rounded-xl border border-border bg-card shadow-sm", className)}>
      <table className="people-ops-table min-w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function PeopleOpsTableHead({ children }) {
  return (
    <thead className="sticky top-0 z-10 border-b border-border bg-[var(--pc-neutral-bg)] text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </thead>
  );
}

export function PeopleOpsTableBody({ children }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function PeopleOpsTableRow({ children, className, onClick }) {
  return (
    <tr
      className={cn("transition-colors hover:bg-muted/40", onClick && "cursor-pointer", className)}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

export function PeopleOpsTableCell({ children, className, header = false }) {
  const Tag = header ? "th" : "td";
  return (
    <Tag className={cn(header ? "px-2.5 py-2" : "px-2.5 py-1.5 text-xs text-foreground", className)}>
      {children}
    </Tag>
  );
}
