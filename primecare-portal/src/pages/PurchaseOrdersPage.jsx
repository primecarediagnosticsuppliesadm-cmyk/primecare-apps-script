import React, { useEffect, useMemo, useState } from "react";
import {
  getPurchaseDashboard,
  createPurchaseOrder,
  receivePurchaseOrder,
  bulkCreateDraftPurchaseOrders,
} from "@/api/primecareApi";

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

export default function PurchaseOrdersPage() {
  const [dashboard, setDashboard] = useState(null);
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
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [receiveForm, setReceiveForm] = useState(emptyReceiveForm);

  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [poSearch, setPoSearch] = useState("");
  const [poStatusFilter, setPoStatusFilter] = useState("");
  const [activeTab, setActiveTab] = useState("triggers");
  const [bulkCreating, setBulkCreating] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  const loadPurchaseDashboard = async () => {
    const res = await getPurchaseDashboard();
    const payload = res?.data || {};

    setDashboard(payload || null);
    setPurchaseOrders(Array.isArray(payload?.purchaseOrders) ? payload.purchaseOrders : []);
    setReorderCandidates(Array.isArray(payload?.reorderCandidates) ? payload.reorderCandidates : []);
    setSmartReorder(Array.isArray(payload?.smartReorder?.items) ? payload.smartReorder.items : []);
    setSmartReorderSummary(payload?.smartReorder?.summary || null);
    setSupplierDashboard(Array.isArray(payload?.supplierDashboard?.suppliers) ? payload.supplierDashboard.suppliers : []);
    setSupplierSummary(payload?.supplierDashboard?.summary || null);
    setAutoTriggers(Array.isArray(payload?.autoPurchaseTriggers?.triggers) ? payload.autoPurchaseTriggers.triggers : []);
    setAutoTriggerSummary(payload?.autoPurchaseTriggers?.summary || null);
  };

  const refreshAll = async () => {
    try {
      setErrorMessage("");
      await loadPurchaseDashboard();
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
        await loadPurchaseDashboard();
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
      open: purchaseOrders.filter((po) =>
        ["draft", "ordered", "partially received"].includes(String(po.status || "").toLowerCase())
      ).length,
      received: purchaseOrders.filter(
        (po) => String(po.status || "").toLowerCase() === "received"
      ).length,
      totalValue: purchaseOrders.reduce((sum, po) => sum + numberValue(po.totalCost), 0),
    };
  }, [purchaseOrders]);

  const handleCandidateSelect = (item) => {
    setSelectedCandidate(item);
    setCreateForm({
      productId: item?.productId || "",
      productName: item?.productName || "",
      quantity: item?.suggestedQty || item?.reorderQty || "",
      unitCost: "",
      supplier: "",
      status: "Draft",
    });
    setStatusMessage("");
    setErrorMessage("");
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

  const handleBulkCreateCriticalDraftPos = async () => {
    try {
      setBulkCreating(true);
      setStatusMessage("");
      setErrorMessage("");
      setBulkResult(null);

      const res = await bulkCreateDraftPurchaseOrders({
        onlyUrgency: "CRITICAL",
      });

      const result = res?.data || {};
      setBulkResult(result);
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

      const res = await createPurchaseOrder({
        productId: createForm.productId,
        productName: createForm.productName,
        quantity: Number(createForm.quantity || 0),
        unitCost: Number(createForm.unitCost || 0),
        supplier: createForm.supplier,
        status: createForm.status || "Draft",
      });

      const result = res?.data || {};
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

      const res = await receivePurchaseOrder({
        poId: receiveForm.poId,
        receivedQty: Number(receiveForm.receivedQty || 0),
        grnNotes: receiveForm.grnNotes,
      });

      const result = res?.data || {};
      setStatusMessage(`Purchase order received successfully: ${result.poId || ""}`);
      setReceiveForm(emptyReceiveForm);

      await refreshAll();
    } catch (err) {
      console.error(err);
      setErrorMessage(err?.message || "Failed to receive purchase order");
    } finally {
      setReceivingPo(false);
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

      const res = await createPurchaseOrder({
        productId: item.productId,
        productName: item.productName,
        quantity: item.suggestedOrderQty,
        unitCost: item.unitCost || 0,
        supplier: item.supplier || "",
        status: "Draft",
      });

      const result = res?.data || {};
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
      <div className="p-4 sm:p-6">
        <div className="rounded-2xl border border-dashed bg-white p-8 text-sm text-slate-500 shadow-sm">
          Loading purchase operations...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Purchase &amp; Reorder Operations</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage reorder candidates, purchase orders, stock inward, and auto-triggered procurement.
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
          <div className="mt-1 text-2xl font-semibold">{poStats.open}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Received</div>
          <div className="mt-1 text-2xl font-semibold">{poStats.received}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Total PO Value</div>
          <div className="mt-1 text-2xl font-semibold">{currency(poStats.totalValue)}</div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {["triggers", "reorder", "smart", "create", "receive", "history", "suppliers"].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`rounded-xl px-4 py-2 text-sm font-medium ${
              activeTab === tab ? "bg-black text-white" : "border bg-white"
            }`}
          >
            {tab === "triggers" && "Auto Triggers"}
            {tab === "reorder" && "Reorder Candidates"}
            {tab === "smart" && "Smart Reorder"}
            {tab === "create" && "Create PO"}
            {tab === "receive" && "Receive Stock"}
            {tab === "history" && "Purchase Orders"}
            {tab === "suppliers" && "Suppliers"}
          </button>
        ))}
      </div>

      {activeTab === "triggers" && (
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Auto Purchase Triggers</h2>
              <p className="text-sm text-slate-500">
                Urgent SKUs detected from stock level and sales velocity.
              </p>
            </div>

            <button
              type="button"
              onClick={handleBulkCreateCriticalDraftPos}
              disabled={bulkCreating}
              className="rounded-xl bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {bulkCreating ? "Creating Critical Draft POs..." : "Create Draft POs for All Critical"}
            </button>
          </div>

          {autoTriggerSummary ? (
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
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

          <div className="space-y-3">
            {autoTriggers.length === 0 ? (
              <div className="rounded-xl border border-dashed p-6 text-sm text-slate-500">
                No urgent auto purchase triggers right now.
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
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Reorder Candidates</h2>
            <p className="text-sm text-slate-500">
              Products below safe stock level. Tap a candidate to prefill purchase order form.
            </p>
          </div>

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
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Smart Procurement Insights</h2>
            <p className="text-sm text-slate-500">
              Velocity-based reorder intelligence using recent order-line consumption.
            </p>
          </div>

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
                        setCreateForm({
                          productId: item.productId || "",
                          productName: item.productName || "",
                          quantity: item.suggestedOrderQty || "",
                          unitCost: "",
                          supplier: "",
                          status: "Draft",
                        });
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
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Create Purchase Order</h2>
          </div>

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
            <div>
              <label className="mb-1 block text-sm font-medium">Product ID</label>
              <input type="text" value={createForm.productId} onChange={(e) => handleCreateFormChange("productId", e.target.value)} className="w-full rounded-xl border px-3 py-3 text-sm outline-none focus:ring" required />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Product Name</label>
              <input type="text" value={createForm.productName} onChange={(e) => handleCreateFormChange("productName", e.target.value)} className="w-full rounded-xl border px-3 py-3 text-sm outline-none focus:ring" required />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Quantity</label>
              <input type="number" min="1" value={createForm.quantity} onChange={(e) => handleCreateFormChange("quantity", e.target.value)} className="w-full rounded-xl border px-3 py-3 text-sm outline-none focus:ring" required />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Unit Cost</label>
              <input type="number" min="0" step="0.01" value={createForm.unitCost} onChange={(e) => handleCreateFormChange("unitCost", e.target.value)} className="w-full rounded-xl border px-3 py-3 text-sm outline-none focus:ring" required />
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
            <h2 className="text-lg font-semibold">Goods Receipt / Stock Inward</h2>
          </div>

          <form onSubmit={handleReceivePurchaseOrder} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">PO ID</label>
              <input type="text" value={receiveForm.poId} onChange={(e) => handleReceiveFormChange("poId", e.target.value)} className="w-full rounded-xl border px-3 py-3 text-sm outline-none focus:ring" required />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Received Qty</label>
              <input type="number" min="1" value={receiveForm.receivedQty} onChange={(e) => handleReceiveFormChange("receivedQty", e.target.value)} className="w-full rounded-xl border px-3 py-3 text-sm outline-none focus:ring" required />
            </div>

            <div className="lg:col-span-2">
              <label className="mb-1 block text-sm font-medium">GRN Notes</label>
              <textarea value={receiveForm.grnNotes} onChange={(e) => handleReceiveFormChange("grnNotes", e.target.value)} rows={4} className="w-full rounded-xl border px-3 py-3 text-sm outline-none focus:ring" />
            </div>

            <div className="lg:col-span-2 flex flex-col gap-3 sm:flex-row">
              <button type="submit" disabled={receivingPo} className="rounded-xl bg-black px-4 py-3 text-sm font-medium text-white disabled:opacity-50">
                {receivingPo ? "Receiving..." : "Receive Purchase Order"}
              </button>

              <button type="button" onClick={() => setReceiveForm(emptyReceiveForm)} className="rounded-xl border bg-white px-4 py-3 text-sm font-medium hover:bg-slate-50">
                Reset
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === "history" && (
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Purchase Orders</h2>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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

                    <button
                      type="button"
                      onClick={() =>
                        setReceiveForm({
                          poId: po.poId || "",
                          receivedQty: Math.max(0, Number(po.quantity || 0) - Number(po.receivedQty || 0)),
                          grnNotes: "",
                        })
                      }
                      className="rounded-xl border bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
                    >
                      Prefill Receive Form
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === "suppliers" && (
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Supplier Dashboard</h2>
          </div>

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
    </div>
  );
}