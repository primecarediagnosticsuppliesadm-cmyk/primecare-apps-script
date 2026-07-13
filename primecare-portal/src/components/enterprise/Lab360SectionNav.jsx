import React from "react";
import { cn } from "@/lib/utils";

/**
 * In-drawer section navigation for Lab 360 surfaces (RC2).
 */
export default function Lab360SectionNav({ sections = [], activeId, onSelect, className }) {
  if (!sections.length) return null;

  return (
    <nav
      className={cn(
        "sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto rounded-lg border border-border bg-muted/30 p-1",
        className
      )}
      aria-label="Lab 360 sections"
    >
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          onClick={() => onSelect?.(section.id)}
          className={cn(
            "shrink-0 rounded-md px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
            activeId === section.id
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
          )}
        >
          {section.label}
        </button>
      ))}
    </nav>
  );
}
