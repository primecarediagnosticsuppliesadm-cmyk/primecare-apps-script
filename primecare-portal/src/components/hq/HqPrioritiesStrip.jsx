import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { loadHqPrioritiesBundle } from "@/operations/hqCommandCenterData.js";
import { buildHqPriorityCards } from "@/operations/hqCommandCenterEngine.js";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ClipboardList,
  Package,
  Shield,
  ShoppingCart,
  Users,
  RefreshCw,
} from "lucide-react";

const SEVERITY_STYLES = {
  critical: "border-red-200 bg-red-50/80",
  attention: "border-amber-200 bg-amber-50/70",
  monitor: "border-blue-200 bg-blue-50/60",
  healthy: "border-slate-200 bg-slate-50/80",
};

const SEVERITY_BADGE = {
  critical: "destructive",
  attention: "secondary",
  monitor: "default",
  healthy: "outline",
};

const CARD_ICONS = {
  inventory: Package,
  collections: ClipboardList,
  orders: ShoppingCart,
  users: Users,
  audit: Shield,
};

function severityLabel(severity) {
  if (severity === "critical") return "Critical";
  if (severity === "attention") return "Action needed";
  if (severity === "monitor") return "Monitor";
  return "Clear";
}

export default function HqPrioritiesStrip({ tenantId, setActivePage }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(
    async (opts = {}) => {
      const isRefresh = opts.refresh === true;
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError("");
        const data = await loadHqPrioritiesBundle(tenantId);
        setBundle(data);
        if (data.error) setError(data.error);
      } catch (err) {
        setError(err?.message || "Failed to load HQ priorities");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [tenantId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const cards = useMemo(() => buildHqPriorityCards(bundle || {}), [bundle]);

  return (
    <section
      className="rounded-2xl border border-border bg-card p-4 shadow-[var(--pc-shadow-card)] sm:p-5"
      aria-label="Today's HQ Priorities"
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Today&apos;s HQ Priorities</h2>
          <p className="text-xs text-muted-foreground">
            Actionable items across inventory, collections, orders, users, and audit.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0"
          disabled={loading || refreshing}
          onClick={() => void load({ refresh: true })}
        >
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {error ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-muted/40" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {cards.map((card) => {
            const Icon = CARD_ICONS[card.id] || AlertTriangle;
            return (
              <article
                key={card.id}
                className={cn(
                  "flex flex-col rounded-xl border p-3 shadow-sm",
                  SEVERITY_STYLES[card.severity] || SEVERITY_STYLES.healthy
                )}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-white/80 p-1.5 shadow-sm">
                      <Icon className="h-4 w-4 text-slate-700" />
                    </span>
                    <Badge variant={SEVERITY_BADGE[card.severity] || "outline"} className="text-[10px]">
                      {severityLabel(card.severity)}
                    </Badge>
                  </div>
                  <span className="text-2xl font-bold tabular-nums text-slate-900">{card.count}</span>
                </div>
                <h3 className="text-sm font-semibold text-slate-900">{card.title}</h3>
                <p className="mt-1 flex-1 text-[11px] leading-snug text-slate-600">{card.description}</p>
                <Button
                  type="button"
                  size="sm"
                  variant={card.count > 0 ? "default" : "outline"}
                  className="mt-3 h-9 w-full text-xs"
                  onClick={() => setActivePage?.(card.page)}
                >
                  {card.ctaLabel}
                </Button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
