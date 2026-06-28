import React, { useEffect, useMemo, useState } from "react";
import {
  getPurchaseOrders,
  getSmartReorder,
  createPurchaseOrder,
  receivePurchaseOrder,
  bulkCreateDraftPurchaseOrders,
} from "@/api/primecareApi";
import {
  createPurchaseOrderWrite,
  getPurchaseOrdersRead,
  getReorderForecastRead,
  receivePurchaseOrderWrite,
  cancelPurchaseOrderWrite,
  updatePurchaseOrderWrite,
  getTenantActiveProductsRead,
} from "@/api/primecareSupabaseApi";
import { IS_DEV, IS_QA } from "@/config/environment.js";
import { supabase } from "@/api/supabaseClient.js";
import {
  logAppsScriptFallbackUsed,
  logAppsScriptPrimarySource,
  logPartialMigrationWarning,
  logSupabaseFeatureSource,
} from "@/utils/migrationTrace.js";
import { invalidateAdminDashboardCaches } from "@/utils/dashboardInvalidate.js";
import { ALLOW_LEGACY_APPS_SCRIPT } from "@/config/environment";
import PageSkeleton from "@/components/ux/PageSkeleton";

const emptyCreateForm = {
  productId: "",
  productName: "",
  quantity: "",
  unitCost: "",
  supplier: "",
  status: "Draft",
};

const emptyReceiveForm = {
  poId: "",
  po_id: "",
  productId: "",
  product_id: "",
  productName: "",
  product_name: "",
  quantity: "",
  remainingQty: "",
  receivedQty: "",
  grnNotes: "",
};

function currency(value) {
  return `₹${Number(value || 0).toLocaleString()}`;
}

function numberValue(value) {
  return Number(value || 0);
}

function urgencyBadgeClass(urgency) {
  const val = String(urgency || "").toUpperCase();
  if (val === "CRITICAL") return "bg-red-100 text-red-700 border-red-200";
  if (val === "HIGH" || val === "WARNING") return "bg-orange-100 text-orange-700 border-orange-200";
  if (val === "MEDIUM" || val === "REORDER") return "bg-yellow-100 text-yellow-700 border-yellow-200";
  return "bg-green-100 text-green-700 border-green-200";
}

function statusBadgeClass(status) {
  const val = String(status || "").toLowerCase();
  if (val === "received" || val === "fulfilled" || val === "healthy") {
    return "bg-green-100 text-green-700 border-green-200";
  }
  if (val === "ordered" || val === "processing" || val === "partially received") {
    return "bg-blue-100 text-blue-700 border-blue-200";
  }
  if (val === "draft" || val === "warning" || val === "reorder") {
    return "bg-yellow-100 text-yellow-700 border-yellow-200";
  }
  if (val === "critical" || val === "cancelled" || val === "out") {
    return "bg-red-100 text-red-700 border-red-200";
  }
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function formatTriggerBasis(triggerBasis) {
  const val = String(triggerBasis || "").trim();
  if (!val) return "-";
  return val
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}

function procurementUnitCost(item) {
  const raw =
    item?.costPrice ??
    item?.cost_price ??
    item?.unitCost ??
    item?.unit_cost ??
    "";
  if (raw === "" || raw == null) return "";
  const value = numberValue(raw);
  return value >= 0 ? String(value) : "";
}

function procurementSupplier(item) {
  return String(
    item?.preferredSupplier ??
      item?.preferred_supplier ??
      item?.supplier ??
      item?.supplierName ??
      ""
  ).trim();
}

function buildCreateFormFromItem(item) {
  const qty =
    item?.suggestedQty ??
    item?.suggestedOrderQty ??
    item?.reorderQty ??
    item?.quantity ??
    "";
  return {
    productId: item?.productId || "",
    productName: item?.productName || "",
    quantity: qty !== "" && qty != null ? String(qty) : "",
    unitCost: procurementUnitCost(item),
    supplier: procurementSupplier(item),
    status: "Draft",
  };
}

function candidateFromProcurementItem(item) {
  if (!item?.productId && !item?.productName) return null;
  return {
    productId: item.productId,
    productName: item.productName,
    suggestedQty: item.suggestedQty ?? item.suggestedOrderQty,
    reorderQty: item.reorderQty ?? item.suggestedOrderQty,
  };
}

const RECEIVABLE_PO_STATUSES = new Set(["ordered", "partially received"]);

function isReceivablePurchaseOrderStatus(status) {
  return RECEIVABLE_PO_STATUSES.has(String(status || "").toLowerCase());
}

function poReceivedQty(po) {
  return numberValue(po.receivedQty ?? po.received_qty);
}

function poRemainingQty(po) {
  return Math.max(0, numberValue(po.quantity) - poReceivedQty(po));
}

function canReceivePurchaseOrder(po) {
  return isReceivablePurchaseOrderStatus(po.status) && poRemainingQty(po) > 0;
}

function canEditOrCancelPurchaseOrder(po) {
  const status = String(po.status || "").toLowerCase();
  return poReceivedQty(po) === 0 && (status === "draft" || status === "ordered");
}

function catalogProductCost(product) {
  const raw = product?.costPrice ?? product?.cost_price ?? product?.unitCost ?? "";
  if (raw === "" || raw == null) return "";
  const value = numberValue(raw);
  return value > 0 ? String(value) : "";
}

function ProductCatalogPicker({ products, value, onSelect, disabled = false, placeholder = "Search product by name or SKU…" }) {
  const [query, setQuery] = useState("");
  const selected = products.find((p) => p.productId === value) || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 50);
    return products
      .filter(
        (p) =>
          String(p.productId || "").toLowerCase().includes(q) ||
          String(p.productName || "").toLowerCase().includes(q)
      )
      .slice(0, 50);
  }, [products, query]);

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring"
        disabled={disabled}
      />
      <select
        value={value || ""}
        onChange={(e) => {
          const product = products.find((p) => p.productId === e.target.value);
          if (product) onSelect(product);
        }}
        className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring"
        required
        disabled={disabled}
      >
        <option value="">Select a product from catalog…</option>
        {filtered.map((p) => (
          <option key={p.productId} value={p.productId}>
            {p.productName} ({p.productId})
          </option>
        ))}
      </select>
      {selected ? (
        <p className="text-xs text-slate-500">
          Selected: {selected.productName} · SKU {selected.productId}
        </p>
      ) : null}
    </div>
  );
}

/** Map Supabase reorder forecast row → PurchaseOrdersPage "Reorder Candidates" card shape. */
function mapForecastToPurchaseReorderCandidate(f) {
  const suggested = numberValue(f.suggestedOrderQty);
  const reorder = numberValue(f.reorderQty);
  const unitCost = procurementUnitCost(f);
  return {
    productId: f.productId,
    productName: f.productName,
    stockHealth: f.stockHealth || f.urgency || "Reorder",
    currentStock: f.currentStock,
    minStock: numberValue(f.minStock),
    reorderQty: reorder > 0 ? reorder : suggested,
    suggestedQty: suggested > 0 ? suggested : reorder,
    costPrice: numberValue(f.costPrice ?? f.cost_price),
    preferredSupplier: procurementSupplier(f),
    unitCost,
    supplier: procurementSupplier(f),
  };
}

