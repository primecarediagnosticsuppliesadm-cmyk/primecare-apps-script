import React from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ux";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import { Bell } from "lucide-react";

const CATEGORY_LABEL = {
  info: "Information",
  warning: "Warning",
  critical: "Critical",
};

export default function PeopleOpsNotificationsPanel({ notifications = [], onOpenNotification }) {
  const active = notifications.filter((row) => !row.disabled);
  return (
    <PeopleOpsSectionCard title="Notifications" subtitle="Workforce and payroll signals for this cycle" icon={Bell}>
      {active.length ? (
        <ul className="space-y-2">
          {active.map((item) => (
            <li key={item.id} className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{item.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
                </div>
                <StatusBadge
                  variant={item.category === "critical" ? "danger" : item.category === "warning" ? "warning" : "info"}
                  label={CATEGORY_LABEL[item.category] || "Info"}
                />
              </div>
              {item.route ? (
                <Button type="button" size="sm" variant="link" className="mt-2 h-auto px-0" onClick={() => onOpenNotification?.(item)}>
                  View
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No notifications right now.</p>
      )}
    </PeopleOpsSectionCard>
  );
}
