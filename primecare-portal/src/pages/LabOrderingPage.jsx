import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  submitLabOrder,
} from "@/api/primecareApi";
import {
  createOrderWrite,
  getCollectionsRead,
  getLabCatalogRead,
  getLabRecentOrdersRead,
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
import { cn } from "@/lib/utils";
import OrderTrackingDrawer from "@/components/lab/OrderTrackingDrawer.jsx";
import OrderProgressMini from "@/components/lab/OrderProgressMini.jsx";
import { StatusBadge, usePortalToast } from "@/components/ux";
import {
  fetchScopedOrderDetails,
  formatOrderPaymentLabel,
  isCancelledStatus,
  logOrderTrackingEvent,
  orderStatusChipVariant,
} from "@/utils/orderTracking.js";
import { paymentStatusToVariant } from "@/utils/statusTokens.js";

function formatOrderDateShort(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return d.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
}

function QuickStat({ title, value, icon: Icon }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[10px] font-medium uppercase tracking-wide text-slate-500">
            {title}
          </div>
          <div className="truncate text-base font-semibold tabular-nums text-slate-900">{value}</div>
        </div>
        <div className="shrink-0 rounded-md bg-slate-100 p-1.5">
          <Icon className="h-3.5 w-3.5 text-slate-600" />
        </div>
      </div>
    </div>
  );
}

function QtyControl({
  value,
  onDecrease,
  onIncrease,
  size = "product",
  disabled = false,
}) {
  const isDrawer = size === "drawer";
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-slate-200 bg-white",
        isDrawer ? "h-8" : "h-9",
        disabled && "opacity-50"
      )}
    >
      <button
        type="button"
        onClick={onDecrease}
        disabled={disabled}
        className={cn(
          "flex h-full items-center justify-center text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed",
          isDrawer ? "w-7" : "w-9"
        )}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <div
        className={cn(
          "px-1.5 text-center font-semibold tabular-nums text-slate-900",
          isDrawer ? "min-w-[26px] text-xs" : "min-w-[34px] text-sm"
        )}
      >
        {value}
      </div>
      <button
        type="button"
        onClick={onIncrease}
        disabled={disabled}
        className={cn(
          "flex h-full items-center justify-center text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed",
          isDrawer ? "w-7" : "w-9"
        )}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function CompactStockBadge({ stockHealth, currentStock }) {
  if (stockHealth === "OUT") {
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-red-700 bg-red-50">
        Out
      </span>
    );
  }
  if (stockHealth === "LOW") {
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-amber-700 bg-amber-50">
        Low
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 bg-emerald-50">
      {Number(currentStock || 0) > 0 ? `${Number(currentStock).toLocaleString()} left` : "In stock"}
    </span>
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

function CollapsibleSection({ title, open, onToggle, children }) {
  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 hover:bg-slate-50"
        onClick={onToggle}
      >
        {title}
        <span className="text-slate-400">{open ? "−" : "+"}</span>
      </button>
      {open ? <div className="px-3 pb-3">{children}</div> : null}
    </div>
  );
}

function ProductCatalogCard({ item, qty, onQtyChange, onAdd, disabled }) {
  const unitPrice = Number(item.unitSellingPrice ?? item.price ?? 0);
  const packSize = item.packSize || item.unit || item.pack || "";
  const CategoryIcon = categoryIcon(item.category);

  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 bg-white p-2 transition-shadow hover:border-slate-300 hover:shadow-sm",
        disabled && "opacity-70"
      )}
    >
      <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-slate-900">
        {item.productName}
      </p>
      <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-500">
        <CategoryIcon className="h-3 w-3 shrink-0" />
        <span className="truncate">
          {item.category || "General"}
          {packSize ? ` • ${packSize}` : ""}
        </span>
      </p>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-sm font-bold tabular-nums text-slate-900">
          ₹{unitPrice.toLocaleString()}
        </span>
        <CompactStockBadge stockHealth={item.stockHealth} currentStock={item.currentStock} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-1.5">
        <QtyControl
          size="product"
          value={qty}
          disabled={disabled}
          onDecrease={() => onQtyChange(qty - 1)}
          onIncrease={() => onQtyChange(qty + 1)}
        />
        <Button
          type="button"
          size="sm"
          className="h-8 shrink-0 rounded-md px-2.5 text-xs font-semibold"
          onClick={onAdd}
          disabled={disabled}
        >
          {disabled ? "N/A" : "Add"}
        </Button>
      </div>
    </div>
  );
}

