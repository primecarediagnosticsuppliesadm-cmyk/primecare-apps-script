import React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { typography } from "@/styles/designTokens";

export default function PeopleOpsBreadcrumbs({ items = [], className }) {
  if (!items.length) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn("flex flex-wrap items-center gap-1", className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <React.Fragment key={`${item.label}-${index}`}>
            {index > 0 ? (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            ) : null}
            {isLast ? (
              <span className={cn(typography.caption, "font-medium text-foreground")} aria-current="page">
                {item.label}
              </span>
            ) : (
              <span className={cn(typography.caption, "text-muted-foreground")}>{item.label}</span>
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
