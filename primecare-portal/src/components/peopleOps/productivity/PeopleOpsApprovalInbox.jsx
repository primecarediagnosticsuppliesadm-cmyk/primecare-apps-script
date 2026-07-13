import React from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ux";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import { Inbox } from "lucide-react";

export default function PeopleOpsApprovalInbox({ items = [], onOpenItem }) {
  return (
    <PeopleOpsSectionCard title="Approval Inbox" subtitle="Items waiting for executive or HR action" icon={Inbox}>
      {items.length ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border border-border bg-background px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{item.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
                </div>
                <StatusBadge variant={item.tone || "neutral"} label={item.tone || "open"} />
              </div>
              <Button type="button" size="sm" variant="link" className="mt-2 h-auto px-0" onClick={() => onOpenItem?.(item)}>
                Open
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Your approval inbox is clear. No payroll or compensation items need action.</p>
      )}
    </PeopleOpsSectionCard>
  );
}
