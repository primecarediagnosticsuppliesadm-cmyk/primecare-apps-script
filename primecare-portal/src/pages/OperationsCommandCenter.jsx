import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, PageSkeleton, usePortalToast } from "@/components/ux";
import OperationalLabDrawer from "@/components/operations/OperationalLabDrawer.jsx";
import { loadOperationsCommandCenterData } from "@/operations/operationsCommandCenterLoader.js";
import { buildOperationsCommandCenterModel } from "@/operations/operationsCommandCenterModel.js";
import {
  recordOperationsCenterEvent,
  traceOperationsCenterLoad,
} from "@/operations/operationsCommandCenterPredator.js";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import { cn } from "@/lib/utils";
import {
  RefreshCw,
  AlertOctagon,
  AlertTriangle,
  Activity,
  Package,
  Users,
  Wallet,
  Shield,
  Radio,
} from "lucide-react";

const SEVERITY_STYLES = {
  CRITICAL: "border-red-200 bg-red-50/80",
  ATTENTION: "border-amber-200 bg-amber-50/60",
  MONITORING: "border-slate-200 bg-slate-50/80",
};

const SEVERITY_BADGE = {
  CRITICAL: "danger",
  ATTENTION: "warning",
  MONITORING: "neutral",
};

function formatFeedTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function AttentionRow({ item, onAction, onOpenLab }) {
  return (
    <article
      className={cn(
        "rounded-lg border px-2.5 py-2 shadow-sm",
        SEVERITY_STYLES[item.severity] || SEVERITY_STYLES.MONITORING
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs font-semibold text-slate-900">{item.title}</span>
            <StatusBadge variant={SEVERITY_BADGE[item.severity] || "neutral"} compact>
              {item.severity}
            </StatusBadge>
            <span className="text-[10px] text-slate-500">{item.ageLabel}</span>
          </div>
          <p className="mt-0.5 truncate text-[11px] font-medium text-slate-700">{item.subtitle}</p>
          <p className="mt-0.5 text-[11px] text-slate-600">{item.explanation}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {item.labId ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[10px]"
            onClick={() => onOpenLab(item.labId)}
          >
            Open Lab
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          className="h-7 px-2 text-[10px]"
          onClick={() => onAction(item.action, item)}
        >
          {item.actionLabel}
        </Button>
      </div>
    </article>
  );
}

export default function OperationsCommandCenter({ currentUser, setActivePage }) {
  const [opsModel, setOpsModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [drawerLabId, setDrawerLabId] = useState("");
  const { showToast } = usePortalToast();

  const load = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) setRefreshing(true);
        else setLoading(true);
        setError("");

        const model = await traceOperationsCenterLoad(async () => {
          const payload = await loadOperationsCommandCenterData(currentUser);
          return buildOperationsCommandCenterModel(payload);
        });
        setOpsModel(model);
      } catch (err) {
        console.error(err);
        setError(err?.message || "Failed to load operations center");
        setOpsModel(null);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [currentUser]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const model = useMemo(() => {
    if (!opsModel) return null;
    return {
      ...opsModel,
      payload: { ...opsModel.payload, riskLabs: opsModel.riskLabs },
    };
  }, [opsModel]);

  useEffect(() => {
    if (!model?.attention?.length) return;
    recordOperationsCenterEvent("operations_center.attention_queue_render", {
      count: model.attention.length,
      critical: model.attentionBySeverity.CRITICAL.length,
    });
  }, [model?.attention?.length, model?.attentionBySeverity?.CRITICAL?.length]);

  useEffect(() => {
    if (model?.health) {
      recordOperationsCenterEvent("operations_center.risk_score_compute", {
        healthScore: model.health.score,
        riskLabCount: model.riskLabs.length,
      });
    }
  }, [model?.health?.score, model?.riskLabs?.length]);

  usePredatorModuleValidation(
    "Admin Dashboard",
    currentUser,
    {
      attentionCount: model?.attention?.length ?? 0,
      feedCount: model?.feed?.length ?? 0,
      healthScore: model?.health?.score ?? null,
      operationsCenter: true,
    },
    !loading && Boolean(model)
  );

  const navigateForAction = useCallback(
    (action) => {
      const map = {
        collections: "collections",
        orders: "orders",
        inventory: "inventory",
        purchase: "purchase",
        visits: "visits",
        labs: "labs",
        lab: "labs",
      };
      const page = map[action] || "dashboard";
      if (page === "dashboard") {
        showToast("info", "Use the module sidebar to continue.");
        return;
      }
      setActivePage?.(page);
    },
    [setActivePage, showToast]
  );

  const openLab = useCallback((labId) => {
    if (!labId) return;
    recordOperationsCenterEvent("operations_center.lab_drawer_open", { labId });
    setDrawerLabId(String(labId));
  }, []);

  const handleDrawerAction = useCallback(
    (action, snapshot) => {
      setDrawerLabId("");
      if (action === "follow_up") {
        navigateForAction("visits");
        return;
      }
      navigateForAction(action);
    },
    [navigateForAction]
  );

  if (loading) {
    return <PageSkeleton kpiCount={4} kpiColumns={4} listRows={8} />;
  }

  if (!model) {
    return (
      <div className="p-6 text-sm text-red-700">
        {error || "Unable to load operations center."}
      </div>
    );
  }

  const { attentionBySeverity, feed, inventory, agents, financial, health, riskLabs } = model;

  return (
    <div className="space-y-4 p-4 pb-8 lg:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Mission control
          </p>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Operations Command Center
          </h1>
          <p className="mt-0.5 text-sm text-slate-600">
            What needs attention, what is blocked, and where risk is building.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load(true)}
          disabled={refreshing}
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-900 to-slate-800 p-4 text-white shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-300">
              Operational health
            </p>
            <p className="text-3xl font-bold tabular-nums">{health.score}%</p>
            <p className="mt-1 text-xs text-slate-300">
              Trend: {health.trend} · Collections {health.contributors.collectionsHealth}% ·
              Fulfillment {health.contributors.fulfillmentHealth}%
            </p>
          </div>
          <Shield className="h-10 w-10 text-slate-400" />
        </div>
        <ul className="mt-3 flex flex-wrap gap-2">
          {health.drivers.map((d) => (
            <li
              key={d.label}
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px]",
                d.impact === "positive" ? "bg-emerald-500/20" : "bg-red-500/20"
              )}
            >
              {d.label}
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <AlertOctagon className="h-4 w-4 text-red-600" />
            Operational attention queue
          </h2>

          {["CRITICAL", "ATTENTION", "MONITORING"].map((severity) => {
            const items = attentionBySeverity[severity] || [];
            if (!items.length) return null;
            return (
              <div key={severity} className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {severity} ({items.length})
                </p>
                <ul className="space-y-1.5">
                  {items.map((item) => (
                    <li key={item.id}>
                      <AttentionRow
                        item={item}
                        onAction={navigateForAction}
                        onOpenLab={openLab}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          {!model.attention.length ? (
            <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-slate-500">
              No critical operational alerts in the current data window.
            </p>
          ) : null}
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Radio className="h-4 w-4" />
            Live operations feed
          </h2>
          <ul className="max-h-[520px] space-y-1 overflow-y-auto rounded-lg border bg-white p-2">
            {feed.map((row) => (
              <li
                key={row.id}
                className="flex gap-2 rounded-md border border-slate-100 px-2 py-1.5 text-[11px]"
              >
                <Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold capitalize text-slate-900">{row.title}</span>
                    <span className="shrink-0 text-slate-500">{formatFeedTime(row.createdAt)}</span>
                  </div>
                  <p className="text-slate-600">{row.subtitle}</p>
                  {row.labName ? (
                    <button
                      type="button"
                      className="mt-0.5 text-[10px] font-medium text-primary underline-offset-2 hover:underline"
                      onClick={() => openLab(row.labId)}
                    >
                      {row.labName}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
            {!feed.length ? (
              <li className="py-4 text-center text-slate-500">No recent operational events.</li>
            ) : null}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <section className="rounded-lg border p-3">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Top risky labs
          </h2>
          <ul className="space-y-1.5">
            {riskLabs.map((lab) => (
              <li key={lab.labId}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-100 px-2 py-1.5 text-left text-[11px] hover:bg-slate-50"
                  onClick={() => openLab(lab.labId)}
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{lab.labName}</p>
                    <p className="truncate text-slate-500">{lab.drivers[0] || "Risk flagged"}</p>
                  </div>
                  <StatusBadge
                    variant={
                      lab.level === "Critical"
                        ? "danger"
                        : lab.level === "High"
                          ? "warning"
                          : "info"
                    }
                    compact
                  >
                    {lab.level}
                  </StatusBadge>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border p-3">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Package className="h-4 w-4" />
            Inventory risk
          </h2>
          <div className="space-y-2 text-[11px]">
            <p className="font-medium text-slate-700">
              Critical SKUs ({inventory.critical.length})
            </p>
            {inventory.critical.slice(0, 4).map((r) => (
              <p key={r.productId} className="text-slate-600">
                {r.productName} · stock {r.currentStock}
              </p>
            ))}
            <p className="font-medium text-slate-700">Urgent reorder forecast</p>
            {inventory.urgentForecast.slice(0, 3).map((r) => (
              <p key={r.productId} className="text-slate-600">
                {r.productName} · {r.urgency}
              </p>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-1 h-7 w-full text-[10px]"
              onClick={() => navigateForAction("inventory")}
            >
              View Inventory
            </Button>
          </div>
        </section>

        <section className="rounded-lg border p-3">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4" />
            Agent operations
          </h2>
          <dl className="grid grid-cols-2 gap-2 text-[11px]">
            <div>
              <dt className="text-slate-500">Visits today</dt>
              <dd className="font-semibold">{agents.visitsToday}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Recovered</dt>
              <dd className="font-semibold">{agents.collectionsRecovered}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Missed follow-ups</dt>
              <dd className="font-semibold">{agents.missedFollowUps}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Health</dt>
              <dd className="font-semibold">{agents.healthLabel}</dd>
            </div>
          </dl>
          <ul className="mt-2 space-y-1">
            {agents.agentRows.slice(0, 4).map((a) => (
              <li key={a.name} className="flex justify-between text-[10px] text-slate-600">
                <span>{a.name}</span>
                <span>
                  {a.visits} visits · ₹{Number(a.sold).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border p-3 lg:col-span-2 xl:col-span-1">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Wallet className="h-4 w-4" />
            Financial pressure
          </h2>
          <dl className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">Total overdue</dt>
              <dd className="font-semibold">{financial.totalOverdue}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Blocked</dt>
              <dd className="font-semibold">{financial.blockedCount} accounts</dd>
            </div>
            <div>
              <dt className="text-slate-500">Outstanding</dt>
              <dd className="font-semibold">{financial.totalOutstanding}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Recovery</dt>
              <dd className="font-semibold">
                {financial.recoveryPct != null ? `${financial.recoveryPct}%` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Today collections</dt>
              <dd className="font-semibold">{financial.todayCollections}</dd>
            </div>
          </dl>
          <ul className="mt-2 space-y-1">
            {financial.topDebtors.slice(0, 5).map((c) => (
              <li key={c.labId}>
                <button
                  type="button"
                  className="flex w-full justify-between text-[11px] hover:text-primary"
                  onClick={() => openLab(c.labId)}
                >
                  <span className="truncate">{c.labName}</span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    ₹{Number(c.outstandingAmount || 0).toLocaleString()}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2 h-7 w-full text-[10px]"
            onClick={() => navigateForAction("collections")}
          >
            View Collections
          </Button>
        </section>
      </div>

      <OperationalLabDrawer
        open={Boolean(drawerLabId)}
        onClose={() => setDrawerLabId("")}
        labId={drawerLabId}
        opsPayload={model.payload}
        onAction={handleDrawerAction}
      />
    </div>
  );
}