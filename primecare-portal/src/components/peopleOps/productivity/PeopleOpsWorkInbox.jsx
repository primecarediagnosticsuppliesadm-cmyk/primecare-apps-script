import React, { useMemo } from "react";
import { Inbox } from "lucide-react";
import { StatusBadge } from "@/components/ux";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import { cn } from "@/lib/utils";

/**
 * RC3 — Unified work inbox (approvals + notifications).
 */
export default function PeopleOpsWorkInbox({ approvalItems = [], notifications = [], onOpenItem }) {
  const items = useMemo(() => {
    const approvals = (approvalItems || []).map((row) => ({
      ...row,
      kind: "approval",
      sortAt: row.createdAt || row.id,
    }));
    const alerts = (notifications || [])
      .filter((row) => !row.disabled)
      .map((row) => ({
        ...row,
        kind: "notification",
        sortAt: row.at || row.id,
      }));
    return [...approvals, ...alerts].slice(0, 12);
  }, [approvalItems, notifications]);

  return (
    <PeopleOpsSectionCard
      title="Work Inbox"
      subtitle="Approvals and operational signals requiring attention"
      icon={Inbox}
      rightAction={
        items.length ? <StatusBadge variant="warning" label={String(items.length)} /> : <StatusBadge variant="success" label="Clear" />
      }
    >
      {items.length ? (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-start justify-between gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pc-brand-primary)]"
                )}
                onClick={() => onOpenItem?.(item.route, item)}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.title}</p>
                  <p className="text-[11px] text-muted-foreground">{item.subtitle || item.reason}</p>
                </div>
                <StatusBadge variant={item.kind === "approval" ? "warning" : "info"} label={item.kind === "approval" ? "Approval" : "Alert"} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Inbox clear — no approvals or alerts for the current context.</p>
      )}
    </PeopleOpsSectionCard>
  );
}
