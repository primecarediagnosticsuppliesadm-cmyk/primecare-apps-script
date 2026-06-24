import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  createTodaysWorkCardLoaders,
  getHqTodaysWorkCacheMeta,
  invalidateHqTodaysWorkCache,
  peekHqTodaysWorkBundle,
  storeHqTodaysWorkBundle,
  TODAYS_WORK_CARD_IDS,
} from "@/operations/hqCommandCenterData.js";
import { buildHqPriorityCards } from "@/operations/hqCommandCenterEngine.js";
import { DataFreshnessLabel } from "@/components/ux";
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

const CARD_TITLES = {
  inventory: "Critical Inventory Issues",
  collections: "Collections Requiring Action",
  orders: "Pending Orders",
  users: "Inactive Users",
  audit: "Recent Audit Alerts",
};

function severityLabel(severity) {
  if (severity === "critical") return "Critical";
  if (severity === "attention") return "Action needed";
  if (severity === "monitor") return "Monitor";
  return "Clear";
}

function initialCardState(ids, value) {
  return Object.fromEntries(ids.map((id) => [id, value]));
}

export default function HqPrioritiesStrip({ tenantId, setActivePage }) {
  const [bundleParts, setBundleParts] = useState({});
  const [cardLoading, setCardLoading] = useState(() =>
    initialCardState(TODAYS_WORK_CARD_IDS, true)
  );
  const [cardErrors, setCardErrors] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [dataLoadedAt, setDataLoadedAt] = useState(null);
  const loadGenRef = useRef(0);

  const load = useCallback(
    (opts = {}) => {
      const isRefresh = opts.refresh === true;
      if (isRefresh) {
        invalidateHqTodaysWorkCache();
        setRefreshing(true);
      } else {
        const cached = peekHqTodaysWorkBundle(tenantId);
        if (cached) {
          setBundleParts({
            dashboard: cached.dashboard,
            collections: cached.collections,
            orders: cached.orders,
            directoryUsers: cached.directoryUsers,
            auditEvents: cached.auditEvents,
          });
          setCardLoading(initialCardState(TODAYS_WORK_CARD_IDS, false));
          setCardErrors({});
          const meta = getHqTodaysWorkCacheMeta(tenantId);
          if (meta?.loadedAt) setDataLoadedAt(meta.loadedAt);
          return;
        }
      }

      setCardErrors({});
      setCardLoading(initialCardState(TODAYS_WORK_CARD_IDS, true));

      const gen = ++loadGenRef.current;
      const loaders = createTodaysWorkCardLoaders(tenantId, { force: isRefresh });

      let completed = 0;
      const merged = {
        ok: true,
        error: null,
        dashboard: null,
        collections: [],
        orders: [],
        directoryUsers: [],
        auditEvents: [],
      };

      for (const cardId of TODAYS_WORK_CARD_IDS) {
        void loaders[cardId]()
          .then(({ slice, error }) => {
            if (gen !== loadGenRef.current) return;
            Object.assign(merged, slice);
            setBundleParts((prev) => ({ ...prev, ...slice }));
            setCardLoading((prev) => ({ ...prev, [cardId]: false }));
            if (error) {
              setCardErrors((prev) => ({ ...prev, [cardId]: String(error) }));
              merged.error = merged.error || error;
            }
            completed += 1;
            if (completed === TODAYS_WORK_CARD_IDS.length) {
              storeHqTodaysWorkBundle(tenantId, { ...merged, ok: !merged.error });
              setDataLoadedAt(Date.now());
            }
          })
          .catch((err) => {
            if (gen !== loadGenRef.current) return;
            setCardLoading((prev) => ({ ...prev, [cardId]: false }));
            setCardErrors((prev) => ({
              ...prev,
              [cardId]: err?.message || "Failed to load card",
            }));
          });
      }

      if (isRefresh) {
        Promise.allSettled(TODAYS_WORK_CARD_IDS.map((id) => loaders[id]())).finally(() => {
          if (gen === loadGenRef.current) setRefreshing(false);
        });
      }
    },
    [tenantId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const cards = useMemo(() => buildHqPriorityCards(bundleParts), [bundleParts]);
  const cardsById = useMemo(
    () => Object.fromEntries(cards.map((card) => [card.id, card])),
    [cards]
  );
  const anyLoading = TODAYS_WORK_CARD_IDS.some((id) => cardLoading[id]);

  return (
    <section
      className="rounded-2xl border border-border bg-card p-4 shadow-[var(--pc-shadow-card)] sm:p-5"
      aria-label="Today's Work"
    >
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Today&apos;s Work</h2>
          <p className="text-xs text-muted-foreground">
            What needs your attention right now — each card explains the next step.
          </p>
          <DataFreshnessLabel
            loadedAt={dataLoadedAt}
            refreshing={refreshing || anyLoading}
            className="mt-1 block"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 shrink-0"
          disabled={refreshing}
          onClick={() => load({ refresh: true })}
        >
          <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {TODAYS_WORK_CARD_IDS.map((cardId) => {
          const card = cardsById[cardId];
          const Icon = CARD_ICONS[cardId] || AlertTriangle;
          const loading = cardLoading[cardId];
          const error = cardErrors[cardId];
          const title = card?.title || CARD_TITLES[cardId] || cardId;

          return (
            <article
              key={cardId}
              className={cn(
                "flex flex-col rounded-xl border p-3 shadow-sm",
                !loading && card
                  ? SEVERITY_STYLES[card.severity] || SEVERITY_STYLES.healthy
                  : "border-slate-200 bg-slate-50/80"
              )}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-white/80 p-1.5 shadow-sm">
                    <Icon className="h-4 w-4 text-slate-700" />
                  </span>
                  {!loading && card ? (
                    <Badge
                      variant={SEVERITY_BADGE[card.severity] || "outline"}
                      className="text-[10px]"
                    >
                      {severityLabel(card.severity)}
                    </Badge>
                  ) : (
                    <span className="h-5 w-16 animate-pulse rounded bg-muted/50" />
                  )}
                </div>
                {loading ? (
                  <span
                    className="h-8 w-10 animate-pulse rounded bg-muted/50"
                    aria-label={`Loading ${title}`}
                  />
                ) : error ? (
                  <span className="text-lg font-bold text-amber-700" title={error}>
                    —
                  </span>
                ) : (
                  <span className="text-2xl font-bold tabular-nums text-slate-900">{card?.count}</span>
                )}
              </div>

              <h3 className="text-sm font-semibold text-slate-900">{title}</h3>

              {loading ? (
                <>
                  <div className="mt-2 h-8 animate-pulse rounded bg-muted/40" />
                  <div className="mt-2 h-6 flex-1 animate-pulse rounded bg-muted/30" />
                </>
              ) : error ? (
                <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-900">
                  {error}
                </p>
              ) : card ? (
                <>
                  <p className="mt-1 text-[11px] font-medium leading-snug text-slate-700">
                    {card.actionNeeded}
                  </p>
                  <p className="mt-1 flex-1 text-[10px] leading-snug text-slate-500">
                    {card.description}
                  </p>
                </>
              ) : null}

              <Button
                type="button"
                size="sm"
                variant={!loading && card && card.count > 0 ? "default" : "outline"}
                className="mt-3 h-9 w-full text-xs"
                disabled={loading || Boolean(error) || !card}
                onClick={() => card && setActivePage?.(card.page)}
              >
                {card?.ctaLabel || "Review"}
              </Button>
            </article>
          );
        })}
      </div>

      {anyLoading ? (
        <p className="sr-only" aria-live="polite">
          Loading Today&apos;s Work cards
        </p>
      ) : null}
    </section>
  );
}