function QuickPickRow({ item, onAdd }) {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-left text-xs hover:bg-slate-100"
      onClick={onAdd}
    >
      <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{item.productName}</span>
      <span className="shrink-0 font-semibold text-slate-900">
        ₹{Number(item.unitSellingPrice ?? item.price ?? 0).toLocaleString()}
      </span>
    </button>
  );
}

const DEMO_SEEDED_PRICES = [120, 350, 980, 160, 420, 1250, 275, 640];

function applyDemoPriceIfNeeded(item, index) {
  const currentPrice = Number(item?.unitSellingPrice ?? item?.price ?? 0);
  if (currentPrice > 0) return item;
  const seeded = DEMO_SEEDED_PRICES[index % DEMO_SEEDED_PRICES.length];
  return {
    ...item,
    unitSellingPrice: seeded,
    price: seeded,
  };
}

function buildDefaultQtyMap(products) {
  const next = {};
  for (const item of products || []) {
    const id = String(item?.productId || "").trim();
    if (!id) continue;
    next[id] = 1;
  }
  return next;
}

function buildCartHash(items) {
  return JSON.stringify(
    (items || [])
      .map((item) => ({
        productId: String(item.productId || ""),
        quantity: Number(item.quantity || 0),
        unitPrice: Number(item.unitPrice || 0),
      }))
      .sort((a, b) => a.productId.localeCompare(b.productId))
  );
}

