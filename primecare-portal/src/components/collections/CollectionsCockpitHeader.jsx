import { IndianRupee, AlertCircle, Wallet, CalendarClock, ShieldAlert, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `₹${n.toLocaleString("en-IN")}`;
}

function MetricCard({ title, value, icon: Icon, className, hero = false }) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card px-3 py-2.5 shadow-sm",
        hero && "border-[var(--pc-brand-primary)]/25 bg-gradient-to-br from-[var(--pc-brand-primary)]/8 to-card",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </p>
          <p
            className={cn(
              "mt-0.5 truncate font-bold tabular-nums text-foreground",
              hero ? "text-2xl sm:text-3xl" : "text-lg"
            )}
          >
            {value}
          </p>
          {hero ? (
            <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
              <TrendingUp className="h-3 w-3" aria-hidden />
              Trend — coming soon
            </p>
          ) : null}
        </div>
        {Icon ? (
          <div
            className={cn(
              "shrink-0 rounded-md p-1.5",
              hero ? "bg-[var(--pc-brand-primary)]/15" : "bg-muted"
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4",
                hero ? "text-[var(--pc-brand-primary)]" : "text-muted-foreground"
              )}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function CollectionsCockpitHeader({ metrics, className }) {
  const m = metrics || {};

  return (
    <section
      className={cn("grid grid-cols-2 gap-2 lg:grid-cols-6", className)}
      aria-label="Collections cockpit summary"
    >
      <MetricCard
        hero
        className="col-span-2 lg:col-span-2"
        title="Total outstanding"
        value={formatMoney(m.totalOutstanding)}
        icon={IndianRupee}
      />
      <MetricCard
        title="Labs requiring action"
        value={String(m.labsRequiringAction ?? 0)}
        icon={AlertCircle}
      />
      <MetricCard
        title="Total collected"
        value={formatMoney(m.totalCollected)}
        icon={Wallet}
      />
      <MetricCard
        title="Follow-ups due"
        value={String(m.followUpsDue ?? 0)}
        icon={CalendarClock}
      />
      <MetricCard
        title="High risk labs"
        value={String(m.highRiskLabs ?? 0)}
        icon={ShieldAlert}
      />
    </section>
  );
}