/** Placeholder auto-trigger rows derived from Supabase reorder forecast (read-only migration). */
function buildPlaceholderAutoTriggersFromForecast(forecast) {
  return forecast.map((f) => {
    const urgencyRaw = String(f.urgency || "Medium").trim();
    const urgencyUpper = urgencyRaw.toUpperCase();
    const dailyFromMonthly =
      numberValue(f.monthlyDemand) > 0 ? Math.round((numberValue(f.monthlyDemand) / 30) * 100) / 100 : 0;

    return {
      productId: f.productId,
      productName: f.productName,
      urgency: urgencyUpper === "CRITICAL" ? "CRITICAL" : urgencyUpper,
      hasOpenPo: false,
      canAutoCreate: true,
      autoTriggerReason: `Forecast suggestion from Supabase reorder data (${f.stockHealth || urgencyRaw}). Review manually before creating a purchase order.`,
      currentStock: numberValue(f.currentStock),
      minStock: numberValue(f.minStock),
      dailyConsumption: dailyFromMonthly,
      daysLeft: numberValue(f.daysLeft),
      suggestedOrderQty: numberValue(f.suggestedOrderQty),
      unitCost: procurementUnitCost(f),
      supplier: procurementSupplier(f),
      triggerBasis: "supabase_reorder_forecast",
      openPoId: "",
      openPoStatus: "",
      estimatedCost:
        numberValue(f.suggestedOrderQty) * numberValue(procurementUnitCost(f) || f.costPrice),
    };
  });
}

function summarizePlaceholderTriggers(triggers) {
  const u = (s) => String(s || "").trim().toUpperCase();
  return {
    criticalCount: triggers.filter((t) => u(t.urgency) === "CRITICAL").length,
    highCount: triggers.filter((t) => u(t.urgency) === "HIGH").length,
    mediumCount: triggers.filter((t) => u(t.urgency) === "MEDIUM").length,
    blockedByOpenPo: triggers.filter((t) => t.hasOpenPo).length,
    totalEstimatedCost: triggers.reduce((sum, t) => sum + numberValue(t.estimatedCost), 0),
  };
}

const PURCHASE_TAB_ORDER = [
  "triggers",
  "reorder",
  "smart",
  "create",
  "receive",
  "history",
  "suppliers",
];

const PURCHASE_TAB_META = {
  triggers: {
    label: "Forecast Suggestions",
    shortDescription: "Projected demand based on sales/stock history.",
    purposeSentence: "Review demand projections before purchasing.",
    nextStepLabel: "Reorder Candidates",
    nextStepTab: "reorder",
  },
  reorder: {
    label: "Reorder Candidates",
    shortDescription: "Items below reorder level that may need purchase.",
    purposeSentence: "Confirm SKUs below safe stock that need replenishment.",
    nextStepLabel: "Create PO",
    nextStepTab: "create",
  },
  smart: {
    label: "Smart Reorder",
    shortDescription: "System-suggested PO quantities.",
    purposeSentence: "Use velocity-based quantities when basic reorder levels are not enough.",
    nextStepLabel: "Create PO",
    nextStepTab: "create",
  },
  create: {
    label: "Create PO",
    shortDescription: "Create a purchase order for supplier stock.",
    purposeSentence: "Draft or submit a purchase order for supplier stock.",
    nextStepLabel: "Receive Stock",
    nextStepTab: "receive",
  },
  receive: {
    label: "Receive Stock",
    shortDescription: "Record goods received and increase inventory.",
    purposeSentence: "Record inbound goods against an open PO and update stock.",
    nextStepLabel: "Purchase Orders",
    nextStepTab: "history",
  },
  history: {
    label: "Purchase Orders",
    shortDescription: "Track open, received, and completed POs.",
    purposeSentence: "Track open, received, and completed purchase orders.",
    nextStepLabel: "Receive Stock",
    nextStepTab: "receive",
  },
  suppliers: {
    label: "Suppliers",
    shortDescription: "Manage supplier details.",
    purposeSentence: "Review supplier activity and open PO history by vendor.",
    nextStepLabel: "Create PO",
    nextStepTab: "create",
  },
};

function ProcurementWorkflowGuide() {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 sm:text-sm">
      <span className="font-medium text-slate-700">Procurement: </span>
      Forecast → Reorder → Create PO → Receive → Track
    </div>
  );
}

function ActiveStepSummary({ meta, onGoToTab }) {
  if (!meta) return null;

  return (
    <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
      <div className="font-medium text-slate-900">{meta.label}</div>
      <p className="mt-0.5 text-slate-600">{meta.purposeSentence}</p>
      {meta.nextStepLabel && meta.nextStepTab && onGoToTab ? (
        <button
          type="button"
          onClick={() => onGoToTab(meta.nextStepTab)}
          className="mt-1.5 inline-flex items-center rounded-full border border-slate-300 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-1"
        >
          Next: {meta.nextStepLabel} →
        </button>
      ) : null}
    </div>
  );
}

