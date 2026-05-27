import React, { useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ShoppingCart,
  RotateCcw,
  FileText,
  IndianRupee,
  Minus,
  Plus,
  Trash2,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  PackageX,
  X,
  Clock3,
  Package,
  FlaskConical,
  ShieldCheck,
} from "lucide-react";
import {
  getLabCatalog,
  getLabRecentOrders,
  getOrderDetails,
  submitLabOrder,
} from "@/api/primecareApi";
import {
  createOrderWrite,
  getCollectionsRead,
  getLabCatalogRead,
  getLabRecentOrdersRead,
  getOrderDetailsRead,
  mapOrderRow,
} from "@/api/primecareSupabaseApi";
import { supabase } from "@/api/supabaseClient.js";
import { filterCollectionsForUser } from "@/utils/accessFilters.js";
import { labIdKey } from "@/utils/labId.js";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import {
  logAppsScriptFallbackUsed,
  logAppsScriptPrimarySource,
  logPartialMigrationWarning,
  logSupabaseFeatureSource,
} from "@/utils/migrationTrace.js";
import { ALLOW_LEGACY_APPS_SCRIPT } from "@/config/environment";

function QuickStat({ title, value, icon: Icon }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-500">{title}</div>
          <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
        </div>
        <div className="rounded-xl bg-slate-50 p-2">
          <Icon className="h-4 w-4 text-slate-700" />
        </div>
      </div>
    </div>
  );
}

