import React, { useCallback, useEffect, useState } from "react";
import { PageSkeleton } from "@/components/ux";
import { loadMasterCatalog } from "@/catalog/masterCatalogData.js";
import { formatInr, formatMarginPct, formatPriceOrNotConfigured } from "@/catalog/masterCatalogEngine.js";
import {
  createHqProductWrite,
  setHqProductActiveWrite,
  updateHqProductWrite,
} from "@/api/primecareSupabaseApi.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Package, Pencil, Plus, X } from "lucide-react";

const EMPTY_ADD_FORM = {
  productId: "",
  productName: "",
  category: "Consumables",
  unit: "",
  sellingPrice: "",
  costPrice: "",
  preferredSupplier: "",
  openingStock: "0",
  minStock: "0",
  reorderQty: "0",
};

function resolveTenantId(currentUser) {
  return String(currentUser?.tenantId || currentUser?.tenant_id || "").trim() || null;
}

function resolveCreatedBy(currentUser) {
  return (
    currentUser?.email ||
    currentUser?.name ||
    currentUser?.userId ||
    currentUser?.id ||
    null
  );
}

function ProductFormModal({ mode, initial, tenantId, createdBy, onClose, onSaved }) {
  const isEdit = mode === "edit";
  const [form, setForm] = useState(
    isEdit
      ? {
          productId: initial?.productId || "",
          productName: initial?.productName || "",
          category: initial?.category || "Consumables",
          unit: initial?.unit || "",
          sellingPrice: String(initial?.sellingPrice ?? ""),
          costPrice: String(initial?.costPrice ?? ""),
          preferredSupplier: initial?.preferredSupplier || "",
          openingStock: String(initial?.currentStock ?? "0"),
          minStock: String(initial?.minStock ?? "0"),
          reorderQty: String(initial?.reorderQty ?? "0"),
        }
      : { ...EMPTY_ADD_FORM }
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function patch(fields) {
    setForm((prev) => ({ ...prev, ...fields }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (!tenantId) throw new Error("Tenant context is missing. Re-login and try again.");

      const payload = {
        tenantId,
        productId: form.productId,
        productName: form.productName,
        category: form.category,
        unit: form.unit,
        sellingPrice: Number(form.sellingPrice || 0),
        costPrice: Number(form.costPrice || 0),
        preferredSupplier: form.preferredSupplier,
        minStock: Number(form.minStock || 0),
        reorderQty: Number(form.reorderQty || 0),
        createdBy,
      };

      let res;
      if (isEdit) {
        res = await updateHqProductWrite(form.productId, payload);
      } else {
        res = await createHqProductWrite({
          ...payload,
          openingStock: Number(form.openingStock || 0),
        });
      }

      if (!res?.success) {
        throw new Error(res?.error || "Failed to save product");
      }

      onSaved?.(res.data);
      onClose?.();
    } catch (err) {
      setError(err?.message || "Failed to save product");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border bg-white p-4 shadow-lg"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">
            {isEdit ? "Edit product" : "Add product"}
          </h3>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {error ? <p className="mb-3 text-xs text-red-600">{error}</p> : null}

        <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <label className="sm:col-span-2 block text-xs text-slate-600">
            Product ID / SKU *
            <Input
              className="mt-1"
              value={form.productId}
              onChange={(e) => patch({ productId: e.target.value })}
              readOnly={isEdit}
              required
            />
          </label>
          <label className="sm:col-span-2 block text-xs text-slate-600">
            Product name *
            <Input
              className="mt-1"
              value={form.productName}
              onChange={(e) => patch({ productName: e.target.value })}
              required
            />
          </label>
          <label className="block text-xs text-slate-600">
            Category
            <Input
              className="mt-1"
              value={form.category}
              onChange={(e) => patch({ category: e.target.value })}
            />
          </label>
          <label className="block text-xs text-slate-600">
            Unit
            <Input
              className="mt-1"
              value={form.unit}
              onChange={(e) => patch({ unit: e.target.value })}
              placeholder="e.g. kit, box"
            />
          </label>
          <label className="block text-xs text-slate-600">
            Selling price
            <Input
              className="mt-1"
              type="number"
              min="0"
              step="0.01"
              value={form.sellingPrice}
              onChange={(e) => patch({ sellingPrice: e.target.value })}
            />
          </label>
          <label className="block text-xs text-slate-600">
            Cost price
            <Input
              className="mt-1"
              type="number"
              min="0"
              step="0.01"
              value={form.costPrice}
              onChange={(e) => patch({ costPrice: e.target.value })}
            />
          </label>
          <label className="sm:col-span-2 block text-xs text-slate-600">
            Preferred supplier
            <Input
              className="mt-1"
              value={form.preferredSupplier}
              onChange={(e) => patch({ preferredSupplier: e.target.value })}
            />
          </label>
          {!isEdit ? (
            <label className="block text-xs text-slate-600">
              Opening stock
              <Input
                className="mt-1"
                type="number"
                min="0"
                step="1"
                value={form.openingStock}
                onChange={(e) => patch({ openingStock: e.target.value })}
              />
            </label>
          ) : (
            <div className="block text-xs text-slate-600">
              Current stock
              <p className="mt-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 tabular-nums">
                {form.openingStock}
              </p>
              <p className="mt-1 text-[10px] text-slate-500">
                Adjust stock via Purchase Orders or inventory receipt.
              </p>
            </div>
          )}
          <label className="block text-xs text-slate-600">
            Minimum stock
            <Input
              className="mt-1"
              type="number"
              min="0"
              step="1"
              value={form.minStock}
              onChange={(e) => patch({ minStock: e.target.value })}
            />
          </label>
          <label className="block text-xs text-slate-600">
            Reorder quantity
            <Input
              className="mt-1"
              type="number"
              min="0"
              step="1"
              value={form.reorderQty}
              onChange={(e) => patch({ reorderQty: e.target.value })}
            />
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create product"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function MasterCatalogPage({ currentUser = null }) {
  const [loading, setLoading] = useState(true);
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [formMode, setFormMode] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [togglingId, setTogglingId] = useState("");

  const tenantId = resolveTenantId(currentUser);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await loadMasterCatalog({ tenantId });
      setCatalog(data);
      if (!data.ok && data.error) setError(data.error);
    } catch (err) {
      setError(err?.message || "Failed to load master catalog");
      setCatalog(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleToggleActive(product) {
    if (!product?.productId || !tenantId) return;
    const nextActive = !product.active;
    const label = nextActive ? "enable" : "disable";
    if (
      typeof window !== "undefined" &&
      !window.confirm(`${nextActive ? "Enable" : "Disable"} ${product.productName}?`)
    ) {
      return;
    }

    try {
      setTogglingId(product.productId);
      setStatusMessage("");
      setError("");
      const res = await setHqProductActiveWrite(product.productId, nextActive, { tenantId });
      if (!res?.success) throw new Error(res?.error || `Failed to ${label} product`);
      setStatusMessage(
        nextActive ? `${product.productName} enabled` : `${product.productName} disabled`
      );
      await load();
    } catch (err) {
      setError(err?.message || `Failed to ${label} product`);
    } finally {
      setTogglingId("");
    }
  }

  function openAdd() {
    setEditingProduct(null);
    setFormMode("add");
  }

  function openEdit(product) {
    setEditingProduct(product);
    setFormMode("edit");
  }

  function closeForm() {
    setFormMode(null);
    setEditingProduct(null);
  }

  async function handleSaved() {
    setStatusMessage(formMode === "edit" ? "Product updated" : "Product created");
    await load();
  }

  if (loading) return <PageSkeleton rows={8} />;

  const items = catalog?.items || [];

  return (
    <div className="mx-auto max-w-5xl space-y-3 p-3 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Package className="h-5 w-5 text-indigo-600" />
            Master Catalog
          </h1>
          <p className="text-[11px] text-slate-600">
            PrimeCare HQ owns the master product list. Distributors assign products from this catalog only.
          </p>
        </div>
        <Button type="button" size="sm" onClick={openAdd} className="gap-1">
          <Plus className="h-4 w-4" />
          Add Product
        </Button>
      </header>

      {error ? <p className="text-xs text-amber-700">{error}</p> : null}
      {statusMessage ? <p className="text-xs text-green-700">{statusMessage}</p> : null}

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
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Category</th>
              <th className="px-2 py-2">HQ price</th>
              <th className="px-2 py-2">HQ cost</th>
              <th className="px-2 py-2">Transfer price</th>
              <th className="px-2 py-2">Margin</th>
              <th className="px-2 py-2">HQ stock</th>
              <th className="px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-2 py-6 text-center text-slate-500">
                  No master products yet. Use Add Product to create your first HQ SKU.
                </td>
              </tr>
            ) : null}
            {items.map((p) => (
              <tr
                key={p.productId}
                className={`border-b border-slate-100 ${p.active ? "" : "bg-slate-50/80 opacity-80"}`}
              >
                <td className="px-2 py-2">
                  <div className="font-medium">{p.productName}</div>
                  <div className="text-[10px] text-slate-500">{p.productId}</div>
                </td>
                <td className="px-2 py-2">
                  <Badge variant={p.active ? "default" : "secondary"}>
                    {p.active ? "Active" : "Inactive"}
                  </Badge>
                </td>
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
                <td className="px-2 py-2">
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-[10px]"
                      onClick={() => openEdit(p)}
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[10px]"
                      disabled={togglingId === p.productId}
                      onClick={() => void handleToggleActive(p)}
                    >
                      {p.active ? "Disable" : "Enable"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {formMode ? (
        <ProductFormModal
          mode={formMode}
          initial={editingProduct}
          tenantId={tenantId}
          createdBy={resolveCreatedBy(currentUser)}
          onClose={closeForm}
          onSaved={handleSaved}
        />
      ) : null}
    </div>
  );
}
