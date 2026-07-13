import React from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ux";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import { Clock3 } from "lucide-react";

export default function PeopleOpsRecentlyViewed({ items = [], onOpenItem }) {
  return (
    <PeopleOpsSectionCard title="Recently Viewed" subtitle="This browser session" icon={Clock3}>
      {items.length ? (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id}>
              <Button type="button" variant="ghost" className="h-auto w-full justify-start px-2 py-2 text-left" onClick={() => onOpenItem?.(item)}>
                <span className="block truncate font-medium">{item.label}</span>
                {item.meta ? <span className="block truncate text-xs text-muted-foreground">{item.meta}</span> : null}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No recently viewed items"
          description="Open employees, plans, payroll periods, or reports to build your session history."
          className="py-6"
        />
      )}
    </PeopleOpsSectionCard>
  );
}
