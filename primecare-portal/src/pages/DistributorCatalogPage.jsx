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
  resyncDistributorCatalogMirror,
  unassignDistributorCatalogProduct,
  updateDistributorCatalogItem,
} from "@/catalog/distributorCatalogData.js";
import { loadInventoryEconomicsBundle } from "@/inventory/inventoryEconomicsData.js";
import { InventoryEconomicsSummaryPanel } from "@/components/inventory/InventoryEconomicsPanels.jsx";
import {
  CatalogMirrorDiagnosticsPanel,
  CatalogSaveResultPanel,
  CatalogSyncHealthBadge,
} from "@/components/catalog/CatalogMirrorPanels.jsx";
import {
  buildCatalogMirrorHealth,
  LAYER_OUTCOME,
  parseSyncLayersFromResult,
} from "@/catalog/catalogMirrorHealth.js";
import {
  loadCatalogMirrorDiagnostics,
  probeCatalogMirrorCounts,
  recordCatalogSyncAttempt,
} from "@/catalog/catalogMirrorDiagnostics.js";
import { cn } from "@/lib/utils";
import { RefreshCw, Plus } from "lucide-react";

const DEBUG_CATALOG = import.meta.env.DEV;

function logCatalogTiming(label, detail = {}) {
  if (!DEBUG_CATALOG) return;
  console.debug(`[DistributorCatalog:timing] ${label}`, { at: performance.now().toFixed(1), ...detail });
}

