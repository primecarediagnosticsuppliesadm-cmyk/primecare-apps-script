import {
  buildCollectionActivityTimeline,
  buildPaymentActivityEvents,
  buildNonPaymentActivityEvents,
  formatActivityInr,
} from "@/collections/collectionsActivityTimeline.js";
import {
  paymentHistoryReconciles,
  sumPaymentHistoryTotal,
} from "@/collections/collectionsPaymentHistory.js";
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

function PaymentActivityList({ events, emptyLabel }) {
  if (!events.length) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul className="space-y-0 rounded-lg border border-border bg-card">
      {events.map((event) => (
        <li
          key={event.id}
          className="border-b border-border/60 px-3 py-2.5 last:border-b-0"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-semibold text-emerald-800">{event.title}</p>
              <dl className="grid gap-x-3 gap-y-0.5 text-[11px] sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Payment ID</dt>
                  <dd className="font-medium text-slate-800">{event.paymentId || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Date</dt>
                  <dd className="font-medium text-slate-800">{formatShortDate(event.date)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Amount</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">
                    {formatActivityInr(event.amount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Mode</dt>
                  <dd className="font-medium text-slate-800">{event.paymentMode || "—"}</dd>
                </div>
                {event.orderId ? (
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">Order / reference</dt>
                    <dd className="font-medium text-slate-800">{event.orderId}</dd>
                  </div>
                ) : null}
              </dl>
              {event.subdetail ? (
                <p className="text-[11px] text-slate-500">{event.subdetail}</p>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ActivityEventList({ events, emptyLabel }) {
  if (!events.length) {
    return (
      <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }

  return (
    <ul className="space-y-0 rounded-lg border border-border bg-card">
      {events.map((event) => (
        <li
          key={event.id}
          className="relative border-b border-border/60 px-3 py-2.5 pl-7 last:border-b-0"
        >
          <span
            className={cn(
              "absolute left-2.5 top-3 h-2 w-2 rounded-full border border-background",
              KIND_DOT[event.kind] || "bg-slate-400"
            )}
            aria-hidden
          />
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900">{event.title}</p>
              <p className="text-[11px] text-slate-600">{event.detail}</p>
              {event.subdetail ? (
                <p className="mt-0.5 text-[11px] text-slate-500">{event.subdetail}</p>
              ) : null}
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

export default function CollectionActivityTimeline({
  history = [],
  collectionsNotes = "",
  openOrders = [],
  arTotalPaid = 0,
  className,
}) {
  const paymentEvents = buildPaymentActivityEvents(history);
  const otherEvents = buildNonPaymentActivityEvents({ collectionsNotes, openOrders });
  const allEvents = buildCollectionActivityTimeline({ history, collectionsNotes, openOrders });

  const activityPaymentTotal = sumPaymentHistoryTotal(history);
  const arPaid = Number(arTotalPaid || 0);
  const reconciled = paymentHistoryReconciles(history, arPaid);

  const hasAnyActivity = allEvents.length > 0;

  if (!hasAnyActivity && arPaid <= 0) {
    return (
      <p
        className={cn(
          "rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground",
          className
        )}
      >
        No follow-up activity yet.
      </p>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      <section className="space-y-2">
        <h4 className="text-xs font-semibold text-slate-700">Payment activity</h4>
        <PaymentActivityList
          events={paymentEvents}
          emptyLabel="No payment rows found for this lab."
        />
      </section>

      {otherEvents.length ? (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold text-slate-700">Follow-ups & orders</h4>
          <ActivityEventList events={otherEvents} emptyLabel="No follow-up activity yet." />
        </section>
      ) : null}

      <footer
        className={cn(
          "rounded-lg border px-3 py-2.5 text-[11px]",
          reconciled ? "border-border bg-muted/30 text-slate-700" : "border-amber-300 bg-amber-50 text-amber-900"
        )}
      >
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>
            Payment activity total:{" "}
            <strong className="tabular-nums">{formatActivityInr(activityPaymentTotal)}</strong>
          </span>
          <span>
            AR total paid: <strong className="tabular-nums">{formatActivityInr(arPaid)}</strong>
          </span>
        </div>
        {!reconciled ? (
          <p className="mt-1.5 font-medium">
            Payment history does not reconcile with AR total paid.
          </p>
        ) : null}
      </footer>
    </div>
  );
}
