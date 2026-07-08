import React from "react";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import { Activity } from "lucide-react";

export default function PeopleOpsRecentActivity({ items = [] }) {
  return (
    <PeopleOpsSectionCard title="Recent Activity" subtitle="Business events across payroll and compensation" icon={Activity}>
      {items.length ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-foreground">{item.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
              </div>
              <div className="shrink-0 text-right text-xs text-muted-foreground">
                <p>{item.atLabel}</p>
                <p>{item.actorRole}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Activity will appear here after payroll previews, plan changes, or exports.</p>
      )}
    </PeopleOpsSectionCard>
  );
}