function logCatalogState(bundle, tenantId) {
  const config = bundle?.registryRow?.config || bundle?.distributorRow?.config || {};
  const metadataItems = config?.distributorCatalog?.items;
  console.info("[DistributorCatalog:state]", {
    tenantId,
    catalogItemCount: bundle?.assignedCount ?? bundle?.assignedItems?.length ?? 0,
    catalogAssigned: Boolean(bundle?.catalogAssigned),
    catalogAssignedFlag: config?.catalogAssigned === true,
    catalogMetadataLength: Array.isArray(metadataItems) ? metadataItems.length : 0,
    renderedProductCount: bundle?.assignedItems?.length ?? 0,
  });
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
  const [mirrorDiagnostics, setMirrorDiagnostics] = useState(null);
  const [saveResult, setSaveResult] = useState(null);
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
        logCatalogState(data, tenantId);
        setInventoryEconomics(inventoryRes?.model || null);
        let diagnostics = null;
        try {
          diagnostics = await loadCatalogMirrorDiagnostics(
            tenantId,
            data.assignedItems || []
          );
          setMirrorDiagnostics(diagnostics);
        } catch (mirrorErr) {
          console.warn("[DistributorCatalog] mirror diagnostics failed", mirrorErr);
          setMirrorDiagnostics(null);
        }
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
            ...(diagnostics ? { catalogMirrorHealth: diagnostics } : {}),
          });
        }
        logCatalogTiming("load:done", {
          tenantId,
          ms: (performance.now() - started).toFixed(1),
        });
      } catch (err) {
        console.error("[DistributorCatalog] load failed", err);
        setBundle(null);
        setInventoryEconomics(null);
        setMirrorDiagnostics(null);
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

  async function handleResyncMirror() {
    setBusy(true);
    setMsg("");
    try {
      const result = await resyncDistributorCatalogMirror(tenantId, {
        distributorRow: distributorRowRef.current,
      });
      if (!result.ok) {
        setMsgTone("error");
        setMsg(result.error || "Inventory mirror sync failed");
        return;
      }
      setMsgTone("success");
      setMsg(
        `Mirrored ${result.catalogInventoryMirrorStatus?.productsCount ?? 0} product(s) and ${result.catalogInventoryMirrorStatus?.inventoryCount ?? 0} inventory row(s) to Supabase`
      );
      await applySaveMirrorFeedback({
        result: { ok: true, items: result.items, supabaseSync: result.supabaseSync },
        productId: result.items?.[0]?.productId || null,
        productLabel: "Catalog mirror resync",
        catalogItemsCount: result.items?.length ?? 0,
        action: "resync_mirror",
      });
      await onCatalogChanged?.(result);
    } catch (err) {
      setMsgTone("error");
      setMsg(err?.message || "Mirror resync failed");
    } finally {
      setBusy(false);
    }
  }

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
      await applySaveMirrorFeedback({
        result,
        productId: productId || result.items?.[0]?.productId || null,
        productLabel: productId
          ? str(productId)
          : `All ${result.assignedCount ?? 0} catalog products`,
        catalogItemsCount: result.assignedCount ?? result.items?.length ?? 0,
        action: productId ? "assign_one" : "assign_all",
      });
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

  async function applySaveMirrorFeedback({
    result,
    productId,
    productLabel,
    catalogItemsCount,
    action = "save",
  }) {
    const layers = parseSyncLayersFromResult(result);
    const probe = await probeCatalogMirrorCounts(tenantId, [productId]);
    const health = buildCatalogMirrorHealth({
      catalogItemsCount,
      mirroredProductsCount: probe.productsCount,
      mirroredInventoryCount: probe.inventoryCount,
      lastAttempt: {
        at: new Date().toISOString(),
        status: null,
        layers,
      },
    });
    recordCatalogSyncAttempt(tenantId, {
      result,
      layers,
      status: health.status,
      catalogItemsCount,
      mirroredProductsCount: probe.productsCount,
      mirroredInventoryCount: probe.inventoryCount,
      productId,
      action,
    });
    const diagnostics = await loadCatalogMirrorDiagnostics(tenantId, result.items || bundle?.assignedItems || []);
    setMirrorDiagnostics(diagnostics);
    const tone =
      layers.metadata === LAYER_OUTCOME.PASS &&
      layers.products === LAYER_OUTCOME.PASS &&
      layers.inventory === LAYER_OUTCOME.PASS
        ? "success"
        : layers.metadata === LAYER_OUTCOME.PASS
          ? "warning"
          : "error";
    setSaveResult({ productLabel, layers, tone });
    setMsg("");
    setMsgTone("neutral");
    await onCatalogChangedRef.current?.({
      config: result.config,
      items: result.items,
      assignedCount: result.items?.length ?? catalogItemsCount,
      catalogMirrorHealth: diagnostics,
    });
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
    setSaveResult(null);
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
        const layers = parseSyncLayersFromResult(result);
        setSaveResult({
          productLabel,
          layers: {
            metadata: LAYER_OUTCOME.FAIL,
            products: LAYER_OUTCOME.FAIL,
            inventory: LAYER_OUTCOME.FAIL,
          },
          tone: "error",
        });
        setMsg(result.error || `Failed to save ${productLabel}.`);
        setMsgTone("error");
        return;
      }

      try {
        await load({ showLoading: false, syncParent: false });
      } catch (refreshErr) {
        console.warn("[DistributorCatalog] post-save refresh failed", refreshErr);
      }

      await applySaveMirrorFeedback({
        result,
        productId,
        productLabel,
        catalogItemsCount: result.items?.length ?? bundle?.assignedCount ?? 0,
      });
    } catch (err) {
      console.error("[DistributorCatalog] save failed", err);
      setSaveResult({
        productLabel,
        headline: `Catalog save failed — ${productLabel}.`,
        layers: {
          metadata: LAYER_OUTCOME.FAIL,
          products: LAYER_OUTCOME.FAIL,
          inventory: LAYER_OUTCOME.FAIL,
        },
        tone: "error",
      });
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
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !(bundle?.assignedCount > 0)}
            onClick={() => void handleResyncMirror()}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Sync inventory mirror
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
        <CatalogSyncHealthBadge health={mirrorDiagnostics} />
        <StatusBadge variant="neutral" label={`${bundle?.assignedCount ?? 0} products`} />
        {bundle?.hqPricingValid === false ? (
          <StatusBadge variant="danger" label="HQ pricing not configured" />
        ) : null}
        {bundle?.pricingValid === false && bundle?.hqPricingValid !== false ? (
          <StatusBadge variant="danger" label="Distributor pricing invalid" />
        ) : null}
      </div>

      {saveResult ? (
        <CatalogSaveResultPanel saveResult={saveResult} tone={saveResult.tone} />
      ) : null}

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

      <CatalogMirrorDiagnosticsPanel diagnostics={mirrorDiagnostics} />

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