export default function LabOrderingPage({ currentUser }) {
  const [activeTab, setActiveTab] = useState("catalog");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartSections, setCartSections] = useState({
    items: true,
    notes: false,
    summary: true,
  });
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name");
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
  const submitLockRef = useRef(false);
  const hydratedDraftRef = useRef(false);
  const lastSubmittedHashRef = useRef("");

  const [trackingOpen, setTrackingOpen] = useState(false);
  const [trackingOrder, setTrackingOrder] = useState(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState("");
  const [repeatLoading, setRepeatLoading] = useState(false);
  const { showToast } = usePortalToast();

  const labId =
    currentUser?.labId ||
    currentUser?.labCode ||
    currentUser?.accountId ||
    currentUser?.id ||
    "";

  const labName = currentUser?.labName || currentUser?.name || "Lab";
  const cartDraftStorageKey = useMemo(() => {
    const key = labIdKey(labId);
    return key ? `lab-ordering-cart-draft:${key}` : "";
  }, [labId]);
  const cartHandoffStorageKey = useMemo(() => {
    const key = labIdKey(labId);
    return key ? `lab-ordering-handoff:${key}` : "";
  }, [labId]);
  const [outstandingBalance, setOutstandingBalance] = useState(
    Number(currentUser?.outstanding ?? 0)
  );

  // CREDIT CONTROL (NEW)
  const creditStatus = (currentUser?.creditStatus || "").toUpperCase();
  const creditReason = currentUser?.creditReason || "";
  const isCreditHold = creditStatus === "HOLD";
  const isNearLimit = creditStatus === "NEAR_LIMIT";


  const profileLabKey = labIdKey(labId);

  const catalogSkuStats = useMemo(() => {
    const counts = new Map();
    for (const item of catalog) {
      const key = String(item.productId || "")
        .trim()
        .toUpperCase();
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    const duplicateSkus = [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([sku]) => sku);
    return {
      catalogProductCount: catalog.length,
      catalogUniqueSkuCount: counts.size,
      catalogDuplicateSkus: duplicateSkus,
    };
  }, [catalog]);

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
      catalogProductCount: catalogSkuStats.catalogProductCount,
      catalogUniqueSkuCount: catalogSkuStats.catalogUniqueSkuCount,
      catalogDuplicateSkus: catalogSkuStats.catalogDuplicateSkus,
      ordersLoaded: !loadingOrders,
      cartLineCount: cartItems.length,
      cartQtyCount: cartItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      cartSubTotal: cartItems.reduce(
        (sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0),
        0
      ),
      trackingDrawerOpen: trackingOpen,
      cartDrawerOpen: isCartOpen,
      submitting,
      canCheckout: !submitting && cartItems.length > 0 && !isCreditHold,
      submitLocked: submitLockRef.current,
      submitSuccess: Boolean(submitResult?.success),
      productQtyInSync: cartItems.every(
        (item) => Number(productQty[item.productId] || 0) === Number(item.quantity || 0)
      ),
    },
    !loadingCatalog && !loadingOrders
  );

  useEffect(() => {
    loadCatalog();
    loadRecentOrders();
    loadAccountOutstanding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labId]);

  useEffect(() => {
    if (!cartDraftStorageKey || hydratedDraftRef.current) return;
    try {
      const raw = window.localStorage.getItem(cartDraftStorageKey);
      if (!raw) {
        hydratedDraftRef.current = true;
        return;
      }
      const parsed = JSON.parse(raw);
      const nextItems = Array.isArray(parsed?.cartItems) ? parsed.cartItems : [];
      const nextNotes = typeof parsed?.notes === "string" ? parsed.notes : "";
      const nextQty = parsed?.productQty && typeof parsed.productQty === "object" ? parsed.productQty : {};
      if (nextItems.length) setCartItems(nextItems);
      if (nextNotes) setNotes(nextNotes);
      setProductQty((prev) => ({ ...prev, ...nextQty }));
    } catch (error) {
      console.warn("[LabOrderingPage] failed to hydrate cart draft", error);
    } finally {
      hydratedDraftRef.current = true;
    }
  }, [cartDraftStorageKey]);

  useEffect(() => {
    if (!cartDraftStorageKey || !hydratedDraftRef.current) return;
    try {
      const payload = JSON.stringify({
        cartItems,
        notes,
        productQty,
      });
      window.localStorage.setItem(cartDraftStorageKey, payload);
    } catch (error) {
      console.warn("[LabOrderingPage] failed to persist cart draft", error);
    }
  }, [cartDraftStorageKey, cartItems, notes, productQty]);

  useEffect(() => {
    if (!cartHandoffStorageKey) return;
    try {
      const raw = window.localStorage.getItem(cartHandoffStorageKey);
      if (!raw) return;
      const handoff = JSON.parse(raw);
      if (handoff?.message) setStatusMessage(String(handoff.message));
      if (handoff?.openCart) setIsCartOpen(true);
      window.localStorage.removeItem(cartHandoffStorageKey);
    } catch (error) {
      console.warn("[LabOrderingPage] failed to process handoff", error);
    }
  }, [cartHandoffStorageKey]);

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
        const tenantId = currentUser?.tenantId || currentUser?.tenant_id || null;
        const sbRes = await getLabCatalogRead({ tenantId });
        if (!sbRes?.success) {
          throw new Error(sbRes?.error || "Supabase lab catalog read failed.");
        }

        const productsRaw = Array.isArray(sbRes?.data?.products) ? sbRes.data.products : [];
        const products = productsRaw;
        console.log("SUPABASE LAB CATALOG", {
          count: products.length,
          source: sbRes?.data?.source || "supabase",
        });

        setCatalog(products);

        setProductQty((prev) => ({ ...buildDefaultQtyMap(products), ...prev }));
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
      const productsRaw = Array.isArray(result?.products) ? result.products : [];
      const products = productsRaw.map((item, index) => applyDemoPriceIfNeeded(item, index));

      setCatalog(products);

      setProductQty((prev) => ({ ...buildDefaultQtyMap(products), ...prev }));
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

  async function openOrderTracking(orderId) {
    if (!orderId) return null;
    try {
      setTrackingOpen(true);
      setTrackingLoading(true);
      setTrackingError("");
      setTrackingOrder(null);
      logOrderTrackingEvent("order_tracking.drawer_open", { orderId, source: "lab_ordering" });
      const details = await fetchScopedOrderDetails(orderId, profileLabKey);
      setTrackingOrder(details);
      logOrderTrackingEvent("order_tracking.status_render", {
        orderId: details.orderId,
        status: details.orderStatus,
      });
      return details;
    } catch (error) {
      console.error("Failed to load order tracking", error);
      setTrackingError(error.message || "Unable to load order details right now.");
      return null;
    } finally {
      setTrackingLoading(false);
    }
  }

  function closeOrderTracking() {
    setTrackingOpen(false);
    setTrackingOrder(null);
    setTrackingError("");
  }

  async function handleTrackingDrawerAction(action, details) {
    if (action === "invoice") {
      if (details && isCancelledStatus(details.orderStatus)) {
        showToast("info", "No invoice available for cancelled orders.");
        return;
      }
      showToast("info", "Invoice PDFs will be available in a future release.");
      return;
    }
    if (action === "support") {
      showToast("info", "Your account manager will follow up on this order.");
      return;
    }
    if (action === "repeat" && details) {
      try {
        setRepeatLoading(true);
        handleRepeatOrder({
          lines: details.lines.map((line) => ({
            productId: line.productId,
            productName: line.productName,
            quantity: line.quantity,
            netLineTotal: line.lineTotal,
            unitSellingPrice: line.unitPrice,
          })),
        });
        closeOrderTracking();
      } catch (err) {
        setErrorMessage(err?.message || "Unable to prepare repeat order.");
      } finally {
        setRepeatLoading(false);
      }
    }
  }

  const baseFilteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((item) => {
      const haystack = `${item.productName || ""} ${item.category || ""} ${item.productId || ""}`.toLowerCase();
      if (q && !haystack.includes(q)) return false;
      if (categoryFilter === "all") return true;
      return String(item.category || "").toLowerCase() === categoryFilter;
    });
  }, [catalog, search, categoryFilter]);

  const sortedAllProducts = useMemo(() => {
    const list = [...baseFilteredCatalog];
    if (sortBy === "price") {
      return list.sort(
        (a, b) =>
          Number(b.unitSellingPrice ?? b.price ?? 0) - Number(a.unitSellingPrice ?? a.price ?? 0)
      );
    }
    if (sortBy === "stock") {
      const rank = (item) => {
        if (item.stockHealth === "OUT" || item.canOrder === false) return 2;
        if (item.stockHealth === "LOW") return 1;
        return 0;
      };
      return list.sort((a, b) => rank(a) - rank(b));
    }
    return list.sort((a, b) =>
      String(a.productName || "").localeCompare(String(b.productName || ""))
    );
  }, [baseFilteredCatalog, sortBy]);

  useEffect(() => {
    if (!isCartOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isCartOpen]);

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
    return baseFilteredCatalog
      .filter((item) => productOrderStats.has(String(item.productId || "")))
      .sort((a, b) => {
        const aa = productOrderStats.get(String(a.productId || ""));
        const bb = productOrderStats.get(String(b.productId || ""));
        return Number(bb?.qty || 0) - Number(aa?.qty || 0);
      })
      .slice(0, 6);
  }, [baseFilteredCatalog, productOrderStats]);

  const recentlyOrdered = useMemo(() => {
    return baseFilteredCatalog
      .filter((item) => productOrderStats.has(String(item.productId || "")))
      .sort((a, b) => {
        const aa = String(productOrderStats.get(String(a.productId || ""))?.lastDate || "");
        const bb = String(productOrderStats.get(String(b.productId || ""))?.lastDate || "");
        return bb.localeCompare(aa);
      })
      .slice(0, 6);
  }, [baseFilteredCatalog, productOrderStats]);

  const cartCount = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  }, [cartItems]);

  const cartSubTotal = useMemo(() => {
    return cartItems.reduce((sum, item) => {
      return sum + Number(item.quantity || 0) * Number(item.unitPrice || 0);
    }, 0);
  }, [cartItems]);

  const cartQtyByProduct = useMemo(() => {
    const map = new Map();
    for (const item of cartItems) {
      map.set(String(item.productId || ""), Number(item.quantity || 0));
    }
    return map;
  }, [cartItems]);

  const canCheckout = !submitting && cartItems.length > 0 && !isCreditHold;

  const clearCartState = useCallback(
    ({ closeDrawer = true } = {}) => {
      setCartItems([]);
      setNotes("");
      setProductQty(buildDefaultQtyMap(catalog));
      setCartSections({ items: true, notes: false, summary: true });
      if (closeDrawer) setIsCartOpen(false);
      if (cartDraftStorageKey) {
        try {
          window.localStorage.removeItem(cartDraftStorageKey);
        } catch (error) {
          console.warn("[LabOrderingPage] failed to clear cart draft", error);
        }
      }
    },
    [catalog, cartDraftStorageKey]
  );

  function updateProductQty(productId, nextQty) {
    const safeQty = Math.max(1, Number(nextQty || 1));
    const inCart = cartQtyByProduct.has(String(productId || ""));
    if (inCart) {
      updateCartQty(productId, safeQty);
      return;
    }
    setProductQty((prev) => ({ ...prev, [productId]: safeQty }));
  }

  function addToCart(item, forcedQty) {
    if (!item?.canOrder) {
      setErrorMessage(
        `${item.productName} is not available for ordering right now.`
      );
      return;
    }

    const draftQty = Number(productQty[item.productId] || 1);
    const qty = Math.max(1, Number(forcedQty || draftQty || 1));

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

        const nextRows = prev.map((row) =>
          row.productId === item.productId
            ? { ...row, quantity: nextQty }
            : row
        );
        setProductQty((qtyPrev) => ({ ...qtyPrev, [item.productId]: nextQty }));
        return nextRows;
      }

      setProductQty((qtyPrev) => ({ ...qtyPrev, [item.productId]: qty }));
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
    setSubmitResult(null);
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

        setProductQty((qtyPrev) => ({ ...qtyPrev, [productId]: safeQty }));
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
    setProductQty((prev) => ({ ...prev, [productId]: 1 }));
  }

  function handleRepeatOrder(orderDetails) {
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
    if (submitLockRef.current || submitting) return;
    if (!labId) {
      setErrorMessage("Lab identity is missing. Please refresh and try again.");
      return;
    }

    if (!cartItems.length) {
      setErrorMessage("Please add at least one item to cart.");
      return;
    }

    const cartSnapshot = cartItems.map((item) => ({
      productId: item.productId,
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
    }));
    const itemCount = cartSnapshot.reduce((sum, item) => sum + item.quantity, 0);
    const total = cartSnapshot.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const cartHash = buildCartHash(cartSnapshot);
    if (submitResult?.success && lastSubmittedHashRef.current && lastSubmittedHashRef.current === cartHash) {
      setErrorMessage("This cart was already submitted. Update quantities before checkout again.");
      return;
    }

    try {
      submitLockRef.current = true;
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
        items: cartSnapshot.map((item) => ({
          productId: item.productId,
          productName:
            cartItems.find((row) => row.productId === item.productId)?.productName || item.productId,
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
          setSubmitResult({
            success: true,
            orderId,
            invoiceId: null,
            itemCount,
            total,
            submittedAt: new Date().toISOString(),
          });
          lastSubmittedHashRef.current = cartHash;
          clearCartState({ closeDrawer: true });

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
            await openOrderTracking(orderId);
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

      setSubmitResult({
        ...result,
        success: true,
        itemCount,
        total,
        submittedAt: new Date().toISOString(),
      });
      lastSubmittedHashRef.current = cartHash;
      clearCartState({ closeDrawer: true });

      await loadRecentOrders();
      await loadCatalog();

      if (result?.orderId) {
        await openOrderTracking(result.orderId);
      }
    } catch (error) {
      console.error("Submit order failed", error);
      setErrorMessage(error.message || "Unable to submit order right now.");
    } finally {
      setSubmitting(false);
      submitLockRef.current = false;
    }
  }

  function toggleCartSection(key) {
    setCartSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="space-y-4 pb-[max(7rem,env(safe-area-inset-bottom))] lg:pb-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Lab Ordering</h1>
        <p className="text-sm text-slate-500">
          {labName} — place orders for your lab. Outstanding and payments are under{" "}
          <span className="font-medium text-slate-700">Payments &amp; Account</span>.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
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

      {statusMessage && !submitResult?.success ? (
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
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-emerald-800">Order placed successfully</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-emerald-700">
                <span>
                  Order ID: <span className="font-semibold">{submitResult.orderId || "—"}</span>
                </span>
                <span>•</span>
                <span>{Number(submitResult.itemCount || 0)} items</span>
                <span>•</span>
                <span>₹{Number(submitResult.total || 0).toLocaleString()}</span>
              </div>
              <div className="mt-1 text-[11px] text-emerald-700">
                {submitResult.submittedAt
                  ? new Date(submitResult.submittedAt).toLocaleString()
                  : "Just now"}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 border-emerald-300 bg-transparent px-2 text-xs text-emerald-800"
                  onClick={() => {
                    setActiveTab("orders");
                    if (submitResult.orderId) {
                      void openOrderTracking(submitResult.orderId);
                    }
                  }}
                >
                  Track Order
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="h-7 bg-emerald-700 px-2 text-xs hover:bg-emerald-800"
                  onClick={() => {
                    setActiveTab("catalog");
                    setSubmitResult(null);
                  }}
                >
                  Continue Shopping
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "catalog" ? (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              placeholder="Search products…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 flex-1 rounded-lg text-sm"
            />
            <select
              className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm sm:w-40"
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
            <select
              className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm sm:w-36"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="name">Sort: Name</option>
              <option value="price">Sort: Price</option>
              <option value="stock">Sort: Stock</option>
            </select>
          </div>

          {loadingCatalog ? (
            <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading catalog…
            </div>
          ) : sortedAllProducts.length === 0 ? (
            <div className="rounded-lg border border-dashed py-8 text-center text-sm text-slate-500">
              No products match this filter.
            </div>
          ) : (
            <div className="space-y-4">
              {frequentlyOrdered.length > 0 ? (
                <section>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Frequently Ordered
                  </h2>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {frequentlyOrdered.map((item) => (
                      <QuickPickRow
                        key={`freq-${item.productId}`}
                        item={item}
                        onAdd={() => addToCart(item, 1)}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              {recentlyOrdered.length > 0 ? (
                <section>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Recently Ordered
                  </h2>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {recentlyOrdered.map((item) => (
                      <QuickPickRow
                        key={`recent-${item.productId}`}
                        item={item}
                        onAdd={() => addToCart(item, 1)}
                      />
                    ))}
                  </div>
                </section>
              ) : null}

              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  All Products
                  <span className="ml-1.5 font-normal normal-case text-slate-400">
                    ({sortedAllProducts.length})
                  </span>
                </h2>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {sortedAllProducts.map((item) => {
                    const qty = cartQtyByProduct.get(String(item.productId || "")) || productQty[item.productId] || 1;
                    const isOut = item.stockHealth === "OUT" || item.canOrder === false;
                    return (
                      <ProductCatalogCard
                        key={`${item.tenantId || "lab"}-${item.productId}`}
                        item={item}
                        qty={qty}
                        disabled={isOut}
                        onQtyChange={(next) => updateProductQty(item.productId, next)}
                        onAdd={() => addToCart(item)}
                      />
                    );
                  })}
                </div>
              </section>
            </div>
          )}
        </div>
      ) : null}

      

      {activeTab === "orders" ? (
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b px-3 py-2">
            <h2 className="text-sm font-semibold text-slate-900">Previous Orders</h2>
            <p className="text-[11px] text-slate-500">Track fulfillment, payments, and reorders</p>
          </div>
          <div className="p-2">
            {loadingOrders ? (
              <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading orders…
              </div>
            ) : scopedRecentOrders.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-500">No orders yet.</div>
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead>
                      <tr className="border-b text-[10px] uppercase tracking-wide text-slate-500">
                        <th className="px-2 py-1.5 font-medium">Order</th>
                        <th className="px-2 py-1.5 font-medium">Status</th>
                        <th className="px-2 py-1.5 font-medium">Progress</th>
                        <th className="px-2 py-1.5 font-medium text-right">Total</th>
                        <th className="px-2 py-1.5 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scopedRecentOrders.map((order) => {
                        const orderStatus = order.orderStatus || order.status || "Placed";
                        const cancelled = isCancelledStatus(orderStatus);
                        const payment = formatOrderPaymentLabel({
                          orderStatus,
                          paymentStatus: order.paymentStatus || "Pending",
                          invoiceStatus: order.invoiceStatus,
                        });
                        const cancelledDate = formatOrderDateShort(
                          order.cancelledAt || order.cancelled_at
                        );
                        return (
                          <tr
                            key={order.orderId}
                            className={cn(
                              "border-b border-slate-100 last:border-0",
                              cancelled && "bg-slate-50/90 text-slate-600"
                            )}
                          >
                            <td className="px-2 py-2">
                              <p className={cn("font-semibold", cancelled ? "text-slate-700" : "text-slate-900")}>
                                {order.orderId}
                              </p>
                              <p className="text-[10px] text-slate-500">{order.orderDate || "—"}</p>
                              {cancelled && cancelledDate ? (
                                <p className="text-[10px] text-red-700">Cancelled {cancelledDate}</p>
                              ) : null}
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex flex-col gap-1">
                                <StatusBadge variant={orderStatusChipVariant(orderStatus)}>
                                  {orderStatus}
                                </StatusBadge>
                                <StatusBadge variant={paymentStatusToVariant(payment)}>{payment}</StatusBadge>
                              </div>
                            </td>
                            <td className="px-2 py-2 min-w-[140px]">
                              {cancelled ? (
                                <span className="text-[10px] font-semibold text-red-700">Cancelled</span>
                              ) : (
                                <OrderProgressMini status={orderStatus} />
                              )}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums font-semibold">
                              ₹{Number(order.orderTotal ?? order.total ?? 0).toLocaleString("en-IN")}
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex justify-end gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-[10px]"
                                  onClick={() => void openOrderTracking(order.orderId)}
                                >
                                  Track
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-[10px]"
                                  disabled={cancelled}
                                  title={
                                    cancelled ? "No invoice available for cancelled orders" : undefined
                                  }
                                  onClick={() =>
                                    cancelled
                                      ? showToast("info", "No invoice available for cancelled orders.")
                                      : showToast("info", "Invoice download coming soon.")
                                  }
                                >
                                  Invoice
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-7 px-2 text-[10px]"
                                  onClick={async () => {
                                    const details = await openOrderTracking(order.orderId);
                                    if (details) {
                                      await handleTrackingDrawerAction("repeat", details);
                                    }
                                  }}
                                >
                                  Repeat
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-2 md:hidden">
                  {scopedRecentOrders.map((order) => {
                    const orderStatus = order.orderStatus || order.status || "Placed";
                    const cancelled = isCancelledStatus(orderStatus);
                    const payment = formatOrderPaymentLabel({
                      orderStatus,
                      paymentStatus: order.paymentStatus || "Pending",
                      invoiceStatus: order.invoiceStatus,
                    });
                    const cancelledDate = formatOrderDateShort(
                      order.cancelledAt || order.cancelled_at
                    );
                    return (
                      <article
                        key={order.orderId}
                        className={cn(
                          "rounded-md border px-2.5 py-2",
                          cancelled
                            ? "border-slate-200 bg-slate-50/90 opacity-90"
                            : "border-slate-200"
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-slate-900">{order.orderId}</p>
                            <p className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500">
                              <Clock3 className="h-3 w-3 shrink-0" />
                              {order.orderDate || "—"}
                            </p>
                            {cancelled && cancelledDate ? (
                              <p className="mt-0.5 text-[10px] font-medium text-red-700">
                                Cancelled {cancelledDate}
                              </p>
                            ) : null}
                          </div>
                          <StatusBadge variant={orderStatusChipVariant(orderStatus)}>{orderStatus}</StatusBadge>
                        </div>
                        <div className="mt-1.5">
                          {cancelled ? (
                            <span className="text-[10px] font-semibold text-red-700">Cancelled</span>
                          ) : (
                            <OrderProgressMini status={orderStatus} />
                          )}
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                          <span className="font-semibold tabular-nums">
                            ₹{Number(order.orderTotal ?? order.total ?? 0).toLocaleString("en-IN")}
                          </span>
                          <StatusBadge variant={paymentStatusToVariant(payment)}>{payment}</StatusBadge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 flex-1 text-[11px]"
                            onClick={() => void openOrderTracking(order.orderId)}
                          >
                            Track
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-[11px]"
                            disabled={cancelled}
                            title={
                              cancelled ? "No invoice available for cancelled orders" : undefined
                            }
                            onClick={() =>
                              cancelled
                                ? showToast("info", "No invoice available for cancelled orders.")
                                : showToast("info", "Invoice download coming soon.")
                            }
                          >
                            Invoice
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 flex-1 text-[11px]"
                            onClick={async () => {
                              const details = await openOrderTracking(order.orderId);
                              if (details) await handleTrackingDrawerAction("repeat", details);
                            }}
                          >
                            <RotateCcw className="mr-1 h-3 w-3" />
                            Repeat
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      <OrderTrackingDrawer
        open={trackingOpen}
        onClose={closeOrderTracking}
        order={trackingOrder}
        loading={trackingLoading}
        error={trackingError}
        repeatLoading={repeatLoading}
        onAction={handleTrackingDrawerAction}
      />

      {cartItems.length > 0 ? (
        <button
          type="button"
          onClick={() => setIsCartOpen(true)}
          className="fixed bottom-[max(5rem,env(safe-area-inset-bottom))] right-3 z-30 flex items-center gap-2 rounded-full bg-slate-900 px-3.5 py-2.5 text-xs font-semibold text-white shadow-lg transition hover:bg-slate-800 md:bottom-6 md:right-4 md:text-sm"
        >
          <ShoppingCart className="h-4 w-4" />
          {cartCount} · ₹{cartSubTotal.toLocaleString()}
        </button>
      ) : null}

      {isCartOpen ? (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Shopping cart">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/35 backdrop-blur-[2px] transition-opacity"
            aria-label="Close cart"
            onClick={() => setIsCartOpen(false)}
          />
          <div
            className={cn(
              "absolute right-0 flex w-full max-w-[min(100vw,480px)] flex-col bg-white shadow-[-8px_0_32px_rgba(15,23,42,0.12)]",
              "transition-transform duration-300 ease-out",
              "max-md:inset-0 max-md:max-w-none",
              "md:inset-y-0 md:h-full md:border-l md:border-slate-200"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold text-slate-900">Cart</p>
                <p className="text-[11px] text-slate-500">{cartCount} units · {cartItems.length} lines</p>
              </div>
              <button
                type="button"
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
                onClick={() => setIsCartOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {cartItems.length === 0 ? (
                <div className="p-4 text-center text-sm text-slate-500">
                  Cart is empty. Add products from the catalog.
                </div>
              ) : (
                <>
                  <CollapsibleSection
                    title={`Items (${cartItems.length})`}
                    open={cartSections.items}
                    onToggle={() => toggleCartSection("items")}
                  >
                    <div className="space-y-1.5">
                      {cartItems.map((item) => {
                        const lineTotal = Number(item.quantity) * Number(item.unitPrice);
                        return (
                          <div
                            key={item.productId}
                            className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50/50 px-2 py-1.5"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold text-slate-900">
                                {item.productName}
                              </p>
                              <p className="text-[10px] text-slate-500">
                                ₹{Number(item.unitPrice).toLocaleString()} ea
                              </p>
                            </div>
                            <QtyControl
                              size="drawer"
                              value={item.quantity}
                              onDecrease={() => decreaseCartQty(item.productId)}
                              onIncrease={() => increaseCartQty(item.productId)}
                            />
                            <span className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums">
                              ₹{lineTotal.toLocaleString()}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeFromCart(item.productId)}
                              className="shrink-0 rounded p-1 text-slate-400 hover:bg-white hover:text-red-600"
                              aria-label={`Remove ${item.productName}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection
                    title="Notes"
                    open={cartSections.notes}
                    onToggle={() => toggleCartSection("notes")}
                  >
                    <Textarea
                      placeholder="Delivery or packing notes (optional)"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="min-h-[72px] resize-none rounded-md text-sm"
                    />
                  </CollapsibleSection>
                </>
              )}
            </div>

            <div className="shrink-0 border-t bg-white shadow-[0_-4px_12px_rgba(15,23,42,0.06)]">
              <CollapsibleSection
                title="Summary"
                open={cartSections.summary}
                onToggle={() => toggleCartSection("summary")}
              >
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Items</span>
                    <span className="tabular-nums font-medium">{cartCount}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-slate-900">
                    <span>Subtotal</span>
                    <span className="tabular-nums">₹{cartSubTotal.toLocaleString()}</span>
                  </div>
                </div>
              </CollapsibleSection>
              <div className="flex gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-9 rounded-md px-3 text-xs"
                  onClick={() => clearCartState({ closeDrawer: false })}
                  disabled={cartItems.length === 0}
                >
                  Clear
                </Button>
                <Button
                  type="button"
                  className="h-9 flex-1 rounded-md text-sm"
                  onClick={handleSubmitOrder}
                  disabled={!canCheckout}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting…
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