function QtyControl({
  value,
  onDecrease,
  onIncrease,
  compact = false,
  disabled = false,
}) {
  return (
    <div
      className={`inline-flex items-center rounded-xl border bg-white ${
        compact ? "h-9" : "h-11"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <button
        type="button"
        onClick={onDecrease}
        disabled={disabled}
        className="flex h-full w-10 items-center justify-center text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed"
      >
        <Minus className="h-4 w-4" />
      </button>
      <div className="min-w-[42px] px-2 text-center text-sm font-semibold text-slate-900">
        {value}
      </div>
      <button
        type="button"
        onClick={onIncrease}
        disabled={disabled}
        className="flex h-full w-10 items-center justify-center text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

function StockBadge({ stockHealth, currentStock }) {
  if (stockHealth === "OUT") {
    return (
      <Badge variant="destructive" className="gap-1 border-red-300 bg-red-100 text-red-700">
        <PackageX className="h-3 w-3" />
        Out of Stock
      </Badge>
    );
  }

  if (stockHealth === "LOW") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-amber-300 bg-amber-50 text-amber-700"
      >
        <AlertTriangle className="h-3 w-3" />
        Low Stock
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
      <ShieldCheck className="mr-1 h-3 w-3" />
      In Stock {Number(currentStock || 0).toLocaleString()}
    </Badge>
  );
}

function categoryIcon(category) {
  const c = String(category || "").toLowerCase();
  if (c.includes("reagent") || c.includes("chemical")) return FlaskConical;
  if (c.includes("kit") || c.includes("pack")) return Package;
  return Package;
}

export default function LabOrderingPage({ currentUser }) {
  const [activeTab, setActiveTab] = useState("catalog");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [catalog, setCatalog] = useState([]);
  const [recentOrders, setRecentOrders] = useState([]);
  const [cartItems, setCartItems] = useState([]);
  const [productQty, setProductQty] = useState({});
  const [notes, setNotes] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);

  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);
  const [loadingOrderDetails, setLoadingOrderDetails] = useState(false);

  const labId =
    currentUser?.labId ||
    currentUser?.labCode ||
    currentUser?.accountId ||
    currentUser?.id ||
    "";

  const labName = currentUser?.labName || currentUser?.name || "Lab";
  const [outstandingBalance, setOutstandingBalance] = useState(
    Number(currentUser?.outstanding ?? 0)
  );

  // CREDIT CONTROL (NEW)
  const creditStatus = (currentUser?.creditStatus || "").toUpperCase();
  const creditReason = currentUser?.creditReason || "";
  const isCreditHold = creditStatus === "HOLD";
  const isNearLimit = creditStatus === "NEAR_LIMIT";


  const profileLabKey = labIdKey(labId);

  const scopedRecentOrders = useMemo(() => {
    if (!profileLabKey) return recentOrders;
    return recentOrders.filter((o) => {
      const rowLab = labIdKey(o.labId || o.lab_id);
      return !rowLab || rowLab === profileLabKey;
    });
  }, [recentOrders, profileLabKey]);

  const crossLabOrderCount = useMemo(() => {
    if (!profileLabKey) return 0;
    return recentOrders.filter((o) => {
      const rowLab = labIdKey(o.labId || o.lab_id);
      return rowLab && rowLab !== profileLabKey;
    }).length;
  }, [recentOrders, profileLabKey]);

  usePredatorModuleValidation(
    "Lab Portal",
    currentUser,
    {
      labId,
      recentOrdersCount: scopedRecentOrders.length,
      crossLabOrderCount,
      isLabAccountView: false,
      catalogLoaded: !loadingCatalog,
      ordersLoaded: !loadingOrders,
      cartLineCount: cartItems.length,
      cartQtyCount: cartItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      selectedOrderId: selectedOrderId || null,
      cartDrawerOpen: isCartOpen,
      submitting,
    },
    !loadingCatalog && !loadingOrders
  );

  useEffect(() => {
    loadCatalog();
    loadRecentOrders();
    loadAccountOutstanding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labId]);

  async function loadAccountOutstanding() {
    try {
      const res = await getCollectionsRead();
      const allRows = Array.isArray(res?.data?.collections) ? res.data.collections : [];
      const rows = filterCollectionsForUser(allRows, currentUser);
      const own = rows[0];
      const amount = Number(own?.outstandingAmount ?? own?.outstanding_amount ?? 0);
      if (Number.isFinite(amount)) {
        setOutstandingBalance(amount);
      }
    } catch (e) {
      console.warn("[LabOrderingPage] loadAccountOutstanding:", e?.message || e);
    }
  }

  async function loadCatalog() {
    try {
      setLoadingCatalog(true);
      setErrorMessage("");

      if (supabase) {
        logSupabaseFeatureSource("LabOrdering.catalog", { api: "getLabCatalogRead" });
        const sbRes = await getLabCatalogRead();
        if (!sbRes?.success) {
          throw new Error(sbRes?.error || "Supabase lab catalog read failed.");
        }

        const products = Array.isArray(sbRes?.data?.products) ? sbRes.data.products : [];
        console.log("SUPABASE LAB CATALOG", {
          count: products.length,
          source: sbRes?.data?.source || "supabase",
        });

        setCatalog(products);

        const defaultQtyMap = {};
        products.forEach((item) => {
          defaultQtyMap[item.productId] = 1;
        });
        setProductQty(defaultQtyMap);
        return;
      }

      if (!ALLOW_LEGACY_APPS_SCRIPT) {
        throw new Error("Supabase catalog is required for pilot access.");
      }

      console.warn("LAB CATALOG FALLBACK USED", {
        feature: "LabOrdering.catalog",
        primarySourceExpected: "Supabase getLabCatalogRead",
        fallbackSourceUsed: "Apps Script getLabCatalog",
        reason: "Supabase client unavailable.",
      });
      logAppsScriptPrimarySource("LabOrdering.catalog", "getLabCatalog");
      const res = await getLabCatalog(labId);
      const result = res?.data || res || {};
      const products = Array.isArray(result?.products) ? result.products : [];

      setCatalog(products);

      const defaultQtyMap = {};
      products.forEach((item) => {
        defaultQtyMap[item.productId] = 1;
      });
      setProductQty(defaultQtyMap);
    } catch (error) {
      console.error("Failed to load catalog", error);
      setErrorMessage("Unable to load product catalog right now.");
    } finally {
      setLoadingCatalog(false);
    }
  }

  async function loadRecentOrders() {
    try {
      setLoadingOrders(true);

      let supabaseOrders = [];
      if (supabase && labId) {
        logSupabaseFeatureSource("LabOrdering.recentOrders", { api: "getLabRecentOrdersRead" });
        const sbRes = await getLabRecentOrdersRead(labId);
        supabaseOrders = Array.isArray(sbRes?.data?.orders) ? sbRes.data.orders : [];
      }

      let scriptOrders = [];
      if (ALLOW_LEGACY_APPS_SCRIPT) {
        try {
          logAppsScriptPrimarySource("LabOrdering.recentOrders", "getLabRecentOrders");
          const res = await getLabRecentOrders(labId);
          const result = res?.data || res || {};
          scriptOrders = Array.isArray(result?.orders) ? result.orders : [];
        } catch (e) {
          console.warn("[LabOrderingPage] getLabRecentOrders:", e?.message || e);
        }
      }

      const byId = new Map();
      for (const o of [...supabaseOrders, ...scriptOrders]) {
        const id = String(o?.orderId || o?.order_id || "").trim();
        if (!id) continue;
        if (!byId.has(id)) byId.set(id, o);
      }

      const merged = Array.from(byId.values()).sort((a, b) => {
        const da = String(a.orderDate || a.order_date || a.date || "");
        const db = String(b.orderDate || b.order_date || b.date || "");
        return db.localeCompare(da);
      });

      setRecentOrders(merged);
    } catch (error) {
      console.error("Failed to load recent orders", error);
    } finally {
      setLoadingOrders(false);
    }
  }

  async function openOrderDetails(orderId) {
    try {
      setLoadingOrderDetails(true);
      setErrorMessage("");

      if (supabase) {
        const sup = await getOrderDetailsRead(orderId);
        if (sup?.data?.order) {
          const orderLab = labIdKey(sup.data.order.labId || sup.data.order.lab_id);
          if (profileLabKey && orderLab && orderLab !== profileLabKey) {
            throw new Error("This order is not available for your lab account.");
          }
          setSelectedOrderId(orderId);
          setSelectedOrderDetails(sup.data);
          return sup.data;
        }
      }

      const res = await getOrderDetails(orderId);
      const result = res?.data || res || {};
      setSelectedOrderId(orderId);
      setSelectedOrderDetails(result);
      return result;
    } catch (error) {
      console.error("Failed to load order details", error);
      setErrorMessage(
        error.message || "Unable to load order details right now."
      );
      return null;
    } finally {
      setLoadingOrderDetails(false);
    }
  }

  const visibleCatalog = useMemo(() => {
    return catalog.filter((item) => {
      const matchesSearch = `${item.productName || ""} ${item.category || ""} ${item.productId || ""}`
        .toLowerCase()
        .includes(search.toLowerCase());
      if (!matchesSearch) return false;
      if (categoryFilter === "all") return true;
      return String(item.category || "").toLowerCase() === categoryFilter;
    });
  }, [catalog, search, categoryFilter]);

  const categoryOptions = useMemo(() => {
    const set = new Set();
    for (const item of catalog) {
      const c = String(item.category || "").trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [catalog]);

  const productOrderStats = useMemo(() => {
    const byProduct = new Map();
    for (const order of scopedRecentOrders) {
      const lines = Array.isArray(order?.lines) ? order.lines : [];
      for (const line of lines) {
        const productId = String(line?.productId || "").trim();
        if (!productId) continue;
        const row = byProduct.get(productId) || {
          count: 0,
          qty: 0,
          lastDate: "",
        };
        row.count += 1;
        row.qty += Number(line?.quantity || 0);
        row.lastDate = String(order.orderDate || order.order_date || order.date || "");
        byProduct.set(productId, row);
      }
    }
    return byProduct;
  }, [scopedRecentOrders]);

  const frequentlyOrdered = useMemo(() => {
    return visibleCatalog
      .filter((item) => productOrderStats.has(String(item.productId || "")))
      .sort((a, b) => {
        const aa = productOrderStats.get(String(a.productId || ""));
        const bb = productOrderStats.get(String(b.productId || ""));
        return Number(bb?.qty || 0) - Number(aa?.qty || 0);
      })
      .slice(0, 6);
  }, [visibleCatalog, productOrderStats]);

  const recentlyOrdered = useMemo(() => {
    return visibleCatalog
      .filter((item) => productOrderStats.has(String(item.productId || "")))
      .sort((a, b) => {
        const aa = String(productOrderStats.get(String(a.productId || ""))?.lastDate || "");
        const bb = String(productOrderStats.get(String(b.productId || ""))?.lastDate || "");
        return bb.localeCompare(aa);
      })
      .slice(0, 6);
  }, [visibleCatalog, productOrderStats]);

  const cartCount = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  }, [cartItems]);

  const cartSubTotal = useMemo(() => {
    return cartItems.reduce((sum, item) => {
      return sum + Number(item.quantity || 0) * Number(item.unitPrice || 0);
    }, 0);
  }, [cartItems]);

  function updateProductQty(productId, nextQty) {
    setProductQty((prev) => ({
      ...prev,
      [productId]: Math.max(1, Number(nextQty || 1)),
    }));
  }

  function addToCart(item, forcedQty) {
    if (!item?.canOrder) {
      setErrorMessage(
        `${item.productName} is not available for ordering right now.`
      );
      return;
    }

    const qty = Math.max(
      1,
      Number(forcedQty || productQty[item.productId] || 1)
    );

    if (
      item.currentStock !== undefined &&
      item.currentStock !== null &&
      qty > Number(item.currentStock)
    ) {
      setErrorMessage(
        `Requested quantity exceeds available stock for ${item.productName}.`
      );
      return;
    }

    setCartItems((prev) => {
      const existing = prev.find((row) => row.productId === item.productId);

      if (existing) {
        const nextQty = existing.quantity + qty;

        if (
          item.currentStock !== undefined &&
          item.currentStock !== null &&
          nextQty > Number(item.currentStock)
        ) {
          setErrorMessage(
            `Total cart quantity exceeds available stock for ${item.productName}.`
          );
          return prev;
        }

        return prev.map((row) =>
          row.productId === item.productId
            ? { ...row, quantity: nextQty }
            : row
        );
      }

      return [
        ...prev,
        {
          productId: item.productId,
          productName: item.productName,
          category: item.category || "",
          unitPrice: Number(item.unitSellingPrice ?? item.price ?? 0),
          quantity: qty,
          currentStock: item.currentStock ?? null,
          stockHealth: item.stockHealth || "OK",
        },
      ];
    });

    setStatusMessage(`${item.productName} added to cart`);
    setErrorMessage("");
  }

  function updateCartQty(productId, nextQty) {
    setCartItems((prev) =>
      prev.map((item) => {
        if (item.productId !== productId) return item;

        const safeQty = Math.max(1, Number(nextQty || 1));

        if (
          item.currentStock !== undefined &&
          item.currentStock !== null &&
          safeQty > Number(item.currentStock)
        ) {
          setErrorMessage(
            `Requested quantity exceeds available stock for ${item.productName}.`
          );
          return item;
        }

        return { ...item, quantity: safeQty };
      })
    );
  }

  function increaseCartQty(productId) {
    const found = cartItems.find((item) => item.productId === productId);
    if (!found) return;
    updateCartQty(productId, found.quantity + 1);
  }

  function decreaseCartQty(productId) {
    const found = cartItems.find((item) => item.productId === productId);
    if (!found) return;

    if (found.quantity <= 1) {
      removeFromCart(productId);
      return;
    }

    updateCartQty(productId, found.quantity - 1);
  }

  function removeFromCart(productId) {
    setCartItems((prev) => prev.filter((item) => item.productId !== productId));
  }

  function handleRepeatOrder(orderDetails = selectedOrderDetails) {
    if (!orderDetails?.lines?.length) {
      setErrorMessage("No line items found to repeat.");
      return;
    }

    const catalogMap = {};
    catalog.forEach((item) => {
      catalogMap[item.productId] = item;
    });

    const nextCart = [];
    const issues = [];

    orderDetails.lines.forEach((line) => {
      const product = catalogMap[line.productId];

      if (!product) {
        issues.push(`${line.productName} is no longer available in catalog`);
        return;
      }

      if (!product.canOrder || product.stockHealth === "OUT") {
        issues.push(`${line.productName} is currently unavailable`);
        return;
      }

      const availableStock = Number(product.currentStock || 0);
      const desiredQty = Number(line.quantity || 0);
      const safeQty = Math.min(desiredQty, availableStock);

      if (safeQty <= 0) {
        issues.push(`${line.productName} has no available stock`);
        return;
      }

      if (safeQty < desiredQty) {
        issues.push(
          `${line.productName} quantity reduced from ${desiredQty} to ${safeQty} due to stock limits`
        );
      }

      nextCart.push({
        productId: product.productId,
        productName: product.productName,
        category: product.category || "",
        unitPrice: Number(product.unitSellingPrice ?? product.price ?? 0),
        quantity: safeQty,
        currentStock: product.currentStock ?? null,
        stockHealth: product.stockHealth || "OK",
      });
    });

    if (!nextCart.length) {
      setErrorMessage(
        issues.length
          ? issues.join(". ")
          : "Unable to repeat this order right now."
      );
      return;
    }

    setCartItems(nextCart);
    setStatusMessage("Previous order loaded into cart.");
    setErrorMessage(issues.length ? issues.join(". ") : "");

    const nextQtyMap = { ...productQty };
    nextCart.forEach((item) => {
      nextQtyMap[item.productId] = item.quantity;
    });
    setProductQty(nextQtyMap);
    setIsCartOpen(true);

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmitOrder() {
    if (!labId) {
      setErrorMessage("Lab identity is missing. Please refresh and try again.");
      return;
    }

    if (!cartItems.length) {
      setErrorMessage("Please add at least one item to cart.");
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage("");
      setStatusMessage("");
      setSubmitResult(null);

      const requestPayload = {
        labId,
        labName,
        notes,
        tenantId: currentUser?.tenantId || currentUser?.tenant_id || null,
        createdBy:
          currentUser?.email ||
          currentUser?.userId ||
          currentUser?.id ||
          labName ||
          labId ||
          null,
        items: cartItems.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: Number(item.quantity || 0),
          unitSellingPrice: Number(item.unitPrice || 0),
        })),
      };

      if (supabase) {
        logSupabaseFeatureSource("LabOrdering.submit", { api: "createOrderWrite" });
        const sbRes = await createOrderWrite(requestPayload);
        if (sbRes?.success) {
          const orderId =
            sbRes.data?.orderId ?? sbRes.data?.order?.order_id ?? "";
          setSubmitResult({ success: true, orderId, invoiceId: null });
          setCartItems([]);
          setNotes("");
          setStatusMessage(
            orderId
              ? `Order submitted successfully (Supabase): ${orderId}`
              : "Order submitted successfully (Supabase)."
          );

          if (sbRes?.data?.order) {
            setRecentOrders((prev) => {
              const mapped = mapOrderRow(sbRes.data.order, labName, 0);
              const rest = prev.filter((o) => o.orderId !== mapped.orderId);
              return [mapped, ...rest];
            });
          }

          await loadRecentOrders();
          await loadCatalog();

          if (orderId) {
            await openOrderDetails(orderId);
          }
          return;
        }
        if (!ALLOW_LEGACY_APPS_SCRIPT) {
          throw new Error(sbRes?.error || "Supabase order submission failed.");
        }
        logAppsScriptFallbackUsed("LabOrdering.submit", sbRes?.error);
      }

      if (!ALLOW_LEGACY_APPS_SCRIPT) {
        throw new Error("Supabase order submission is required for pilot access.");
      }

      logPartialMigrationWarning(
        "LabOrdering.submit",
        "Using submitLabOrder (Apps Script) — catalog/recent orders may still be Apps Script reads."
      );
      const res = await submitLabOrder(requestPayload);
      const result = res?.data || res || {};

      if (!result?.success) {
        throw new Error(result?.message || "Order submission failed");
      }

      setSubmitResult(result);
      setCartItems([]);
      setNotes("");
      setStatusMessage(`Order submitted successfully: ${result.orderId || ""}`);

      await loadRecentOrders();
      await loadCatalog();

      if (result?.orderId) {
        await openOrderDetails(result.orderId);
      }
    } catch (error) {
      console.error("Submit order failed", error);
      setErrorMessage(error.message || "Unable to submit order right now.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5 pb-28 lg:pb-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Lab Ordering</h1>
        <p className="text-sm text-slate-500">
          {labName} — place orders for your lab. Outstanding and payments are under{" "}
          <span className="font-medium text-slate-700">Payments &amp; Account</span>.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <QuickStat
          title="Outstanding"
          value={`₹${Number(outstandingBalance).toLocaleString()}`}
          icon={IndianRupee}
        />
        <QuickStat title="Cart Items" value={cartCount} icon={ShoppingCart} />
        <QuickStat title="Your Orders" value={scopedRecentOrders.length} icon={FileText} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={activeTab === "catalog" ? "default" : "outline"}
          className="rounded-full"
          onClick={() => setActiveTab("catalog")}
        >
          Product Catalog
        </Button>
        <Button
          type="button"
          variant={activeTab === "orders" ? "default" : "outline"}
          className="rounded-full"
          onClick={() => setActiveTab("orders")}
        >
          Previous Orders
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={() => setIsCartOpen(true)}
        >
          <ShoppingCart className="mr-2 h-4 w-4" />
          Cart ({cartCount})
        </Button>
      </div>

      {statusMessage ? (
        <div className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{statusMessage}</div>
      ) : null}

      {isCreditHold ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          🚫 Credit Hold: {creditReason || "You cannot place orders until payment is cleared."}
        </div>
      ) : null}

      {isNearLimit ? (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-700">
          ⚠️ Warning: You are near your credit limit. Please clear dues to avoid order blockage.
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{errorMessage}</div>
      ) : null}

      {submitResult?.success ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-700" />
            <div>
              <div className="text-sm font-semibold text-green-800">Order placed successfully</div>
              <div className="mt-1 text-sm text-green-700">
                Order ID: <span className="font-medium">{submitResult.orderId}</span>
                {submitResult.invoiceId ? (
                  <>
                    {" "}
                    • Invoice ID: <span className="font-medium">{submitResult.invoiceId}</span>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "catalog" ? (
        <div className="space-y-4">
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="pt-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  placeholder="Search product, category, SKU..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-11 rounded-xl"
                />
                <select
                  className="h-11 rounded-xl border border-input bg-background px-3 text-sm"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                >
                  <option value="all">All categories</option>
                  {categoryOptions.map((c) => (
                    <option key={c} value={c.toLowerCase()}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Product Catalog</CardTitle>
              <CardDescription>Fast ordering cards for day-to-day lab operations.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingCatalog ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading catalog...
                </div>
              ) : visibleCatalog.length === 0 ? (
                <div className="text-sm text-slate-500">No products found for this filter.</div>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleCatalog.map((item) => {
                    const unitPrice = Number(item.unitSellingPrice ?? item.price ?? 0);
                    const qty = productQty[item.productId] || 1;
                    const isOut = item.stockHealth === "OUT" || item.canOrder === false;
                    const packSize = item.packSize || item.unit || item.pack || "";
                    const CategoryIcon = categoryIcon(item.category);
                    return (
                      <div
                        key={item.productId}
                        className={`
                          rounded-xl border bg-white p-3 transition-all duration-150
                          hover:-translate-y-0.5 hover:shadow-md
                          ${isOut ? "opacity-75" : ""}
                        `}
                      >
                        <div className="space-y-1.5">
                          <div className="line-clamp-2 text-sm font-semibold leading-5 text-slate-900">
                            {item.productName}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <CategoryIcon className="h-3.5 w-3.5" />
                            <span>{item.category || "General"}</span>
                            {packSize ? <span>• {packSize}</span> : null}
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                          <Badge variant="secondary" className="text-xs font-semibold">
                            ₹{unitPrice.toLocaleString()}
                          </Badge>
                          <StockBadge
                            stockHealth={item.stockHealth}
                            currentStock={item.currentStock}
                          />
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <QtyControl
                            compact
                            value={qty}
                            disabled={isOut}
                            onDecrease={() => updateProductQty(item.productId, qty - 1)}
                            onIncrease={() => updateProductQty(item.productId, qty + 1)}
                          />
                          <Button
                            size="sm"
                            className="h-9 rounded-lg px-3 font-medium"
                            onClick={() => addToCart(item)}
                            disabled={isOut}
                          >
                            {isOut ? "Unavailable" : "Add"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {frequentlyOrdered.length > 0 ? (
            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Frequently Ordered</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {frequentlyOrdered.map((item) => (
                    <button
                      key={`freq-${item.productId}`}
                      type="button"
                      className="rounded-lg border bg-slate-50 px-3 py-2 text-left text-sm transition hover:bg-slate-100"
                      onClick={() => addToCart(item, 1)}
                    >
                      <div className="truncate font-medium text-slate-900">{item.productName}</div>
                      <div className="text-xs text-slate-500">{item.category || "General"}</div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {recentlyOrdered.length > 0 ? (
            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Recently Ordered</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {recentlyOrdered.map((item) => (
                    <button
                      key={`recent-${item.productId}`}
                      type="button"
                      className="rounded-lg border bg-white px-3 py-2 text-left text-sm transition hover:bg-slate-50"
                      onClick={() => addToCart(item, 1)}
                    >
                      <div className="truncate font-medium text-slate-900">{item.productName}</div>
                      <div className="text-xs text-slate-500">{item.category || "General"}</div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      

      {activeTab === "orders" ? (
        <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Previous Orders</CardTitle>
              <CardDescription>Orders from your lab only.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingOrders ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading orders...
                </div>
              ) : scopedRecentOrders.length === 0 ? (
                <div className="text-sm text-slate-500">No orders yet.</div>
              ) : (
                <div className="space-y-3">
                  {scopedRecentOrders.map((order) => (
                    <div
                      key={order.orderId}
                      className={`rounded-xl border bg-white p-3 ${
                        selectedOrderId === order.orderId ? "ring-2 ring-slate-200" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold">{order.orderId}</div>
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <Clock3 className="h-3 w-3" />
                            {order.orderDate || order.date || "-"}
                          </div>
                        </div>
                        <Badge variant="secondary">{order.orderStatus || order.status || "Placed"}</Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Badge variant="outline" className="text-[11px]">
                          {order.paymentStatus || "Pending payment"}
                        </Badge>
                        <Badge variant="outline" className="text-[11px]">
                          {selectedOrderId === order.orderId ? "Viewed" : "Ready to reorder"}
                        </Badge>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <span>Total: ₹{Number(order.orderTotal ?? order.total ?? 0).toLocaleString()}</span>
                        <span>•</span>
                        <span>Items: {Number(order.itemCount || order.totalItems || 0)}</span>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg"
                          onClick={() => openOrderDetails(order.orderId)}
                        >
                          <FileText className="mr-1.5 h-4 w-4" />
                          View details
                        </Button>
                        <Button
                          size="sm"
                          className="rounded-lg"
                          onClick={async () => {
                            const details = await openOrderDetails(order.orderId);
                            handleRepeatOrder(details || undefined);
                          }}
                        >
                          <RotateCcw className="mr-1.5 h-4 w-4" />
                          Repeat
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Order Details</CardTitle>
              <CardDescription>Review selected order lines.</CardDescription>
            </CardHeader>
            <CardContent>
              {!selectedOrderId ? (
                <div className="text-sm text-slate-500">Select an order to view details.</div>
              ) : loadingOrderDetails ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading details...
                </div>
              ) : selectedOrderDetails?.order ? (
                <div className="space-y-3">
                  <div className="text-sm">
                    <div className="font-semibold">{selectedOrderDetails.order.orderId}</div>
                    <div className="text-slate-500">{selectedOrderDetails.order.orderDate || "-"}</div>
                  </div>
                  <div className="text-sm space-y-1">
                    <div>Status: {selectedOrderDetails.order.orderStatus || "-"}</div>
                    <div>Payment: {selectedOrderDetails.order.paymentStatus || "-"}</div>
                    <div>
                      Total: ₹{Number(selectedOrderDetails.order.orderTotal || 0).toLocaleString()}
                    </div>
                  </div>
                  <Button className="rounded-lg" onClick={handleRepeatOrder}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Repeat This Order
                  </Button>
                  <div className="space-y-2">
                    {selectedOrderDetails.lines?.length ? (
                      selectedOrderDetails.lines.map((line) => (
                        <div key={line.orderLineId} className="rounded-lg border p-2.5 text-sm">
                          <div className="font-medium">{line.productName}</div>
                          <div className="text-xs text-slate-500">
                            {line.productId} • Qty {line.quantity}
                          </div>
                          <div className="text-xs text-slate-600">
                            ₹{Number(line.netLineTotal || 0).toLocaleString()}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-slate-500">No line items found.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-500">No details available.</div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {cartItems.length > 0 ? (
        <button
          type="button"
          onClick={() => setIsCartOpen(true)}
          className="fixed bottom-20 right-4 z-30 flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-slate-800 md:bottom-6"
        >
          <ShoppingCart className="h-4 w-4" />
          {cartCount} • ₹{cartSubTotal.toLocaleString()}
        </button>
      ) : null}

      {isCartOpen ? (
        <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setIsCartOpen(false)}>
          <div
            className="absolute bottom-0 right-0 flex h-[82vh] w-full max-w-md flex-col rounded-t-2xl border bg-white shadow-2xl md:top-0 md:h-full md:rounded-none md:rounded-l-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">Cart</p>
                <p className="text-xs text-slate-500">{cartCount} items</p>
              </div>
              <button
                type="button"
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                onClick={() => setIsCartOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {cartItems.length === 0 ? (
                <div className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">
                  Your cart is empty. Add products from Product Catalog.
                </div>
              ) : (
                <>
                  {cartItems.map((item) => {
                    const lineTotal = Number(item.quantity) * Number(item.unitPrice);
                    return (
                      <div key={item.productId} className="rounded-xl border bg-white p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {item.productName}
                            </p>
                            <p className="text-xs text-slate-500">
                              {item.category || "General"} • ₹
                              {Number(item.unitPrice).toLocaleString()} each
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.productId)}
                            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <QtyControl
                            compact
                            value={item.quantity}
                            onDecrease={() => decreaseCartQty(item.productId)}
                            onIncrease={() => increaseCartQty(item.productId)}
                          />
                          <div className="text-sm font-semibold">₹{lineTotal.toLocaleString()}</div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Order Notes (optional)</label>
                    <Textarea
                      placeholder="Any delivery or packing notes..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="min-h-[84px] rounded-xl"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="sticky bottom-0 space-y-3 border-t bg-white p-4">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span>Items</span>
                  <span className="font-medium">{cartCount}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-base font-semibold">
                  <span>Subtotal</span>
                  <span>₹{cartSubTotal.toLocaleString()}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-xl"
                  onClick={() => setCartItems([])}
                  disabled={cartItems.length === 0}
                >
                  Clear
                </Button>
                <Button
                  className="h-11 flex-1 rounded-xl"
                  onClick={handleSubmitOrder}
                  disabled={submitting || cartItems.length === 0 || isCreditHold}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      Checkout
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}