export default function PurchaseOrdersPage({ currentUser = null }) {
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [reorderCandidates, setReorderCandidates] = useState([]);
  const [smartReorder, setSmartReorder] = useState([]);
  const [smartReorderSummary, setSmartReorderSummary] = useState(null);
  const [supplierDashboard, setSupplierDashboard] = useState([]);
  const [supplierSummary, setSupplierSummary] = useState(null);
  const [autoTriggers, setAutoTriggers] = useState([]);
  const [autoTriggerSummary, setAutoTriggerSummary] = useState(null);

  const [loading, setLoading] = useState(true);
  const [creatingPo, setCreatingPo] = useState(false);
  const [receivingPo, setReceivingPo] = useState(false);
  const [creatingAutoPoId, setCreatingAutoPoId] = useState("");

  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [selectedPurchaseOrder, setSelectedPurchaseOrder] = useState(null);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [receiveForm, setReceiveForm] = useState(emptyReceiveForm);

  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [poSearch, setPoSearch] = useState("");
  const [poStatusFilter, setPoStatusFilter] = useState("");
  const [activeTab, setActiveTab] = useState("triggers");
  const [bulkCreating, setBulkCreating] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [catalogProductsError, setCatalogProductsError] = useState("");
  const [editingPo, setEditingPo] = useState(null);
  const [editForm, setEditForm] = useState(emptyCreateForm);
  const [savingEdit, setSavingEdit] = useState(false);
  const [cancellingPoId, setCancellingPoId] = useState("");

  const tenantId = currentUser?.tenantId || currentUser?.tenant_id || null;

  const loadCatalogProducts = async () => {
    if (!supabase) {
      setCatalogProducts([]);
      setCatalogProductsError("Supabase is not configured.");
      return;
    }
    if (!tenantId) {
      setCatalogProducts([]);
      setCatalogProductsError("Tenant context missing — cannot load catalog products.");
      return;
    }
    try {
      const res = await getTenantActiveProductsRead({ tenantId });
      if (IS_DEV || IS_QA) {
        console.info("PRODUCT PICKER SOURCE", {
          source: res?.data?.source || "products",
          tenantId,
          count: res?.data?.products?.length ?? 0,
          error: res?.error || null,
        });
      }
      if (!res?.success) {
        setCatalogProducts([]);
        setCatalogProductsError(res?.error || "Failed to load products from catalog.");
        return;
      }
      setCatalogProductsError("");
      setCatalogProducts(
        (res.data?.products || []).filter((p) => p.active !== false && String(p.productId || "").trim())
      );
    } catch (err) {
      console.warn("[PurchaseOrders] catalog load", err);
      setCatalogProducts([]);
      setCatalogProductsError(err?.message || "Failed to load catalog products.");
    }
  };

  const loadPurchaseDashboard = async () => {
    setSupplierDashboard([]);
    setSupplierSummary(null);

    if (supabase) {
      logSupabaseFeatureSource("PurchaseOrders.reorderCandidates", {
        api: "getReorderForecastRead",
      });
      const forecastRes = await getReorderForecastRead();
      if (!forecastRes?.success) {
        throw new Error(forecastRes?.error || "Failed to load reorder candidates from Supabase");
      }

      const forecast = forecastRes.data?.forecast || [];
      const rows = forecast.map(mapForecastToPurchaseReorderCandidate);
      console.log("SUPABASE PURCHASE REORDER:", rows);
      setReorderCandidates(rows);

      const triggerRows = buildPlaceholderAutoTriggersFromForecast(forecast);
      console.log("SUPABASE AUTO PURCHASE TRIGGERS:", triggerRows);
      setAutoTriggers(triggerRows);
      setAutoTriggerSummary(summarizePlaceholderTriggers(triggerRows));

      logSupabaseFeatureSource("PurchaseOrders.purchaseOrders", { api: "getPurchaseOrdersRead" });
      const poResult = await getPurchaseOrdersRead();
      if (poResult?.success) {
        const d = poResult.data;
        setPurchaseOrders(
          Array.isArray(d) ? d : Array.isArray(d?.purchaseOrders) ? d.purchaseOrders : []
        );
      } else {
        setPurchaseOrders([]);
        console.warn("[PurchaseOrders] getPurchaseOrdersRead:", poResult?.error);
      }
      setSmartReorder([]);
      setSmartReorderSummary(null);
      logPartialMigrationWarning(
        "PurchaseOrders.smartReorder",
        "Smart reorder Apps Script read skipped while Supabase is configured; reorder forecast is the authoritative read path."
      );
    } else {
      if (!ALLOW_LEGACY_APPS_SCRIPT) {
        throw new Error("Supabase purchase order reads are required for pilot access.");
      }
      logAppsScriptFallbackUsed("PurchaseOrders.purchaseOrders", {
        primarySourceExpected: "Supabase getPurchaseOrdersRead",
        fallbackSourceUsed: "Apps Script getPurchaseOrders + getSmartReorder",
        riskLevel: "WARNING",
        reason: "Supabase client unavailable.",
      });
      setReorderCandidates([]);
      setAutoTriggers([]);
      setAutoTriggerSummary(null);
      logAppsScriptPrimarySource("PurchaseOrders.purchaseOrders", "getPurchaseOrders");
      logAppsScriptPrimarySource("PurchaseOrders.smartReorder", "getSmartReorder");

      const [poResult, smartResult] = await Promise.allSettled([
        getPurchaseOrders(),
        getSmartReorder(),
      ]);

      if (poResult.status === "fulfilled" && poResult.value?.success) {
        const d = poResult.value.data;
        setPurchaseOrders(
          Array.isArray(d) ? d : Array.isArray(d?.purchaseOrders) ? d.purchaseOrders : []
        );
      } else {
        setPurchaseOrders([]);
      }

      if (smartResult.status === "fulfilled" && smartResult.value?.success) {
        const d = smartResult.value.data;
        const items = Array.isArray(d?.items)
          ? d.items
          : Array.isArray(d?.smartReorder?.items)
          ? d.smartReorder.items
          : [];
        setSmartReorder(items);
        setSmartReorderSummary(d?.summary || d?.smartReorder?.summary || null);
      } else {
        setSmartReorder([]);
        setSmartReorderSummary(null);
      }
    }
  };

  const refreshAll = async () => {
    try {
      setErrorMessage("");
      await Promise.all([loadPurchaseDashboard(), loadCatalogProducts()]);
    } catch (err) {
      console.error(err);
      setErrorMessage(err?.message || "Failed to load purchase dashboard.");
    }
  };

  useEffect(() => {
    async function initialLoad() {
      try {
        setLoading(true);
        setErrorMessage("");
        await Promise.all([loadPurchaseDashboard(), loadCatalogProducts()]);
      } catch (err) {
        console.error(err);
        setErrorMessage(err?.message || "Failed to load purchase operations data.");
      } finally {
        setLoading(false);
      }
    }

    initialLoad();
  }, []);

  const filteredPurchaseOrders = useMemo(() => {
    return purchaseOrders.filter((po) => {
      const matchesSearch =
        !poSearch ||
        String(po.poId || "").toLowerCase().includes(poSearch.toLowerCase()) ||
        String(po.productName || "").toLowerCase().includes(poSearch.toLowerCase()) ||
        String(po.productId || "").toLowerCase().includes(poSearch.toLowerCase()) ||
        String(po.supplier || "").toLowerCase().includes(poSearch.toLowerCase());

      const matchesStatus =
        !poStatusFilter ||
        String(po.status || "").toLowerCase() === poStatusFilter.toLowerCase();

      return matchesSearch && matchesStatus;
    });
  }, [purchaseOrders, poSearch, poStatusFilter]);

  const poStats = useMemo(() => {
    return {
      total: purchaseOrders.length,
      open: purchaseOrders.filter((po) => canReceivePurchaseOrder(po)).length,
      received: purchaseOrders.filter(
        (po) => String(po.status || "").toLowerCase() === "received"
      ).length,
      totalValue: purchaseOrders.reduce((sum, po) => sum + numberValue(po.totalCost), 0),
    };
  }, [purchaseOrders]);

  const criticalActionableTriggers = useMemo(
    () =>
      autoTriggers.filter(
        (item) =>
          String(item.urgency || "").toUpperCase() === "CRITICAL" && item.canAutoCreate
      ),
    [autoTriggers]
  );

  const openPurchaseOrders = useMemo(
    () => purchaseOrders.filter((po) => canReceivePurchaseOrder(po)),
    [purchaseOrders]
  );

  const resolveCatalogProduct = (productId) =>
    catalogProducts.find((p) => p.productId === productId) || null;

  const applyCatalogProductToCreateForm = (product) => {
    if (!product?.productId) return;
    setCreateForm((prev) => ({
      ...prev,
      productId: product.productId,
      productName: product.productName || product.productId,
      unitCost: catalogProductCost(product) || prev.unitCost,
    }));
    setSelectedCandidate({
      productId: product.productId,
      productName: product.productName,
    });
  };

  const validateCreateForm = () => {
    const product = resolveCatalogProduct(createForm.productId);
    if (!product) {
      throw new Error("Select a valid product from catalog.");
    }
    const qty = Number(createForm.quantity || 0);
    const unitCost = Number(createForm.unitCost || 0);
    if (qty <= 0) throw new Error("Quantity must be greater than zero.");
    if (unitCost <= 0) throw new Error("Unit cost must be greater than zero.");
    return {
      productId: product.productId,
      productName: product.productName || product.productId,
      quantity: qty,
      unitCost,
      supplier: createForm.supplier,
      status: createForm.status || "Draft",
    };
  };

  const handleCandidateSelect = (item) => {
    const product = catalogProducts.find((p) => p.productId === item?.productId);
    if (product) {
      applyCatalogProductToCreateForm(product);
    } else {
      setCreateForm(buildCreateFormFromItem(item));
      setSelectedCandidate(candidateFromProcurementItem(item));
    }
    setStatusMessage(`Create PO form prefilled for ${item?.productName || item?.productId || "candidate"}.`);
    setErrorMessage("");
  };

  const handleReviewForecastInCreatePo = (item) => {
    handleCandidateSelect(item);
    setActiveTab("create");
  };

  const handleCreateFormChange = (field, value) => {
    setCreateForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleReceiveFormChange = (field, value) => {
    setReceiveForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const applyReceivePoSelection = (po, { switchTab = false } = {}) => {
    console.log("APPLY RECEIVE PO SELECTION", po);
    setStatusMessage("");
    setErrorMessage("");

    if (!canReceivePurchaseOrder(po)) {
      throw new Error(
        `Purchase order ${po?.poId || ""} cannot be received. Only Ordered or Partially Received POs with remaining quantity can be received.`
      );
    }

    const poId = String(po?.poId ?? po?.po_id ?? "").trim();
    const productId = String(po?.productId ?? po?.product_id ?? "").trim();
    const productName = String(po?.productName ?? po?.product_name ?? productId).trim();
    const quantity = numberValue(po?.quantity);
    const receivedQty = numberValue(po?.receivedQty ?? po?.received_qty);
    const remainingQty = Math.max(0, quantity - receivedQty);

    if (!poId) {
      throw new Error("Cannot prefill receipt: purchase order id is missing.");
    }
    if (!productId && !productName) {
      throw new Error(`Cannot prefill receipt for ${poId}: product is missing.`);
    }
    if (remainingQty <= 0) {
      throw new Error(`Purchase order ${poId} is already fully received.`);
    }

    const nextForm = {
      poId,
      po_id: poId,
      productId,
      product_id: productId,
      productName,
      product_name: productName,
      quantity: String(quantity || remainingQty),
      remainingQty: String(remainingQty),
      receivedQty: String(remainingQty),
      grnNotes: "",
    };

    setSelectedPurchaseOrder(po);
    setReceiveForm(nextForm);
    if (switchTab) {
      setActiveTab("receive");
    }
    setStatusMessage(`Receive form prefilled for ${poId}.`);
  };

  const handlePrefillReceiveForm = (po) => {
    try {
      applyReceivePoSelection(po, { switchTab: true });
    } catch (err) {
      console.error("Prefill receive failed", err);
      setSelectedPurchaseOrder(null);
      setErrorMessage(err?.message || "Failed to prefill receive form.");
    }
  };

  const handleOpenPoSelect = (poId) => {
    try {
      setStatusMessage("");
      setErrorMessage("");
      if (!poId) {
        setSelectedPurchaseOrder(null);
        setReceiveForm(emptyReceiveForm);
        return;
      }
      const po = openPurchaseOrders.find((row) => row.poId === poId);
      if (!po) {
        throw new Error("Selected purchase order is no longer open.");
      }
      applyReceivePoSelection(po);
    } catch (err) {
      console.error("Open PO select failed", err);
      setSelectedPurchaseOrder(null);
      setReceiveForm(emptyReceiveForm);
      setErrorMessage(err?.message || "Failed to load purchase order for receipt.");
    }
  };

  const handleBulkCreateCriticalDraftPos = async () => {
    try {
      setBulkCreating(true);
      setStatusMessage("");
      setErrorMessage("");

      let result = {};
      if (supabase) {
        const critical = autoTriggers.filter(
          (item) => String(item.urgency || "").toUpperCase() === "CRITICAL" && item.canAutoCreate
        );
        const results = await Promise.allSettled(
          critical.map((item) =>
            createPurchaseOrderWrite({
              productId: item.productId,
              productName: item.productName,
              quantity: item.suggestedOrderQty || item.suggestedQty || item.reorderQty || 0,
              unitCost: numberValue(item.unitCost || procurementUnitCost(item)),
              supplier: item.supplier || procurementSupplier(item) || "",
              status: "Draft",
              tenantId: currentUser?.tenantId || currentUser?.tenant_id || null,
            })
          )
        );
        result = {
          summary: {
            createdCount: results.filter((r) => r.status === "fulfilled" && r.value?.success).length,
            skippedCount: Math.max(0, critical.length - results.length),
            failedCount: results.filter((r) => r.status === "rejected" || !r.value?.success).length,
          },
        };
      } else {
        if (!ALLOW_LEGACY_APPS_SCRIPT) {
          throw new Error("Supabase bulk purchase order creation is required for pilot access.");
        }
        logAppsScriptFallbackUsed("PurchaseOrders.bulkCreate", {
          primarySourceExpected: "Supabase createPurchaseOrderWrite loop",
          fallbackSourceUsed: "Apps Script bulkCreateDraftPurchaseOrders",
          riskLevel: "WARNING",
          reason: "Supabase client unavailable.",
        });
        const res = await bulkCreateDraftPurchaseOrders({
          onlyUrgency: "CRITICAL",
        });
        result = res?.data || {};
      }
      setStatusMessage(
        `Bulk draft PO run complete: Created ${result?.summary?.createdCount || 0}, Skipped ${result?.summary?.skippedCount || 0}, Failed ${result?.summary?.failedCount || 0}`
      );

      await refreshAll();
    } catch (err) {
      console.error(err);
      setErrorMessage(err?.message || "Failed to bulk create draft purchase orders");
    } finally {
      setBulkCreating(false);
    }
  };

  const handleCreatePurchaseOrder = async (e) => {
    e.preventDefault();
    try {
      setCreatingPo(true);
      setStatusMessage("");
      setErrorMessage("");

      const payload = {
        ...validateCreateForm(),
        tenantId,
      };

      let res;
      if (supabase) {
        res = await createPurchaseOrderWrite(payload);
      } else {
        if (!ALLOW_LEGACY_APPS_SCRIPT) {
          throw new Error("Supabase purchase order creation is required for pilot access.");
        }
        logAppsScriptFallbackUsed("PurchaseOrders.create", {
          primarySourceExpected: "Supabase createPurchaseOrderWrite",
          fallbackSourceUsed: "Apps Script createPurchaseOrder",
          riskLevel: "WARNING",
          reason: "Supabase client unavailable.",
        });
        res = await createPurchaseOrder(payload);
      }

      const result = res?.data || {};
      if (!res?.success && !result?.success) {
        throw new Error(res?.error || result?.message || "Failed to create purchase order");
      }
      setStatusMessage(`Purchase order created successfully: ${result.poId || ""}`);
      setCreateForm(emptyCreateForm);
      setSelectedCandidate(null);

      await refreshAll();
    } catch (err) {
      console.error(err);
      setErrorMessage(err?.message || "Failed to create purchase order");
    } finally {
      setCreatingPo(false);
    }
  };

  const handleReceivePurchaseOrder = async (e) => {
    e.preventDefault();
    try {
      setReceivingPo(true);
      setStatusMessage("");
      setErrorMessage("");

      const payload = {
        poId: receiveForm.poId,
        po_id: receiveForm.po_id || receiveForm.poId,
        productId: receiveForm.productId,
        product_id: receiveForm.product_id || receiveForm.productId,
        productName: receiveForm.productName,
        product_name: receiveForm.product_name || receiveForm.productName,
        quantity: Number(receiveForm.quantity || 0),
        remainingQty: Number(receiveForm.remainingQty || 0),
        receivedQty: Number(receiveForm.receivedQty || 0),
        grnNotes: receiveForm.grnNotes,
        tenantId,
        receivedBy: currentUser?.email || currentUser?.name || currentUser?.id || null,
      };
      const orderedQty = Number(receiveForm.quantity || 0);
      const remainingQty = Number(receiveForm.remainingQty || receiveForm.quantity || 0);
      const receivedQty = Number(receiveForm.receivedQty || 0);

      if (!receiveForm.poId) {
        throw new Error("Select or enter a purchase order before receiving stock.");
      }
      if (!selectedPurchaseOrder || !canReceivePurchaseOrder(selectedPurchaseOrder)) {
        throw new Error(
          "This purchase order cannot be received. Only Ordered or Partially Received POs with remaining quantity are eligible."
        );
      }
      if (!resolveCatalogProduct(receiveForm.productId)) {
        throw new Error("Select a valid product from catalog.");
      }
      if (receivedQty <= 0) {
        throw new Error("Received quantity must be greater than zero.");
      }
      if (remainingQty > 0 && receivedQty > remainingQty) {
        throw new Error(
          `Received quantity (${receivedQty}) cannot exceed remaining quantity (${remainingQty}) for ordered quantity ${orderedQty}.`
        );
      }

      let res;
      if (supabase) {
        res = await receivePurchaseOrderWrite(receiveForm.poId, payload);
      } else {
        if (!ALLOW_LEGACY_APPS_SCRIPT) {
          throw new Error("Supabase purchase receipt is required for pilot access.");
        }
        logAppsScriptFallbackUsed("PurchaseOrders.receive", {
          primarySourceExpected: "Supabase receivePurchaseOrderWrite",
          fallbackSourceUsed: "Apps Script receivePurchaseOrder",
          riskLevel: "WARNING",
          reason: "Supabase client unavailable.",
        });
        res = await receivePurchaseOrder(payload);
      }

      const result = res?.data || {};
      if (!res?.success && !result?.success) {
        throw new Error(res?.error || result?.message || "Failed to receive purchase order");
      }
      setStatusMessage(`Stock inward completed successfully${result.poId ? `: ${result.poId}` : ""}`);
      setReceiveForm(emptyReceiveForm);
      setSelectedPurchaseOrder(null);

      await refreshAll();
      invalidateAdminDashboardCaches();
    } catch (err) {
      console.error(err);
      setErrorMessage(err?.message || "Failed to receive purchase order");
    } finally {
      setReceivingPo(false);
    }
  };

  const handleStartEditPo = (po) => {
    if (!canEditOrCancelPurchaseOrder(po)) return;
    setEditingPo(po);
    setEditForm({
      productId: po.productId || "",
      productName: po.productName || "",
      quantity: String(po.quantity || ""),
      unitCost: String(po.unitCost || ""),
      supplier: po.supplier || "",
      status: po.status || "Draft",
    });
    setErrorMessage("");
    setStatusMessage("");
  };

  const handleSaveEditPo = async (e) => {
    e.preventDefault();
    if (!editingPo?.poId) return;
    try {
      setSavingEdit(true);
      setStatusMessage("");
      setErrorMessage("");

      const product = resolveCatalogProduct(editForm.productId);
      if (!product) throw new Error("Select a valid product from catalog.");
      const qty = Number(editForm.quantity || 0);
      const unitCost = Number(editForm.unitCost || 0);
      if (qty <= 0) throw new Error("Quantity must be greater than zero.");
      if (unitCost <= 0) throw new Error("Unit cost must be greater than zero.");

      const res = await updatePurchaseOrderWrite(editingPo.poId, {
        productId: product.productId,
        productName: product.productName || product.productId,
        quantity: qty,
        unitCost,
        supplier: editForm.supplier,
        status: editForm.status,
        tenantId,
      });
      if (!res?.success) throw new Error(res?.error || "Failed to update purchase order");

      setStatusMessage(`Purchase order updated: ${editingPo.poId}`);
      setEditingPo(null);
      setEditForm(emptyCreateForm);
      await refreshAll();
    } catch (err) {
      console.error(err);
      setErrorMessage(err?.message || "Failed to update purchase order");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCancelPo = async (po) => {
    if (!canEditOrCancelPurchaseOrder(po)) return;
    const confirmed =
      typeof window === "undefined" ||
      window.confirm(`Cancel purchase order ${po.poId}? This cannot be undone.`);
    if (!confirmed) return;

    try {
      setCancellingPoId(po.poId);
      setStatusMessage("");
      setErrorMessage("");
      const res = await cancelPurchaseOrderWrite(po.poId, { tenantId });
      if (!res?.success) throw new Error(res?.error || "Failed to cancel purchase order");
      setStatusMessage(`Purchase order cancelled: ${po.poId}`);
      if (editingPo?.poId === po.poId) {
        setEditingPo(null);
        setEditForm(emptyCreateForm);
      }
      await refreshAll();
    } catch (err) {
      console.error(err);
      setErrorMessage(err?.message || "Failed to cancel purchase order");
    } finally {
      setCancellingPoId("");
    }
  };

  const handleCreateDraftPoFromTrigger = async (item) => {
    try {
      if (!item?.canAutoCreate) {
        setErrorMessage("Open PO already exists for this product.");
        return;
      }

      setCreatingAutoPoId(item.productId);
      setStatusMessage("");
      setErrorMessage("");

      const payload = {
        productId: item.productId,
        productName: item.productName,
        quantity: item.suggestedOrderQty,
        unitCost: numberValue(item.unitCost || procurementUnitCost(item)),
        supplier: item.supplier || procurementSupplier(item) || "",
        status: "Draft",
        tenantId: currentUser?.tenantId || currentUser?.tenant_id || null,
      };

      let res;
      if (supabase) {
        res = await createPurchaseOrderWrite(payload);
      } else {
        if (!ALLOW_LEGACY_APPS_SCRIPT) {
          throw new Error("Supabase purchase order creation is required for pilot access.");
        }
        logAppsScriptFallbackUsed("PurchaseOrders.createFromTrigger", {
          primarySourceExpected: "Supabase createPurchaseOrderWrite",
          fallbackSourceUsed: "Apps Script createPurchaseOrder",
          riskLevel: "WARNING",
          reason: "Supabase client unavailable.",
        });
        res = await createPurchaseOrder(payload);
      }

      const result = res?.data || {};
      if (!res?.success && !result?.success) {
        throw new Error(res?.error || result?.message || "Failed to create draft purchase order");
      }
      setStatusMessage(`Draft purchase order created: ${result.poId || ""}`);

      await refreshAll();
    } catch (err) {
      console.error(err);
      setErrorMessage(err?.message || "Failed to create draft purchase order");
    } finally {
      setCreatingAutoPoId("");
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <PageSkeleton kpiCount={4} kpiColumns={4} listRows={8} />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Purchase &amp; Reorder Operations</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage reorder candidates, purchase orders, stock inward, and forecast-based draft PO suggestions.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={refreshAll}
            className="rounded-xl border bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-slate-50"
          >
            Refresh Dashboard
          </button>
        </div>
      </div>

      {statusMessage ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {statusMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Total POs</div>
          <div className="mt-1 text-2xl font-semibold">{poStats.total}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Open POs</div>
          <div className="mt-0.5 text-[11px] text-slate-400">Awaiting receipt</div>
          <div className="mt-1 text-2xl font-semibold">{poStats.open}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Received</div>
          <div className="mt-0.5 text-[11px] text-slate-400">Stock received</div>
          <div className="mt-1 text-2xl font-semibold">{poStats.received}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Total PO Value</div>
          <div className="mt-0.5 text-[11px] text-slate-400">Current PO value</div>
          <div className="mt-1 text-2xl font-semibold">{currency(poStats.totalValue)}</div>
        </div>
      </div>

      <ProcurementWorkflowGuide />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {PURCHASE_TAB_ORDER.map((tab) => {
          const meta = PURCHASE_TAB_META[tab];
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              aria-current={isActive ? "page" : undefined}
              className={`flex shrink-0 flex-col items-start rounded-xl px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 ${
                isActive
                  ? "min-w-[9rem] bg-black text-white shadow-md ring-2 ring-black ring-offset-2"
                  : "border bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span className="font-medium leading-tight">{meta.label}</span>
              {isActive ? (
                <span className="mt-0.5 line-clamp-1 text-xs leading-snug text-slate-300">
                  {meta.shortDescription}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <ActiveStepSummary meta={PURCHASE_TAB_META[activeTab]} onGoToTab={setActiveTab} />

      {activeTab === "triggers" && (
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          {autoTriggerSummary ? (
            <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
              <div className="rounded-xl border p-3">
                <div className="text-xs text-slate-500">Critical</div>
                <div className="text-xl font-semibold">{autoTriggerSummary.criticalCount || 0}</div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-slate-500">High</div>
                <div className="text-xl font-semibold">{autoTriggerSummary.highCount || 0}</div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-slate-500">Medium</div>
                <div className="text-xl font-semibold">{autoTriggerSummary.mediumCount || 0}</div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-slate-500">Blocked by Open PO</div>
                <div className="text-xl font-semibold">{autoTriggerSummary.blockedByOpenPo || 0}</div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-slate-500">Estimated PO Value</div>
                <div className="text-xl font-semibold">
                  {currency(autoTriggerSummary.totalEstimatedCost || 0)}
                </div>
              </div>
            </div>
          ) : null}

          {criticalActionableTriggers.length > 0 ? (
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={handleBulkCreateCriticalDraftPos}
                disabled={bulkCreating}
                className="rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {bulkCreating
                  ? "Creating Critical Draft POs..."
                  : "Create Draft POs for All Critical"}
              </button>
            </div>
          ) : null}

          <div className="space-y-3">
            {autoTriggers.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-sm text-slate-500">
                No reorder forecast suggestions right now.
              </div>
            ) : (
              autoTriggers.map((item) => (
                <div key={item.productId} className="rounded-2xl border p-4 shadow-sm">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold">{item.productName}</h3>
                        <span className="rounded-full border px-2 py-0.5 text-xs font-medium">
                          {item.productId}
                        </span>
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${urgencyBadgeClass(item.urgency)}`}>
                          {item.urgency}
                        </span>
                        {item.hasOpenPo ? (
                          <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                            Open PO Exists
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-1 text-sm text-slate-600">{item.autoTriggerReason}</p>

                      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-8">
                        <div><div className="text-xs text-slate-500">Current Stock</div><div className="font-medium">{item.currentStock}</div></div>
                        <div><div className="text-xs text-slate-500">Min Stock</div><div className="font-medium">{item.minStock}</div></div>
                        <div><div className="text-xs text-slate-500">Daily Use</div><div className="font-medium">{item.dailyConsumption}</div></div>
                        <div><div className="text-xs text-slate-500">Days Left</div><div className="font-medium">{item.daysLeft}</div></div>
                        <div><div className="text-xs text-slate-500">Suggested Qty</div><div className="font-medium">{item.suggestedOrderQty}</div></div>
                        <div><div className="text-xs text-slate-500">Supplier</div><div className="font-medium">{item.supplier || "-"}</div></div>
                        <div><div className="text-xs text-slate-500">Trigger Basis</div><div className="font-medium">{formatTriggerBasis(item.triggerBasis)}</div></div>
                        <div><div className="text-xs text-slate-500">Open PO</div><div className="font-medium">{item.hasOpenPo ? `${item.openPoId} (${item.openPoStatus})` : "No"}</div></div>
                      </div>
                    </div>

                    <div className="flex w-full flex-col gap-2 xl:w-60">
                      <div className="rounded-xl bg-slate-50 p-3 text-sm">
                        <div className="text-xs text-slate-500">Estimated Cost</div>
                        <div className="text-lg font-semibold">
                          {currency(item.estimatedCost || 0)}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleReviewForecastInCreatePo(item)}
                        className="rounded-xl border bg-white px-4 py-3 text-sm font-medium hover:bg-slate-50"
                      >
                        Review in Create PO
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCreateDraftPoFromTrigger(item)}
                        disabled={creatingAutoPoId === item.productId || !item.canAutoCreate}
                        className="rounded-xl bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
                      >
                        {creatingAutoPoId === item.productId
                          ? "Creating Draft PO..."
                          : !item.canAutoCreate
                          ? "Open PO Already Exists"
                          : "Create Draft PO"}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === "reorder" && (
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="space-y-3">
            {reorderCandidates.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-sm text-slate-500">
                No reorder candidates found.
              </div>
            ) : (
              reorderCandidates.map((item) => (
                <button
                  key={`${item.productId}-${item.productName}`}
                  type="button"
                  onClick={() => {
                    handleCandidateSelect(item);
                    setActiveTab("create");
                  }}
                  className="w-full rounded-2xl border p-4 text-left shadow-sm transition hover:bg-slate-50"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold">{item.productName}</span>
                        <span className="rounded-full border px-2 py-0.5 text-xs">{item.productId}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(item.stockHealth)}`}>
                          {item.stockHealth}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                        <div><div className="text-xs text-slate-500">Current</div><div className="font-medium">{item.currentStock}</div></div>
                        <div><div className="text-xs text-slate-500">Min</div><div className="font-medium">{item.minStock}</div></div>
                        <div><div className="text-xs text-slate-500">Reorder Qty</div><div className="font-medium">{item.reorderQty}</div></div>
                        <div><div className="text-xs text-slate-500">Suggested</div><div className="font-medium">{item.suggestedQty}</div></div>
                      </div>
                    </div>

                    <div className="text-sm font-medium text-slate-600">Tap to create PO</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === "smart" && (
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          {smartReorderSummary ? (
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-xl border p-3"><div className="text-xs text-slate-500">Critical</div><div className="text-xl font-semibold">{smartReorderSummary.criticalCount || 0}</div></div>
              <div className="rounded-xl border p-3"><div className="text-xs text-slate-500">High</div><div className="text-xl font-semibold">{smartReorderSummary.highUrgencyItems || 0}</div></div>
              <div className="rounded-xl border p-3"><div className="text-xs text-slate-500">Medium</div><div className="text-xl font-semibold">{smartReorderSummary.mediumUrgencyItems || 0}</div></div>
              <div className="rounded-xl border p-3"><div className="text-xs text-slate-500">Suggested Qty</div><div className="text-xl font-semibold">{smartReorderSummary.totalSuggestedOrderQty || 0}</div></div>
            </div>
          ) : null}

          <div className="space-y-3">
            {smartReorder.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-sm text-slate-500">
                No smart reorder insights available.
              </div>
            ) : (
              smartReorder.map((item) => (
                <div key={item.productId} className="rounded-2xl border p-4 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold">{item.productName}</span>
                        <span className="rounded-full border px-2 py-0.5 text-xs">{item.productId}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${urgencyBadgeClass(item.urgency)}`}>
                          {item.urgency}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
                        <div><div className="text-xs text-slate-500">Current</div><div className="font-medium">{item.currentStock}</div></div>
                        <div><div className="text-xs text-slate-500">Min</div><div className="font-medium">{item.minStock}</div></div>
                        <div><div className="text-xs text-slate-500">30D Sold</div><div className="font-medium">{item.totalSoldLast30Days}</div></div>
                        <div><div className="text-xs text-slate-500">Daily</div><div className="font-medium">{item.dailyConsumption}</div></div>
                        <div><div className="text-xs text-slate-500">Days Left</div><div className="font-medium">{item.daysLeft}</div></div>
                        <div><div className="text-xs text-slate-500">Suggested</div><div className="font-medium">{item.suggestedOrderQty}</div></div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCandidate(candidateFromProcurementItem(item));
                        setCreateForm(buildCreateFormFromItem(item));
                        setStatusMessage(
                          `Create PO form prefilled for ${item.productName || item.productId || "smart reorder item"}.`
                        );
                        setErrorMessage("");
                        setActiveTab("create");
                      }}
                      className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
                    >
                      Use in PO
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === "create" && (
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          {selectedCandidate ? (
            <div className="mb-4 rounded-2xl border bg-slate-50 p-4 text-sm">
              <div className="font-medium">Selected Candidate</div>
              <div className="mt-1 text-slate-600">
                {selectedCandidate.productName} ({selectedCandidate.productId}) — Suggested Qty:{" "}
                {selectedCandidate.suggestedQty || selectedCandidate.reorderQty || 0}
              </div>
            </div>
          ) : null}

          <form onSubmit={handleCreatePurchaseOrder} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="lg:col-span-2">
              <label className="mb-1 block text-sm font-medium">Product</label>
              {catalogProductsError ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
                  {catalogProductsError}
                </p>
              ) : catalogProducts.length === 0 ? (
                <p className="rounded-xl border border-dashed px-3 py-3 text-sm text-slate-500">
                  No active products found for this tenant. Create products in Master Catalog first.
                </p>
              ) : (
                <ProductCatalogPicker
                  products={catalogProducts}
                  value={createForm.productId}
                  onSelect={applyCatalogProductToCreateForm}
                />
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Product Name</label>
              <input
                type="text"
                value={createForm.productName}
                readOnly
                className="w-full rounded-xl border bg-slate-50 px-3 py-3 text-sm text-slate-700 outline-none"
                placeholder="Auto-filled from catalog"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Product ID</label>
              <input
                type="text"
                value={createForm.productId}
                readOnly
                className="w-full rounded-xl border bg-slate-50 px-3 py-3 text-sm text-slate-700 outline-none"
                placeholder="Auto-filled from catalog"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Quantity</label>
              <input type="number" min="1" step="1" value={createForm.quantity} onChange={(e) => handleCreateFormChange("quantity", e.target.value)} className="w-full rounded-xl border px-3 py-3 text-sm outline-none focus:ring" required />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Unit Cost</label>
              <input type="number" min="0.01" step="0.01" value={createForm.unitCost} onChange={(e) => handleCreateFormChange("unitCost", e.target.value)} className="w-full rounded-xl border px-3 py-3 text-sm outline-none focus:ring" required />
              <p className="mt-1 text-xs text-slate-500">Defaults from product cost; override per order if supplier price differs.</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Supplier</label>
              <input type="text" value={createForm.supplier} onChange={(e) => handleCreateFormChange("supplier", e.target.value)} className="w-full rounded-xl border px-3 py-3 text-sm outline-none focus:ring" />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Status</label>
              <select value={createForm.status} onChange={(e) => handleCreateFormChange("status", e.target.value)} className="w-full rounded-xl border px-3 py-3 text-sm outline-none focus:ring">
                <option value="Draft">Draft</option>
                <option value="Ordered">Ordered</option>
              </select>
            </div>

            <div className="lg:col-span-2 flex flex-col gap-3 sm:flex-row">
              <button type="submit" disabled={creatingPo} className="rounded-xl bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50">
                {creatingPo ? "Creating..." : "Create Purchase Order"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setCreateForm(emptyCreateForm);
                  setSelectedCandidate(null);
                  setStatusMessage("Create purchase order form reset.");
                  setErrorMessage("");
                }}
                className="rounded-xl border bg-white px-4 py-3 text-sm font-medium hover:bg-slate-50"
              >
                Reset
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === "receive" && (
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium">Open Purchase Order</label>
            <select
              value={receiveForm.poId || ""}
              onChange={(e) => handleOpenPoSelect(e.target.value)}
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring"
            >
              <option value="">Select open purchase order...</option>
              {openPurchaseOrders.map((po) => (
                <option key={po.poId} value={po.poId}>
                  {po.poId} — {po.productName || po.productId} ({po.status})
                </option>
              ))}
            </select>
          </div>

          {openPurchaseOrders.length === 0 ? (
            <div className="mb-4 rounded-xl border border-dashed p-4 text-sm text-slate-500">
              No open purchase orders available for receipt.
            </div>
          ) : null}

          {selectedPurchaseOrder ? (
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <div className="text-xs text-slate-500">PO ID</div>
                  <div className="font-medium">{receiveForm.poId || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Product</div>
                  <div className="font-medium">
                    {receiveForm.productName || "-"} ({receiveForm.productId || "-"})
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Supplier</div>
                  <div className="font-medium">{selectedPurchaseOrder.supplier || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Ordered Qty</div>
                  <div className="font-medium">{receiveForm.quantity || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Remaining Qty</div>
                  <div className="font-medium">{receiveForm.remainingQty || "-"}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Status</div>
                  <div className="font-medium">{selectedPurchaseOrder.status || "-"}</div>
                </div>
              </div>
            </div>
          ) : null}

          <form onSubmit={handleReceivePurchaseOrder} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Received Qty</label>
              <input
                type="number"
                min="1"
                value={receiveForm.receivedQty}
                onChange={(e) => handleReceiveFormChange("receivedQty", e.target.value)}
                className="w-full rounded-xl border px-3 py-3 text-sm outline-none focus:ring"
                disabled={!selectedPurchaseOrder}
                required
              />
            </div>

            <div className="lg:col-span-2">
              <label className="mb-1 block text-sm font-medium">GRN Notes</label>
              <textarea
                value={receiveForm.grnNotes}
                onChange={(e) => handleReceiveFormChange("grnNotes", e.target.value)}
                rows={4}
                className="w-full rounded-xl border px-3 py-3 text-sm outline-none focus:ring"
                disabled={!selectedPurchaseOrder}
              />
            </div>

            <div className="lg:col-span-2 flex flex-col gap-3 sm:flex-row">
              <button type="submit" disabled={receivingPo || !selectedPurchaseOrder || !receiveForm.poId || Number(receiveForm.receivedQty || 0) <= 0} className="rounded-xl bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50">
                {receivingPo ? "Receiving..." : "Receive Purchase Order"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setReceiveForm(emptyReceiveForm);
                  setSelectedPurchaseOrder(null);
                  setStatusMessage("Receive stock form reset.");
                  setErrorMessage("");
                }}
                className="rounded-xl border bg-white px-4 py-3 text-sm font-medium hover:bg-slate-50"
              >
                Reset
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === "history" && (
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input type="text" value={poSearch} onChange={(e) => setPoSearch(e.target.value)} placeholder="Search PO / product / supplier" className="rounded-xl border px-3 py-2 text-sm outline-none focus:ring" />
            <select value={poStatusFilter} onChange={(e) => setPoStatusFilter(e.target.value)} className="rounded-xl border px-3 py-2 text-sm outline-none focus:ring">
                <option value="">All Statuses</option>
                <option value="Draft">Draft</option>
                <option value="Ordered">Ordered</option>
                <option value="Partially Received">Partially Received</option>
                <option value="Received">Received</option>
                <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          <div className="space-y-3">
            {filteredPurchaseOrders.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-sm text-slate-500">
                No purchase orders found.
              </div>
            ) : (
              filteredPurchaseOrders.map((po) => (
                <div key={po.poId} className="rounded-2xl border p-4 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold">{po.productName}</span>
                        <span className="rounded-full border px-2 py-0.5 text-xs">{po.poId}</span>
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadgeClass(po.status)}`}>
                          {po.status || "Draft"}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
                        <div><div className="text-xs text-slate-500">Date</div><div className="font-medium">{po.poDate || "-"}</div></div>
                        <div><div className="text-xs text-slate-500">Product ID</div><div className="font-medium">{po.productId || "-"}</div></div>
                        <div><div className="text-xs text-slate-500">Quantity</div><div className="font-medium">{po.quantity || 0}</div></div>
                        <div><div className="text-xs text-slate-500">Unit Cost</div><div className="font-medium">{currency(po.unitCost || 0)}</div></div>
                        <div><div className="text-xs text-slate-500">Total Cost</div><div className="font-medium">{currency(po.totalCost || 0)}</div></div>
                        <div><div className="text-xs text-slate-500">Supplier</div><div className="font-medium">{po.supplier || "-"}</div></div>
                      </div>
                    </div>

                    <div className="flex w-full flex-col gap-2 lg:w-auto lg:min-w-[12rem]">
                      {canReceivePurchaseOrder(po) ? (
                        <button
                          type="button"
                          onClick={() => handlePrefillReceiveForm(po)}
                          className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
                        >
                          Prefill Receive Form
                        </button>
                      ) : null}
                      {canEditOrCancelPurchaseOrder(po) ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleStartEditPo(po)}
                            className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleCancelPo(po)}
                            disabled={cancellingPoId === po.poId}
                            className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                          >
                            {cancellingPoId === po.poId ? "Cancelling…" : "Cancel PO"}
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === "suppliers" && (
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          {supplierSummary ? (
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-xl border p-3"><div className="text-xs text-slate-500">Total Suppliers</div><div className="text-xl font-semibold">{supplierSummary.totalSuppliers || 0}</div></div>
              <div className="rounded-xl border p-3"><div className="text-xs text-slate-500">Active Suppliers</div><div className="text-xl font-semibold">{supplierSummary.activeSuppliers || 0}</div></div>
              <div className="rounded-xl border p-3"><div className="text-xs text-slate-500">Suppliers With Open POs</div><div className="text-xl font-semibold">{supplierSummary.suppliersWithOpenPos || 0}</div></div>
              <div className="rounded-xl border p-3"><div className="text-xs text-slate-500">Total PO Value</div><div className="text-xl font-semibold">{currency(supplierSummary.totalPoValue || 0)}</div></div>
            </div>
          ) : null}

          <div className="space-y-3">
            {supplierDashboard.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-sm text-slate-500">
                No supplier data found.
              </div>
            ) : (
              supplierDashboard.map((supplier) => (
                <div key={supplier.supplierName} className="rounded-2xl border p-4 shadow-sm">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold">{supplier.supplierName}</h3>
                        {supplier.openPOs > 0 ? (
                          <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                            {supplier.openPOs} Open
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                        <div><div className="text-xs text-slate-500">Total POs</div><div className="font-medium">{supplier.totalPOs}</div></div>
                        <div><div className="text-xs text-slate-500">Received</div><div className="font-medium">{supplier.receivedPOs}</div></div>
                        <div><div className="text-xs text-slate-500">Qty Ordered</div><div className="font-medium">{supplier.totalOrderedQty}</div></div>
                        <div><div className="text-xs text-slate-500">Value</div><div className="font-medium">{currency(supplier.totalOrderedValue)}</div></div>
                        <div><div className="text-xs text-slate-500">Avg Unit Cost</div><div className="font-medium">{currency(supplier.averageUnitCost)}</div></div>
                        <div><div className="text-xs text-slate-500">Last PO Date</div><div className="font-medium">{supplier.lastPODate || "-"}</div></div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {editingPo ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={handleSaveEditPo}
            className="w-full max-w-lg rounded-2xl border bg-white p-4 shadow-lg"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Edit purchase order · {editingPo.poId}</h3>
              <button
                type="button"
                onClick={() => {
                  setEditingPo(null);
                  setEditForm(emptyCreateForm);
                }}
                className="text-sm text-slate-500 hover:text-slate-800"
              >
                Close
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Product</label>
                <ProductCatalogPicker
                  products={catalogProducts}
                  value={editForm.productId}
                  onSelect={(product) => {
                    setEditForm((prev) => ({
                      ...prev,
                      productId: product.productId,
                      productName: product.productName || product.productId,
                      unitCost: catalogProductCost(product) || prev.unitCost,
                    }));
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={editForm.quantity}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, quantity: e.target.value }))}
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">Unit Cost</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={editForm.unitCost}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, unitCost: e.target.value }))}
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Supplier</label>
                <input
                  type="text"
                  value={editForm.supplier}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, supplier: e.target.value }))}
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Status</label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value }))}
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                >
                  <option value="Draft">Draft</option>
                  <option value="Ordered">Ordered</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingPo(null);
                  setEditForm(emptyCreateForm);
                }}
                className="rounded-xl border px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="rounded-xl bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {savingEdit ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}