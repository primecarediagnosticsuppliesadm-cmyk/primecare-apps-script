import React from "react";
import { Button } from "@/components/ui/button";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import { Zap } from "lucide-react";

export default function PeopleOpsQuickActions({ actions = [], onAction, busy = false }) {
  const enabled = actions.filter((row) => row.enabled !== false);
  return (
    <PeopleOpsSectionCard title="Quick Actions" subtitle="Context-aware shortcuts for your current payroll cycle" icon={Zap}>
      {enabled.length ? (
        <div className="flex flex-wrap gap-2">
          {enabled.map((action) => (
            <Button
              key={action.id}
              type="button"
              size="sm"
              variant={action.kind === "workflow" ? "default" : "outline"}
              disabled={busy}
              onClick={() => onAction?.(action)}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No quick actions available for your role in the current payroll state.</p>
      )}
    </PeopleOpsSectionCard>
  );
}
