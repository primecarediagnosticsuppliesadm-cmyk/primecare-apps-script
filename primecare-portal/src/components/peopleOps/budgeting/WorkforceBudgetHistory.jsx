import React from "react";
import { History } from "lucide-react";
import { EmptyState } from "@/components/ux";
import PeopleOpsModuleFrame from "@/components/peopleOps/PeopleOpsModuleFrame.jsx";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";

function formatWhen(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("en-IN");
}

export default function WorkforceBudgetHistory({ workspace, breadcrumbs = [] }) {
  if (!workspace) return null;
  const entries = workspace.history || [];

  return (
    <PeopleOpsModuleFrame
      title="Budget History"
      description="Read-only session timeline of saved planning scenarios. No payroll or finance writes."
      breadcrumbs={breadcrumbs}
    >
      <PeopleOpsSectionCard title="Planning Timeline" subtitle="Saved scenarios from this browser session" icon={History}>
        {entries.length ? (
          <div className="space-y-3">
            {entries.map((entry) => (
              <article key={entry.id} className="rounded-xl border border-border bg-background px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-foreground">{entry.scenario}</h3>
                    <p className="text-sm text-muted-foreground">{entry.summary}</p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>{formatWhen(entry.createdAt)}</p>
                    <p>{entry.createdBy || "Executive"}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No budget history yet"
            description="Save a scenario from Scenario Planning to build a read-only planning timeline."
          />
        )}
      </PeopleOpsSectionCard>
    </PeopleOpsModuleFrame>
  );
}
