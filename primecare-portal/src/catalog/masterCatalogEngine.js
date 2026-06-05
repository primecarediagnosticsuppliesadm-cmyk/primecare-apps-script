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

export function computeMarginPct(sellingPrice, costPrice) {
  const sell = num(sellingPrice);
  const cost = num(costPrice);
  if (sell <= 0) return 0;
  return Math.round(((sell - cost) / sell) * 100);
}

export function mapMasterCatalogRow(row = {}) {
  const productId = str(row.productId ?? row.product_id);
  const sellingPrice = num(row.unitSellingPrice ?? row.selling_price ?? row.sellingPrice);
  const costPrice = num(row.unitCost ?? row.cost_price ?? row.costPrice);
  return {
    productId,
    productName: str(row.productName ?? row.product_name) || productId,
    category: str(row.category) || "Consumables",
    brand: str(row.brand) || "PrimeCare",
    sellingPrice,
    costPrice,
    marginPct: computeMarginPct(sellingPrice, costPrice),
    currentStock: num(row.currentStock ?? row.current_stock),
    minStock: num(row.minStock ?? row.min_stock),
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
