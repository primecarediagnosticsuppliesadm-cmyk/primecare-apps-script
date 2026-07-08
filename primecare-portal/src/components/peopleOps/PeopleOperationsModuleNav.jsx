import React from "react";
import { Button } from "@/components/ui/button";
import { PEOPLE_OPS_MODULES, resolvePeopleOpsRoute } from "@/peopleOps/peopleOpsNavigation.js";
import { cn } from "@/lib/utils";

export default function PeopleOperationsModuleNav({
  moduleId,
  screenId,
  onNavigate,
  className,
}) {
  const route = resolvePeopleOpsRoute(moduleId, screenId);
  const activeModule = PEOPLE_OPS_MODULES.find((row) => row.id === route.moduleId) || PEOPLE_OPS_MODULES[0];
  const showSubNav = activeModule.screens.length > 1;

  return (
    <nav
      className={cn("sticky top-0 z-30 space-y-3 bg-background/95 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80", className)}
      aria-label="People Operations modules"
    >
      <div
        className="flex flex-wrap gap-2 rounded-xl border border-border bg-card p-2 shadow-sm"
        role="tablist"
        aria-label="Primary modules"
      >
        {PEOPLE_OPS_MODULES.map((module) => (
          <Button
            key={module.id}
            type="button"
            size="sm"
            role="tab"
            aria-selected={route.moduleId === module.id}
            variant={route.moduleId === module.id ? "default" : "ghost"}
            className="h-9 rounded-lg"
            onClick={() =>
              onNavigate?.({
                moduleId: module.id,
                screenId: module.screens[0].id,
              })
            }
          >
            {module.label}
          </Button>
        ))}
      </div>
      {showSubNav ? (
        <div className="flex flex-wrap gap-2 border-b border-border pb-2" role="tablist" aria-label={`${activeModule.label} screens`}>
          {activeModule.screens.map((screen) => (
            <Button
              key={screen.id}
              type="button"
              size="sm"
              role="tab"
              aria-selected={route.screenId === screen.id}
              variant={route.screenId === screen.id ? "secondary" : "ghost"}
              className="h-8 rounded-lg text-xs"
              onClick={() =>
                onNavigate?.({
                  moduleId: activeModule.id,
                  screenId: screen.id,
                })
              }
            >
              {screen.label}
            </Button>
          ))}
        </div>
      ) : null}
    </nav>
  );
}
