import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, PageSkeleton, KpiCard, KpiCardGrid, usePortalToast } from "@/components/ux";
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
  Activity,
  Package,
  Users,
  Wallet,
  Shield,
  Radio,
  ClipboardList,
  TrendingUp,
  Truck,
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

const FEED_KIND_DOT = {
  order: "bg-blue-500",
  payment: "bg-emerald-500",
  visit: "bg-violet-500",
  evidence: "bg-cyan-500",
  inventory: "bg-amber-500",
  qualification: "bg-indigo-500",
  ops: "bg-slate-400",
};

const HEALTH_TILE_STYLES = {
  healthy: "border-emerald-200 bg-emerald-50/50",
  watch: "border-amber-200 bg-amber-50/40",
  risk: "border-red-200 bg-red-50/50",
};

function formatFeedTime(iso) {
  if (!iso) return "Recently";
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
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
            {item.ageLabel ? (
              <span className="text-[10px] text-slate-500">{item.ageLabel}</span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-[11px] font-medium text-slate-800">{item.subtitle}</p>
          {item.owner ? (
            <p className="text-[10px] text-slate-500">Owner · {item.owner}</p>
          ) : null}
          <p className="mt-0.5 text-[11px] text-slate-600">{item.recommendedAction || item.explanation}</p>
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

function HealthTile({ tile, onNavigate }) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-lg border px-3 py-2.5 text-left transition hover:shadow-sm",
        HEALTH_TILE_STYLES[tile.status] || HEALTH_TILE_STYLES.watch
      )}
      onClick={() => onNavigate(tile.action)}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{tile.title}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900">{tile.label}</p>
      <p className="mt-1 text-[10px] leading-snug text-slate-600">{tile.detail}</p>
    </button>
  );
}

