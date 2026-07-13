import React from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ux";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import { Star } from "lucide-react";

export default function PeopleOpsFavorites({ items = [], onOpenItem }) {
  return (
    <PeopleOpsSectionCard title="Favorites" subtitle="Pinned for fast access" icon={Star}>
      {items.length ? (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.favoriteKey}>
              <Button type="button" variant="ghost" className="h-auto w-full justify-start px-2 py-2 text-left" onClick={() => onOpenItem?.(item)}>
                <span className="block truncate font-medium">{item.label}</span>
                {item.meta ? <span className="block truncate text-xs text-muted-foreground">{item.meta}</span> : null}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No favorites yet"
          description="Pin frequently used employees, plans, payroll periods, or reports from search results."
          className="py-6"
        />
      )}
    </PeopleOpsSectionCard>
  );
}
