import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, PageSkeleton } from "@/components/ux";
import {
  buildRevenueFunnelModel,
} from "@/founder/revenueFunnelEngine.js";
import {
  loadRevenueFunnelData,
} from "@/founder/revenueFunnelData.js";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import { cn } from "@/lib/utils";
import { BarChart3, RefreshCw, TrendingUp, AlertTriangle } from "lucide-react";

function MetricTile({ label, value, sub, className }) {
  return (
    <div className={cn("rounded-lg border bg-white p-2 text-center shadow-sm", className)}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{value}</p>
      {sub ? <p className="mt-0.5 text-[10px] text-slate-500">{sub}</p> : null}
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
        {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

function formatPct(v) {
  if (v == null) return "—";
  return `${v}%`;
}

function integrityVariant(status) {
  const s = String(status || "").toLowerCase();
  if (s === "healthy") return "success";
  if (s === "warning") return "warning";
  if (s === "broken") return "danger";
  return "neutral";
}

export default function RevenueFunnelPage({ currentUser = null, setActivePage = null }) {
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await loadRevenueFunnelData(currentUser);
      const built = buildRevenueFunnelModel(data);
      setModel(built);
      const gunturId = built.guntur?.distributorId || "";
      setSelectedId((prev) => prev || gunturId || built.distributors[0]?.distributorId || "");
    } catch (err) {
      setError(err?.message || "Failed to load revenue funnel");
      setModel(null);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedRow = useMemo(() => {
    if (!model) return null;
    return (
      model.distributors.find((r) => r.distributorId === selectedId) ||
      model.guntur ||
      model.distributors[0] ||
      null
    );
  }, [model, selectedId]);

  const predatorSnapshot = useMemo(() => {
    if (!model) return null;
    return {
      revenueFunnel: true,
      funnel: model,
      selectedDistributorId: selectedRow?.distributorId || null,
      gunturDistributorId: model.guntur?.distributorId || null,
      distributorCount: model.distributors.length,
    };
  }, [model, selectedRow]);

  usePredatorModuleValidation("Revenue Funnel", currentUser, predatorSnapshot ?? {}, Boolean(predatorSnapshot));

  if (loading) return <PageSkeleton rows={10} />;
  if (error) {
    return (
      <div className="p-4 text-sm text-red-700">
        <p>{error}</p>
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }
  if (!model) return null;

  const { portfolio, distributors, guntur } = model;
  const focus = selectedRow || guntur;

  return (
    <div className="mx-auto max-w-6xl space-y-3 p-3 pb-8">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <BarChart3 className="h-5 w-5 text-indigo-600" aria-hidden />
            Revenue Funnel
          </h1>
          <p className="mt-0.5 text-xs text-slate-600">
            Read-only commercial lifecycle — Qualification → Contract → Order → Fulfillment → AR → Payment.
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={() => void load()} aria-label="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </header>

      <Section title="Executive summary" icon={TrendingUp}>
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border bg-white p-2 shadow-sm">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Qualification integrity
          </p>
          <StatusBadge variant={integrityVariant(portfolio.qualificationIntegrity)} compact>
            {portfolio.qualificationIntegrity || "Healthy"}
          </StatusBadge>
          {portfolio.misalignedContractCount > 0 ? (
            <p className="text-[10px] text-red-800">
              {portfolio.misalignedContractCount} active contract(s) missing qualification row
            </p>
          ) : (
            <p className="text-[10px] text-slate-600">All contracts linked to qualifications</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          <MetricTile label="Qualified labs" value={String(portfolio.qualified)} />
          <MetricTile label="Contracted labs" value={String(portfolio.contracted)} />
          <MetricTile label="Orders" value={String(portfolio.ordered)} />
          <MetricTile label="Fulfilled" value={String(portfolio.fulfilled)} />
          <MetricTile label="AR outstanding" value={portfolio.arOutstandingLabel} />
          <MetricTile label="Payments" value={portfolio.paymentsReceivedLabel} />
          <MetricTile label="Revenue collected" value={portfolio.revenueCollectedLabel} />
        </div>
      </Section>

      <Section title="Distributor funnel" icon={BarChart3}>
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-2">Distributor</th>
                <th className="px-2 py-2">Qualified</th>
                <th className="px-2 py-2">Contracted</th>
                <th className="px-2 py-2">Ordered</th>
                <th className="px-2 py-2">Fulfilled</th>
                <th className="px-2 py-2">AR</th>
                <th className="px-2 py-2">Paid</th>
                <th className="px-2 py-2">Revenue</th>
                <th className="px-2 py-2">Path</th>
              </tr>
            </thead>
            <tbody>
              {distributors.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-2 py-4 text-center text-slate-500">
                    No distributors in portfolio.
                  </td>
                </tr>
              ) : (
                distributors.map((row) => (
                  <tr
                    key={row.distributorId}
                    className={cn(
                      "cursor-pointer border-b last:border-0 hover:bg-slate-50",
                      row.distributorId === selectedId && "bg-indigo-50/60"
                    )}
                    onClick={() => setSelectedId(row.distributorId)}
                  >
                    <td className="px-2 py-2 font-medium text-slate-900">
                      {row.name}
                      {guntur?.distributorId === row.distributorId ? (
                        <span className="ml-1 text-[10px] text-indigo-600">(Guntur)</span>
                      ) : null}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{row.summary.qualified}</td>
                    <td className="px-2 py-2 tabular-nums">{row.summary.contracted}</td>
                    <td className="px-2 py-2 tabular-nums">{row.summary.ordersCreated}</td>
                    <td className="px-2 py-2 tabular-nums">{row.summary.ordersFulfilled}</td>
                    <td className="px-2 py-2 tabular-nums">{row.summary.arOutstandingLabel}</td>
                    <td className="px-2 py-2 tabular-nums">{row.summary.paidLabs}</td>
                    <td className="px-2 py-2 tabular-nums">{row.summary.revenueCollectedLabel}</td>
                    <td className="px-2 py-2">
                      <StatusBadge variant={row.pathComplete ? "success" : "warning"} compact>
                        {row.pathComplete ? "Complete" : "In progress"}
                      </StatusBadge>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {focus ? (
        <>
          <Section title={`Stage detail — ${focus.name}`} icon={TrendingUp}>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {focus.stages.map((stage) => (
                <div key={stage.id} className="rounded-lg border bg-white p-2 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-800">{stage.label}</p>
                    <p className="text-sm font-bold tabular-nums text-slate-900">{stage.count}</p>
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    Conversion {formatPct(stage.conversionPct)}
                  </p>
                  {stage.blockingReason ? (
                    <p className="mt-1 text-[10px] text-amber-800">{stage.blockingReason}</p>
                  ) : (
                    <p className="mt-1 text-[10px] text-emerald-700">Stage active</p>
                  )}
                </div>
              ))}
            </div>
          </Section>

          <Section title={`${focus.name} — commercial checkpoints`} icon={BarChart3}>
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border bg-white p-2 shadow-sm">
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Mirror status
              </p>
              <StatusBadge
                variant={
                  focus.inventory?.catalogInventoryMirrorStatus === "PASS" ? "success" : "danger"
                }
                compact
              >
                {focus.inventory?.catalogInventoryMirrorStatus || "FAIL"}
              </StatusBadge>
            </div>
            <div className="mb-2 grid grid-cols-2 gap-2 rounded-lg border bg-white p-2 shadow-sm sm:grid-cols-5">
              <MetricTile
                label="Catalog assigned"
                value={String(focus.detail.catalogAssigned ?? focus.inventory?.catalogItemCount ?? 0)}
              />
              <MetricTile
                label="Products"
                value={String(focus.detail.productsCount ?? focus.inventory?.productsCount ?? 0)}
              />
              <MetricTile
                label="Inventory rows"
                value={String(focus.detail.inventoryRows ?? focus.inventory?.inventoryRowCount ?? 0)}
              />
              <MetricTile
                label="Items in stock"
                value={String(focus.detail.itemsInStock ?? focus.inventory?.inStockCount ?? 0)}
              />
              <MetricTile
                label="Total stock units"
                value={String(focus.detail.totalStockUnits ?? focus.inventory?.totalStockUnits ?? 0)}
              />
            </div>
            {!focus.inventory?.ready && focus.detail.inventoryRecommendedAction ? (
              <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50/90 p-2 text-xs text-amber-950">
                <p className="font-semibold">Why Ready to Order = 0</p>
                <p className="mt-0.5">{focus.detail.readyToOrderReason}</p>
                <p className="mt-1 text-[10px] text-slate-700">
                  Recommended: {focus.detail.inventoryRecommendedAction}
                </p>
                {focus.inventory?.missingItems?.length ? (
                  <ul className="mt-1 space-y-0.5 text-[10px] text-slate-700">
                    {focus.inventory.missingItems.map((item) => (
                      <li key={item.productId}>
                        Missing inventory row: {item.productName} ({item.productId})
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <MetricTile label="Qualification" value={focus.detail.qualificationStatus} />
              <MetricTile label="Contract" value={focus.detail.contractStatus} />
              <MetricTile
                label="Inventory status"
                value={focus.detail.inventoryReadiness}
                sub={focus.detail.inventoryDetail}
              />
              <MetricTile label="Orders" value={String(focus.detail.orderCount)} sub="created" />
              <MetricTile label="Fulfillment" value={String(focus.detail.fulfillmentCount)} sub="fulfilled orders" />
              <MetricTile label="AR balance" value={focus.detail.arBalanceLabel} />
              <MetricTile label="Payments" value={focus.detail.paymentBalanceLabel} />
              <MetricTile label="Labs in scope" value={String(focus.labCount)} />
            </div>
          </Section>

          <Section title="First revenue blockers" icon={AlertTriangle}>
            {focus.blockers.length === 0 ? (
              <p className="text-xs text-emerald-700">No blockers — commercial path complete for this distributor.</p>
            ) : (
              <ul className="space-y-2 text-xs text-slate-700">
                {focus.blockers.map((b) => (
                  <li key={`${b.stage}-${b.reason}`} className="rounded-lg border border-amber-200 bg-amber-50/80 p-2">
                    <p className="font-semibold capitalize text-amber-950">{b.stage.replace(/_/g, " ")}</p>
                    <p className="mt-0.5 text-amber-900">{b.reason}</p>
                    {b.labs?.length ? (
                      <ul className="mt-1 space-y-0.5 text-[10px] text-slate-700">
                        {b.labs.map((lab) => (
                          <li key={lab.labId}>
                            {lab.labName}
                            {lab.contractId ? ` · contract ${lab.contractId}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {b.inventorySnapshot ? (
                      <div className="mt-1 space-y-0.5 text-[10px] text-slate-600">
                        <p>
                          Mirror status: {b.inventorySnapshot.mirrorStatus || "FAIL"} · Catalog{" "}
                          {b.inventorySnapshot.catalogAssigned} · Products{" "}
                          {b.inventorySnapshot.products} · Inventory rows{" "}
                          {b.inventorySnapshot.inventoryRows} · In stock{" "}
                          {b.inventorySnapshot.itemsInStock}
                        </p>
                        {b.inventorySnapshot.missingSkus?.length ? (
                          <p>Missing: {b.inventorySnapshot.missingSkus.join(", ")}</p>
                        ) : null}
                      </div>
                    ) : null}
                    {b.action ? (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <p className="text-[10px] text-slate-600">{b.action}</p>
                        {b.stage === "inventory" && setActivePage ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px]"
                            onClick={() => setActivePage("distributorOs")}
                          >
                            Open Distributor Catalog
                          </Button>
                        ) : null}
                        {b.stage === "qualification_integrity" && setActivePage ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px]"
                            onClick={() => setActivePage("qualificationReview")}
                          >
                            Open Qualification Review
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {focus.labs.length > 0 ? (
            <Section title="Lab-level funnel" icon={BarChart3}>
              <div className="overflow-x-auto rounded-lg border bg-white">
                <table className="min-w-full text-left text-xs">
                  <thead className="border-b bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Lab</th>
                      <th className="px-2 py-2">Qualification status</th>
                      <th className="px-2 py-2">Founder review</th>
                      <th className="px-2 py-2">Pipeline stage</th>
                      <th className="px-2 py-2">Score</th>
                      <th className="px-2 py-2">Contract</th>
                      <th className="px-2 py-2">Orders</th>
                      <th className="px-2 py-2">Fulfilled</th>
                      <th className="px-2 py-2">AR</th>
                      <th className="px-2 py-2">Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {focus.labs.map((lab) => (
                      <tr key={lab.labId} className="border-b last:border-0">
                        <td className="px-2 py-2 font-medium">{lab.labName}</td>
                        <td className="px-2 py-2">{lab.qualificationStatus}</td>
                        <td className="px-2 py-2">{lab.founderReviewStatus}</td>
                        <td className="px-2 py-2">{lab.pipelineStage}</td>
                        <td className="px-2 py-2 tabular-nums">
                          {lab.qualificationScore != null ? lab.qualificationScore : "—"}
                        </td>
                        <td className="px-2 py-2">{lab.contractStatus}</td>
                        <td className="px-2 py-2 tabular-nums">{lab.orderCount}</td>
                        <td className="px-2 py-2 tabular-nums">{lab.fulfilledCount}</td>
                        <td className="px-2 py-2 tabular-nums">₹{lab.arOutstanding.toLocaleString("en-IN")}</td>
                        <td className="px-2 py-2 tabular-nums">₹{lab.totalPaid.toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
