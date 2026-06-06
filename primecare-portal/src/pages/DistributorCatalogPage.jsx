import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge, PageSkeleton } from "@/components/ux";
import {
  formatInr,
  formatMarginAmount,
  formatMarginPct,
  formatPriceOrNotConfigured,
} from "@/catalog/masterCatalogEngine.js";
import {
  assignMasterProductsToDistributor,
  loadDistributorCatalogBundle,
  unassignDistributorCatalogProduct,
  updateDistributorCatalogItem,
} from "@/catalog/distributorCatalogData.js";
import { loadInventoryEconomicsBundle } from "@/inventory/inventoryEconomicsData.js";
import { InventoryEconomicsSummaryPanel } from "@/components/inventory/InventoryEconomicsPanels.jsx";
import { cn } from "@/lib/utils";
import { RefreshCw, Plus } from "lucide-react";

const DEBUG_CATALOG = import.meta.env.DEV;

function logCatalogTiming(label, detail = {}) {
  if (!DEBUG_CATALOG) return;
  console.debug(`[DistributorCatalog:timing] ${label}`, { at: performance.now().toFixed(1), ...detail });
}

function str(v) {
  return String(v ?? "").trim();
}

export default function DistributorCatalogPage({
  currentUser = null,
  distributorScope = null,
  selectedDistributorTenantId = "",
  distributorRow = null,
  onCatalogChanged = null,
  embedded = false,
}) {
  const tenantId =
    selectedDistributorTenantId || distributorScope?.tenantId || "";
  const homeTenantId = distributorScope?.homeTenantId || currentUser?.tenantId || "";
  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState(null);
  const [inventoryEconomics, setInventoryEconomics] = useState(null);
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState("neutral");
  const [busy, setBusy] = useState(false);
  const [savingProductId, setSavingProductId] = useState("");
  const renderCountRef = useRef(0);
  const distributorRowRef = useRef(distributorRow);
  const onCatalogChangedRef = useRef(onCatalogChanged);
  distributorRowRef.current = distributorRow;
  onCatalogChangedRef.current = onCatalogChanged;
  renderCountRef.current += 1;

  useEffect(() => {
    logCatalogTiming("render", { count: renderCountRef.current, tenantId });
  });

  const load = useCallback(
    async ({ showLoading = true, syncParent = false } = {}) => {
      if (!tenantId) {
        setBundle(null);
        setInventoryEconomics(null);
        setLoading(false);
        return;
      }
      const started = performance.now();
      logCatalogTiming("load:start", { tenantId, showLoading });
      try {
        if (showLoading) setLoading(true);
        const [data, inventoryRes] = await Promise.all([
          loadDistributorCatalogBundle(tenantId, homeTenantId, {
            distributorRow: distributorRowRef.current,
          }),
          loadInventoryEconomicsBundle({
            distributorId: tenantId,
            distributorNames: new Map([[tenantId, distributorRowRef.current?.name || tenantId]]),
          }).catch((err) => {
            console.warn("[DistributorCatalog] inventory economics load failed", err);
            return { ok: false, model: null };
          }),
        ]);
        setBundle(data);
        setInventoryEconomics(inventoryRes?.model || null);
        if (syncParent && onCatalogChangedRef.current) {
          await onCatalogChangedRef.current({
            config: data.registryRow?.config || data.distributorRow?.config,
            items: data.assignedItems,
            assignedCount: data.assignedCount,
            catalogAssigned: data.catalogAssigned,
            pricingValid: data.pricingValid,
            hqPricingValid: data.hqPricingValid,
            hqPricingMissingCount: data.hqPricingMissingCount,
            inventoryIsolated: data.inventoryIsolated,
            hqLeakCount: data.hqLeakCount,
          });
        }
        logCatalogTiming("load:done", {
          tenantId,
          ms: (performance.now() - started).toFixed(1),
        });
      } catch (err) {
        console.error(err);
        setBundle(null);
        setInventoryEconomics(null);
        setMsgTone("error");
        setMsg(err?.message || "Failed to load catalog");
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [tenantId, homeTenantId]
  );

  useEffect(() => {
    void load({ showLoading: true, syncParent: true });
  }, [load]);

  async function handleAssign(productId = null) {
    setBusy(true);
    setMsg("");
    try {
      const result = await assignMasterProductsToDistributor(
        tenantId,
        productId ? [productId] : [],
        { distributorRow: distributorRowRef.current }
      );
      if (!result.ok) {
        setMsg(
          result.error ||
            (result.localOnly
              ? "Catalog saved locally but Supabase persistence failed — metadata was not updated"
              : "Assignment failed")
        );
        return;
      }
      const persistedNote = result.supabasePersisted
        ? " · saved to Supabase"
        : result.supabaseSkipped
          ? " · local registry only"
          : "";
      setMsg(
        (productId
          ? "Product assigned from HQ master catalog"
          : `Assigned ${result.assignedCount} product(s) from HQ master catalog`) + persistedNote
      );
      setBundle((prev) => ({
        ...(prev || {}),
        assignedItems: result.items || prev?.assignedItems || [],
        assignedCount: result.assignedCount ?? prev?.assignedCount ?? 0,
        catalogAssigned: true,
        availableItems: (prev?.master?.items || prev?.availableItems || []).filter(
          (p) => !(result.items || []).some((i) => i.productId === p.productId)
        ),
      }));
      await onCatalogChanged?.(result);
    } catch (err) {
      setMsg(err?.message || "Assignment failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnassign(productId) {
    setBusy(true);
    const result = await unassignDistributorCatalogProduct(tenantId, productId, {
      distributorRow: distributorRowRef.current,
    });
    setMsg(
      result.ok
        ? `Product removed from distributor catalog${result.supabasePersisted ? " · saved to Supabase" : ""}`
        : result.error || "Failed to remove product"
    );
    if (result.ok) {
      setBundle((prev) => {
        const assignedItems = (prev?.assignedItems || []).filter(
          (i) => i.productId !== productId
        );
        return {
          ...(prev || {}),
          assignedItems,
          assignedCount: assignedItems.length,
          catalogAssigned: assignedItems.length > 0,
        };
      });
      await onCatalogChanged?.(result);
    }
    setBusy(false);
  }

  async function handlePriceSave(productId, productName, sellingPrice, currentStock) {
    const price = Number(sellingPrice);
    const stock = Number(currentStock);
    const productLabel = str(productName) || str(productId) || "Product";
    if (!Number.isFinite(price) || price <= 0) {
      setMsgTone("error");
      setMsg("Distributor selling price must be greater than 0.");
      return;
    }
    if (!Number.isFinite(stock) || stock < 0) {
      setMsgTone("error");
      setMsg("Inventory must be 0 or greater.");
      return;
    }

    setSavingProductId(productId);
    setMsg("");
    setMsgTone("neutral");
    try {
      const result = await updateDistributorCatalogItem(
        tenantId,
        productId,
        { sellingPrice: price, currentStock: stock },
        { distributorRow: distributorRowRef.current }
      );
      if (!result.ok) {
        setMsgTone("error");
        setMsg(result.error || `Failed to save ${productLabel}.`);
        return;
      }

      try {
        await load({ showLoading: false, syncParent: true });
      } catch (refreshErr) {
        console.warn("[DistributorCatalog] post-save refresh failed", refreshErr);
        setMsgTone("success");
        setMsg(
          `Catalog item saved — ${productLabel}. Refresh the catalog tab to see updated economics.`
        );
        return;
      }

      if (result.localOnly) {
        setMsgTone("error");
        setMsg(
          `Catalog item saved locally — ${productLabel}. Supabase metadata was not updated.`
        );
        return;
      }

      const syncIssue =
        result.supabaseSync?.productError || result.supabaseSync?.inventoryError || null;
      if (syncIssue) {
        setMsgTone("error");
        setMsg(`Catalog item saved — ${productLabel}. Metadata saved; sync issue: ${syncIssue}`);
        return;
      }

      setMsgTone("success");
      setMsg(`Catalog item saved — ${productLabel}.`);
    } catch (err) {
      console.error("[DistributorCatalog] save failed", err);
      setMsgTone("error");
      setMsg(err?.message || `Failed to save ${productLabel}.`);
    } finally {
      setSavingProductId("");
    }
  }

  if (!tenantId) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Select a distributor to manage catalog assignment.
      </p>
    );
  }

  if (loading && !bundle) return <PageSkeleton rows={6} />;

  const assigned = bundle?.assignedItems || [];
  const available = bundle?.availableItems || [];

  return (
    <div className={embedded ? "space-y-3" : "mx-auto max-w-5xl space-y-3 p-3 pb-8"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-700">
            Catalog for {distributorScope?.tenantName || distributorRow?.name || tenantId}
          </p>
          <p className="text-[11px] text-slate-500">
            Assign from HQ master only · distributor-specific pricing and inventory
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void load({ showLoading: false })}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" size="sm" disabled={busy} onClick={() => void handleAssign()}>
            <Plus className="h-3.5 w-3.5" /> Assign all HQ products
          </Button>
        </div>
      </div>

      {embedded ? (
        inventoryEconomics ? (
          <InventoryEconomicsSummaryPanel economics={inventoryEconomics} compact />
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            Inventory economics unavailable.
          </div>
        )
      ) : null}

      <div className="flex flex-wrap gap-2 text-xs">
        <StatusBadge
          variant={bundle?.catalogAssigned ? "success" : "warning"}
          label={bundle?.catalogAssigned ? "Catalog assigned" : "No catalog assigned"}
        />
        <StatusBadge variant="neutral" label={`${bundle?.assignedCount ?? 0} products`} />
        {bundle?.hqPricingValid === false ? (
          <StatusBadge variant="danger" label="HQ pricing not configured" />
        ) : null}
        {bundle?.pricingValid === false && bundle?.hqPricingValid !== false ? (
          <StatusBadge variant="danger" label="Distributor pricing invalid" />
        ) : null}
      </div>

      {msg ? (
        <p
          className={cn(
            "rounded-md border px-2 py-1.5 text-xs",
            msgTone === "success" && "border-emerald-200 bg-emerald-50 text-emerald-800",
            msgTone === "error" && "border-red-200 bg-red-50 text-red-800",
            msgTone === "neutral" && "border-slate-200 bg-slate-50 text-slate-600"
          )}
          role="status"
        >
          {msg}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-slate-500">
              <th className="px-2 py-2">Product</th>
              <th className="px-2 py-2">HQ Cost</th>
              <th className="px-2 py-2">HQ Transfer Price</th>
              <th className="px-2 py-2">Distributor Selling Price</th>
              <th className="px-2 py-2">Margin ₹</th>
              <th className="px-2 py-2">Margin %</th>
              <th className="px-2 py-2">Inventory</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {assigned.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-2 py-6 text-center text-slate-500">
                  No products assigned. Assign from HQ master catalog to pass launch gate.
                </td>
              </tr>
            ) : null}
            {assigned.map((item) => (
              <CatalogRow
                key={item.productId}
                item={item}
                busy={busy}
                saving={savingProductId === item.productId}
                onSave={handlePriceSave}
                onUnassign={handleUnassign}
              />
            ))}
          </tbody>
        </table>
      </div>

      {available.length ? (
        <section className="rounded-xl border border-dashed border-slate-200 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-600">Available from HQ master</p>
          <ul className="space-y-1 text-xs">
            {available.slice(0, 8).map((p) => (
              <li key={p.productId} className="flex items-center justify-between gap-2">
                <span>
                  {p.productName} · {formatInr(p.sellingPrice)}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void handleAssign(p.productId)}
                >
                  Assign
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function CatalogRow({ item, busy, saving = false, onSave, onUnassign }) {
  const [price, setPrice] = useState(String(item.sellingPrice ?? ""));
  const [stock, setStock] = useState(String(item.currentStock ?? 0));
  const marginReady = item.marginConfigured === true;

  useEffect(() => {
    setPrice(String(item.sellingPrice ?? ""));
    setStock(String(item.currentStock ?? 0));
  }, [item.productId, item.sellingPrice, item.currentStock]);

  return (
    <tr className="border-b border-slate-100">
      <td className="px-2 py-2">
        <p className="font-medium">{item.productName}</p>
        <p className="text-slate-500">{item.category}</p>
      </td>
      <td className="px-2 py-2 tabular-nums text-slate-600">
        {formatPriceOrNotConfigured(item.hqCostPrice, item.hqPricingConfigured)}
      </td>
      <td className="px-2 py-2 tabular-nums text-slate-600">
        {formatPriceOrNotConfigured(item.hqTransferPrice, item.hqPricingConfigured)}
      </td>
      <td className="px-2 py-2">
        <Input
          className="h-7 w-24 text-xs"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </td>
      <td className="px-2 py-2 tabular-nums">
        {formatMarginAmount(item.marginAmount, marginReady)}
      </td>
      <td className="px-2 py-2 tabular-nums">
        {formatMarginPct(item.marginPct, marginReady)}
      </td>
      <td className="px-2 py-2">
        <Input
          className="h-7 w-20 text-xs"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
        />
      </td>
      <td className="px-2 py-2">
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || saving}
            onClick={() => void onSave(item.productId, item.productName, price, stock)}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => onUnassign(item.productId)}
          >
            Remove
          </Button>
        </div>
      </td>
    </tr>
  );
}
