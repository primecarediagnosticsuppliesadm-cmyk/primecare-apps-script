/**
 * HQ Master Catalog — PrimeCare-owned product list distributors may assign from.
 */

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function formatInr(n) {
  return `₹${num(n).toLocaleString("en-IN")}`;
}

export function isPositivePrice(value) {
  const n = num(value);
  return Number.isFinite(n) && n > 0;
}

export function computeMarginPct(sellingPrice, costPrice) {
  const sell = num(sellingPrice);
  const cost = num(costPrice);
  if (sell <= 0 || cost <= 0) return null;
  return Math.round(((sell - cost) / sell) * 100);
}

/** Distributor margin vs HQ transfer price (not HQ cost). */
export function computeDistributorMargin(distributorPrice, hqTransferPrice) {
  const sell = num(distributorPrice);
  const transfer = num(hqTransferPrice);
  if (sell <= 0 || transfer <= 0) {
    return {
      marginAmount: null,
      marginPct: null,
      configured: false,
    };
  }
  const marginAmount = Math.round((sell - transfer) * 100) / 100;
  const marginPct = Math.round(((sell - transfer) / sell) * 100);
  return { marginAmount, marginPct, configured: true };
}

export function isHqPricingConfigured(hqCostPrice, hqTransferPrice) {
  return isPositivePrice(hqCostPrice) && isPositivePrice(hqTransferPrice);
}

export function isHqCostConfigured(hqCostPrice) {
  return isPositivePrice(hqCostPrice);
}

export function isHqTransferConfigured(hqTransferPrice) {
  return isPositivePrice(hqTransferPrice);
}

export function isHqMarginConfigured(sellingPrice, costPrice) {
  return isPositivePrice(sellingPrice) && isPositivePrice(costPrice);
}

export function formatPriceOrNotConfigured(value, configured = true) {
  if (!configured || !isPositivePrice(value)) return "Not configured";
  return formatInr(value);
}

export function formatMarginAmount(amount, configured = true) {
  if (!configured || amount == null) return "--";
  return formatInr(amount);
}

export function formatMarginPct(pct, configured = true) {
  if (!configured || pct == null) return "--";
  return `${pct}%`;
}

function optionalPositivePrice(value) {
  if (value == null || value === "") return null;
  const n = num(value);
  return n > 0 ? n : null;
}

/**
 * HQ Master Catalog pricing — products table is authoritative for Year-1 HQ.
 * View/lab prices are fallback only when product selling_price / cost_price is missing.
 */
export function resolveMasterCatalogPricing({
  productId = "",
  viewPrice = null,
  viewCost = null,
  productSellingPrice = null,
  productCostPrice = null,
  logQa = true,
} = {}) {
  const viewSelling = optionalPositivePrice(viewPrice);
  const viewCostValue = optionalPositivePrice(viewCost);
  const productSell = optionalPositivePrice(productSellingPrice);
  const productCost = optionalPositivePrice(productCostPrice);

  const resolvedHqPrice = productSell ?? viewSelling;
  const resolvedHqCost = productCost ?? viewCostValue;
  const margin =
    resolvedHqPrice != null && resolvedHqCost != null
      ? computeMarginPct(resolvedHqPrice, resolvedHqCost)
      : null;

  const payload = {
    productId: str(productId),
    viewPrice: viewSelling,
    productSellingPrice: productSell,
    productCostPrice: productCost,
    resolvedHqPrice,
    resolvedHqCost,
    margin,
  };

  if (logQa) {
    console.log("[masterCatalogPricing]", payload);
  }

  return {
    viewPrice: viewSelling,
    productSellingPrice: productSell,
    productCostPrice: productCost,
    sellingPrice: resolvedHqPrice ?? 0,
    costPrice: resolvedHqCost ?? 0,
    marginPct: margin,
    hqCostConfigured: isHqCostConfigured(resolvedHqCost),
    hqMarginConfigured: isHqMarginConfigured(resolvedHqPrice, resolvedHqCost),
  };
}

export function mapMasterCatalogRow(row = {}) {
  const productId = str(row.productId ?? row.product_id);
  const pricing = resolveMasterCatalogPricing({
    productId,
    viewPrice: row.viewUnitSellingPrice ?? row.unitSellingPrice ?? row.selling_price ?? row.sellingPrice,
    viewCost: row.viewUnitCost ?? row.unitCost ?? row.cost_price ?? row.costPrice,
    productSellingPrice:
      row.productSellingPrice ?? row.product_selling_price ?? row.catalogSellingPrice ?? null,
    productCostPrice:
      row.productCostPrice ?? row.product_cost_price ?? row.catalogCostPrice ?? null,
    logQa: row._logMasterCatalogPricing !== false,
  });
  const sellingPrice = pricing.sellingPrice;
  const costPrice = pricing.costPrice;
  const transferPrice = num(
    row.transferPrice ??
      row.transfer_price ??
      row.unitTransferPrice ??
      row.unit_transfer_price ??
      row.hqTransferPrice ??
      row.hq_transfer_price
  );
  const hqCostConfigured = pricing.hqCostConfigured;
  const hqTransferConfigured = isHqTransferConfigured(transferPrice);
  const hqPricingConfigured = isHqPricingConfigured(costPrice, transferPrice);
  const hqMarginConfigured = pricing.hqMarginConfigured;
  return {
    productId,
    productName: str(row.productName ?? row.product_name) || productId,
    category: str(row.category) || "Consumables",
    brand: str(row.brand) || "PrimeCare",
    sellingPrice,
    costPrice,
    transferPrice,
    hqCostConfigured,
    hqTransferConfigured,
    hqPricingConfigured,
    hqMarginConfigured,
    marginPct: pricing.marginPct,
    currentStock: num(row.currentStock ?? row.current_stock),
    minStock: num(row.minStock ?? row.min_stock),
    reorderQty: num(row.reorderQty ?? row.reorder_qty),
    unit: str(row.unit) || "",
    preferredSupplier: str(row.preferredSupplier ?? row.preferred_supplier) || "",
    active: row.active !== false && str(row.activeFlag).toUpperCase() !== "N",
    source: str(row.source) || "hq_master",
  };
}

export function buildMasterCatalogModel(products = []) {
  const items = (products || []).map(mapMasterCatalogRow).filter((p) => p.productId);
  return {
    items,
    productCount: items.length,
    activeCount: items.filter((p) => p.active).length,
  };
}
