import React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { typography } from "@/styles/designTokens";

export default function PeopleOpsBreadcrumbs({ items = [], onNavigate, className }) {
  if (!items.length) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn("flex flex-wrap items-center gap-1", className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const canNavigate = Boolean(!isLast && item.route && onNavigate);
        return (
          <React.Fragment key={`${item.label}-${index}`}>
            {index > 0 ? (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
            ) : null}
            {canNavigate ? (
              <button
                type="button"
                onClick={() => onNavigate(item.route)}
                className={cn(
                  typography.caption,
                  "rounded px-0.5 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pc-brand-primary)]"
                )}
              >
                {item.label}
              </button>
            ) : isLast ? (
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
