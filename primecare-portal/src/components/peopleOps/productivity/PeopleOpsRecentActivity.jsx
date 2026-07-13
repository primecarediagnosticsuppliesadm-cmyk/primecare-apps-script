import React from "react";
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import PeopleOpsPageHelp from "@/components/peopleOps/PeopleOpsPageHelp.jsx";

/**
 * RC6 — Business Activity Today (no internal event names).
 */
export default function PeopleOpsRecentActivity({ items = [], onOpenItem }) {
  return (
    <PeopleOpsSectionCard
      title="Business Activity Today"
      subtitle="What changed in people and pay"
      icon={Activity}
      rightAction={<PeopleOpsPageHelp sectionId="businessActivity" compact />}
    >
      {items.length ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{item.title || item.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {item.atLabel}
                  {item.actorRole ? ` · ${item.actorRole}` : ""}
                </p>
              </div>
              {item.route && onOpenItem ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 text-[10px]"
                  onClick={() => onOpenItem(item.route, item)}
                >
                  {item.viewLabel || "View →"}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-md border border-dashed border-border bg-muted/10 px-3 py-3 text-sm">
          <p className="font-medium text-foreground">No business activity yet today.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Activity appears after payroll previews, plan assignments, approvals, or exports.
          </p>
        </div>
      )}
    </PeopleOpsSectionCard>
  );
}
