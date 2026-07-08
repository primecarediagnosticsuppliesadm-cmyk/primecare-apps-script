import React from "react";
import { StatusBadge } from "@/components/ux";

const EVENT_VARIANT = {
  assigned: "info",
  changed: "warning",
  transferred: "warning",
  ended: "neutral",
  current: "success",
};

export default function OwnershipTimelinePanel({ events = [], title = "Ownership Timeline" }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="space-y-2">
        {(events || []).length ? (
          events.map((event) => (
            <div key={event.id} className="rounded-lg border border-border bg-card px-3 py-2 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground capitalize">{event.eventType}</p>
                  <p className="text-muted-foreground">
                    {event.primaryAgentName} · Admin {event.adminName}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{event.notes}</p>
                </div>
                <div className="text-right">
                  <StatusBadge variant={EVENT_VARIANT[event.eventType] || "neutral"} label={event.status || event.eventType} />
                  <p className="mt-1 text-[10px] text-muted-foreground">{event.atLabel}</p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">No ownership timeline events recorded.</p>
        )}
      </div>
    </section>
  );
}
