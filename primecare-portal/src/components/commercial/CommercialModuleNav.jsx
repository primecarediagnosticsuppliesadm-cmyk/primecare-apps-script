import React from "react";
import { Button } from "@/components/ui/button";
import { COMMERCIAL_MODULES } from "@/commercial/commercialNavigation.js";
import { cn } from "@/lib/utils";

export default function CommercialModuleNav({ moduleId, screenId, onNavigate }) {
  const activeModule = COMMERCIAL_MODULES.find((row) => row.id === moduleId) || COMMERCIAL_MODULES[0];

  return (
    <div className="space-y-2">
      <nav className="sticky top-0 z-20 -mx-1 flex flex-wrap gap-1 rounded-xl border border-border bg-card/95 p-2 shadow-sm backdrop-blur">
        {COMMERCIAL_MODULES.map((module) => (
          <Button
            key={module.id}
            type="button"
            size="sm"
            variant={module.id === moduleId ? "default" : "ghost"}
            className={cn("h-9", module.id === moduleId && "shadow-sm")}
            onClick={() => onNavigate?.({ moduleId: module.id, screenId: module.screens[0]?.id })}
          >
            {module.label}
          </Button>
        ))}
      </nav>
      {activeModule.screens.length > 1 ? (
        <div className="flex flex-wrap gap-1 px-1">
          {activeModule.screens.map((screen) => (
            <Button
              key={screen.id}
              type="button"
              size="sm"
              variant={screen.id === screenId ? "secondary" : "ghost"}
              className="h-8"
              onClick={() => onNavigate?.({ moduleId: activeModule.id, screenId: screen.id })}
            >
              {screen.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
