import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge, PageSkeleton } from "@/components/ux";
import { formatInr } from "@/catalog/masterCatalogEngine.js";
import {
  assignMasterProductsToDistributor,
  loadDistributorCatalogBundle,
  unassignDistributorCatalogProduct,
  updateDistributorCatalogItem,
} from "@/catalog/distributorCatalogData.js";
import { RefreshCw, Plus } from "lucide-react";

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
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const rowOptions = { distributorRow: distributorRow || bundle?.distributorRow };

  const load = useCallback(async () => {
    if (!tenantId) {
      setBundle(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await loadDistributorCatalogBundle(tenantId, homeTenantId, {
        distributorRow,
      });
      setBundle(data);
    } catch (err) {
      console.error(err);
      setBundle(null);
      setMsg(err?.message || "Failed to load catalog");
    } finally {
      setLoading(false);
    }
  }, [tenantId, homeTenantId, distributorRow]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAssign(productId = null) {
    setBusy(true);
    setMsg("");
    try {
      const result = await assignMasterProductsToDistributor(
        tenantId,
        productId ? [productId] : [],
        rowOptions
      );
      if (!result.ok) {
        setMsg(result.error || "Assignment failed");
        return;
      }
      setMsg(
        productId
          ? "Product assigned from HQ master catalog"
          : `Assigned ${result.assignedCount} product(s) from HQ master catalog`
      );
      await load();
      await onCatalogChanged?.(result);
    } catch (err) {
      setMsg(err?.message || "Assignment failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleUnassign(productId) {
    setBusy(true);
    const result = await unassignDistributorCatalogProduct(tenantId, productId, rowOptions);
    setMsg(result.ok ? "Product removed from distributor catalog" : result.error);
    await load();
    if (result.ok) await onCatalogChanged?.(result);
    setBusy(false);
  }

  async function handlePriceSave(productId, sellingPrice, currentStock) {
    setBusy(true);
    await updateDistributorCatalogItem(
      tenantId,
      productId,
      {
        sellingPrice: Number(sellingPrice),
        currentStock: Number(currentStock),
      },
      rowOptions
    );
    setMsg("Pricing and inventory updated");
    await load();
    setBusy(false);
  }

  if (!tenantId) {
    return (
      <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Select a distributor to manage catalog assignment.
      </p>
    );
  }

  if (loading) return <PageSkeleton rows={6} />;

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
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" size="sm" disabled={busy} onClick={() => void handleAssign()}>
            <Plus className="h-3.5 w-3.5" /> Assign all HQ products
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <StatusBadge
          variant={bundle?.catalogAssigned ? "success" : "warning"}
          label={bundle?.catalogAssigned ? "Catalog assigned" : "No catalog assigned"}
        />
        <StatusBadge variant="neutral" label={`${bundle?.assignedCount ?? 0} products`} />
        {bundle?.pricingValid === false ? (
          <StatusBadge variant="danger" label="Pricing invalid" />
        ) : null}
      </div>

      {msg ? <p className="text-xs text-slate-600">{msg}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-slate-500">
              <th className="px-2 py-2">Product</th>
              <th className="px-2 py-2">Pricing</th>
              <th className="px-2 py-2">Margin</th>
              <th className="px-2 py-2">Inventory</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {assigned.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-6 text-center text-slate-500">
                  No products assigned. Assign from HQ master catalog to pass launch gate.
                </td>
              </tr>
            ) : null}
            {assigned.map((item) => (
              <CatalogRow
                key={item.productId}
                item={item}
                busy={busy}
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

function CatalogRow({ item, busy, onSave, onUnassign }) {
  const [price, setPrice] = useState(String(item.sellingPrice ?? ""));
  const [stock, setStock] = useState(String(item.currentStock ?? 0));

  return (
    <tr className="border-b border-slate-100">
      <td className="px-2 py-2">
        <p className="font-medium">{item.productName}</p>
        <p className="text-slate-500">{item.category}</p>
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center gap-1">
          <Input
            className="h-7 w-24 text-xs"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
          <span className="text-slate-400">HQ {formatInr(item.hqSellingPrice)}</span>
        </div>
      </td>
      <td className="px-2 py-2 tabular-nums">{item.marginPct}%</td>
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
            disabled={busy}
            onClick={() => onSave(item.productId, price, stock)}
          >
            Save
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
