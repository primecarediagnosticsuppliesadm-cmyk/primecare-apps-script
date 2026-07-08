import React from "react";
import { cn } from "@/lib/utils";

export default function FounderModuleNav({ modules, activeModuleId, onSelect }) {
  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b border-border pb-0 scrollbar-thin"
      aria-label="Founder OS modules"
    >
      {modules.map((module) => {
        const active = module.id === activeModuleId;
        return (
          <button
            key={module.id}
            type="button"
            onClick={() => onSelect?.(module.id)}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            aria-current={active ? "page" : undefined}
          >
            {module.label}
          </button>
        );
      })}
    </nav>
  );
}
