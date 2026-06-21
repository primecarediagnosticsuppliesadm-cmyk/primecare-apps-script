import { buildCollectionActivityTimeline } from "@/collections/collectionsActivityTimeline.js";
import { cn } from "@/lib/utils";

function formatShortDate(value) {
  if (!value) return "—";
  const s = String(value).slice(0, 10);
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const KIND_DOT = {
  payment: "bg-emerald-500",
  followup: "bg-blue-500",
  note: "bg-slate-400",
  order: "bg-amber-500",
};

export default function CollectionActivityTimeline({
  history = [],
  collectionsNotes = "",
  openOrders = [],
  className,
}) {
  const events = buildCollectionActivityTimeline({ history, collectionsNotes, openOrders });

  if (!events.length) {
    return (
      <p className={cn("rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground", className)}>
        No follow-up activity yet.
      </p>
    );
  }

  return (
    <ul className={cn("space-y-0", className)}>
      {events.map((event) => (
        <li
          key={event.id}
          className="relative border-b border-border/60 py-2.5 pl-4 last:border-b-0"
        >
          <span
            className={cn(
              "absolute left-0 top-3 h-2 w-2 rounded-full border border-background",
              KIND_DOT[event.kind] || "bg-slate-400"
            )}
            aria-hidden
          />
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900">{event.title}</p>
              <p className="text-[11px] text-slate-600">{event.detail}</p>
            </div>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {formatShortDate(event.date)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
