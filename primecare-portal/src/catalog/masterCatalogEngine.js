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

export function mapMasterCatalogRow(row = {}) {
  const productId = str(row.productId ?? row.product_id);
  const sellingPrice = num(row.unitSellingPrice ?? row.selling_price ?? row.sellingPrice);
  const costPrice = num(row.unitCost ?? row.cost_price ?? row.costPrice);
  const transferPrice = num(
    row.transferPrice ??
      row.transfer_price ??
      row.unitTransferPrice ??
      row.unit_transfer_price ??
      row.hqTransferPrice ??
      row.hq_transfer_price
  );
  const hqCostConfigured = isHqCostConfigured(costPrice);
  const hqTransferConfigured = isHqTransferConfigured(transferPrice);
  const hqPricingConfigured = isHqPricingConfigured(costPrice, transferPrice);
  const hqMarginConfigured = isHqMarginConfigured(sellingPrice, costPrice);
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
    marginPct: hqMarginConfigured ? computeMarginPct(sellingPrice, costPrice) : null,
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