export default function OperationsCommandCenter({ currentUser, setActivePage }) {
  const [opsModel, setOpsModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [drawerLabId, setDrawerLabId] = useState("");
  const [attentionExpanded, setAttentionExpanded] = useState(true);
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

  const model = opsModel;

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
    "Operations Center",
    currentUser,
    {
      attentionCount: model?.attention?.length ?? 0,
      feedCount: model?.feed?.length ?? 0,
      healthScore: model?.health?.score ?? null,
      snapshotVisitsToday: model?.snapshot?.visitsToday ?? null,
      highRiskLabs: model?.snapshot?.highRiskLabs ?? null,
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
        qualification: "qualificationReview",
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
    (action) => {
      setDrawerLabId("");
      navigateForAction(action);
    },
    [navigateForAction]
  );

  if (loading) {
    return <PageSkeleton kpiCount={6} kpiColumns={3} listRows={6} />;
  }

  if (!model) {
    return (
      <div className="p-6 text-sm text-red-700">
        {error || "Unable to load operations center."}
      </div>
    );
  }

  const {
    snapshot,
    attentionBySeverity,
    feed,
    inventory,
    agents,
    financial,
    health,
    healthTiles,
    riskLabs,
  } = model;
  const criticalCount = attentionBySeverity.CRITICAL?.length ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 pb-10 lg:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Executive oversight
          </p>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            Operations Command Center
          </h1>
          <p className="mt-0.5 max-w-xl text-sm text-slate-600">
            What needs attention, who is behind, and where operational risk is building — no
            charts, just live status.
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

      {/* 1. Executive Daily Snapshot */}
      <section aria-label="Executive daily snapshot">
        <KpiCardGrid columns={3} className="sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            title="Revenue today"
            value={snapshot.revenueToday}
            subtitle="Fulfilled orders"
            icon={TrendingUp}
            className="!rounded-xl !p-3"
          />
          <KpiCard
            title="Collections pending"
            value={snapshot.collectionsPending}
            subtitle={snapshot.collectionsExposure}
            icon={Wallet}
            className="!rounded-xl !p-3"
          />
          <KpiCard
            title="High-risk labs"
            value={snapshot.highRiskLabs}
            subtitle="Hold, overdue, or elevated risk"
            icon={AlertOctagon}
            className="!rounded-xl !p-3"
          />
          <KpiCard
            title="Agents active today"
            value={snapshot.activeAgentsToday}
            subtitle={`${snapshot.visitsToday} visits logged`}
            icon={Users}
            className="!rounded-xl !p-3"
          />
          <KpiCard
            title="Orders to fulfill"
            value={snapshot.ordersPendingFulfillment}
            subtitle="Open pipeline"
            icon={Truck}
            className="!rounded-xl !p-3"
          />
          <KpiCard
            title="Low stock SKUs"
            value={snapshot.lowStockSkus}
            subtitle="Critical or at stockout"
            icon={Package}
            className="!rounded-xl !p-3"
          />
        </KpiCardGrid>
      </section>

      {/* 5. Operational Health tiles */}
      <section aria-label="Operational health">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Shield className="h-4 w-4 text-slate-600" />
            Operational health
          </h2>
          <span className="text-[10px] text-slate-500">
            Overall {health.score}% · {health.trend}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {(healthTiles || []).map((tile) => (
            <HealthTile key={tile.key} tile={tile} onNavigate={navigateForAction} />
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        {/* 2. Needs Attention Queue */}
        <section className="space-y-2">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 text-left"
            onClick={() => setAttentionExpanded((v) => !v)}
          >
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ClipboardList className="h-4 w-4 text-red-600" />
              Needs attention
              {criticalCount > 0 ? (
                <StatusBadge variant="danger" compact>
                  {criticalCount} critical
                </StatusBadge>
              ) : null}
            </h2>
            <span className="text-[10px] text-slate-500">
              {model.attention.length} items · {attentionExpanded ? "Hide" : "Show"}
            </span>
          </button>

          {attentionExpanded ? (
            <>
              {["CRITICAL", "ATTENTION", "MONITORING"].map((severity) => {
                const items = attentionBySeverity[severity] || [];
                if (!items.length) return null;
                return (
                  <div key={severity} className="space-y-1.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {severity} ({items.length})
                    </p>
                    <ul className="space-y-1.5">
                      {items.slice(0, severity === "MONITORING" ? 4 : 8).map((item) => (
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
                <p className="rounded-lg border border-dashed border-emerald-200 bg-emerald-50/40 px-3 py-5 text-center text-sm text-emerald-800">
                  No operational alerts in the current window. Teams are current.
                </p>
              ) : null}
            </>
          ) : null}
        </section>

        {/* 3. Live Operational Feed */}
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Radio className="h-4 w-4" />
            Live operational feed
          </h2>
          <ul className="max-h-[min(520px,60vh)] space-y-0.5 overflow-y-auto rounded-lg border bg-white p-1.5">
            {feed.map((row) => (
              <li
                key={row.id}
                className="flex gap-2 rounded-md px-2 py-1.5 text-[11px] hover:bg-slate-50"
              >
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    FEED_KIND_DOT[row.kind] || FEED_KIND_DOT.ops
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      <span className="text-[10px] font-medium uppercase text-slate-400">
                        {row.telemetryLabel || row.kind}
                      </span>
                      {" · "}
                      {row.title}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-500">
                      {formatFeedTime(row.createdAt)}
                    </span>
                  </div>
                  <p className="truncate text-slate-600">{row.subtitle}</p>
                  {row.labId ? (
                    <button
                      type="button"
                      className="mt-0.5 text-[10px] font-medium text-primary hover:underline"
                      onClick={() => openLab(row.labId)}
                    >
                      {row.labName || row.labId}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
            {!feed.length ? (
              <li className="py-6 text-center text-sm text-slate-500">
                No recent operational events in this tenant.
              </li>
            ) : null}
          </ul>
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* 4. Agent Activity Monitor */}
        <section className="rounded-lg border border-slate-200 bg-card p-3 shadow-sm">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Users className="h-4 w-4" />
            Agent activity
          </h2>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
            <div>
              <dt className="text-slate-500">Visits today</dt>
              <dd className="text-lg font-semibold tabular-nums">{agents.visitsToday}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Collections today</dt>
              <dd className="text-lg font-semibold">{agents.collectionsToday}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Proofs uploaded</dt>
              <dd className="font-semibold tabular-nums">{agents.proofsUploaded}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Labs touched</dt>
              <dd className="font-semibold tabular-nums">{agents.labsTouched}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Follow-ups pending</dt>
              <dd className="font-semibold tabular-nums">{agents.followUpsPending}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Stale agents</dt>
              <dd className="font-semibold tabular-nums">{agents.staleAgentCount}</dd>
            </div>
          </dl>
          <p className="mt-2 text-[10px] text-slate-500">{agents.healthLabel}</p>
          {agents.agentRows.length ? (
            <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2">
              {agents.agentRows.slice(0, 4).map((a) => (
                <li key={a.name} className="flex justify-between text-[10px] text-slate-600">
                  <span className="truncate">{a.name}</span>
                  <span className="shrink-0 tabular-nums">
                    {a.visits} visits · ₹{Number(a.sold).toLocaleString("en-IN")}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2 h-7 w-full text-[10px]"
            onClick={() => navigateForAction("visits")}
          >
            Open field visits
          </Button>
        </section>

        {/* Risk labs — compact */}
        <section className="rounded-lg border border-slate-200 bg-card p-3 shadow-sm">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Activity className="h-4 w-4 text-amber-600" />
            Top risky labs
          </h2>
          {riskLabs.length ? (
            <ul className="space-y-1">
              {riskLabs.slice(0, 5).map((lab) => (
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
          ) : (
            <p className="text-[11px] text-slate-500">No elevated lab risk in current data.</p>
          )}
        </section>

        {/* Inventory economics risks */}
        {model.inventoryEconomicsRisks?.length ? (
          <section className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 shadow-sm md:col-span-2">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-950">
              <Package className="h-4 w-4" />
              Inventory economics risks
            </h2>
            <ul className="space-y-1.5 text-[11px]">
              {model.inventoryEconomicsRisks.map((card) => (
                <li key={card.id} className="rounded-md border border-amber-100 bg-white px-2 py-1.5">
                  <p className="font-semibold text-slate-900">{card.title}</p>
                  <p className="text-slate-600">{card.detail}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Inventory — no forecast language */}
        <section className="rounded-lg border border-slate-200 bg-card p-3 shadow-sm">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Package className="h-4 w-4" />
            Inventory pressure
          </h2>
          {inventory.critical.length || inventory.belowReorder.length ? (
            <div className="space-y-2 text-[11px]">
              {inventory.critical.slice(0, 3).map((r) => (
                <p key={r.productId} className="text-slate-700">
                  <span className="font-medium">{r.productName}</span> · stock {r.currentStock}
                </p>
              ))}
              {inventory.belowReorder.slice(0, 2).map((r) => (
                <p key={`low-${r.productId}`} className="text-slate-500">
                  Low: {r.productName} ({r.currentStock})
                </p>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">Stock levels within reorder thresholds.</p>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2 h-7 w-full text-[10px]"
            onClick={() => navigateForAction("inventory")}
          >
            View inventory
          </Button>
        </section>

        {/* Financial — compact */}
        <section className="rounded-lg border border-slate-200 bg-card p-3 shadow-sm md:col-span-2 xl:col-span-1">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Wallet className="h-4 w-4" />
            Collections pressure
          </h2>
          <dl className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">Overdue exposure</dt>
              <dd className="font-semibold">{financial.totalOverdue}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Blocked accounts</dt>
              <dd className="font-semibold">{financial.blockedCount}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Outstanding</dt>
              <dd className="font-semibold">{financial.totalOutstanding}</dd>
            </div>
          </dl>
          {financial.topDebtors.length ? (
            <ul className="mt-2 space-y-1">
              {financial.topDebtors.slice(0, 4).map((c) => (
                <li key={c.labId}>
                  <button
                    type="button"
                    className="flex w-full justify-between text-[11px] hover:text-primary"
                    onClick={() => openLab(c.labId)}
                  >
                    <span className="truncate">{c.labName}</span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      ₹{Number(c.outstandingAmount || 0).toLocaleString("en-IN")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2 h-7 w-full text-[10px]"
            onClick={() => navigateForAction("collections")}
          >
            View collections
          </Button>
        </section>
      </div>

      <OperationalLabDrawer
        open={Boolean(drawerLabId)}
        onClose={() => setDrawerLabId("")}
        labId={drawerLabId}
        opsPayload={model.payload}
        onAction={handleDrawerAction}
        currentUser={currentUser}
      />
    </div>
  );
}
