import React, { useCallback, useEffect, useState } from "react";
import { PageSkeleton } from "@/components/ux";
import { loadMasterCatalog } from "@/catalog/masterCatalogData.js";
import { formatInr, formatMarginPct, formatPriceOrNotConfigured } from "@/catalog/masterCatalogEngine.js";
import { Package } from "lucide-react";

export default function MasterCatalogPage() {
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await loadMasterCatalog();
      setCatalog(data);
      if (!data.ok && data.error) setError(data.error);
    } catch (err) {
      setError(err?.message || "Failed to load master catalog");
      setCatalog(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <PageSkeleton rows={8} />;

  const items = catalog?.items || [];

  return (
    <div className="mx-auto max-w-5xl space-y-3 p-3 pb-8">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <Package className="h-5 w-5 text-indigo-600" />
          Master Catalog
        </h1>
        <p className="text-[11px] text-slate-600">
          PrimeCare HQ owns the master product list. Distributors assign products from this catalog only.
        </p>
      </header>

      {error ? <p className="text-xs text-amber-700">{error}</p> : null}

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg border bg-white p-2">
          <p className="text-slate-500">Products</p>
          <p className="text-lg font-bold tabular-nums">{catalog?.productCount ?? 0}</p>
        </div>
        <div className="rounded-lg border bg-white p-2">
          <p className="text-slate-500">Active SKUs</p>
          <p className="text-lg font-bold tabular-nums">{catalog?.activeCount ?? 0}</p>
        </div>
        <div className="rounded-lg border bg-white p-2">
          <p className="text-slate-500">Source</p>
          <p className="text-sm font-semibold">{catalog?.source || "hq_master"}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-slate-500">
              <th className="px-2 py-2">Product</th>
              <th className="px-2 py-2">Category</th>
              <th className="px-2 py-2">HQ price</th>
              <th className="px-2 py-2">HQ cost</th>
              <th className="px-2 py-2">Transfer price</th>
              <th className="px-2 py-2">Margin</th>
              <th className="px-2 py-2">HQ stock</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-6 text-center text-slate-500">
                  No master products loaded. Add products to HQ inventory first.
                </td>
              </tr>
            ) : null}
            {items.map((p) => (
              <tr key={p.productId} className="border-b border-slate-100">
                <td className="px-2 py-2 font-medium">{p.productName}</td>
                <td className="px-2 py-2">{p.category}</td>
                <td className="px-2 py-2 tabular-nums">{formatInr(p.sellingPrice)}</td>
                <td className="px-2 py-2 tabular-nums">
                  {formatPriceOrNotConfigured(p.costPrice, p.hqPricingConfigured)}
                </td>
                <td className="px-2 py-2 tabular-nums">
                  {formatPriceOrNotConfigured(p.transferPrice, p.hqPricingConfigured)}
                </td>
                <td className="px-2 py-2 tabular-nums">
                  {formatMarginPct(p.marginPct, p.hqPricingConfigured)}
                </td>
                <td className="px-2 py-2 tabular-nums">{p.currentStock}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
