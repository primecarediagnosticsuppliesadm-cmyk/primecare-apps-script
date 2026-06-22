import { buildCollectionActivityTimeline } from "@/collections/collectionsActivityTimeline.js";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatShortDate(value) {
  if (!value) return "—";
  const s = String(value).slice(0, 10);
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function CollectionActivitySummary({
  history = [],
  collectionsNotes = "",
  openOrders = [],
  onViewFullActivity,
  className,
}) {
  const events = buildCollectionActivityTimeline({
    history,
    collectionsNotes,
    openOrders,
  }).slice(0, 3);

  return (
    <section className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-slate-700">Activity summary</h3>
        {onViewFullActivity ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[10px]"
            onClick={onViewFullActivity}
          >
            View full Activity
          </Button>
        ) : null}
      </div>
      {events.length ? (
        <ul className="space-y-1.5 rounded-lg border border-border bg-card px-2.5 py-2">
          {events.map((event) => (
            <li key={event.id} className="flex items-start justify-between gap-2 text-[11px]">
              <div className="min-w-0">
                <p className="font-medium text-slate-800">{event.title}</p>
                <p className="truncate text-slate-600">{event.detail}</p>
              </div>
              <span className="shrink-0 text-muted-foreground">{formatShortDate(event.date)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-3 py-2.5 text-[11px] text-muted-foreground">
          No recent activity yet.
        </p>
      )}
    </section>
  );
}
