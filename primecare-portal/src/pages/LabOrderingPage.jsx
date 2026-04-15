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
} from "lucide-react";
import {
  getLabCatalog,
  getLabRecentOrders,
  getOrderDetails,
  submitLabOrder,
} from "@/api/primecareApi";

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
      <Badge variant="destructive" className="gap-1">
        <PackageX className="h-3 w-3" />
        Out of Stock
      </Badge>
    );
  }

  if (stockHealth === "LOW") {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-amber-300 text-amber-700"
      >
        <AlertTriangle className="h-3 w-3" />
        Low Stock
      </Badge>
    );
  }

  return (
    <Badge variant="outline">
      Stock: {Number(currentStock || 0).toLocaleString()}
    </Badge>
  );
}

export default function LabOrderingPage({ currentUser }) {
  const [search, setSearch] = useState("");
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
  const outstandingBalance = Number(currentUser?.outstanding ?? 18500);

  // CREDIT CONTROL (NEW)
  const creditStatus = (currentUser?.creditStatus || "").toUpperCase();
  const creditReason = currentUser?.creditReason || "";
  const isCreditHold = creditStatus === "HOLD";
  const isNearLimit = creditStatus === "NEAR_LIMIT";


  useEffect(() => {
    loadCatalog();
    loadRecentOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labId]);

  async function loadCatalog() {
    try {
      setLoadingCatalog(true);
      setErrorMessage("");

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
      const res = await getLabRecentOrders(labId);
      const result = res?.data || res || {};
      setRecentOrders(Array.isArray(result?.orders) ? result.orders : []);
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
      const res = await getOrderDetails(orderId);
      const result = res?.data || res || {};
      setSelectedOrderId(orderId);
      setSelectedOrderDetails(result);
    } catch (error) {
      console.error("Failed to load order details", error);
      setErrorMessage(
        error.message || "Unable to load order details right now."
      );
    } finally {
      setLoadingOrderDetails(false);
    }
  }

  const visibleCatalog = useMemo(() => {
    return catalog.filter((item) =>
      `${item.productName || ""} ${item.category || ""} ${item.productId || ""}`
        .toLowerCase()
        .includes(search.toLowerCase())
    );
  }, [catalog, search]);

  const quickOrderItems = useMemo(() => {
    return visibleCatalog.filter((item) => item.quickOrder || item.isQuickOrder);
  }, [visibleCatalog]);

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

  function quickReorder(item) {
    addToCart(item, 1);
    if (item?.canOrder) {
      setStatusMessage(`Quick reorder added for ${item.productName}`);
    }
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

  function handleRepeatOrder() {
    if (!selectedOrderDetails?.lines?.length) {
      setErrorMessage("No line items found to repeat.");
      return;
    }

    const catalogMap = {};
    catalog.forEach((item) => {
      catalogMap[item.productId] = item;
    });

    const nextCart = [];
    const issues = [];

    selectedOrderDetails.lines.forEach((line) => {
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
        items: cartItems.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          quantity: Number(item.quantity || 0),
          unitSellingPrice: Number(item.unitPrice || 0),
        })),
      };

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
          Welcome {labName} — fast mobile ordering for repeat purchases.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <QuickStat
          title="Outstanding"
          value={`₹${Number(outstandingBalance).toLocaleString()}`}
          icon={IndianRupee}
        />
        <QuickStat
          title="Recent Orders"
          value={recentOrders.length}
          icon={FileText}
        />
        <QuickStat
          title="Quick Reorder"
          value={quickOrderItems.length}
          icon={RotateCcw}
        />
        <QuickStat title="Cart Items" value={cartCount} icon={ShoppingCart} />
      </div>

      {statusMessage ? (
        <div className="rounded-xl bg-green-50 p-3 text-sm text-green-700">
          {statusMessage}
        </div>
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
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {submitResult?.success ? (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-700" />
            <div>
              <div className="text-sm font-semibold text-green-800">
                Order placed successfully
              </div>
              <div className="mt-1 text-sm text-green-700">
                Order ID:{" "}
                <span className="font-medium">{submitResult.orderId}</span>
                {submitResult.invoiceId ? (
                  <>
                    {" "}
                    • Invoice ID:{" "}
                    <span className="font-medium">
                      {submitResult.invoiceId}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Search Catalog</CardTitle>
          <CardDescription>
            Find products quickly and place orders on mobile.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Search products, category, SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-12 rounded-xl text-base"
          />
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Product Catalog</CardTitle>
            <CardDescription>
              Tap-friendly ordering for frequently used items.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingCatalog ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading catalog...
              </div>
            ) : visibleCatalog.length === 0 ? (
              <div className="text-sm text-slate-500">No products found.</div>
            ) : (
              <div className="space-y-3">
                {visibleCatalog.map((item) => {
                  const unitPrice = Number(
                    item.unitSellingPrice ?? item.price ?? 0
                  );
                  const qty = productQty[item.productId] || 1;
                  const isOut =
                    item.stockHealth === "OUT" || item.canOrder === false;
                  const isLow = item.stockHealth === "LOW";

                  return (
                    <div
                      key={item.productId}
                      className={`rounded-2xl border bg-white p-4 shadow-sm ${
                        isOut ? "opacity-80" : ""
                      }`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="text-base font-semibold text-slate-900">
                            {item.productName}
                          </div>
                          <div className="mt-1 text-sm text-slate-500">
                            {item.category || "General"} • {item.productId}
                          </div>

                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge variant="secondary">
                              ₹{unitPrice.toLocaleString()}
                            </Badge>

                            <StockBadge
                              stockHealth={item.stockHealth}
                              currentStock={item.currentStock}
                            />

                            {item.quickOrder || item.isQuickOrder ? (
                              <Badge>Quick Reorder</Badge>
                            ) : null}
                          </div>

                          {isLow ? (
                            <div className="mt-2 text-xs text-amber-700">
                              Limited stock available. Order soon.
                            </div>
                          ) : null}

                          {isOut ? (
                            <div className="mt-2 text-xs text-red-600">
                              This product is currently unavailable for ordering.
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <QtyControl
                          value={qty}
                          disabled={isOut}
                          onDecrease={() =>
                            updateProductQty(item.productId, qty - 1)
                          }
                          onIncrease={() =>
                            updateProductQty(item.productId, qty + 1)
                          }
                        />

                        <Button
                          className="h-11 rounded-xl sm:min-w-[180px]"
                          onClick={() => addToCart(item)}
                          disabled={isOut}
                        >
                          <ShoppingCart className="mr-2 h-4 w-4" />
                          {isOut ? "Unavailable" : "Add to Cart"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Cart Summary</CardTitle>
              <CardDescription>Review and submit your order.</CardDescription>
            </CardHeader>
            <CardContent>
              {cartItems.length === 0 ? (
                <div className="text-sm text-slate-500">Your cart is empty.</div>
              ) : (
                <div className="space-y-4">
                  {cartItems.map((item) => {
                    const lineTotal =
                      Number(item.quantity) * Number(item.unitPrice);

                    return (
                      <div
                        key={item.productId}
                        className="rounded-2xl border bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              {item.productName}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              {item.productId} • ₹
                              {Number(item.unitPrice).toLocaleString()} each
                            </div>
                            {item.currentStock !== null &&
                            item.currentStock !== undefined ? (
                              <div className="mt-1 text-xs text-slate-500">
                                Available stock:{" "}
                                {Number(item.currentStock).toLocaleString()}
                              </div>
                            ) : null}
                          </div>

                          <button
                            type="button"
                            onClick={() => removeFromCart(item.productId)}
                            className="rounded-lg p-2 text-slate-500 hover:bg-slate-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <QtyControl
                            compact
                            value={item.quantity}
                            onDecrease={() => decreaseCartQty(item.productId)}
                            onIncrease={() => increaseCartQty(item.productId)}
                          />

                          <div className="text-sm font-semibold text-slate-900">
                            ₹{lineTotal.toLocaleString()}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div className="rounded-2xl border bg-slate-50 p-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Items</span>
                      <span className="font-medium text-slate-900">
                        {cartCount}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-base">
                      <span className="font-semibold text-slate-900">
                        Subtotal
                      </span>
                      <span className="font-semibold text-slate-900">
                        ₹{cartSubTotal.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">
                      Order Notes
                    </label>
                    <Textarea
                      placeholder="Any urgent note, delivery request, or instruction..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="min-h-[96px] rounded-xl"
                    />
                  </div>

                  <Button
                    className="h-11 w-full rounded-xl"
                    onClick={handleSubmitOrder}
                    disabled={submitting || cartItems.length === 0 || isCreditHold}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Submitting Order...
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="mr-2 h-4 w-4" />
                        Submit Order
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Quick Reorder</CardTitle>
              <CardDescription>
                Fast repeat ordering for common products.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {quickOrderItems.length === 0 ? (
                <div className="text-sm text-slate-500">
                  No quick reorder items found.
                </div>
              ) : (
                <div className="space-y-3">
                  {quickOrderItems.map((item) => {
                    const isOut =
                      item.stockHealth === "OUT" || item.canOrder === false;

                    return (
                      <div
                        key={item.productId}
                        className="rounded-2xl border bg-white p-4 shadow-sm"
                      >
                        <div className="text-base font-semibold text-slate-900">
                          {item.productName}
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          ₹
                          {Number(
                            item.unitSellingPrice ?? item.price ?? 0
                          ).toLocaleString()}
                        </div>
                        <div className="mt-2">
                          <StockBadge
                            stockHealth={item.stockHealth}
                            currentStock={item.currentStock}
                          />
                        </div>
                        <Button
                          className="mt-4 h-11 w-full rounded-xl"
                          variant="outline"
                          onClick={() => quickReorder(item)}
                          disabled={isOut}
                        >
                          <RotateCcw className="mr-2 h-4 w-4" />
                          {isOut ? "Unavailable" : "Quick Reorder"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Recent Orders</CardTitle>
            <CardDescription>Your latest visible orders.</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingOrders ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading recent orders...
              </div>
            ) : recentOrders.length === 0 ? (
              <div className="text-sm text-slate-500">No recent orders found.</div>
            ) : (
              <div className="space-y-3">
                {recentOrders.map((order) => (
                  <div
                    key={order.orderId}
                    className={`rounded-2xl border bg-white p-4 shadow-sm ${
                      selectedOrderId === order.orderId
                        ? "ring-2 ring-slate-200"
                        : ""
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-base font-semibold text-slate-900">
                          {order.orderId}
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          Date: {order.orderDate || order.date || "-"}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">
                          {order.orderStatus || order.status || "Placed"}
                        </Badge>
                        <Badge variant="outline">
                          {order.paymentStatus || "Pending"}
                        </Badge>
                        <Badge>
                          ₹
                          {Number(
                            order.orderTotal ?? order.total ?? 0
                          ).toLocaleString()}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-3">
                      <Button
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => openOrderDetails(order.orderId)}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        View Details
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Order Details</CardTitle>
            <CardDescription>
              Review the selected order and item details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedOrderId ? (
              <div className="text-sm text-slate-500">
                Select a recent order to view details.
              </div>
            ) : loadingOrderDetails ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading order details...
              </div>
            ) : selectedOrderDetails?.order ? (
              <div className="space-y-4">
                <div>
                  <div className="font-semibold">
                    {selectedOrderDetails.order.orderId}
                  </div>
                  <div className="text-sm text-slate-500">
                    {selectedOrderDetails.order.orderDate || "-"}
                  </div>
                </div>

                <div className="text-sm space-y-1">
                  <div>
                    Invoice: {selectedOrderDetails.order.invoiceId || "-"}
                  </div>
                  <div>Status: {selectedOrderDetails.order.orderStatus || "-"}</div>
                  <div>
                    Payment: {selectedOrderDetails.order.paymentStatus || "-"}
                  </div>
                  <div>
                    Total: ₹
                    {Number(
                      selectedOrderDetails.order.orderTotal || 0
                    ).toLocaleString()}
                  </div>
                </div>

                <div className="pt-1">
                  <Button className="rounded-xl" onClick={handleRepeatOrder}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Repeat This Order
                  </Button>
                </div>

                {selectedOrderDetails.order.notes ? (
                  <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                    <div className="font-medium">Notes</div>
                    <div className="mt-1 whitespace-pre-wrap">
                      {selectedOrderDetails.order.notes}
                    </div>
                  </div>
                ) : null}

                <div className="space-y-2">
                  {selectedOrderDetails.lines?.length ? (
                    selectedOrderDetails.lines.map((line) => (
                      <div
                        key={line.orderLineId}
                        className="rounded-xl border p-3"
                      >
                        <div className="font-medium">{line.productName}</div>
                        <div className="text-sm text-slate-500">
                          {line.productId} • Qty {line.quantity}
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          Unit Price: ₹
                          {Number(
                            line.unitSellingPrice || 0
                          ).toLocaleString()}
                        </div>
                        <div className="text-sm text-slate-600">
                          Tax: ₹{Number(line.taxAmount || 0).toLocaleString()}
                        </div>
                        <div className="text-sm font-medium">
                          ₹{Number(line.netLineTotal || 0).toLocaleString()}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-sm text-slate-500">
                      No line items found.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">No details available.</div>
            )}
          </CardContent>
        </Card>
      </div>

      {cartItems.length > 0 ? (
        <div className="fixed inset-x-0 bottom-16 z-30 border-t bg-white/95 px-4 py-3 shadow-lg backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-md items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500">Cart</div>
              <div className="text-sm font-semibold text-slate-900">
                {cartCount} items • ₹{cartSubTotal.toLocaleString()}
              </div>
            </div>
            <Button
              className="h-10 rounded-xl"
              onClick={handleSubmitOrder}
              disabled={submitting}
            >
              {submitting ? "Submitting..." : "Submit"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}