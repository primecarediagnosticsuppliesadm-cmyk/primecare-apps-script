import { supabase } from "./supabaseClient.js";
import {
  filterCollectionsForUser,
  filterLabsForUser,
  filterVisitsForUser,
} from "@/utils/accessFilters.js";
import {
  logStaleFieldMapping,
  logSupabaseFeatureSource,
} from "@/utils/migrationTrace.js";
import { labIdKey, normalizeLabIdKey } from "@/utils/labId.js";
import { computeQualificationScore } from "@/utils/computeQualificationScore.js";
import {
  deriveDefaultPipelineStage,
  isAgentAllowedPipelineStage,
  mapPipelineFieldsFromRow,
  normalizeQualificationPipelineStage,
} from "@/utils/qualificationPipeline.js";
import {
  buildOrdersByLabDateIndex,
  collectOrderRowIds,
  computeRevenueMetrics,
  normalizedOrderRowStatus,
  orderCountsTowardDashboardRevenue,
  orderOperationalExcludedFromIndices,
  resolveOrderAmount,
} from "@/metrics/computeRevenueMetrics.js";
import {
  computeReceivableMetrics,
  isArCreditRiskRow,
  summarizeCollectionsList,
} from "@/metrics/computeReceivableMetrics.js";
import {
  productsNearStockoutFromInventoryStats,
  rollupInventoryTableRows,
  rollupStockDashboardMappedItems,
} from "@/metrics/computeInventoryMetrics.js";
import { IS_QA } from "@/config/environment";
import { recordPredatorCacheEvent } from "@/predator/cacheDiagnostics.js";
import {
  estimatePayloadBytes,
  recordPredatorApiExecution,
} from "@/predator/apiExecutionTrace.js";
import { recordAdminDashboardApiUiSnapshots } from "@/predator/uiStateReliability.js";
import { recordPredatorTiming, predatorTrace } from "@/predator/predatorTiming.js";
import {
  AGENT_VISITS_INSERT_COLUMNS,
  sanitizeRowToKnownColumns,
} from "@/predator/schemaAwareness.js";
import { isPerfLogEnabled, perfLog, perfTime, shouldRunDashboardKpiAudit } from "@/utils/perfLog.js";
import { fireNotificationEvent } from "@/notifications/fireNotificationEvent.js";
import { directoryRoleFromPlatformRole } from "@/operations/operationsCenterAdminEngine.js";

export { labIdKey, normalizeLabIdKey };

function traceSupabaseRead(feature, extra) {
  logSupabaseFeatureSource(feature, extra ?? {});
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v) {
  return String(v ?? "").trim();
}

function cleanCollectionAgentName(agent) {
  const s = str(agent);
  if (!s || s === "-" || s === "—" || s.toLowerCase() === "null") return "";
  return s;
}

function paymentAmountFromRow(p) {
  return num(
    p?.amount_received ??
      p?.amountReceived ??
      p?.amount_collected ??
      p?.amountCollected ??
      p?.amount ??
      p?.payment_amount ??
      0
  );
}

/** Index payments by normalized lab_id (fixes LAB_001 vs Lab_001 query misses). */
export function buildPaymentsByNormalizedLabId(paymentRows) {
  const byLab = new Map();
  const casingVariants = [];

  for (const p of paymentRows || []) {
    const rawLab = str(p.lab_id ?? p.labId ?? p.Lab_ID);
    const key = normalizeLabIdKey(rawLab);
    if (!key) continue;
    if (rawLab && rawLab !== key) {
      casingVariants.push({ raw: rawLab, normalized: key, payment_id: p.payment_id ?? p.id });
    }
    if (!byLab.has(key)) byLab.set(key, []);
    byLab.get(key).push(p);
  }

  for (const list of byLab.values()) {
    list.sort((a, b) => {
      const tb = new Date(b.payment_date ?? b.created_at ?? 0).getTime();
      const ta = new Date(a.payment_date ?? a.created_at ?? 0).getTime();
      return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    });
  }

  return { byLab, casingVariants };
}

export function sumPaymentsForLabRows(paymentList) {
  return (paymentList || []).reduce((s, p) => s + paymentAmountFromRow(p), 0);
}

/**
 * Derives display payment status from AR totals (never persisted to ar_credit_control).
 */
export function deriveCollectionPaymentStatus({
  outstandingAmount,
  totalPaid,
  totalDelivered = 0,
  explicitStatus = "",
}) {
  const outstanding = num(outstandingAmount);
  const paid = num(totalPaid);
  const delivered = num(totalDelivered);
  const explicit = str(explicitStatus).trim();
  const explicitLower = explicit.toLowerCase();

  let derived;
  if (outstanding > 0) {
    derived = paid > 0 ? "Partially Paid" : delivered > 0 ? "Pending" : "Pending";
  } else if (paid > 0) {
    derived = "Paid";
  } else {
    derived = "Current";
  }

  if (explicit) {
    if (explicitLower === "paid" && outstanding > 0) {
      derived = paid > 0 ? "Partially Paid" : "Pending";
    } else if (explicitLower === "pending" && outstanding <= 0) {
      derived = paid > 0 ? "Paid" : "Current";
    } else if (explicitLower === "partially paid" || explicitLower === "partial") {
      derived = outstanding > 0 && paid > 0 ? "Partially Paid" : derived;
    } else if (
      explicitLower !== "paid" &&
      explicitLower !== "pending" &&
      explicitLower !== "current"
    ) {
      derived = explicit;
    } else if (explicitLower === "paid" && paid <= 0 && outstanding <= 0) {
      derived = "Current";
    }
  }

  return derived;
}

/** Rows with no receivables activity are hidden from the collections list. */
export function hasCollectionArRelevance(row) {
  const outstanding = num(row?.outstandingAmount);
  const totalPaid = num(row?.totalPaid);
  const totalDelivered = num(row?.totalDelivered);
  const overdueDays = num(row?.overdueDays);
  if (outstanding > 0 || totalPaid > 0 || totalDelivered > 0 || overdueDays > 0) return true;
  const hold = str(row?.creditHold).toUpperCase();
  if (hold === "HOLD" || hold === "YES") return true;
  const risk = str(row?.riskStatus).toLowerCase();
  if (risk === "high" || risk === "medium") return true;
  return false;
}

export function auditCollectionDataInconsistencies(arRaw, payRaw, collections) {
  const issues = [];
  const { byLab, casingVariants } = buildPaymentsByNormalizedLabId(payRaw);

  if (casingVariants.length) {
    issues.push({
      type: "lab_id_casing_in_payments",
      count: casingVariants.length,
      samples: casingVariants.slice(0, 5),
    });
  }

  for (const c of collections || []) {
    const labKey = normalizeLabIdKey(c.labId);
    const pays = byLab.get(labKey) || [];
    const paySum = sumPaymentsForLabRows(pays);

    if (c.paymentStatus === "Paid" && num(c.totalPaid) <= 0) {
      issues.push({ type: "paid_status_zero_total_paid", labId: labKey, paySum });
    }
    if (c.paymentStatus === "Pending" && num(c.outstandingAmount) <= 0 && paySum > 0) {
      issues.push({ type: "pending_with_no_outstanding_but_payments", labId: labKey, paySum });
    }
    if (paySum > 0 && pays.length && num(c.totalPaid) < paySum - 0.01) {
      issues.push({
        type: "ar_total_paid_below_payments_sum",
        labId: labKey,
        arTotalPaid: c.totalPaid,
        paymentsSum: paySum,
      });
    }
    if (pays.length && !arRaw?.some((ar) => normalizeLabIdKey(ar.lab_id ?? ar.labId) === labKey)) {
      issues.push({ type: "payments_without_ar_row", labId: labKey, paymentCount: pays.length });
    }
  }

  for (const ar of arRaw || []) {
    const labKey = normalizeLabIdKey(ar.lab_id ?? ar.labId);
    const outstanding = num(ar.outstanding ?? ar.outstanding_amount ?? 0);
    const totalPaid = num(ar.total_paid ?? ar.totalPaid ?? 0);
    if (outstanding <= 0 && totalPaid <= 0) {
      const pays = byLab.get(labKey) || [];
      if (!pays.length) {
        issues.push({ type: "ar_row_no_activity", labId: labKey });
      }
    }
  }

  if (issues.length) {
    console.warn("COLLECTION DATA INCONSISTENCIES", issues);
  }
  return issues;
}

/**
 * Maps a row from v_stock_dashboard (snake_case) to the camelCase shape
 * used by StockPage and the legacy Apps Script stock payload.
 */
export function mapStockDashboardRow(row) {
  const productId = str(row.product_id ?? row.productId ?? row.Product_ID);
  const productName = str(row.product_name ?? row.productName ?? row.Product_Name);
  const category = str(row.category ?? row.Category);

  const currentStock = num(row.current_stock ?? row.currentStock ?? row.Current_Stock);
  const minStock = num(row.min_stock ?? row.minStock ?? row.Min_Stock);
  const reorderQty = num(row.reorder_qty ?? row.reorderQty ?? row.Reorder_Qty);
  const reorderStatus = str(
    row.reorder_status ?? row.reorderStatus ?? row.Reorder_Status
  ).toUpperCase();

  let stockHealth = str(row.stock_health ?? row.stockHealth);
  if (!stockHealth) {
    if (currentStock <= 0) stockHealth = "Critical";
    else if (currentStock < minStock) stockHealth = "Reorder";
    else stockHealth = "Healthy";
  }

  return {
    tenantId: str(row.tenant_id ?? row.tenantId ?? row.Tenant_ID),
    productId,
    productName,
    category,
    currentStock,
    minStock,
    reorderQty,
    reorderStatus,
    avgDailySales: num(
      row.avg_daily_sales_30d ?? row.avgDailySales ?? row.Avg_Daily_Sales_30D
    ),
    leadTimeDays: num(row.lead_time_days ?? row.leadTimeDays ?? row.Lead_Time_Days),
    stockHealth,
  };
}

function sortInventoryLikeLegacy(inventory) {
  const rank = { Critical: 1, Reorder: 2, Healthy: 3 };
  return [...inventory].sort(
    (a, b) => (rank[a.stockHealth] || 99) - (rank[b.stockHealth] || 99)
  );
}

function normalizeLabCatalogStockHealth(row, currentStock, minStock) {
  const raw = str(row.stock_health ?? row.stockHealth ?? row.stock_status ?? row.stockStatus);
  const value = raw.toLowerCase();
  if (value === "out" || value.includes("out")) return "OUT";
  if (value === "low" || value === "reorder" || value.includes("critical")) return "LOW";
  if (raw) return raw.toUpperCase();
  if (currentStock <= 0) return "OUT";
  if (minStock > 0 && currentStock < minStock) return "LOW";
  return "OK";
}

function coerceCatalogBool(value, fallback) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const s = str(value).toLowerCase();
  if (s === "true" || s === "yes" || s === "y" || s === "1") return true;
  if (s === "false" || s === "no" || s === "n" || s === "0") return false;
  return fallback;
}

export function mapLabCatalogRow(row) {
  const productId = str(row.product_id ?? row.productId ?? row.Product_ID ?? row.id);
  const productName = str(
    row.product_name ?? row.productName ?? row.Product_Name ?? row.name ?? row.item_name ?? productId
  );
  const currentStock = num(row.current_stock ?? row.currentStock ?? row.Current_Stock);
  const minStock = num(row.min_stock ?? row.minStock ?? row.Min_Stock);
  const reorderQty = num(row.reorder_qty ?? row.reorderQty ?? row.Reorder_Qty);
  const stockHealth = normalizeLabCatalogStockHealth(row, currentStock, minStock);
  const activeFlag = str(row.active_flag ?? row.activeFlag ?? row.Active_Flag ?? "Y") || "Y";
  const active = !["N", "NO", "FALSE", "0", "INACTIVE"].includes(activeFlag.toUpperCase());
  const canOrder = coerceCatalogBool(row.can_order ?? row.canOrder, active && currentStock > 0);

  return {
    productId,
    tenantId: str(row.tenant_id ?? row.tenantId ?? row.Tenant_ID) || null,
    productName,
    category: str(row.category ?? row.Category) || "Consumables",
    brand: str(row.brand ?? row.Brand) || "PrimeCare",
    unitSellingPrice: num(
      row.unit_selling_price ??
        row.unitSellingPrice ??
        row.selling_price ??
        row.sellingPrice ??
        row.price ??
        row.unit_price ??
        row.unitPrice
    ),
    unitCost: num(row.unit_cost ?? row.unitCost ?? row.cost_price ?? row.costPrice),
    transferPrice: num(
      row.transfer_price ??
        row.transferPrice ??
        row.unit_transfer_price ??
        row.unitTransferPrice ??
        row.hq_transfer_price ??
        row.hqTransferPrice
    ),
    taxRate: num(row.tax_rate ?? row.taxRate ?? row.gst_rate ?? row.gstRate),
    activeFlag,
    currentStock,
    minStock,
    reorderQty,
    reorderStatus: str(row.reorder_status ?? row.reorderStatus ?? row.Reorder_Status).toUpperCase(),
    stockHealth,
    canOrder: active && canOrder && stockHealth !== "OUT",
    quickOrder: coerceCatalogBool(row.quick_order ?? row.quickOrder ?? row.is_quick_order, true),
  };
}

async function readInventoryCatalogFallbackRows() {
  const catalogProjection = [
    "tenant_id",
    "product_id",
    "product_name",
    "current_stock",
    "min_stock",
    "reorder_qty",
    "reorder_status",
    "unit_selling_price",
    "unit_cost",
    "category",
    "brand",
    "tax_rate",
    "active_flag",
  ].join(",");

  let inv = await supabase.from("inventory").select(catalogProjection);
  if (!inv.error) return inv;

  console.warn(
    "[getLabCatalogRead] inventory catalog projection failed; retrying core stock columns:",
    inv.error.message
  );
  return supabase
    .from("inventory")
    .select("tenant_id,product_id,product_name,current_stock,min_stock,reorder_qty,reorder_status");
}

function normalizeLabCatalogProductId(productId) {
  return str(productId).toUpperCase();
}

/**
 * Prefer profile tenant match, then non-zero price, then purchasable rows.
 * @param {ReturnType<typeof mapLabCatalogRow>} item
 * @param {string|null} preferredTenantId
 */
function scoreLabCatalogDedupeRow(item, preferredTenantId) {
  let score = 0;
  if (preferredTenantId && str(item.tenantId) === str(preferredTenantId)) score += 100;
  if (num(item.unitSellingPrice) > 0) score += 10;
  if (item.canOrder) score += 1;
  return score;
}

/**
 * Collapse cross-tenant fan-out to one purchasable row per SKU.
 * @param {ReturnType<typeof mapLabCatalogRow>[]} products
 * @param {string|null} [preferredTenantId]
 */
export function dedupeLabCatalogProducts(products, preferredTenantId = null) {
  const preferred = str(preferredTenantId) || null;
  const bySku = new Map();

  for (const item of products || []) {
    const key = normalizeLabCatalogProductId(item.productId);
    if (!key) continue;
    const prev = bySku.get(key);
    if (
      !prev ||
      scoreLabCatalogDedupeRow(item, preferred) > scoreLabCatalogDedupeRow(prev, preferred)
    ) {
      bySku.set(key, item);
    }
  }

  return [...bySku.values()];
}

/**
 * Lab order catalog from Supabase. Prefers `v_lab_catalog` when present, otherwise
 * reads `inventory` directly. Shape matches legacy getLabCatalog payload.
 * @param {{ tenantId?: string|null, preferredTenantId?: string|null }} [options]
 */
export async function getLabCatalogRead(options = {}) {
  const preferredTenantId =
    str(options.tenantId ?? options.preferredTenantId) || null;
  traceSupabaseRead("LabOrdering.getLabCatalogRead", {
    tables: ["v_lab_catalog", "inventory"],
    preferredTenantId,
  });
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: { products: [] } };
  }

  try {
    let source = "v_lab_catalog";
    let { data, error } = await supabase.from("v_lab_catalog").select("*");

    if (error) {
      console.warn("[getLabCatalogRead] v_lab_catalog unavailable; trying inventory:", error.message);
      console.warn("SUPABASE LAB CATALOG USING INVENTORY FALLBACK", {
        reason: error.message,
        expectedView: "v_lab_catalog",
        fallbackTable: "inventory",
      });
      source = "inventory";
      const inv = await readInventoryCatalogFallbackRows();
      data = inv.data;
      error = inv.error;
      console.log("SUPABASE LAB CATALOG RAW INVENTORY", data || []);
    }

    if (error) {
      return { success: false, error: error.message || "Supabase lab catalog read failed", data: { products: [] } };
    }

    const mapped = (data || [])
      .map(mapLabCatalogRow)
      .filter((item) => item.productId);
    const products = dedupeLabCatalogProducts(mapped, preferredTenantId).sort((a, b) => {
        if (a.canOrder !== b.canOrder) return a.canOrder ? -1 : 1;
        return a.productName.localeCompare(b.productName);
      });

    console.log("SUPABASE LAB CATALOG", {
      source,
      count: products.length,
      rawCount: mapped.length,
      dedupedFrom: mapped.length - products.length,
      products,
    });

    return { success: true, data: { products, source }, error: null };
  } catch (err) {
    console.warn("[getLabCatalogRead] failed:", err?.message || err);
    return { success: false, error: err?.message || String(err), data: { products: [] } };
  }
}

function normalizeHqSku(productId) {
  return str(productId).toUpperCase();
}

function validateHqProductNumericFields({
  sellingPrice,
  costPrice,
  openingStock,
  minStock,
  reorderQty,
  requireOpeningStock = false,
}) {
  if (num(sellingPrice) < 0) return "Selling price must be 0 or greater";
  if (num(costPrice) < 0) return "Cost price must be 0 or greater";
  if (requireOpeningStock && num(openingStock) < 0) return "Opening stock must be 0 or greater";
  if (num(minStock) < 0) return "Minimum stock must be 0 or greater";
  if (num(reorderQty) < 0) return "Reorder quantity must be 0 or greater";
  return null;
}

async function hqProductExists(tenantId, productId) {
  const sel = await supabase
    .from("products")
    .select("product_id")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId)
    .limit(1);
  if (sel.error) return { exists: false, error: sel.error.message };
  return { exists: Boolean(Array.isArray(sel.data) && sel.data[0]), error: null };
}

/**
 * Create HQ master product + paired inventory row (Year-1 pilot).
 * Payload: tenantId, productId, productName, category?, unit?, sellingPrice, costPrice?,
 * preferredSupplier?, openingStock?, minStock?, reorderQty?, createdBy?
 */
export async function createHqProductWrite(payload = {}) {
  traceSupabaseRead("MasterCatalog.createHqProductWrite", { tables: ["products", "inventory", "inventory_ledger"] });
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: null };
  }

  try {
    const tenantId = str(payload.tenantId ?? payload.tenant_id);
    const productId = normalizeHqSku(payload.productId ?? payload.product_id);
    const productName = str(payload.productName ?? payload.product_name);

    if (!tenantId) return { success: false, error: "tenant_id is required", data: null };
    if (!productId) return { success: false, error: "product_id is required", data: null };
    if (!productName) return { success: false, error: "product_name is required", data: null };

    const numericError = validateHqProductNumericFields({
      sellingPrice: payload.sellingPrice ?? payload.selling_price,
      costPrice: payload.costPrice ?? payload.cost_price,
      openingStock: payload.openingStock ?? payload.opening_stock,
      minStock: payload.minStock ?? payload.min_stock,
      reorderQty: payload.reorderQty ?? payload.reorder_qty,
      requireOpeningStock: true,
    });
    if (numericError) return { success: false, error: numericError, data: null };

    const dup = await hqProductExists(tenantId, productId);
    if (dup.error) return { success: false, error: dup.error, data: null };
    if (dup.exists) {
      return {
        success: false,
        error: `Product already exists for this tenant: ${productId}`,
        data: null,
      };
    }

    const openingStock = num(payload.openingStock ?? payload.opening_stock);
    const minStock = num(payload.minStock ?? payload.min_stock);
    const reorderQty = num(payload.reorderQty ?? payload.reorder_qty);
    const category = str(payload.category) || "Consumables";
    const unit = str(payload.unit) || null;
    const preferredSupplier = str(payload.preferredSupplier ?? payload.preferred_supplier) || null;
    const createdBy = str(payload.createdBy ?? payload.created_by) || null;

    const productRow = {
      tenant_id: tenantId,
      product_id: productId,
      product_name: productName,
      category,
      unit,
      selling_price: num(payload.sellingPrice ?? payload.selling_price),
      cost_price: num(payload.costPrice ?? payload.cost_price),
      preferred_supplier: preferredSupplier,
      active: true,
    };

    const prodIns = await supabase.from("products").insert([productRow]).select();
    if (prodIns.error) {
      return { success: false, error: prodIns.error.message || "Product insert failed", data: null };
    }

    const invRow = {
      tenant_id: tenantId,
      product_id: productId,
      current_stock: openingStock,
      min_stock: minStock,
      reorder_qty: reorderQty,
      stock_in: openingStock,
      stock_out: 0,
      updated_at: new Date().toISOString(),
    };

    const invIns = await supabase.from("inventory").insert([invRow]).select();
    if (invIns.error) {
      return {
        success: false,
        error: invIns.error.message || "Inventory insert failed",
        data: { product: Array.isArray(prodIns.data) ? prodIns.data[0] : prodIns.data },
      };
    }

    if (openingStock > 0) {
      const ledger = await createInventoryLedgerWrite([
        {
          movement_type: "IN",
          product_id: productId,
          product_name: productName,
          order_id: `OPENING-${productId}`,
          quantity: openingStock,
          stock_before: 0,
          stock_after: openingStock,
          tenant_id: tenantId,
          created_by: createdBy,
          created_at: new Date().toISOString(),
        },
      ]);
      if (!ledger.success) {
        console.warn("[createHqProductWrite] opening stock ledger insert failed:", ledger.error);
      }
    }

    return {
      success: true,
      data: {
        productId,
        product: Array.isArray(prodIns.data) ? prodIns.data[0] : prodIns.data,
        inventory: Array.isArray(invIns.data) ? invIns.data[0] : invIns.data,
      },
      error: null,
    };
  } catch (err) {
    console.warn("[createHqProductWrite] failed:", err?.message || err);
    return { success: false, error: err?.message || String(err), data: null };
  }
}

/**
 * Update HQ master product metadata and inventory thresholds (not current_stock).
 */
export async function updateHqProductWrite(productId, payload = {}) {
  traceSupabaseRead("MasterCatalog.updateHqProductWrite", { tables: ["products", "inventory"] });
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: null };
  }

  try {
    const tenantId = str(payload.tenantId ?? payload.tenant_id);
    const sku = normalizeHqSku(productId ?? payload.productId ?? payload.product_id);
    if (!tenantId) return { success: false, error: "tenant_id is required", data: null };
    if (!sku) return { success: false, error: "product_id is required", data: null };

    const productName = str(payload.productName ?? payload.product_name);
    if (!productName) return { success: false, error: "product_name is required", data: null };

    const numericError = validateHqProductNumericFields({
      sellingPrice: payload.sellingPrice ?? payload.selling_price,
      costPrice: payload.costPrice ?? payload.cost_price,
      minStock: payload.minStock ?? payload.min_stock,
      reorderQty: payload.reorderQty ?? payload.reorder_qty,
    });
    if (numericError) return { success: false, error: numericError, data: null };

    const exists = await hqProductExists(tenantId, sku);
    if (exists.error) return { success: false, error: exists.error, data: null };
    if (!exists.exists) {
      return { success: false, error: `Product not found: ${sku}`, data: null };
    }

    const productPatch = {
      product_name: productName,
      category: str(payload.category) || "Consumables",
      unit: str(payload.unit) || null,
      selling_price: num(payload.sellingPrice ?? payload.selling_price),
      cost_price: num(payload.costPrice ?? payload.cost_price),
      preferred_supplier: str(payload.preferredSupplier ?? payload.preferred_supplier) || null,
    };

    const prodUpd = await supabase
      .from("products")
      .update(productPatch)
      .eq("tenant_id", tenantId)
      .eq("product_id", sku)
      .select();
    if (prodUpd.error) return { success: false, error: prodUpd.error.message, data: null };

    const invPatch = {
      min_stock: num(payload.minStock ?? payload.min_stock),
      reorder_qty: num(payload.reorderQty ?? payload.reorder_qty),
      updated_at: new Date().toISOString(),
    };

    const invUpd = await supabase
      .from("inventory")
      .update(invPatch)
      .eq("tenant_id", tenantId)
      .eq("product_id", sku)
      .select();
    if (invUpd.error) return { success: false, error: invUpd.error.message, data: null };

    return {
      success: true,
      data: {
        productId: sku,
        product: Array.isArray(prodUpd.data) ? prodUpd.data[0] : prodUpd.data,
        inventory: Array.isArray(invUpd.data) ? invUpd.data[0] : invUpd.data,
      },
      error: null,
    };
  } catch (err) {
    console.warn("[updateHqProductWrite] failed:", err?.message || err);
    return { success: false, error: err?.message || String(err), data: null };
  }
}

/**
 * Enable or disable HQ master product (soft delete — inventory row retained).
 */
export async function setHqProductActiveWrite(productId, active, payload = {}) {
  traceSupabaseRead("MasterCatalog.setHqProductActiveWrite", { table: "products" });
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: null };
  }

  try {
    const tenantId = str(payload.tenantId ?? payload.tenant_id);
    const sku = normalizeHqSku(productId ?? payload.productId ?? payload.product_id);
    if (!tenantId) return { success: false, error: "tenant_id is required", data: null };
    if (!sku) return { success: false, error: "product_id is required", data: null };

    const nextActive = active !== false && active !== "false" && active !== 0;

    const upd = await supabase
      .from("products")
      .update({ active: nextActive })
      .eq("tenant_id", tenantId)
      .eq("product_id", sku)
      .select();
    if (upd.error) return { success: false, error: upd.error.message, data: null };

    const row = Array.isArray(upd.data) ? upd.data[0] : upd.data;
    if (!row) return { success: false, error: `Product not found: ${sku}`, data: null };

    return {
      success: true,
      data: { productId: sku, active: nextActive, product: row },
      error: null,
    };
  } catch (err) {
    console.warn("[setHqProductActiveWrite] failed:", err?.message || err);
    return { success: false, error: err?.message || String(err), data: null };
  }
}

/**
 * Merge products-table fields (unit, preferred_supplier) into catalog rows for HQ maintenance UI.
 */
export async function enrichCatalogWithProductMetadata(products, tenantId) {
  const id = str(tenantId);
  if (!id || !supabase || !Array.isArray(products) || !products.length) {
    return products || [];
  }

  const { data, error } = await supabase
    .from("products")
    .select("product_id, unit, preferred_supplier, active")
    .eq("tenant_id", id);

  if (error) {
    console.warn("[enrichCatalogWithProductMetadata]", error.message);
    return products;
  }

  const metaBySku = new Map(
    (data || []).map((row) => [normalizeHqSku(row.product_id), row])
  );

  return products.map((item) => {
    const meta = metaBySku.get(normalizeHqSku(item.productId));
    if (!meta) return item;
    return {
      ...item,
      unit: str(meta.unit) || item.unit,
      preferredSupplier: str(meta.preferred_supplier) || item.preferredSupplier,
      active:
        meta.active !== false &&
        item.active !== false &&
        str(item.activeFlag).toUpperCase() !== "N",
    };
  });
}

/**
 * Read-only stock dashboard from Supabase view v_stock_dashboard.
 */
export async function getStockDashboard() {
  traceSupabaseRead("Inventory.getStockDashboard", { table: "v_stock_dashboard" });
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    );
  }

  const { data: rawRows, error } = await supabase
    .from("v_stock_dashboard")
    .select("*");

  if (error) {
    throw new Error(error.message || "Supabase stock read failed");
  }

  const inventory = sortInventoryLikeLegacy(
    (rawRows || []).map(mapStockDashboardRow).filter((item) => item.productId)
  );

  const stats = rollupStockDashboardMappedItems(inventory);

  return {
    success: true,
    data: {
      stats,
      inventory,
    },
  };
}

/**
 * Maps v_labs_credit rows (snake_case) to the camelCase lab objects LabsPage
 * feeds into normalizeLab (legacy getLabs shape).
 */
export function mapLabsCreditRow(row) {
  const creditWarningsRaw =
    row.credit_warnings ?? row.creditWarnings ?? row.Credit_Warnings;
  let creditWarnings = [];
  if (Array.isArray(creditWarningsRaw)) {
    creditWarnings = creditWarningsRaw;
  } else if (typeof creditWarningsRaw === "string" && creditWarningsRaw.trim()) {
    try {
      const parsed = JSON.parse(creditWarningsRaw);
      creditWarnings = Array.isArray(parsed) ? parsed : [];
    } catch {
      creditWarnings = [];
    }
  }

  return {
    tenantId: str(row.tenant_id ?? row.tenantId ?? row.Tenant_ID),
    labId: normalizeLabIdKey(row.lab_id ?? row.labId ?? row.Lab_ID),
    labName: str(row.lab_name ?? row.labName ?? row.Lab_Name),
    ownerName: str(row.owner_name ?? row.ownerName ?? row.Owner_Name),
    phone: str(row.phone ?? row.Phone ?? row.phone_number ?? row.phoneNumber),
    area: str(row.area ?? row.Area),
    assignedAgentId: str(
      row.assigned_agent_id ??
        row.assignedAgentId ??
        row.agent_id ??
        row.agentId ??
        ""
    ),
    assignedAgent: str(
      row.assigned_agent ??
        row.assignedAgent ??
        row.Assigned_Agent ??
        row.agent_name ??
        row.agentName
    ),
    status: str(row.status ?? row.Status),
    activeFlag: str(row.active_flag ?? row.activeFlag ?? row.Active_Flag ?? ""),
    stage: str(row.stage ?? row.Stage),
    lastVisit: str(row.last_visit ?? row.lastVisit ?? row.Last_Visit) || "-",
    nextFollowUp: str(row.next_follow_up ?? row.nextFollowUp ?? row.Next_Follow_Up) || "-",
    outstanding: num(row.outstanding ?? row.outstanding_amount ?? row.outstandingAmount),
    outstandingAmount: num(
      row.outstanding_amount ?? row.outstandingAmount ?? row.outstanding ?? row.Outstanding
    ),
    creditLimit: num(row.credit_limit ?? row.creditLimit ?? row.Credit_Limit),
    daysOverdue: num(row.days_overdue ?? row.daysOverdue ?? row.overdue_days ?? row.Overdue_Days),
    overdueDays: num(row.overdue_days ?? row.days_overdue),
    allowedOverdueDays: num(
      row.allowed_overdue_days ?? row.allowedOverdueDays ?? row.Allowed_Overdue_Days ?? 15
    ),
    creditHold: str(row.credit_hold ?? row.creditHold ?? row.Credit_Hold),
    creditReason: str(row.credit_reason ?? row.creditReason ?? row.Credit_Reason),
    creditStatus: str(row.credit_status ?? row.creditStatus ?? row.Credit_Status),
    creditTerms: str(row.credit_terms ?? row.creditTerms ?? row.Credit_Terms),
    creditWarnings,
    visitCount: num(row.visit_count ?? row.visitCount ?? row.Visit_Count),
    revenue: num(row.revenue ?? row.Revenue),
  };
}

/**
 * Read-only labs / credit directory from Supabase view v_labs_credit.
 */
export async function getLabsCredit() {
  traceSupabaseRead("Labs.getLabsCredit", { table: "v_labs_credit" });
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    );
  }

  const { data: rawRows, error } = await supabase.from("v_labs_credit").select("*");

  if (error) {
    throw new Error(error.message || "Supabase labs read failed");
  }

  const labs = (rawRows || []).map(mapLabsCreditRow).filter((lab) => lab.labId || lab.labName);

  return {
    success: true,
    data: labs,
  };
}

/**
 * Create a lab + AR credit row for a distributor tenant.
 */
export async function createLabWrite(payload = {}) {
  if (!supabase) {
    return { success: false, error: "Supabase is not configured" };
  }

  const tenantId = str(payload.tenantId || payload.tenant_id);
  const homeTenantId = str(payload.homeTenantId || payload.home_tenant_id);
  const distributorContextTenantId = str(
    payload.distributorContextTenantId ||
      payload.selectedDistributorTenantId ||
      payload.contextTenantId
  );
  const forbidHomeTenant = payload.forbidHomeTenant === true;
  const labName = str(payload.labName || payload.lab_name);
  const contactName = str(payload.contactName || payload.owner_name);
  const phone = str(payload.phone);
  const email = str(payload.email);
  const cityTerritory = str(payload.cityTerritory || payload.area);
  const paymentTerms = str(payload.paymentTerms || payload.credit_terms);
  const creditLimit = num(payload.creditLimit ?? payload.credit_limit);

  if (!tenantId) {
    return { success: false, error: "Distributor is required" };
  }
  if (distributorContextTenantId && tenantId !== distributorContextTenantId) {
    return {
      success: false,
      error: "Lab must be created under the selected distributor tenant",
    };
  }
  if (
    forbidHomeTenant &&
    homeTenantId &&
    tenantId === homeTenantId &&
    distributorContextTenantId &&
    distributorContextTenantId !== homeTenantId
  ) {
    return {
      success: false,
      error: "Cannot create lab under PrimeCare HQ while a distributor is selected",
    };
  }
  if (!labName) {
    return { success: false, error: "Lab name is required" };
  }
  if (!contactName) {
    return { success: false, error: "Contact name is required" };
  }
  if (!phone) {
    return { success: false, error: "Phone is required" };
  }
  if (!email) {
    return { success: false, error: "Email is required" };
  }
  if (!cityTerritory) {
    return { success: false, error: "City/territory is required" };
  }
  if (!paymentTerms) {
    return { success: false, error: "Payment terms are required" };
  }
  if (!Number.isFinite(creditLimit) || creditLimit < 0) {
    return { success: false, error: "Credit limit is required" };
  }

  const slug = labName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24);
  const labId = normalizeLabIdKey(
    payload.labId || `LAB-${slug || "lab"}-${Date.now().toString(36).slice(-4)}`
  );

  const labRow = {
    tenant_id: tenantId,
    lab_id: labId,
    lab_name: labName,
    owner_name: contactName,
    phone,
    area: cityTerritory,
    credit_terms: paymentTerms,
    status: "ACTIVE",
  };

  const { data: insertedLab, error: labErr } = await supabase
    .from("labs")
    .insert([labRow])
    .select()
    .single();

  if (labErr) {
    return { success: false, error: labErr.message || "Failed to create lab" };
  }

  const arRow = {
    tenant_id: tenantId,
    lab_id: labId,
    lab_name: labName,
    credit_limit: creditLimit,
    outstanding: 0,
    total_delivered: 0,
    total_paid: 0,
    collections_notes: `contact_email:${email}`,
  };

  const { error: arErr } = await supabase.from("ar_credit_control").insert([arRow]);
  if (arErr) {
    await supabase.from("labs").delete().eq("tenant_id", tenantId).eq("lab_id", labId);
    return {
      success: false,
      error: arErr.message || "Lab created but credit record failed",
    };
  }

  return {
    success: true,
    data: {
      labId,
      labName,
      tenantId,
      lab: insertedLab,
    },
  };
}

function normalizeUrgencyLabel(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v === "critical" || v === "crit") return "Critical";
  if (v === "high") return "High";
  if (v === "medium" || v === "med") return "Medium";
  if (v === "low") return "Low";
  if (String(raw || "").trim()) {
    const s = String(raw).trim();
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  }
  return "Medium";
}

const FORECAST_URGENCY_RANK = { Critical: 1, High: 2, Medium: 3, Low: 4 };

function sortForecastRows(rows) {
  return [...rows].sort(
    (a, b) =>
      (FORECAST_URGENCY_RANK[a.urgency] || 99) - (FORECAST_URGENCY_RANK[b.urgency] || 99)
  );
}

/**
 * Maps v_reorder_candidates (snake_case) to ReorderForecastPage item shape.
 */
export function mapReorderCandidateRow(row) {
  const daysLeft = num(
    row.days_left ?? row.daysLeft ?? row.Days_Left ?? row.days_until_stockout ?? row.days_to_stockout
  );

  let urgencyRaw = str(row.urgency ?? row.Urgency);
  if (!urgencyRaw) {
    if (daysLeft <= 7) urgencyRaw = "Critical";
    else if (daysLeft <= 14) urgencyRaw = "High";
    else if (daysLeft <= 30) urgencyRaw = "Medium";
    else urgencyRaw = "Low";
  }

  const monthlyFromRow = num(
    row.monthly_demand ?? row.monthlyDemand ?? row.Monthly_Demand ?? row.avg_monthly_demand
  );
  const daily = num(
    row.avg_daily_sales_30d ?? row.avg_daily_sales ?? row.avgDailySales ?? row.Avg_Daily_Sales_30D
  );
  const monthlyDemand =
    monthlyFromRow > 0 ? monthlyFromRow : daily > 0 ? Math.round(daily * 30) : 0;

  return {
    productId: str(row.product_id ?? row.productId ?? row.Product_ID),
    productName: str(row.product_name ?? row.productName ?? row.Product_Name),
    stockHealth: str(row.stock_health ?? row.stockHealth ?? row.Stock_Health),
    currentStock: num(row.current_stock ?? row.currentStock ?? row.Current_Stock),
    monthlyDemand,
    daysLeft,
    urgency: normalizeUrgencyLabel(urgencyRaw),
    minStock: num(row.min_stock ?? row.minStock ?? row.Min_Stock),
    reorderQty: num(row.reorder_qty ?? row.reorderQty ?? row.Reorder_Qty),
    suggestedOrderQty: num(
      row.suggested_order_qty ??
        row.suggestedOrderQty ??
        row.reorder_qty ??
        row.Reorder_Qty ??
        row.suggested_reorder_qty
    ),
    costPrice: num(row.cost_price ?? row.costPrice ?? row.unit_cost ?? row.unitCost),
    preferredSupplier: str(
      row.preferred_supplier ?? row.preferredSupplier ?? row.supplier ?? row.supplier_name
    ),
  };
}

function buildReorderSummaryFromForecast(forecast) {
  return {
    criticalItems: forecast.filter((x) => x.urgency === "Critical").length,
    highUrgencyItems: forecast.filter((x) => x.urgency === "High").length,
    mediumUrgencyItems: forecast.filter((x) => x.urgency === "Medium").length,
    totalSuggestedOrderQty: forecast.reduce((sum, x) => sum + num(x.suggestedOrderQty), 0),
  };
}

/**
 * Read-only reorder forecast from Supabase view v_reorder_candidates.
 */
export async function getReorderForecastRead() {
  traceSupabaseRead("PurchaseReorder.getReorderForecastRead", { table: "v_reorder_candidates" });
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    );
  }

  const { data: rawRows, error } = await supabase.from("v_reorder_candidates").select("*");

  if (error) {
    throw new Error(error.message || "Supabase reorder forecast read failed");
  }

  const forecast = sortForecastRows(
    (rawRows || [])
      .map(mapReorderCandidateRow)
      .filter((row) => row.productId || row.productName)
  );

  const summary = buildReorderSummaryFromForecast(forecast);

  return {
    success: true,
    data: {
      summary,
      forecast,
    },
  };
}

const EMPTY_COLLECTIONS_SUMMARY = {
  totalOutstanding: 0,
  overdueCount: 0,
  highRiskCount: 0,
  todayCollections: 0,
};

function deriveCollectionRiskStatus(m) {
  const hold = String(m.creditHold || "").trim().toUpperCase();
  const cs = String(m.creditStatus || "").trim().toUpperCase();
  const od = num(m.daysOverdue);
  const allowed = num(m.allowedOverdueDays) || 15;
  if (cs === "HOLD" || hold === "YES" || hold === "HOLD") return "High";
  if (od > allowed) return "High";
  if (cs === "NEAR_LIMIT") return "Medium";
  if (od > 0) return "Medium";
  return "Low";
}

/**
 * Maps v_labs_credit (+ optional AR fields on same row) to CollectionsPage row shape.
 */
export function mapCollectionsRowFromLabsCredit(rawRow) {
  const m = mapLabsCreditRow(rawRow);

  const lastFollowUp = str(
    rawRow.last_follow_up ??
      rawRow.lastFollowUp ??
      rawRow.collection_last_follow_up ??
      m.nextFollowUp ??
      m.lastVisit
  );
  const nextAction = str(
    rawRow.next_action ?? rawRow.nextAction ?? rawRow.collection_next_action ?? ""
  );

  const outstandingAmount = m.outstandingAmount;
  const totalPaid = num(rawRow.total_paid ?? rawRow.totalPaid ?? 0);
  const totalDelivered = num(rawRow.total_delivered ?? rawRow.totalDelivered ?? 0);
  const paymentStatus = deriveCollectionPaymentStatus({
    outstandingAmount,
    totalPaid,
    totalDelivered,
  });

  const arAgentId = str(rawRow.agent_id ?? rawRow.agentId ?? "");
  const labAssignedAgentId = str(
    rawRow.assigned_agent_id ??
      rawRow.assignedAgentId ??
      m.assignedAgentId ??
      ""
  );
  const effectiveAgentId = arAgentId || labAssignedAgentId;

  return {
    labId: normalizeLabIdKey(m.labId),
    labName: m.labName,
    assignedAgent: cleanCollectionAgentName(m.assignedAgent),
    agentId: effectiveAgentId,
    assignedAgentId: effectiveAgentId,
    outstandingAmount,
    totalPaid,
    totalDelivered: num(rawRow.total_delivered ?? rawRow.totalDelivered ?? 0),
    overdueDays: num(m.daysOverdue),
    riskStatus: deriveCollectionRiskStatus(m),
    lastFollowUp: lastFollowUp === "-" ? "" : lastFollowUp,
    nextFollowUp: str(
      rawRow.next_follow_up_date ?? rawRow.next_follow_up ?? rawRow.nextFollowUp ?? ""
    ).slice(0, 10),
    nextAction,
    collectionsNotes: str(rawRow.collections_notes ?? rawRow.collectionsNotes ?? ""),
    paymentStatus: paymentStatus || "Pending",
    area: m.area,
    creditHold: m.creditHold,
    creditLimit: m.creditLimit,
  };
}

/**
 * Maps `ar_credit_control` row to CollectionsPage shape (Apps Script AR_Credit_Control equivalent).
 * Optional `labsCreditRow` enriches lab name, agent, area from `v_labs_credit`.
 */
export function mapCollectionsRowFromArCredit(
  arRow,
  labsCreditRow = null,
  paymentsForLab = []
) {
  const m = labsCreditRow ? mapLabsCreditRow(labsCreditRow) : null;
  const labId = normalizeLabIdKey(arRow.lab_id ?? arRow.labId ?? arRow.Lab_ID ?? m?.labId);

  const outstandingAmount = num(
    arRow.outstanding ??
      arRow.outstanding_amount ??
      arRow.outstandingAmount ??
      arRow.balance ??
      0
  );
  const arTotalPaid = num(
    arRow.total_paid ?? arRow.totalPaid ?? arRow.amount_paid ?? arRow.amountPaid ?? 0
  );
  const paymentsSum = sumPaymentsForLabRows(paymentsForLab);
  const totalPaid = Math.max(arTotalPaid, paymentsSum);
  const totalDelivered = num(arRow.total_delivered ?? arRow.totalDelivered ?? 0);
  const creditLimit = num(arRow.credit_limit ?? arRow.creditLimit ?? m?.creditLimit ?? 0);
  const overdueDays = num(
    arRow.days_overdue ?? arRow.daysOverdue ?? arRow.overdue_days ?? m?.daysOverdue ?? 0
  );
  const creditHold = str(arRow.credit_hold ?? arRow.creditHold ?? m?.creditHold ?? "");

  const labName = str(arRow.lab_name ?? arRow.labName ?? m?.labName ?? labId);
  const assignedAgent = cleanCollectionAgentName(
    arRow.assigned_agent ??
      arRow.assignedAgent ??
      arRow.agent_name ??
      arRow.agentName ??
      m?.assignedAgent ??
      ""
  );
  const area = str(arRow.area ?? m?.area ?? "");

  let riskStatus = str(arRow.risk_status ?? arRow.riskStatus ?? "");
  if (!riskStatus) {
    if (creditHold.toUpperCase() === "HOLD") riskStatus = "High";
    else if (overdueDays > 0 || outstandingAmount > 0) riskStatus = "Medium";
    else riskStatus = "Low";
  }

  const paymentStatus = deriveCollectionPaymentStatus({
    outstandingAmount,
    totalPaid,
    totalDelivered,
  });

  const lastFollowUp = str(
    arRow.last_follow_up_date ??
      arRow.last_follow_up ??
      arRow.lastFollowUp ??
      arRow.last_followup ??
      m?.lastFollowUp ??
      ""
  ).slice(0, 10);
  const nextFollowUp = str(
    arRow.next_follow_up_date ?? arRow.next_follow_up ?? arRow.nextFollowUp ?? m?.nextFollowUp ?? ""
  ).slice(0, 10);
  const nextAction = str(arRow.next_action ?? arRow.nextAction ?? "");
  const collectionsNotes = str(
    arRow.collections_notes ?? arRow.collectionsNotes ?? arRow.Collections_Notes ?? ""
  );

  const arAgentId = str(arRow.agent_id ?? arRow.agentId ?? "");
  const labAssignedAgentId = str(m?.assignedAgentId ?? "");
  const effectiveAgentId = arAgentId || labAssignedAgentId;

  return {
    tenantId: str(arRow.tenant_id ?? arRow.tenantId ?? m?.tenantId ?? ""),
    labId,
    labName,
    assignedAgent,
    agentId: effectiveAgentId,
    assignedAgentId: effectiveAgentId,
    outstandingAmount,
    totalPaid,
    totalDelivered,
    creditLimit,
    overdueDays,
    riskStatus,
    creditHold,
    lastFollowUp: lastFollowUp === "-" ? "" : lastFollowUp,
    nextFollowUp: nextFollowUp === "-" ? "" : nextFollowUp,
    nextAction,
    collectionsNotes,
    paymentStatus,
    area,
  };
}

function appendTimestampedCollectionNote(existingNotes, noteText) {
  const existing = str(existingNotes);
  const note = str(noteText);
  if (!note) return existing;
  const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
  const line = `[${timestamp}] ${note}`;
  return existing ? `${existing}\n${line}` : line;
}

function buildCollectionDetailFromSources(arRow, labsCreditRow, paymentsForLab = []) {
  const base = mapCollectionsRowFromArCredit(arRow, labsCreditRow, paymentsForLab);
  return {
    ...base,
    allowedOverdueDays: num(
      arRow?.allowed_overdue_days ?? arRow?.allowedOverdueDays ?? arRow?.Allowed_Overdue_Days ?? 0
    ),
    note: base.collectionsNotes,
  };
}

function buildLabsCreditMapByLabId(labsRaw) {
  const map = new Map();
  for (const row of labsRaw || []) {
    const id = normalizeLabIdKey(row.lab_id ?? row.labId ?? row.Lab_ID);
    if (id) map.set(id, row);
  }
  return map;
}

function localDateYmd(d = new Date()) {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function sumTodayPayments(paymentRows) {
  const today = localDateYmd();
  let sum = 0;
  for (const p of paymentRows || []) {
    const raw = str(p.payment_date ?? p.paymentDate ?? p.collected_at ?? p.collectedAt ?? "");
    const d = raw.slice(0, 10);
    if (d === today) {
      sum += num(
        p.amount_collected ??
          p.amountCollected ??
          p.amount_received ??
          p.amountReceived ??
          p.amount ??
          p.payment_amount
      );
    }
  }
  return sum;
}

function isMissingPaymentsOptionalColumnError(err) {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  return (
    (msg.includes("schema cache") ||
      msg.includes("could not find") ||
      msg.includes("does not exist")) &&
    (msg.includes("collected_by") || msg.includes("'note'") || msg.includes(" note"))
  );
}

/** Inserts payment row; retries without optional note/collected_by if columns are not migrated yet. */
async function insertPaymentsRow(paymentRow) {
  const attempt = (row) => supabase.from("payments").insert([row]).select();
  let res = await attempt(paymentRow);
  if (!res.error) return res;

  if (!isMissingPaymentsOptionalColumnError(res.error)) return res;

  const slim = { ...paymentRow };
  delete slim.collected_by;
  delete slim.note;
  console.warn(
    "[createPaymentWrite] payments.note/collected_by missing in Supabase — retrying core columns only. Run primecare-portal/supabase/sql/collections_notes_migration.sql",
    res.error.message
  );
  return attempt(slim);
}

/**
 * Records a collection payment in `payments` and rolls `ar_credit_control` forward for the lab.
 * Payload: { labId, amountReceived | amountCollected, paymentMode | mode, paymentDate?, orderId?, tenantId?, outstandingBefore?, collectedBy? }
 */
export async function createPaymentWrite(payload = {}) {
  return predatorTrace("Collections", "save.payment", async () => {
  traceSupabaseRead("Collections.createPaymentWrite", { tables: ["payments", "ar_credit_control"] });
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: null };
  }

  try {
    const lab_id = normalizeLabIdKey(payload.labId ?? payload.lab_id);
    const amount_received = num(
      payload.amountReceived ?? payload.amount_received ?? payload.amountCollected ?? 0
    );
    const tenant_id = str(payload.tenantId ?? payload.tenant_id) || null;
    const order_id = str(payload.orderId ?? payload.order_id ?? "") || null;
    const mode = str(payload.paymentMode ?? payload.mode ?? "Cash");
    const payment_date = str(
      payload.paymentDate ?? payload.payment_date ?? localDateYmd(new Date())
    ).slice(0, 10);
    const outstanding_before_fallback = num(
      payload.outstandingBefore ?? payload.outstanding_before ?? 0
    );

    let payment_id = str(payload.paymentId ?? payload.payment_id);
    if (!payment_id) {
      payment_id = `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }

    if (!lab_id) {
      return { success: false, error: "lab_id is required", data: null };
    }
    if (amount_received <= 0) {
      return { success: false, error: "amount_received must be > 0", data: null };
    }

    let arSelQuery = supabase.from("ar_credit_control").select("*").eq("lab_id", lab_id);
    if (tenant_id) arSelQuery = arSelQuery.eq("tenant_id", tenant_id);
    const arSel = await arSelQuery.limit(1);

    if (arSel.error) {
      console.warn("[createPaymentWrite] ar_credit_control select:", arSel.error.message);
      return { success: false, error: arSel.error.message || "AR read failed", data: null };
    }

    const arRow = Array.isArray(arSel.data) && arSel.data[0];
    const scoped_tenant_id = tenant_id || str(arRow?.tenant_id ?? arRow?.tenantId);
    if (!scoped_tenant_id) {
      return { success: false, error: "tenant_id is required for AR write", data: null };
    }
    const old_outstanding = arRow
      ? num(
          arRow.outstanding ??
            arRow.outstanding_amount ??
            arRow.outstandingAmount ??
            arRow.balance ??
            0
        )
      : outstanding_before_fallback;
    const old_total_paid = arRow
      ? num(arRow.total_paid ?? arRow.totalPaid ?? arRow.amount_paid ?? arRow.amountPaid ?? 0)
      : 0;

    const new_total_paid = old_total_paid + amount_received;
    const new_outstanding = Math.max(0, old_outstanding - amount_received);

    const created_at = new Date().toISOString();
    const writePayload = {
      payment_id,
      tenant_id: scoped_tenant_id,
      order_id,
      lab_id,
      amount_received,
      payment_date,
      mode,
      outstanding_balance: new_outstanding,
      created_at,
    };

    const paymentRow = { ...writePayload };
    const note = str(payload.note);
    const collected_by = str(payload.collectedBy ?? payload.collected_by);
    if (note) paymentRow.note = note;
    if (collected_by) paymentRow.collected_by = collected_by;

    const { data: payData, error: payErr } = await insertPaymentsRow(paymentRow);

    if (payErr) {
      console.warn("[createPaymentWrite] payments insert:", payErr.message);
      return { success: false, error: payErr.message || "Payment insert failed", data: null };
    }

    const savedPay = Array.isArray(payData) ? payData[0] : payData;

    const arPatch = {
      total_paid: new_total_paid,
      outstanding: new_outstanding,
      updated_at: new Date().toISOString(),
    };

    const arUpd = await supabase
      .from("ar_credit_control")
      .update(arPatch)
      .eq("tenant_id", scoped_tenant_id)
      .eq("lab_id", lab_id);

    if (arUpd.error) {
      console.warn(
        "[createPaymentWrite] ar_credit_control update FAILED — payment row kept; reconcile AR manually:",
        arUpd.error.message
      );
      return {
        success: false,
        error: `Payment saved but AR update failed: ${arUpd.error.message}`,
        data: { payment: savedPay, partial: true },
      };
    }

    fireNotificationEvent(
      {
        eventType: "payment_received",
        sourceModule: "collections",
        sourceId: payment_id,
        tenantId: scoped_tenant_id,
        targetLabId: lab_id,
        targetRole: "admin",
        severity: "info",
        payload: {
          paymentId: payment_id,
          labId: lab_id,
          amountReceived: amount_received,
          mode,
        },
      },
      "createPaymentWrite"
    );

    return {
      success: true,
      data: { payment: savedPay, ar: { lab_id, ...arPatch } },
      error: null,
    };
  } catch (err) {
    console.warn("[createPaymentWrite] failed:", err?.message || err);
    return { success: false, error: err?.message || String(err), data: null };
  }
  });
}

/**
 * Read-only collections: `ar_credit_control` (outstanding, total_paid) + `payments` (today's total),
 * enriched from `v_labs_credit` when present. Never throws.
 */
export async function getCollectionsRead() {
  return predatorTrace("Collections", "api.getCollectionsRead", async () => {
  traceSupabaseRead("Collections.getCollectionsRead", {
    tables: ["ar_credit_control", "payments", "v_labs_credit"],
  });
  if (!supabase) {
    return {
      success: true,
      data: {
        summary: { ...EMPTY_COLLECTIONS_SUMMARY },
        collections: [],
      },
    };
  }

  try {
    const today = localDateYmd();

    const { data: arRaw, error: arErr } = await supabase.from("ar_credit_control").select("*");
    if (arErr) {
      console.warn("[getCollectionsRead] ar_credit_control:", arErr.message);
    }
    const { data: payRaw, error: payErr } = await supabase.from("payments").select("*");
    if (payErr) {
      console.warn("[getCollectionsRead] payments:", payErr.message);
    }
    const { byLab: paymentsByLab, casingVariants } = buildPaymentsByNormalizedLabId(payRaw);
    if (casingVariants.length) {
      console.warn("COLLECTION PAYMENT LAB_ID CASING VARIANTS", casingVariants.slice(0, 10));
    }

    const todayCollections = sumTodayPayments(payRaw);

    const { data: labsRaw, error: labsErr } = await supabase.from("v_labs_credit").select("*");
    if (labsErr) {
      console.warn("[getCollectionsRead] v_labs_credit:", labsErr.message);
    }
    const labsByLab = buildLabsCreditMapByLabId(labsRaw);

    let collections = [];
    if (Array.isArray(arRaw) && arRaw.length) {
      collections = arRaw
        .map((ar) => {
          const labKey = normalizeLabIdKey(ar.lab_id ?? ar.labId ?? ar.Lab_ID);
          return mapCollectionsRowFromArCredit(
            ar,
            labsByLab.get(labKey),
            paymentsByLab.get(labKey) || []
          );
        })
        .filter((c) => c.labId && hasCollectionArRelevance(c));
    } else if (Array.isArray(labsRaw) && labsRaw.length) {
      collections = labsRaw
        .map((row) => {
          const mapped = mapCollectionsRowFromLabsCredit(row);
          const labKey = mapped.labId;
          const pays = paymentsByLab.get(labKey) || [];
          const paySum = sumPaymentsForLabRows(pays);
          if (paySum > mapped.totalPaid) {
            mapped.totalPaid = paySum;
            mapped.paymentStatus = deriveCollectionPaymentStatus({
              outstandingAmount: mapped.outstandingAmount,
              totalPaid: mapped.totalPaid,
              totalDelivered: mapped.totalDelivered,
            });
          }
          return mapped;
        })
        .filter((c) => c.labId && hasCollectionArRelevance(c));
    }

    auditCollectionDataInconsistencies(arRaw, payRaw, collections);

    const summary = summarizeCollectionsList(collections, todayCollections);

    return {
      success: true,
      data: {
        summary,
        collections,
      },
    };
  } catch (err) {
    console.warn("[getCollectionsRead] failed:", err?.message || err);
    return {
      success: true,
      data: {
        summary: { ...EMPTY_COLLECTIONS_SUMMARY },
        collections: [],
      },
    };
  }
  });
}

/** Maps `payments` row → CollectionsPage history card shape. */
export function mapPaymentHistoryRow(row) {
  return {
    paymentId: str(row.payment_id ?? row.paymentId ?? row.Payment_ID ?? row.id ?? ""),
    amountCollected: num(
      row.amount_received ??
        row.amountReceived ??
        row.amount_collected ??
        row.amountCollected ??
        0
    ),
    paymentDate: str(row.payment_date ?? row.paymentDate ?? row.collected_at ?? "").slice(0, 10),
    paymentMode: str(row.mode ?? row.payment_mode ?? row.paymentMode ?? "Cash"),
    note: str(row.note ?? row.notes ?? row.collection_note ?? ""),
  };
}

/**
 * Read-only payment history for a lab from `payments`.
 */
export async function getCollectionHistoryRead(labId, options = {}) {
  const labKey = normalizeLabIdKey(labId);
  traceSupabaseRead("Collections.getCollectionHistoryRead", { table: "payments", labId: labKey });
  if (!supabase || !labKey) {
    return { success: true, data: { history: [] } };
  }

  try {
    let payRaw = Array.isArray(options.paymentsRaw) ? options.paymentsRaw : null;
    if (!payRaw) {
      const { data, error } = await supabase.from("payments").select("*");
      if (error) {
        console.warn("[getCollectionHistoryRead] payments:", error.message);
        return { success: false, error: error.message, data: { history: [] } };
      }
      payRaw = data || [];
    }

    const { byLab } = buildPaymentsByNormalizedLabId(payRaw);
    const matchedRaw = byLab.get(labKey) || [];

    const history = matchedRaw.map(mapPaymentHistoryRow).filter((h) => h.amountCollected > 0);
    return { success: true, data: { history } };
  } catch (err) {
    console.warn("[getCollectionHistoryRead] failed:", err?.message || err);
    return { success: false, error: err?.message || String(err), data: { history: [] } };
  }
}

/**
 * Collection detail for one lab from `ar_credit_control` (+ `v_labs_credit`, payments enrichment).
 */
export async function getCollectionDetailRead(labId, options = {}) {
  const labKey = normalizeLabIdKey(labId);
  traceSupabaseRead("Collections.getCollectionDetailRead", {
    tables: ["ar_credit_control", "v_labs_credit", "payments"],
    labId: labKey,
  });
  if (!supabase || !labKey) {
    return { success: false, error: "lab_id is required", data: { collection: null } };
  }

  try {
    let arRow = options.arRow ?? null;
    if (!arRow) {
      const arSel = await supabase.from("ar_credit_control").select("*").eq("lab_id", labKey).limit(1);
      if (arSel.error) {
        console.warn("[getCollectionDetailRead] ar_credit_control:", arSel.error.message);
        return { success: false, error: arSel.error.message, data: { collection: null } };
      }
      arRow = Array.isArray(arSel.data) && arSel.data[0] ? arSel.data[0] : null;
    }

    let labsCreditRow = options.labsCreditRow ?? null;
    let paymentsForLab = options.paymentsForLab ?? null;
    if (!labsCreditRow) {
      const labsRes = await supabase.from("v_labs_credit").select("*");
      if (!labsRes.error) {
        labsCreditRow = buildLabsCreditMapByLabId(labsRes.data || []).get(labKey) ?? null;
      }
    }
    if (!paymentsForLab) {
      const payRes = await supabase.from("payments").select("*");
      if (!payRes.error) {
        paymentsForLab = buildPaymentsByNormalizedLabId(payRes.data || []).byLab.get(labKey) || [];
      } else {
        paymentsForLab = [];
      }
    }

    if (!arRow) {
      if (labsCreditRow) {
        const mapped = mapCollectionsRowFromLabsCredit(labsCreditRow);
        const collection = {
          ...mapped,
          collectionsNotes: "",
          note: "",
        };
        return { success: true, data: { collection } };
      }
      return { success: true, data: { collection: null } };
    }

    const collection = buildCollectionDetailFromSources(arRow, labsCreditRow, paymentsForLab || []);
    return { success: true, data: { collection } };
  } catch (err) {
    console.warn("[getCollectionDetailRead] failed:", err?.message || err);
    return { success: false, error: err?.message || String(err), data: { collection: null } };
  }
}

/**
 * Updates collection notes / follow-up on `ar_credit_control` (amount = 0 path).
 * Payload: { labId, note?, nextFollowUp?, nextAction? }
 */
export async function updateCollectionNotesWrite(payload = {}) {
  traceSupabaseRead("Collections.updateCollectionNotesWrite", { table: "ar_credit_control" });
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: null };
  }

  try {
    const lab_id = normalizeLabIdKey(payload.labId ?? payload.lab_id);
    if (!lab_id) {
      return { success: false, error: "lab_id is required", data: null };
    }

    const note = str(payload.note);
    const next_follow_up_date = str(payload.nextFollowUp ?? payload.next_follow_up_date).slice(0, 10);
    const next_action = str(payload.nextAction ?? payload.next_action);
    const tenant_id = str(payload.tenantId ?? payload.tenant_id) || null;

    let arSelQuery = supabase.from("ar_credit_control").select("*").eq("lab_id", lab_id);
    if (tenant_id) arSelQuery = arSelQuery.eq("tenant_id", tenant_id);
    const arSel = await arSelQuery.limit(1);
    if (arSel.error) {
      console.warn("[updateCollectionNotesWrite] ar_credit_control select:", arSel.error.message);
      return { success: false, error: arSel.error.message, data: null };
    }

    const arRow = Array.isArray(arSel.data) && arSel.data[0];
    if (!arRow) {
      return { success: false, error: `Lab not found in ar_credit_control: ${lab_id}`, data: null };
    }

    const scoped_tenant_id = tenant_id || str(arRow.tenant_id ?? arRow.tenantId);
    if (!scoped_tenant_id) {
      return { success: false, error: "tenant_id is required for AR write", data: null };
    }

    const patch = {
      updated_at: new Date().toISOString(),
    };

    if (next_follow_up_date) patch.next_follow_up_date = next_follow_up_date;
    if (next_action) patch.next_action = next_action;
    if (note) {
      patch.collections_notes = appendTimestampedCollectionNote(
        arRow.collections_notes ?? arRow.collectionsNotes,
        note
      );
      patch.last_follow_up_date = localDateYmd(new Date());
    } else if (next_follow_up_date || next_action) {
      patch.last_follow_up_date = localDateYmd(new Date());
    }

    const arUpd = await supabase
      .from("ar_credit_control")
      .update(patch)
      .eq("tenant_id", scoped_tenant_id)
      .eq("lab_id", lab_id)
      .select();

    if (arUpd.error) {
      console.warn("[updateCollectionNotesWrite] ar_credit_control update:", arUpd.error.message);
      return { success: false, error: arUpd.error.message, data: null };
    }

    const saved = Array.isArray(arUpd.data) ? arUpd.data[0] : arUpd.data;

    return {
      success: true,
      data: { ar: saved },
      error: null,
    };
  } catch (err) {
    console.warn("[updateCollectionNotesWrite] failed:", err?.message || err);
    return { success: false, error: err?.message || String(err), data: null };
  }
}

const EMPTY_ADMIN_DASHBOARD = {
  executive: {
    todaysRevenue: 0,
    outstandingReceivables: 0,
    labsAtCreditRisk: 0,
    productsNearStockout: 0,
    topLabsByRevenue: [],
  },
  summary: {
    stockStats: {
      totalSkus: 0,
      criticalItems: 0,
      reorderItems: 0,
      healthyItems: 0,
    },
    recentVisits: 0,
    totalSoldValue: 0,
    todayCollections: 0,
  },
  visits: { visits: [] },
  insights: { insights: [], recommendedActions: [] },
};


function findBestLinkedOrderForVisit(visit, ordersByLabDate) {
  const labId = normalizeLabIdKey(visit.labId);
  const date = str(visit.date).slice(0, 10);
  if (!labId || !date) return null;
  const candidates = ordersByLabDate.get(`${labId}|${date}`) || [];
  if (!candidates.length) return null;
  return candidates.reduce((best, cur) =>
    num(cur.amount) > num(best?.amount) ? cur : best
  );
}

/** Visit types that should not show a ₹ badge unless clearly sales-linked. */
function visitTypeHidesRevenueByDefault(visitType) {
  const vt = str(visitType).toLowerCase();
  return (
    vt === "follow-up" ||
    vt === "new lead" ||
    vt === "collection" ||
    vt === "support visit" ||
    vt.includes("demo")
  );
}

function visitIsSalesLinked(visit) {
  const vt = str(visit.visitType).toLowerCase();
  const lr = str(visit.labResponse).toLowerCase();
  if (num(visit.soldValue) > 0) return true;
  if (lr === "converted" || lr.includes("order confirmed")) return true;
  if (vt === "closing") return true;
  return false;
}

/**
 * Resolves display revenue for admin Recent Field Activity cards.
 * @returns {{ soldValue: number, showRevenue: boolean, valueSource: string, linkedOrderId: string|null }}
 */
export function resolveAdminVisitRevenue(visit, ordersByLabDate, rawRow = null) {
  const storedSold = num(
    rawRow?.sold_value ??
      rawRow?.soldValue ??
      rawRow?.Sold_Value ??
      visit?.soldValue ??
      0
  );

  if (storedSold > 0) {
    return {
      soldValue: storedSold,
      showRevenue: true,
      valueSource: "sold_value",
      linkedOrderId: null,
    };
  }

  const salesLinked = visitIsSalesLinked({ ...visit, soldValue: storedSold });
  const hideByType = visitTypeHidesRevenueByDefault(visit.visitType) && !salesLinked;

  if (hideByType) {
    return {
      soldValue: 0,
      showRevenue: false,
      valueSource: "hidden",
      linkedOrderId: null,
    };
  }

  if (salesLinked) {
    const linked = findBestLinkedOrderForVisit(visit, ordersByLabDate);
    if (linked) {
      return {
        soldValue: num(linked.amount),
        showRevenue: true,
        valueSource: "linked_order",
        linkedOrderId: linked.orderId || null,
      };
    }
  }

  return {
    soldValue: 0,
    showRevenue: false,
    valueSource: "none",
    linkedOrderId: null,
  };
}

function mapAdminDashboardVisit(row, labNameById, ordersByLabDate) {
  const labId = normalizeLabIdKey(row.lab_id ?? row.labId ?? row.Lab_ID);
  const visitDate = str(
    row.visit_date ?? row.visitDate ?? row.date ?? row.created_at ?? ""
  ).slice(0, 10);
  const base = {
    id: str(row.visit_id ?? row.id ?? ""),
    date: visitDate,
    agent: str(row.agent_id ?? row.agent_name ?? row.agent ?? row.Agent_Name ?? ""),
    labId,
    labName: labNameById.get(labId) || str(row.lab_name ?? row.labName ?? labId),
    area: str(row.area ?? row.Area ?? ""),
    visitType: str(row.visit_type ?? row.visitType ?? row.Visit_Type ?? ""),
    soldValue: num(row.sold_value ?? row.soldValue ?? row.Sold_Value ?? 0),
    labResponse: str(row.lab_response ?? row.labResponse ?? row.Lab_Response ?? ""),
    notes: str(row.notes ?? row.Notes ?? ""),
    nextAction: str(row.next_action ?? row.nextAction ?? row.Next_Action ?? ""),
    createdAt: str(row.created_at ?? row.createdAt ?? ""),
  };
  const revenue = resolveAdminVisitRevenue(base, ordersByLabDate, row);
  return {
    ...base,
    soldValue: revenue.soldValue,
    showRevenue: revenue.showRevenue,
    valueSource: revenue.valueSource,
    linkedOrderId: revenue.linkedOrderId,
  };
}

function buildDashboardInsightsFromMetrics(metrics) {
  const insights = [];
  const recommendedActions = [];

  if (metrics.labsAtCreditRisk > 0) {
    insights.push({
      type: "credit_risk",
      severity: "high",
      title: "Credit risk labs need attention",
      message: `${metrics.labsAtCreditRisk} lab(s) are on hold or elevated credit risk.`,
    });
    recommendedActions.push(
      "Prioritize collections follow-up for high-risk labs before extending more credit."
    );
  }

  if (metrics.productsNearStockout > 0) {
    insights.push({
      type: "stockout",
      severity: "medium",
      title: "Stock pressure detected",
      message: `${metrics.productsNearStockout} SKU(s) are critical or below minimum stock.`,
    });
    recommendedActions.push("Review reorder candidates and purchase orders for near-stockout items.");
  }

  if (metrics.outstandingReceivables > 0) {
    insights.push({
      type: "receivables",
      severity: metrics.outstandingReceivables > 50000 ? "high" : "medium",
      title: "Outstanding receivables",
      message: `₹${Number(metrics.outstandingReceivables).toLocaleString()} outstanding across AR.`,
    });
  }

  if (metrics.todaysRevenue > 0) {
    insights.push({
      type: "revenue",
      severity: "low",
      title: "Today's order revenue",
      message: `₹${Number(metrics.todaysRevenue).toLocaleString()} recorded from orders today.`,
    });
  }

  if (!recommendedActions.length) {
    recommendedActions.push("Refresh dashboard data and review labs, stock, and field visits.");
  }

  return { insights, recommendedActions };
}

/**
 * Dev/ops reconciliation: compares computed dashboard KPIs to independent passes over the same raw rows.
 * Logs DASHBOARD KPI AUDIT plus per-KPI KPI SOURCE VERIFIED or KPI MISMATCH DETECTED.
 */
function logAdminDashboardSupabaseAudit(ctx) {
  if (!shouldRunDashboardKpiAudit()) return;

  const {
    today,
    ordersRaw,
    arRaw,
    orderItemsRawLength,
    arRawLength,
    invRawLength,
    visitsRawLength,
    labsRawLength,
    payRawLength,
    lineTotalByOrderId,
    todaysRevenue,
    totalSoldValue,
    outstandingReceivables,
    labsAtCreditRisk,
    productsNearStockout,
    stockStats,
    topLabsByRevenue,
    visitsMappedTop10Length,
  } = ctx;

  let ordersCancelledCount = 0;
  let ordersFulfilledCount = 0;
  let ordersWithoutArPostedWhenFulfilled = 0;
  for (const o of ordersRaw || []) {
    const stLower = normalizedOrderRowStatus(o).toLowerCase();
    if (stLower === "cancelled") ordersCancelledCount += 1;
    if (orderCountsTowardDashboardRevenue(o)) ordersFulfilledCount += 1;
    if (stLower === "fulfilled") {
      const flagged = o.ar_posted ?? o.arPosted;
      if (flagged === false || flagged === 0 || String(flagged).toLowerCase() === "false") {
        ordersWithoutArPostedWhenFulfilled += 1;
      }
    }
  }

  console.log("DASHBOARD KPI AUDIT", {
    scope: "Supabase backend (getAdminDashboardRead)",
    asOfLocalDate: today,
    rowCounts: {
      orders: ordersRaw?.length ?? 0,
      order_items: orderItemsRawLength,
      ar_credit_control: arRawLength,
      inventory: invRawLength,
      agent_visits: visitsRawLength,
      labs: labsRawLength,
      payments: payRawLength,
    },
    orderStatusRollup: {
      cancelledRows: ordersCancelledCount,
      fulfilledRowsForRevenue: ordersFulfilledCount,
      fulfilledButArPostFlagFalse: ordersWithoutArPostedWhenFulfilled,
    },
    displayedPipelineSnapshot: {
      todaysRevenue,
      totalSoldValue,
      receivablesTotal: outstandingReceivables,
      creditRiskLabs: labsAtCreditRisk,
      nearStockout: productsNearStockout,
      visitsCountCard_equals_agent_visits_table: visitsRawLength,
      visitsPanelUsesMappedTopSlice: visitsMappedTop10Length,
      topLabsCount: topLabsByRevenue?.length ?? 0,
      inventorySnapshotBuckets: stockStats || {},
    },
  });

  let recalcTodayFulfilled = 0;
  let recalcAllFulfilled = 0;
  const recalcLabMap = new Map();
  let naiveTodayNonCancelledAnyStatus = 0;

  for (const o of ordersRaw || []) {
    if (orderOperationalExcludedFromIndices(o)) continue;
    const orderDate = str(o.order_date ?? o.orderDate ?? o.created_at ?? "").slice(0, 10);
    const amount = resolveOrderAmount(o, lineTotalByOrderId);
    if (orderDate === today) naiveTodayNonCancelledAnyStatus += amount;

    const st = normalizedOrderRowStatus(o).toLowerCase();
    if (st !== "fulfilled") continue;
    recalcAllFulfilled += amount;
    if (orderDate === today) recalcTodayFulfilled += amount;
    const labId = normalizeLabIdKey(o.lab_id ?? o.labId);
    if (labId) recalcLabMap.set(labId, (recalcLabMap.get(labId) || 0) + amount);
  }

  const eps = 0.05;
  const check = (kpi, displayed, recomputed, note) => {
    const d = num(displayed);
    const r = num(recomputed);
    const ok = Math.abs(d - r) <= eps;
    if (ok) {
      console.log("KPI SOURCE VERIFIED", { kpi, displayed: d, rawRecomputed: r, note });
    } else {
      console.warn("KPI MISMATCH DETECTED", { kpi, displayed: d, rawRecomputed: r, note });
    }
    return ok;
  };

  check("todaysRevenue", todaysRevenue, recalcTodayFulfilled, "Σ Fulfilled orders where order_date===today");

  check("totalSoldValue", totalSoldValue, recalcAllFulfilled, "Σ Fulfilled order amounts (excludes Cancelled)");

  let arSumRecalc = 0;
  let creditRiskRecalc = 0;
  for (const ar of arRaw || []) {
    arSumRecalc += num(
      ar.outstanding ?? ar.outstanding_amount ?? ar.outstandingAmount ?? ar.balance ?? 0
    );
    if (isArCreditRiskRow(ar)) creditRiskRecalc += 1;
  }
  check(
    "outstandingReceivables",
    outstandingReceivables,
    arSumRecalc,
    "Σ ar_credit_control.outstanding (collections page totals this same pool)"
  );
  check(
    "labsAtCreditRisk",
    labsAtCreditRisk,
    creditRiskRecalc,
    "Count AR rows where isArCreditRiskRow (not getLabsCredit)"
  );

  const skuSum =
    num(stockStats?.criticalItems) +
    num(stockStats?.reorderItems) +
    num(stockStats?.healthyItems);
  const tSku = num(stockStats?.totalSkus);
  if (tSku === skuSum) {
    console.log("KPI SOURCE VERIFIED", {
      kpi: "inventorySnapshot_buckets",
      displayedTotalSkus: tSku,
      recomputedBucketSum: skuSum,
      note: "critical+reorder+healthy matches totalSkus",
    });
  } else {
    console.warn("KPI MISMATCH DETECTED", {
      kpi: "inventorySnapshot_buckets",
      displayedTotalSkus: tSku,
      recomputedBucketSum: skuSum,
      note: "Rows may not fit min_stock buckets; or view vs table drift",
    });
  }

  console.log("KPI SOURCE VERIFIED", {
    kpi: "recentVisitsCountCardSemantics",
    uiValueUses: "COUNT(*) agent_visits (all-time), not today's visits only",
    note: 'Compare dashboard "Recent Visits" StatCard vs Recent Field Activity (top 10 mapped, truncated to 5 in UI)',
  });

  console.log("KPI SOURCE VERIFIED", {
    kpi: "nearStockout",
    computedAs: productsNearStockout,
    note: 'Backend uses criticalItems+reorderItems from inventory table; merged UI may MAX with reorder forecast urgency',
  });

  for (const row of topLabsByRevenue || []) {
    const id = normalizeLabIdKey(row.labId);
    check(
      `topLabsByRevenue.lab:${id}`,
      row.revenue,
      recalcLabMap.get(id) ?? 0,
      "Fulfilled-order rollup by lab vs map used for headline top labs list"
    );
  }

  if (naiveTodayNonCancelledAnyStatus > recalcTodayFulfilled + eps) {
    console.log("KPI SOURCE VERIFIED", {
      kpi: "nonFulFilledPipelineExistsToday",
      note: `Today Σ(non-cancelled, any status)=${naiveTodayNonCancelledAnyStatus.toFixed(
        2
      )} vs Fulfilled-today=${recalcTodayFulfilled.toFixed(2)} (expected gap if Placed/Processing orders exist today)`,
    });
  }

  if (ordersWithoutArPostedWhenFulfilled > 0) {
    console.warn("KPI MISMATCH DETECTED", {
      kpi: "fulfilledOrders_missing_ar_posted_flag",
      count: ordersWithoutArPostedWhenFulfilled,
      note: "May indicate AR not incremented for some fulfilled orders—compare collections AR vs order fulfill path",
    });
  } else {
    console.log("KPI SOURCE VERIFIED", {
      kpi: "fulfilled_orders_ar_posted_scan",
      note: "No Fulfilled rows with orders.ar_posted===false among scanned orders (migration-dependent column)",
    });
  }

  console.log("KPI SOURCE VERIFIED", {
    kpi: "recentFieldActivity_linkedOrders_excludeCancelled",
    note: "buildOrdersByLabDateIndex skips Cancelled orders; linked visit amounts cannot derive from cancelled rows",
  });

  console.log("DASHBOARD KPI AUDIT complete");
}

const ADMIN_DASHBOARD_READ_CACHE_TTL_MS = 60 * 1000;

function adminDashboardServerCacheEnabled() {
  return !IS_QA;
}

export function normalizeAdminDashboardPayload(data) {
  const e = data?.executive || {};
  const s = data?.summary || {};
  const stock = s.stockStats || EMPTY_ADMIN_DASHBOARD.summary.stockStats;
  return {
    executive: {
      todaysRevenue: num(e.todaysRevenue ?? e.todays_revenue),
      outstandingReceivables: num(
        e.outstandingReceivables ?? e.outstanding_receivables
      ),
      labsAtCreditRisk: num(e.labsAtCreditRisk ?? e.labs_at_credit_risk),
      productsNearStockout: num(
        e.productsNearStockout ?? e.products_near_stockout
      ),
      topLabsByRevenue: Array.isArray(e.topLabsByRevenue)
        ? e.topLabsByRevenue
        : Array.isArray(e.top_labs_by_revenue)
          ? e.top_labs_by_revenue
          : [],
    },
    summary: {
      stockStats: {
        totalSkus: num(stock.totalSkus ?? stock.total_skus ?? stock.inventory_skus),
        criticalItems: num(stock.criticalItems ?? stock.critical_items),
        reorderItems: num(stock.reorderItems ?? stock.reorder_items),
        healthyItems: num(stock.healthyItems ?? stock.healthy_items),
      },
      inventorySkus: num(
        s.inventorySkus ??
          s.inventory_skus ??
          stock.totalSkus ??
          stock.total_skus ??
          stock.inventory_skus
      ),
      recentVisits: num(s.recentVisits ?? s.recent_visits),
      totalSoldValue: num(s.totalSoldValue ?? s.total_sold_value),
      todayCollections: num(s.todayCollections ?? s.today_collections),
      ordersRowCount: num(s.ordersRowCount ?? s.orders_row_count),
    },
    visits: data?.visits ?? { visits: [] },
    insights: data?.insights ?? { insights: [], recommendedActions: [] },
  };
}

/**
 * Single normalization entry for getAdminDashboardRead results (UI + QA).
 * @param {{ success?: boolean, data?: object }|null|undefined} result
 */
export function normalizeAdminDashboardReadResult(result) {
  if (!result?.success || !result?.data) return null;

  let raw = result.data;
  if (raw?.data && (raw.summary == null || raw.executive == null)) {
    raw = raw.data;
  }
  if (raw?.payload && (raw.summary == null || raw.executive == null)) {
    raw = raw.payload;
  }
  if (!raw?.summary || !raw?.executive) return null;

  const model = normalizeAdminDashboardPayload(raw);
  if (!model.summary.inventorySkus && model.summary.stockStats?.totalSkus) {
    model.summary.inventorySkus = model.summary.stockStats.totalSkus;
  }
  return model;
}

function mapOrderLineToItemShape(row) {
  return {
    order_id: row.order_id ?? row.orderId,
    total_price: row.net_line_total ?? row.netLineTotal ?? row.total_price,
    quantity: row.quantity,
    unit_price: row.unit_selling_price ?? row.unitSellingPrice ?? row.unit_price,
  };
}

function combineOrderLineItemsForMetrics(orderItemsRaw, orderLinesRaw) {
  const combined = [...(orderItemsRaw || [])];
  for (const line of orderLinesRaw || []) {
    combined.push(mapOrderLineToItemShape(line));
  }
  return combined;
}

function logAdminDashboardKpiDebug(rowCounts, kpis, queryErrors) {
  if (!isPerfLogEnabled()) return;
  console.log("[AdminDashboard KPI debug]", { rowCounts, kpis, queryErrors });
}

function recordAdminDashboardApiExecutionTrace({
  durationMs,
  payload,
  rowCounts,
  orderIds,
  cacheHit = false,
}) {
  recordPredatorApiExecution({
    module: "Admin Dashboard",
    apiName: "getAdminDashboardRead",
    durationMs,
    rowsReturned:
      num(rowCounts?.orders) + num(rowCounts?.ar) + num(rowCounts?.visits),
    payloadBytes: estimatePayloadBytes(payload),
    detail: {
      orders: num(rowCounts?.orders),
      ar: num(rowCounts?.ar),
      visits: num(rowCounts?.visits),
      inventory: num(rowCounts?.inventory),
      orderIds: orderIds || [],
      cacheHit,
    },
  });
}

let adminDashboardReadCache = {
  result: null,
  loadedAt: 0,
  rowCounts: null,
  orderIds: [],
};

/** @type {Promise<{ success: boolean, data?: object }>|null} */
let adminDashboardReadInFlight = null;

export function invalidateAdminDashboardReadCache() {
  adminDashboardReadCache = { result: null, loadedAt: 0, rowCounts: null, orderIds: [] };
  adminDashboardReadInFlight = null;
  perfLog("getAdminDashboardRead.cacheCleared");
  recordPredatorCacheEvent({ cacheKey: "adminDashboardRead", event: "invalidate" });
}

async function timedSupabaseQuery(label, queryFnOrPromise) {
  const end = perfTime(`supabase.${label}`);
  const t0 = performance.now();
  const promise =
    typeof queryFnOrPromise === "function" ? queryFnOrPromise() : queryFnOrPromise;
  const res = await promise;
  const rows = res?.error ? 0 : res?.count ?? res?.data?.length ?? 0;
  const durationMs = Math.round(performance.now() - t0);
  end({ rows, error: res?.error?.message || null });
  recordPredatorTiming({
    module: "Supabase",
    step: `read.${label}`,
    durationMs,
    detail: { rows, hasError: Boolean(res?.error) },
  });
  return res;
}

/**
 * Admin dashboard aggregates from Supabase (full select * — correctness over performance).
 * Never throws.
 * @param {{ force?: boolean }} [options]
 */
export async function getAdminDashboardRead(options = {}) {
  const force = options.force === true;
  if (!force && adminDashboardReadInFlight) {
    return adminDashboardReadInFlight;
  }

  const run = predatorTrace("Admin Dashboard", "api.getAdminDashboardRead", async () => {
  const dashboardReadT0 = performance.now();
  traceSupabaseRead("AdminDashboard.getAdminDashboardRead", {
    tables: [
      "orders",
      "ar_credit_control",
      "agent_visits",
      "inventory",
      "labs",
      "order_lines",
      "payments",
    ],
  });
  if (!supabase) {
    recordPredatorTiming({
      module: "Admin Dashboard",
      step: "api.getAdminDashboardRead",
      durationMs: Math.round(performance.now() - dashboardReadT0),
      detail: { skipped: "no_client" },
    });
    return { success: true, data: { ...EMPTY_ADMIN_DASHBOARD } };
  }

  if (!adminDashboardServerCacheEnabled()) {
    adminDashboardReadCache = { result: null, loadedAt: 0, rowCounts: null, orderIds: [] };
  }

  if (
    adminDashboardServerCacheEnabled() &&
    !force &&
    adminDashboardReadCache.result &&
    Date.now() - adminDashboardReadCache.loadedAt < ADMIN_DASHBOARD_READ_CACHE_TTL_MS
  ) {
    perfLog("getAdminDashboardRead.cacheHit", {
      ageMs: Date.now() - adminDashboardReadCache.loadedAt,
    });
    const ageMs = Date.now() - adminDashboardReadCache.loadedAt;
    const cachedData = adminDashboardReadCache.result?.data;
    const cachedRowCounts = adminDashboardReadCache.rowCounts || {
      orders: cachedData?.summary?.ordersRowCount ?? 0,
      ar: 0,
      visits: cachedData?.summary?.recentVisits ?? 0,
      inventory: cachedData?.summary?.stockStats?.totalSkus ?? 0,
    };
    const cachedOrderIds = adminDashboardReadCache.orderIds || [];
    recordPredatorCacheEvent({
      cacheKey: "adminDashboardRead",
      event: "hit",
      ageMs,
      hydrationPhase: "hydrate",
      summary: {
        outstandingReceivables: cachedData?.executive?.outstandingReceivables ?? 0,
        recentVisits: cachedData?.summary?.recentVisits ?? 0,
        totalSkus:
          cachedData?.summary?.stockStats?.totalSkus ?? cachedData?.summary?.inventorySkus ?? 0,
        totalSoldValue: cachedData?.summary?.totalSoldValue ?? 0,
        ordersRowCount: cachedRowCounts.orders ?? 0,
      },
    });
    recordAdminDashboardApiUiSnapshots(cachedData, "getAdminDashboardRead.cacheHit");
    const cacheDurationMs = Math.round(performance.now() - dashboardReadT0);
    recordPredatorTiming({
      module: "Admin Dashboard",
      step: "api.getAdminDashboardRead",
      durationMs: cacheDurationMs,
      detail: { cacheHit: true, orders: cachedRowCounts.orders ?? 0 },
    });
    recordAdminDashboardApiExecutionTrace({
      durationMs: cacheDurationMs,
      payload: cachedData,
      rowCounts: cachedRowCounts,
      orderIds: cachedOrderIds,
      cacheHit: true,
    });
    return adminDashboardReadCache.result;
  }

  recordPredatorCacheEvent({ cacheKey: "adminDashboardRead", event: "miss", ageMs: 0 });

  const endTotal = perfTime("getAdminDashboardRead.total");

  try {
    const today = localDateYmd();
    const endQuery = perfTime("getAdminDashboardRead.supabaseQueries");

    const queryErrors = [];

    const [ordersRes, arRes, visitsRes, invRes, labsRes, orderLinesRes, payRes] =
      await Promise.all([
        timedSupabaseQuery("orders", () => supabase.from("orders").select("*")),
        timedSupabaseQuery("ar_credit_control", () =>
          supabase.from("ar_credit_control").select("*")
        ),
        timedSupabaseQuery("agent_visits", () => supabase.from("agent_visits").select("*")),
        timedSupabaseQuery("inventory", () => supabase.from("inventory").select("*")),
        timedSupabaseQuery("labs", () => supabase.from("labs").select("*")),
        timedSupabaseQuery("order_lines", () => supabase.from("order_lines").select("*")),
        timedSupabaseQuery("payments", () => supabase.from("payments").select("*")),
      ]);

    const ordersRaw = ordersRes.error ? [] : ordersRes.data || [];
    const orderIds = collectOrderRowIds(ordersRaw);
    const arRaw = arRes.error ? [] : arRes.data || [];
    const visitsAllRaw = visitsRes.error ? [] : visitsRes.data || [];
    const invRaw = invRes.error ? [] : invRes.data || [];
    const labsRaw = labsRes.error ? [] : labsRes.data || [];
    const orderLinesRaw = orderLinesRes.error ? [] : orderLinesRes.data || [];
    const payRaw = payRes.error ? [] : payRes.data || [];

    const orderItemsRaw = combineOrderLineItemsForMetrics([], orderLinesRaw);
    const visitsTotalCount = visitsAllRaw.length;
    const visitsRaw = [...visitsAllRaw]
      .sort((a, b) => {
        const tb = new Date(b.created_at || 0).getTime();
        const ta = new Date(a.created_at || 0).getTime();
        return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
      })
      .slice(0, 40);

    if (ordersRes.error) {
      queryErrors.push("orders");
      console.warn("[getAdminDashboardRead] orders:", ordersRes.error.message);
    }
    if (arRes.error) {
      queryErrors.push("ar_credit_control");
      console.warn("[getAdminDashboardRead] ar_credit_control:", arRes.error.message);
    }
    if (visitsRes.error) {
      queryErrors.push("agent_visits");
      console.warn("[getAdminDashboardRead] agent_visits:", visitsRes.error.message);
    }
    if (invRes.error) {
      queryErrors.push("inventory");
      console.warn("[getAdminDashboardRead] inventory:", invRes.error.message);
    }
    if (labsRes.error) {
      queryErrors.push("labs");
      console.warn("[getAdminDashboardRead] labs:", labsRes.error.message);
    }
    if (orderLinesRes.error) {
      queryErrors.push("order_lines");
      console.warn("[getAdminDashboardRead] order_lines:", orderLinesRes.error.message);
    }
    if (payRes.error) {
      queryErrors.push("payments");
      console.warn("[getAdminDashboardRead] payments:", payRes.error.message);
    }

    endQuery({
      orders: ordersRaw.length,
      order_lines: orderLinesRaw.length,
      ar: arRaw.length,
      inventory: invRaw.length,
      agent_visits: visitsTotalCount,
      payments: payRaw.length,
      labs: labsRaw.length,
    });

    const labNameById = new Map();
    for (const l of labsRaw) {
      const id = normalizeLabIdKey(l.lab_id ?? l.labId ?? l.id);
      const name = str(l.lab_name ?? l.labName ?? l.name);
      if (id && name) labNameById.set(id, name);
    }
    for (const ar of arRaw) {
      const id = normalizeLabIdKey(ar.lab_id ?? ar.labId);
      const name = str(ar.lab_name ?? ar.labName);
      if (id && name && !labNameById.has(id)) labNameById.set(id, name);
    }

    const revenue = computeRevenueMetrics({
      ordersRaw,
      orderItemsRaw,
      todayYmd: today,
      labNameById,
    });
    const lineTotalByOrderId = revenue.lineTotalByOrderId;

    const ordersByLabDate = buildOrdersByLabDateIndex(ordersRaw, lineTotalByOrderId);

    const { outstandingReceivables, labsAtCreditRisk } = computeReceivableMetrics(arRaw);

    const stockStats = rollupInventoryTableRows(invRaw);
    const productsNearStockout = productsNearStockoutFromInventoryStats(stockStats);

    const todayCollections = sumTodayPayments(payRaw);

    const visits = (visitsRaw || [])
      .map((row) => mapAdminDashboardVisit(row, labNameById, ordersByLabDate))
      .filter((v) => v.id || v.labName || v.labId)
      .sort((a, b) => {
        const createdB = new Date(b.createdAt || 0).getTime();
        const createdA = new Date(a.createdAt || 0).getTime();
        const cb = Number.isFinite(createdB) ? createdB : 0;
        const ca = Number.isFinite(createdA) ? createdA : 0;
        if (cb !== ca) return cb - ca;
        const dateB = new Date(`${b.date || ""}T12:00:00`).getTime();
        const dateA = new Date(`${a.date || ""}T12:00:00`).getTime();
        return (Number.isFinite(dateB) ? dateB : 0) - (Number.isFinite(dateA) ? dateA : 0);
      })
      .slice(0, 10);

    const executive = {
      todaysRevenue: revenue.todaysRevenue,
      outstandingReceivables,
      labsAtCreditRisk,
      productsNearStockout,
      topLabsByRevenue: revenue.topLabsByRevenue,
    };

    const summary = {
      stockStats,
      recentVisits: visitsTotalCount,
      totalSoldValue: revenue.totalSoldValue,
      todayCollections,
      ordersRowCount: ordersRaw.length,
    };

    const rowCounts = {
      orders: ordersRaw.length,
      ar: arRaw.length,
      visits: visitsTotalCount,
      inventory: invRaw.length,
    };

    const dashboardInsights = buildDashboardInsightsFromMetrics({
      ...executive,
      outstandingReceivables,
    });

    const payload = normalizeAdminDashboardPayload({
      executive,
      summary,
      visits: { visits },
      insights: dashboardInsights,
    });

    logAdminDashboardKpiDebug(
      {
        orders: ordersRaw.length,
        ar_credit_control: arRaw.length,
        agent_visits: visitsTotalCount,
        inventory: invRaw.length,
        labs: labsRaw.length,
        order_lines: orderLinesRaw.length,
        payments: payRaw.length,
      },
      {
        todaysRevenue: payload.executive.todaysRevenue,
        outstandingReceivables: payload.executive.outstandingReceivables,
        labsAtCreditRisk: payload.executive.labsAtCreditRisk,
        productsNearStockout: payload.executive.productsNearStockout,
        recentVisits: payload.summary.recentVisits,
        totalSoldValue: payload.summary.totalSoldValue,
        todayCollections: payload.summary.todayCollections,
        inventoryTotalSkus: payload.summary.stockStats.totalSkus,
        topLabsByRevenue: payload.executive.topLabsByRevenue,
      },
      queryErrors
    );

    logAdminDashboardSupabaseAudit({
      today,
      ordersRaw,
      arRaw,
      orderItemsRawLength: orderItemsRaw.length,
      arRawLength: arRaw.length,
      invRawLength: invRaw.length,
      visitsRawLength: visitsTotalCount,
      labsRawLength: labsRaw.length,
      payRawLength: payRaw.length,
      lineTotalByOrderId,
      todaysRevenue: revenue.todaysRevenue,
      totalSoldValue: revenue.totalSoldValue,
      outstandingReceivables,
      labsAtCreditRisk,
      productsNearStockout,
      stockStats,
      topLabsByRevenue: revenue.topLabsByRevenue,
      visitsMappedTop10Length: visits.length,
    });

    const result = { success: true, data: payload };
    const mayCache =
      adminDashboardServerCacheEnabled() &&
      !queryErrors.length &&
      (ordersRaw.length > 0 || arRaw.length > 0 || visitsTotalCount > 0);
    if (mayCache) {
      adminDashboardReadCache = {
        result,
        loadedAt: Date.now(),
        rowCounts,
        orderIds,
      };
      endTotal({ cached: true });
    } else {
      perfLog("getAdminDashboardRead.skipCache", {
        queryErrors,
        orders: ordersRaw.length,
        ar: arRaw.length,
        visitsTotalCount,
        isQa: IS_QA,
      });
      endTotal({ cached: false, queryErrors });
    }
    const apiDurationMs = Math.round(performance.now() - dashboardReadT0);
    recordPredatorTiming({
      module: "Admin Dashboard",
      step: "api.getAdminDashboardRead",
      durationMs: apiDurationMs,
      detail: { queryErrors, orders: ordersRaw.length, orderIds },
    });
    recordAdminDashboardApiExecutionTrace({
      durationMs: apiDurationMs,
      payload,
      rowCounts,
      orderIds,
      cacheHit: false,
    });
    recordAdminDashboardApiUiSnapshots(payload, "getAdminDashboardRead.fresh");
    return result;
  } catch (err) {
    console.warn("[getAdminDashboardRead] failed:", err?.message || err);
    endTotal({ error: err?.message || String(err) });
    recordPredatorTiming({
      module: "Admin Dashboard",
      step: "api.getAdminDashboardRead",
      durationMs: Math.round(performance.now() - dashboardReadT0),
      detail: { error: err?.message },
    });
    return { success: true, data: { ...EMPTY_ADMIN_DASHBOARD } };
  }
  });

  if (!force) {
    adminDashboardReadInFlight = run.finally(() => {
      if (adminDashboardReadInFlight === run) {
        adminDashboardReadInFlight = null;
      }
    });
  }

  return run;
}

const EMPTY_AGENT_WORKSPACE = {
  summary: {
    todayVisits: 0,
    pendingCollections: 0,
    totalOutstanding: 0,
    activeLabs: 0,
    openTasks: 0,
    highPriorityTasks: 0,
  },
  tasks: [],
  assignedLabs: [],
  recentVisits: [],
  pendingCollections: [],
};

function mapVisitRowForAgentDashboard(row) {
  const visitDate = str(
    row.visit_date ?? row.visitDate ?? row.date ?? row.Visit_Date ?? ""
  ).slice(0, 10);
  const created = str(row.created_at ?? row.createdAt ?? "");
  const agentId = str(row.agent_id ?? row.agentId ?? "");
  const agent = str(row.agent_name ?? row.Agent_Name ?? row.agent ?? row.agentName ?? "");
  const notes = str(row.notes ?? "");
  let labResponse = str(row.lab_response ?? row.Lab_Response ?? row.labResponse ?? "");
  if (!labResponse && notes.includes("Response:")) {
    const m = notes.match(/Response:\s*([^·\n]+)/);
    if (m) labResponse = str(m[1]);
  }

  return {
    visitId: str(row.visit_id ?? row.id ?? row.Visit_ID ?? ""),
    visitDate: visitDate || created.slice(0, 10),
    labName: str(row.lab_name ?? row.Lab_Name ?? row.labName ?? ""),
    area: str(row.area ?? row.Area ?? ""),
    visitType: str(row.visit_type ?? row.Visit_Type ?? row.visitType ?? ""),
    labResponse,
    soldValue: num(row.sold_value ?? row.soldValue ?? row.Sold_Value ?? 0),
    nextFollowUpDate: str(
      row.next_follow_up_date ?? row.nextFollowUpDate ?? row.Next_Follow_Up_Date ?? ""
    ).slice(0, 10),
    nextFollowUpType: str(row.next_follow_up_type ?? row.nextFollowUpType ?? ""),
    nextAction: str(row.next_action ?? row.nextAction ?? ""),
    notes,
    agentId,
    agent,
    agentName: agent,
    labId: labIdKey(row.lab_id ?? row.Lab_ID ?? row.labId ?? ""),
  };
}

/**
 * Agent Visit page context: assigned labs, recent visits, collections (Supabase + RLS).
 */
export async function getAgentVisitPageContextRead(currentUser) {
  traceSupabaseRead("AgentVisit.getAgentVisitPageContextRead", {
    tables: ["v_labs_credit", "agent_visits", "ar_credit_control", "payments"],
  });

  const workspaceRes = await getAgentWorkspaceRead(currentUser);
  if (!workspaceRes?.success) {
    return {
      success: false,
      error: workspaceRes?.error || "Failed to load agent visit context",
      data: { labs: [], recentVisits: [], collections: [] },
    };
  }

  const workspace = workspaceRes.data || EMPTY_AGENT_WORKSPACE;
  const collectionsRes = await getCollectionsRead();
  const allCollections = Array.isArray(collectionsRes?.data?.collections)
    ? collectionsRes.data.collections
    : [];
  const collections = filterCollectionsForUser(allCollections, currentUser);

  return {
    success: true,
    data: {
      labs: Array.isArray(workspace.assignedLabs) ? workspace.assignedLabs : [],
      recentVisits: Array.isArray(workspace.recentVisits) ? workspace.recentVisits : [],
      collections,
    },
  };
}

/**
 * Read one qualification profile for a lab.
 * Input can be:
 * - getLabQualificationRead({ tenantId, labId })
 * - getLabQualificationRead({ labId })  // RLS-scoped
 * - getLabQualificationRead("LAB_001")
 */
export async function getLabQualificationRead(input = {}) {
  const raw =
    typeof input === "string"
      ? { labId: input }
      : (input || {});
  const tenantId = str(raw.tenantId ?? raw.tenant_id) || "";
  const labId = labIdKey(raw.labId ?? raw.lab_id);

  traceSupabaseRead("Qualification.getLabQualificationRead", {
    table: "lab_qualifications",
    labId,
  });

  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: null };
  }
  if (!labId) {
    return { success: false, error: "lab_id is required", data: null };
  }

  try {
    let q = supabase
      .from("lab_qualifications")
      .select("*")
      .eq("lab_id", labId)
      .limit(1);

    if (tenantId) {
      q = q.eq("tenant_id", tenantId);
    }

    const { data, error } = await q.maybeSingle();
    if (error) {
      return { success: false, error: error.message || "Read failed", data: null };
    }
    return { success: true, data: data || null, error: null };
  } catch (err) {
    return { success: false, error: err?.message || String(err), data: null };
  }
}

async function readLabQualificationRow(tenant_id, lab_id) {
  const { data, error } = await supabase
    .from("lab_qualifications")
    .select("*")
    .eq("tenant_id", tenant_id)
    .eq("lab_id", lab_id)
    .maybeSingle();
  if (error) throw new Error(error.message || "Failed to read qualification");
  return data || null;
}

function mergePipelineForQualificationUpsert(row, existing, payload) {
  const writerRole = str(payload.writerRole ?? payload.writer_role).toLowerCase();
  const isAgent = writerRole === "agent";
  const updatedBy =
    str(payload.updatedBy ?? payload.updated_by ?? payload.userId ?? payload.user_id) ||
    null;

  const explicitStage = normalizeQualificationPipelineStage(
    payload.pipelineStage ?? payload.pipeline_stage
  );
  const nextAction = str(
    payload.pipelineNextAction ?? payload.pipeline_next_action
  );

  if (existing) {
    row.pipeline_stage = existing.pipeline_stage || deriveDefaultPipelineStage(row);
    row.pipeline_stage_updated_at = existing.pipeline_stage_updated_at;
    row.pipeline_stage_updated_by = existing.pipeline_stage_updated_by;
    row.pipeline_lost_reason = existing.pipeline_lost_reason;
    row.pipeline_expected_value = existing.pipeline_expected_value;
    row.pipeline_probability = existing.pipeline_probability;
    row.pipeline_notes = existing.pipeline_notes;
    row.pipeline_next_action = existing.pipeline_next_action;

    if (nextAction) {
      row.pipeline_next_action = nextAction;
    }

    if (explicitStage) {
      if (!isAgent || isAgentAllowedPipelineStage(explicitStage)) {
        if (row.pipeline_stage !== explicitStage) {
          row.pipeline_stage = explicitStage;
          row.pipeline_stage_updated_at = new Date().toISOString();
          row.pipeline_stage_updated_by = updatedBy;
        }
      }
    }
    return;
  }

  const stage =
    explicitStage && (!isAgent || isAgentAllowedPipelineStage(explicitStage))
      ? explicitStage
      : deriveDefaultPipelineStage(row);

  row.pipeline_stage = stage;
  row.pipeline_stage_updated_at = new Date().toISOString();
  row.pipeline_stage_updated_by = updatedBy;
  row.pipeline_next_action = nextAction || null;
  row.pipeline_lost_reason = null;
  row.pipeline_expected_value = null;
  row.pipeline_probability = null;
  row.pipeline_notes = null;
}

/**
 * Upsert one qualification profile for a lab (tenant+lab unique key).
 * Uses current profile agent_id / agent_name metadata when available.
 * Preserves pipeline fields on update unless explicitly provided (pass writerRole: "agent").
 */
export async function upsertLabQualificationWrite(payload = {}) {
  traceSupabaseRead("Qualification.upsertLabQualificationWrite", {
    table: "lab_qualifications",
  });

  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: null };
  }

  try {
    const tenant_id = str(payload.tenantId ?? payload.tenant_id) || "";
    const lab_id = labIdKey(payload.labId ?? payload.lab_id);
    if (!tenant_id || !lab_id) {
      return { success: false, error: "tenant_id and lab_id are required", data: null };
    }

    const existing = await readLabQualificationRow(tenant_id, lab_id);

    const monthly = payload.monthlyConsumablesEstimate ?? payload.monthly_consumables_estimate;
    const monthly_consumables_estimate =
      monthly === "" || monthly == null ? null : num(monthly);

    const row = {
      tenant_id,
      lab_id,
      lab_size: str(payload.labSize ?? payload.lab_size) || null,
      monthly_consumables_estimate,
      current_supplier: str(payload.currentSupplier ?? payload.current_supplier) || null,
      payment_terms: str(payload.paymentTerms ?? payload.payment_terms) || null,
      decision_maker: str(payload.decisionMaker ?? payload.decision_maker) || null,
      reagent_rental_potential:
        str(payload.reagentRentalPotential ?? payload.reagent_rental_potential) || null,
      lab_os_fit: str(payload.labOsFit ?? payload.lab_os_fit) || null,
      next_follow_up_date: str(payload.nextFollowUpDate ?? payload.next_follow_up_date).slice(0, 10) || null,
      founder_review_status:
        str(payload.founderReviewStatus ?? payload.founder_review_status) || "pending",
      notes: str(payload.notes) || null,
      agent_id: str(payload.agentId ?? payload.agent_id) || null,
      agent_name: str(payload.agentName ?? payload.agent_name) || null,
      updated_by: str(payload.updatedBy ?? payload.updated_by ?? payload.userId ?? payload.user_id) || null,
    };

    const scoring = computeQualificationScore(row);
    row.qualification_score = scoring.qualification_score;
    row.qualification_band = scoring.qualification_band;

    mergePipelineForQualificationUpsert(row, existing, payload);

    const { data, error } = await supabase
      .from("lab_qualifications")
      .upsert([row], { onConflict: "tenant_id,lab_id" })
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message || "Upsert failed", data: null };
    }

    fireNotificationEvent(
      {
        eventType: "qualification_updated",
        sourceModule: "qualification",
        sourceId: lab_id,
        tenantId: tenant_id,
        targetLabId: lab_id,
        targetRole: "admin",
        severity: "info",
        payload: {
          labId: lab_id,
          qualificationBand: row.qualification_band,
          qualificationScore: row.qualification_score,
          founderReviewStatus: row.founder_review_status,
        },
      },
      "upsertLabQualificationWrite"
    );

    return { success: true, data: data || null, error: null };
  } catch (err) {
    return { success: false, error: err?.message || String(err), data: null };
  }
}

const FOUNDER_REVIEW_STATUSES = new Set([
  "pending",
  "approved",
  "rejected",
  "needs_info",
]);

function mapQualificationReviewRow(row, labMeta = null) {
  const labId = labIdKey(row?.lab_id ?? row?.labId);
  const labName = str(
    labMeta?.lab_name ?? labMeta?.labName ?? row?.lab_name ?? row?.labName
  );
  return {
    id: row?.id || "",
    tenantId: row?.tenant_id || row?.tenantId || "",
    labId,
    labName: labName || labId,
    labSize: str(row?.lab_size),
    monthlyConsumablesEstimate:
      row?.monthly_consumables_estimate == null
        ? null
        : num(row.monthly_consumables_estimate),
    currentSupplier: str(row?.current_supplier),
    paymentTerms: str(row?.payment_terms),
    decisionMaker: str(row?.decision_maker),
    reagentRentalPotential: str(row?.reagent_rental_potential),
    labOsFit: str(row?.lab_os_fit),
    founderReviewStatus: str(row?.founder_review_status || "pending").toLowerCase(),
    nextFollowUpDate: str(row?.next_follow_up_date).slice(0, 10) || "",
    agentId: str(row?.agent_id),
    agentName: str(row?.agent_name),
    updatedBy: str(row?.updated_by),
    updatedAt: row?.updated_at || "",
    notes: str(row?.notes),
    qualificationScore:
      row?.qualification_score == null ? null : num(row.qualification_score),
    qualificationBand: str(row?.qualification_band).toLowerCase(),
    qualificationReasons: computeQualificationScore(row).qualification_reasons,
    ...mapPipelineFieldsFromRow(row),
  };
}

/**
 * Admin/executive review list: lab_qualifications enriched with lab names from v_labs_credit.
 * RLS scopes rows; no service role or Apps Script.
 */
export async function getQualificationReviewRead() {
  return predatorTrace("Qualification Review", "api.getQualificationReviewRead", async () => {
  traceSupabaseRead("Qualification.getQualificationReviewRead", {
    tables: ["lab_qualifications", "v_labs_credit"],
  });

  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: [] };
  }

  try {
    const { data: qualRows, error: qualErr } = await supabase
      .from("lab_qualifications")
      .select("*")
      .order("updated_at", { ascending: false });

    if (qualErr) {
      return {
        success: false,
        error: qualErr.message || "Failed to load qualifications",
        data: [],
      };
    }

    const { data: labsRaw, error: labsErr } = await supabase
      .from("v_labs_credit")
      .select("lab_id, lab_name, area");

    if (labsErr) {
      console.warn("[getQualificationReviewRead] v_labs_credit:", labsErr.message);
    }

    const labById = new Map();
    for (const lab of labsRaw || []) {
      const key = labIdKey(lab.lab_id ?? lab.labId);
      if (key) labById.set(key, lab);
    }

    const rows = (qualRows || []).map((row) =>
      mapQualificationReviewRow(row, labById.get(labIdKey(row.lab_id)) || null)
    );

    return { success: true, data: rows, error: null };
  } catch (err) {
    return { success: false, error: err?.message || String(err), data: [] };
  }
  });
}

/**
 * Founder/admin review status update (ADMIN/EXECUTIVE via RLS can_write_ops_for_tenant).
 */
export async function updateQualificationFounderReviewWrite(payload = {}) {
  traceSupabaseRead("Qualification.updateQualificationFounderReviewWrite", {
    table: "lab_qualifications",
  });

  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: null };
  }

  try {
    const tenant_id = str(payload.tenantId ?? payload.tenant_id);
    const lab_id = labIdKey(payload.labId ?? payload.lab_id);
    const status = str(
      payload.founderReviewStatus ?? payload.founder_review_status
    ).toLowerCase();

    if (!tenant_id || !lab_id) {
      return { success: false, error: "tenant_id and lab_id are required", data: null };
    }
    if (!FOUNDER_REVIEW_STATUSES.has(status)) {
      return {
        success: false,
        error: "founder_review_status must be pending, approved, rejected, or needs_info",
        data: null,
      };
    }

    const existing = await readLabQualificationRow(tenant_id, lab_id);
    if (!existing) {
      return { success: false, error: "Qualification record not found", data: null };
    }

    const merged = { ...existing, founder_review_status: status };
    const scoring = computeQualificationScore(merged);

    const patch = {
      founder_review_status: status,
      qualification_score: scoring.qualification_score,
      qualification_band: scoring.qualification_band,
      updated_by:
        str(payload.updatedBy ?? payload.updated_by ?? payload.userId ?? payload.user_id) ||
        null,
    };

    const { data, error } = await supabase
      .from("lab_qualifications")
      .update(patch)
      .eq("tenant_id", tenant_id)
      .eq("lab_id", lab_id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message || "Update failed", data: null };
    }

    return {
      success: true,
      data: mapQualificationReviewRow(data),
      error: null,
    };
  } catch (err) {
    return { success: false, error: err?.message || String(err), data: null };
  }
}

/**
 * Update pipeline funnel fields. Admin/executive: full pipeline edit.
 * Agent: only pipeline_next_action, next_follow_up_date (via notes merge), notes — not won/lost.
 */
export async function updateQualificationPipelineWrite(payload = {}) {
  traceSupabaseRead("Qualification.updateQualificationPipelineWrite", {
    table: "lab_qualifications",
  });

  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: null };
  }

  try {
    const tenant_id = str(payload.tenantId ?? payload.tenant_id);
    const lab_id = labIdKey(payload.labId ?? payload.lab_id);
    const writerRole = str(payload.writerRole ?? payload.writer_role).toLowerCase();
    const isAgent = writerRole === "agent";
    const updatedBy =
      str(payload.updatedBy ?? payload.updated_by ?? payload.userId ?? payload.user_id) ||
      null;

    if (!tenant_id || !lab_id) {
      return { success: false, error: "tenant_id and lab_id are required", data: null };
    }

    const existing = await readLabQualificationRow(tenant_id, lab_id);
    if (!existing) {
      return { success: false, error: "Qualification record not found", data: null };
    }

    const patch = {};

    if (isAgent) {
      const nextAction = str(
        payload.pipelineNextAction ?? payload.pipeline_next_action
      );
      if (nextAction) patch.pipeline_next_action = nextAction;

      const followUp = str(payload.nextFollowUpDate ?? payload.next_follow_up_date).slice(
        0,
        10
      );
      if (followUp) patch.next_follow_up_date = followUp;

      const notes = str(payload.notes);
      if (notes) patch.notes = notes;

      if (Object.keys(patch).length === 0) {
        return { success: false, error: "No agent pipeline fields to update", data: null };
      }
      patch.updated_by = updatedBy;
    } else {
      const stage = normalizeQualificationPipelineStage(
        payload.pipelineStage ?? payload.pipeline_stage
      );
      if (!stage) {
        return { success: false, error: "pipeline_stage is required", data: null };
      }

      if (stage !== existing.pipeline_stage) {
        patch.pipeline_stage = stage;
        patch.pipeline_stage_updated_at = new Date().toISOString();
        patch.pipeline_stage_updated_by = updatedBy;
      }

      if (payload.pipelineNextAction !== undefined || payload.pipeline_next_action !== undefined) {
        patch.pipeline_next_action =
          str(payload.pipelineNextAction ?? payload.pipeline_next_action) || null;
      }
      if (payload.pipelineLostReason !== undefined || payload.pipeline_lost_reason !== undefined) {
        patch.pipeline_lost_reason =
          str(payload.pipelineLostReason ?? payload.pipeline_lost_reason) || null;
      }
      if (
        payload.pipelineExpectedValue !== undefined ||
        payload.pipeline_expected_value !== undefined
      ) {
        const ev = payload.pipelineExpectedValue ?? payload.pipeline_expected_value;
        patch.pipeline_expected_value = ev === "" || ev == null ? null : num(ev);
      }
      if (
        payload.pipelineProbability !== undefined ||
        payload.pipeline_probability !== undefined
      ) {
        const prob = payload.pipelineProbability ?? payload.pipeline_probability;
        if (prob === "" || prob == null) {
          patch.pipeline_probability = null;
        } else {
          const p = num(prob);
          if (p < 0 || p > 100) {
            return {
              success: false,
              error: "pipeline_probability must be between 0 and 100",
              data: null,
            };
          }
          patch.pipeline_probability = p;
        }
      }
      if (payload.pipelineNotes !== undefined || payload.pipeline_notes !== undefined) {
        patch.pipeline_notes =
          str(payload.pipelineNotes ?? payload.pipeline_notes) || null;
      }
      if (payload.nextFollowUpDate !== undefined || payload.next_follow_up_date !== undefined) {
        patch.next_follow_up_date =
          str(payload.nextFollowUpDate ?? payload.next_follow_up_date).slice(0, 10) || null;
      }
      patch.updated_by = updatedBy;
    }

    const { data, error } = await supabase
      .from("lab_qualifications")
      .update(patch)
      .eq("tenant_id", tenant_id)
      .eq("lab_id", lab_id)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message || "Pipeline update failed", data: null };
    }

    const merged = { ...data };
    const scoring = computeQualificationScore(merged);
    if (
      scoring.qualification_score !== num(data.qualification_score) ||
      scoring.qualification_band !== str(data.qualification_band).toLowerCase()
    ) {
      await supabase
        .from("lab_qualifications")
        .update({
          qualification_score: scoring.qualification_score,
          qualification_band: scoring.qualification_band,
        })
        .eq("tenant_id", tenant_id)
        .eq("lab_id", lab_id);
      merged.qualification_score = scoring.qualification_score;
      merged.qualification_band = scoring.qualification_band;
    }

    return {
      success: true,
      data: mapQualificationReviewRow(merged),
      error: null,
    };
  } catch (err) {
    return { success: false, error: err?.message || String(err), data: null };
  }
}

/**
 * Read-only agent workspace: labs/credit (`v_labs_credit`), collections (`getCollectionsRead`),
 * visits (`agent_visits`). Task queue is always `[]` here (no Supabase task query).
 * Shapes match AgentDashboard expectations. Never throws.
 */
export async function getAgentWorkspaceRead(currentUser) {
  traceSupabaseRead("AgentDashboard.getAgentWorkspaceRead", {
    tables: ["v_labs_credit", "agent_visits", "ar_credit_control"],
  });
  if (!supabase) {
    return { success: true, data: { ...EMPTY_AGENT_WORKSPACE } };
  }

  try {
    const collectionsRes = await getCollectionsRead();
    const allCollections = Array.isArray(collectionsRes?.data?.collections)
      ? collectionsRes.data.collections
      : [];
    const pendingCollections = filterCollectionsForUser(allCollections, currentUser);

    const { data: labsRaw, error: labsErr } = await supabase.from("v_labs_credit").select("*");
    if (labsErr) {
      console.warn("[getAgentWorkspaceRead] v_labs_credit:", labsErr.message);
    }
    const allLabs = (labsRaw || [])
      .map(mapLabsCreditRow)
      .filter((l) => l.labId || l.labName);
    const assignedLabs = filterLabsForUser(allLabs, currentUser);

    let visitRows = [];
    const av = await supabase.from("agent_visits").select("*");
    if (av.error) {
      console.warn("[getAgentWorkspaceRead] agent_visits:", av.error.message);
    } else if (Array.isArray(av.data)) {
      visitRows = av.data;
    }

    const mappedVisits = visitRows.map(mapVisitRowForAgentDashboard);
    const scopedVisits = filterVisitsForUser(mappedVisits, currentUser);
    const recentVisits = [...scopedVisits].sort((a, b) => {
      const tb = new Date(b.visitDate || 0).getTime();
      const ta = new Date(a.visitDate || 0).getTime();
      return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
    }).slice(0, 10);

    const todayYmd = localDateYmd();
    const todayVisits = scopedVisits.filter(
      (v) => str(v.visitDate || "").slice(0, 10) === todayYmd
    ).length;

    /* No Supabase task read — tasks stay empty until a task source is added. */
    const tasks = [];
    const highPriorityTasks = 0;

    const totalOutstanding = assignedLabs.reduce(
      (s, l) => s + num(l.outstanding ?? l.outstandingAmount ?? 0),
      0
    );

    const summary = {
      todayVisits,
      pendingCollections: pendingCollections.length,
      totalOutstanding,
      activeLabs: assignedLabs.length,
      openTasks: tasks.length,
      highPriorityTasks,
    };

    const data = {
      summary,
      tasks,
      assignedLabs,
      recentVisits,
      pendingCollections,
    };
    console.log("SUPABASE AGENT WORKSPACE:", data);

    return {
      success: true,
      data,
    };
  } catch (err) {
    console.warn("[getAgentWorkspaceRead] failed:", err?.message || err);
    return { success: true, data: { ...EMPTY_AGENT_WORKSPACE } };
  }
}

/**
 * Fold visit fields that are not agent_visits columns into notes (schema-safe remap).
 * @param {string} baseNotes
 * @param {Object} meta
 */
function appendAgentVisitNoteMetadata(baseNotes, meta) {
  const parts = [];
  if (meta.labResponse) parts.push(`Response: ${meta.labResponse}`);
  const sold = num(meta.soldValue);
  if (sold > 0) parts.push(`Sold: ₹${sold}`);
  if (meta.area) parts.push(`Area: ${meta.area}`);
  if (meta.labName) parts.push(`Lab: ${meta.labName}`);
  if (!parts.length) return str(baseNotes) || null;
  const tag = `[Visit] ${parts.join(" · ")}`;
  const base = str(baseNotes);
  return base ? `${base}\n${tag}` : tag;
}

/**
 * Build insert row for agent_visits using only columns that exist in pilot schema.
 * Non-column payload fields are remapped into notes; unknown keys are dropped with Predator drift warning.
 * @returns {{ row: Record<string, unknown>, dropped: string[], error?: string }}
 */
export function buildAgentVisitInsertRow(payload = {}) {
  let visit_id = str(payload.visitId ?? payload.visit_id);
  if (!visit_id) {
    visit_id = `VIS-${Date.now()}`;
  }

  const tenant_id = str(payload.tenantId ?? payload.tenant_id) || null;
  const lab_id = labIdKey(payload.labId ?? payload.lab_id);
  const agent_id = str(payload.agentId ?? payload.agent_id ?? "");
  const visit_date = str(payload.visitDate ?? payload.visit_date).slice(0, 10);
  const visit_type = str(payload.visitType ?? payload.visit_type);
  const notesRaw = str(payload.notes);
  const next_follow_up_date = str(
    payload.nextFollowUpDate ?? payload.next_follow_up_date ?? ""
  ).slice(0, 10);
  const labResponse = str(payload.labResponse ?? payload.lab_response);
  const sold_value = num(payload.soldValue ?? payload.sold_value ?? 0);
  const lab_name = str(payload.labName ?? payload.lab_name) || null;
  const area = str(payload.area ?? payload.Area) || null;
  const agent_name = str(payload.agentName ?? payload.agent_name ?? "") || null;

  if (!lab_id) {
    return { row: {}, dropped: [], error: "lab_id is required" };
  }
  if (!visit_date) {
    return { row: {}, dropped: [], error: "visit_date is required" };
  }
  if (!visit_type) {
    return { row: {}, dropped: [], error: "visit_type is required" };
  }

  const follow_up_required =
    Boolean(next_follow_up_date) || labResponse === "Need Follow-up";

  const notes = appendAgentVisitNoteMetadata(notesRaw, {
    labResponse,
    soldValue: sold_value,
    area,
    labName: lab_name,
  });

  const candidate = {
    tenant_id,
    visit_id,
    lab_id,
    agent_id: agent_id || null,
    agent_name,
    visit_date,
    visit_type,
    notes,
    follow_up_required,
    next_follow_up_date: next_follow_up_date || null,
    lab_response: labResponse || null,
    sold_value: sold_value > 0 ? sold_value : null,
    lab_name,
    area,
  };

  const { row, dropped } = sanitizeRowToKnownColumns(
    "agent_visits",
    candidate,
    AGENT_VISITS_INSERT_COLUMNS
  );

  return { row, dropped };
}

/**
 * Inserts one row into `agent_visits` (PrimeCare agent visit log).
 * Maps frontend payload to schema-safe columns only.
 * @returns {{ success: boolean, data?: object, error?: string }}
 */
export async function createAgentVisitWrite(payload = {}) {
  traceSupabaseRead("Visits.createAgentVisitWrite", { table: "agent_visits" });
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: null };
  }

  try {
    const { row: insertRow, error: buildError } = buildAgentVisitInsertRow(payload);
    if (buildError) {
      return { success: false, error: buildError, data: null };
    }

    const { data, error } = await supabase.from("agent_visits").insert([insertRow]).select();

    if (error) {
      console.warn("[createAgentVisitWrite]", error.message);
      return { success: false, error: error.message || "Insert failed", data: null };
    }

    const saved = Array.isArray(data) ? data[0] : data;
    if (isPerfLogEnabled()) {
      perfLog("createAgentVisitWrite.success", { visit_id: insertRow.visit_id });
    }

    const visitTenantId = str(insertRow.tenant_id ?? payload.tenantId ?? payload.tenant_id);
    if (visitTenantId) {
      fireNotificationEvent(
        {
          eventType: "agent_visit_logged",
          sourceModule: "agent_visits",
          sourceId: insertRow.visit_id,
          tenantId: visitTenantId,
          targetLabId: insertRow.lab_id,
          targetRole: "admin",
          actorUserId: insertRow.agent_id || null,
          severity: "info",
          payload: {
            visitId: insertRow.visit_id,
            labId: insertRow.lab_id,
            visitType: insertRow.visit_type,
            visitDate: insertRow.visit_date,
          },
        },
        "createAgentVisitWrite"
      );
    }

    return { success: true, data: saved ?? null, error: null };
  } catch (err) {
    console.warn("[createAgentVisitWrite] failed:", err?.message || err);
    return { success: false, error: err?.message || String(err), data: null };
  }
}

/**
 * Inserts rows into `inventory_ledger` (e.g. ORDER_OUT lines after a lab order).
 * @param {object[]} ledgerRows
 * @returns {{ success: boolean, data?: object[], error?: string|null }}
 */
export async function createInventoryLedgerWrite(ledgerRows) {
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: null };
  }
  if (!Array.isArray(ledgerRows) || !ledgerRows.length) {
    return { success: true, data: [], error: null };
  }

  try {
    const { data, error } = await supabase.from("inventory_ledger").insert(ledgerRows).select();

    if (error) {
      console.warn("[createInventoryLedgerWrite]", error.message);
      return { success: false, error: error.message || "Ledger insert failed", data: null };
    }

    console.log("SUPABASE INVENTORY LEDGER SAVED", data);
    return { success: true, data: data ?? [], error: null };
  } catch (err) {
    console.warn("[createInventoryLedgerWrite] failed:", err?.message || err);
    return { success: false, error: err?.message || String(err), data: null };
  }
}

function signedInventoryLedgerQuantity(row) {
  const qty = num(row.quantity ?? row.qty ?? row.movement_qty ?? row.movementQty);
  const movementType = str(row.movement_type ?? row.movementType ?? row.type).toUpperCase();
  if (movementType === "ORDER_OUT" || movementType === "OUT") return -Math.abs(qty);
  if (movementType === "PURCHASE_IN" || movementType === "IN") return Math.abs(qty);
  return qty;
}

export function mapInventoryLedgerRow(row) {
  const movementType = str(row.movement_type ?? row.movementType ?? row.type).toUpperCase();
  return {
    id: str(row.id ?? row.ledger_id ?? row.ledgerId),
    createdAt: str(row.created_at ?? row.createdAt ?? row.date),
    tenantId: str(row.tenant_id ?? row.tenantId ?? row.Tenant_ID),
    productId: str(row.product_id ?? row.productId),
    productName: str(row.product_name ?? row.productName),
    movementType,
    quantity: num(row.quantity ?? row.qty ?? row.movement_qty ?? row.movementQty),
    signedQuantity: signedInventoryLedgerQuantity(row),
    orderId: str(row.order_id ?? row.orderId ?? row.source_transaction ?? row.sourceTransaction),
    referenceType: str(row.reference_type ?? row.referenceType),
    referenceId: str(row.reference_id ?? row.referenceId),
    createdBy: str(row.created_by ?? row.createdBy),
    stockBefore: num(row.stock_before ?? row.stockBefore),
    stockAfter: num(row.stock_after ?? row.stockAfter),
    raw: row,
  };
}

/**
 * Read-only inventory movement ledger from public.inventory_ledger.
 */
export async function getInventoryLedgerRead() {
  traceSupabaseRead("InventoryLedger.getInventoryLedgerRead", { table: "inventory_ledger" });
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: { movements: [] } };
  }

  try {
    const { data, error } = await supabase
      .from("inventory_ledger")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return {
        success: false,
        error: error.message || "Inventory ledger read failed",
        data: { movements: [] },
      };
    }

    const movements = (data || []).map(mapInventoryLedgerRow);
    console.log("SUPABASE INVENTORY LEDGER", {
      count: movements.length,
      movements,
    });

    return { success: true, data: { movements }, error: null };
  } catch (err) {
    console.warn("[getInventoryLedgerRead] failed:", err?.message || err);
    return { success: false, error: err?.message || String(err), data: { movements: [] } };
  }
}

function inventoryHealthUrgency({ currentStock, minStock, projectedStockoutDays, leadTimeDays, safetyDays }) {
  if (currentStock <= minStock) return "Critical";
  if (
    Number.isFinite(projectedStockoutDays) &&
    projectedStockoutDays <= leadTimeDays + safetyDays
  ) {
    return "High";
  }
  if (Number.isFinite(projectedStockoutDays) && projectedStockoutDays <= 30) return "Medium";
  return "Low";
}

function mapInventoryHealthRow(row) {
  return {
    productId: str(row.product_id ?? row.productId ?? row.Product_ID),
    productName: str(row.product_name ?? row.productName ?? row.Product_Name ?? row.name),
    tenantId: str(row.tenant_id ?? row.tenantId ?? row.Tenant_ID),
    category: str(row.category ?? row.Category),
    currentStock: num(row.current_stock ?? row.currentStock ?? row.Current_Stock),
    minStock: num(row.min_stock ?? row.minStock ?? row.Min_Stock),
    reorderQty: num(row.reorder_qty ?? row.reorderQty ?? row.Reorder_Qty),
    unitCost: num(row.unit_cost ?? row.unitCost ?? row.cost_price ?? row.costPrice),
    leadTimeDays: num(row.lead_time_days ?? row.leadTimeDays ?? row.Lead_Time_Days),
    safetyDays: num(row.safety_days ?? row.safetyDays ?? row.Safety_Days ?? 7),
  };
}

/**
 * Read-only inventory health intelligence from inventory + inventory_ledger.
 */
export async function getInventoryHealthRead() {
  traceSupabaseRead("InventoryHealth.getInventoryHealthRead", {
    tables: ["inventory", "inventory_ledger"],
  });
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: { rows: [] } };
  }

  try {
    const [inventoryRes, ledgerRes] = await Promise.all([
      supabase.from("inventory").select("*"),
      supabase.from("inventory_ledger").select("*"),
    ]);

    if (inventoryRes.error) {
      return { success: false, error: inventoryRes.error.message, data: { rows: [] } };
    }
    if (ledgerRes.error) {
      return { success: false, error: ledgerRes.error.message, data: { rows: [] } };
    }

    const inventoryRows = (inventoryRes.data || []).map(mapInventoryHealthRow).filter((r) => r.productId);
    const ledgerRows = (ledgerRes.data || []).map(mapInventoryLedgerRow);
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    const orderOutBySku = new Map();
    const orderOutMovementQtyBySku = new Map();
    const lastOrderOutAtBySku = new Map();

    for (const movement of ledgerRows) {
      if (movement.movementType !== "ORDER_OUT" && movement.movementType !== "OUT") continue;
      const productId = movement.productId;
      if (!productId) continue;
      const createdAtMs = new Date(movement.createdAt || 0).getTime();
      if (Number.isFinite(createdAtMs)) {
        const prev = lastOrderOutAtBySku.get(productId) || 0;
        if (createdAtMs > prev) lastOrderOutAtBySku.set(productId, createdAtMs);
      }
      if (createdAtMs < thirtyDaysAgo.getTime()) continue;
      const qty = Math.abs(num(movement.signedQuantity || movement.quantity));
      orderOutBySku.set(productId, (orderOutBySku.get(productId) || 0) + qty);
      if (!orderOutMovementQtyBySku.has(productId)) orderOutMovementQtyBySku.set(productId, []);
      orderOutMovementQtyBySku.get(productId).push(qty);
    }

    const skuRows = inventoryRows.map((item) => {
      const recentOrderOutQty = num(orderOutBySku.get(item.productId));
      const avgDailyConsumption = Math.round((recentOrderOutQty / 30) * 100) / 100;
      const projectedStockoutDays =
        avgDailyConsumption > 0
          ? Math.round((item.currentStock / avgDailyConsumption) * 10) / 10
          : null;
      const urgency = inventoryHealthUrgency({
        currentStock: item.currentStock,
        minStock: item.minStock,
        projectedStockoutDays,
        leadTimeDays: item.leadTimeDays,
        safetyDays: item.safetyDays,
      });
      const movementQtys = orderOutMovementQtyBySku.get(item.productId) || [];
      const avgMovementQty =
        movementQtys.length > 0
          ? movementQtys.reduce((sum, qty) => sum + qty, 0) / movementQtys.length
          : 0;
      const unusualMovements = ledgerRows
        .filter((m) => m.productId === item.productId)
        .filter((m) => {
          const qty = Math.abs(num(m.signedQuantity || m.quantity));
          return avgMovementQty > 0 && qty > avgMovementQty * 3;
        });
      const recommendedReorderQty = Math.max(
        item.reorderQty,
        Math.ceil(avgDailyConsumption * (item.leadTimeDays + item.safetyDays) - item.currentStock),
        0
      );
      const lastOrderOutMs = lastOrderOutAtBySku.get(item.productId);
      const hasRecentOrderOut = recentOrderOutQty > 0;
      const warningNotes = [];
      if (!hasRecentOrderOut) warningNotes.push("No ORDER_OUT movement in last 30 days");
      if (unusualMovements.length) warningNotes.push("Unusual movement quantity detected");
      if (urgency === "Critical") warningNotes.push("Current stock at or below minimum stock");

      return {
        ...item,
        avgDailyConsumption,
        projectedStockoutDays,
        urgency,
        recentOrderOutQty,
        isFastMoving: recentOrderOutQty > 0,
        isSlowOrDeadStock: !hasRecentOrderOut,
        inventoryValue: Math.round(item.currentStock * item.unitCost * 100) / 100,
        recommendedReorderQty,
        lastOrderOutAt: lastOrderOutMs ? new Date(lastOrderOutMs).toISOString() : "",
        unusualMovementCount: unusualMovements.length,
        warningNotes,
      };
    });

    const fastMoving = [...skuRows]
      .filter((row) => row.recentOrderOutQty > 0)
      .sort((a, b) => b.recentOrderOutQty - a.recentOrderOutQty)
      .slice(0, 10)
      .map((row) => row.productId);
    const fastMovingSet = new Set(fastMoving);
    const rows = skuRows
      .map((row) => ({ ...row, isFastMoving: fastMovingSet.has(row.productId) }))
      .sort((a, b) => {
        const rank = { Critical: 1, High: 2, Medium: 3, Low: 4 };
        return (rank[a.urgency] || 9) - (rank[b.urgency] || 9);
      });

    const summary = {
      totalSkus: rows.length,
      criticalCount: rows.filter((row) => row.urgency === "Critical").length,
      highCount: rows.filter((row) => row.urgency === "High").length,
      fastMovingCount: rows.filter((row) => row.isFastMoving).length,
      slowOrDeadCount: rows.filter((row) => row.isSlowOrDeadStock).length,
      totalInventoryValue: Math.round(rows.reduce((sum, row) => sum + row.inventoryValue, 0) * 100) / 100,
      unusualMovementWarnings: rows.reduce((sum, row) => sum + row.unusualMovementCount, 0),
    };

    const payload = { summary, rows };
    console.log("SUPABASE INVENTORY HEALTH", {
      inventoryRows: inventoryRows.length,
      ledgerRows: ledgerRows.length,
    });
    console.log("INVENTORY HEALTH CALCULATED", payload);

    return { success: true, data: payload, error: null };
  } catch (err) {
    console.warn("[getInventoryHealthRead] failed:", err?.message || err);
    return { success: false, error: err?.message || String(err), data: { rows: [] } };
  }
}

function generatePurchaseOrderId() {
  return `PO-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function normalizePurchaseOrderStatus(status) {
  const raw = str(status || "Draft");
  const lower = raw.toLowerCase();
  if (lower === "received" || lower === "fulfilled") return "Received";
  if (lower === "partially received" || lower === "partial") return "Partially Received";
  if (lower === "ordered" || lower === "processing") return "Ordered";
  if (lower === "cancelled" || lower === "canceled") return "Cancelled";
  return "Draft";
}

function mapPurchaseOrderRow(row, itemsByPo = new Map()) {
  const poId = str(row.po_id ?? row.poId ?? row.id);
  const lines = itemsByPo.get(poId) || row.purchase_order_items || row.items || [];
  const first = Array.isArray(lines) && lines.length ? lines[0] : {};
  const quantity = num(row.quantity ?? first.quantity);
  const receivedQty = num(row.received_qty ?? row.receivedQty ?? first.received_qty ?? first.receivedQty);
  const unitCost = num(row.unit_cost ?? row.unitCost ?? first.unit_cost ?? first.unitCost);
  const productId = str(row.product_id ?? row.productId ?? first.product_id ?? first.productId);
  const productName = str(row.product_name ?? row.productName ?? first.product_name ?? first.productName);

  return {
    poId,
    poDate: str(row.po_date ?? row.poDate ?? row.created_at ?? "").slice(0, 10),
    productId,
    productName,
    quantity,
    receivedQty,
    unitCost,
    totalCost: num(row.total_cost ?? row.totalCost) || quantity * unitCost,
    supplier: str(row.supplier ?? row.supplier_name ?? row.supplierName),
    status: normalizePurchaseOrderStatus(row.status),
    grnNotes: str(row.grn_notes ?? row.grnNotes ?? row.notes),
    receivedAt: str(row.received_at ?? row.receivedAt),
    items: Array.isArray(lines) ? lines : [],
  };
}

/**
 * Read purchase orders from Supabase purchase_orders + purchase_order_items.
 */
export async function getPurchaseOrdersRead() {
  traceSupabaseRead("PurchaseOrders.getPurchaseOrdersRead", {
    tables: ["purchase_orders", "purchase_order_items"],
  });
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: { purchaseOrders: [] } };
  }

  try {
    const po = await supabase
      .from("purchase_orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (po.error) {
      return { success: false, error: po.error.message, data: { purchaseOrders: [] } };
    }

    const items = await supabase.from("purchase_order_items").select("*");
    if (items.error) {
      return { success: false, error: items.error.message, data: { purchaseOrders: [] } };
    }

    const itemsByPo = new Map();
    for (const item of items.data || []) {
      const key = str(item.po_id ?? item.poId);
      if (!key) continue;
      if (!itemsByPo.has(key)) itemsByPo.set(key, []);
      itemsByPo.get(key).push(item);
    }

    const purchaseOrders = (po.data || []).map((row) => mapPurchaseOrderRow(row, itemsByPo));
    return { success: true, data: { purchaseOrders }, error: null };
  } catch (err) {
    console.warn("[getPurchaseOrdersRead] failed:", err?.message || err);
    return { success: false, error: err?.message || String(err), data: { purchaseOrders: [] } };
  }
}

/**
 * Create a purchase order and first line item in Supabase.
 */
export async function createPurchaseOrderWrite(payload = {}) {
  traceSupabaseRead("PurchaseOrders.createPurchaseOrderWrite", {
    tables: ["purchase_orders", "purchase_order_items"],
  });
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: null };
  }

  try {
    const productId = str(payload.productId ?? payload.product_id);
    const productName = str(payload.productName ?? payload.product_name);
    const quantity = num(payload.quantity);
    const unitCost = num(payload.unitCost ?? payload.unit_cost);
    const poId = str(payload.poId ?? payload.po_id) || generatePurchaseOrderId();
    const supplier = str(payload.supplier ?? payload.supplierName ?? payload.supplier_name);
    const status = normalizePurchaseOrderStatus(payload.status);
    const totalCost = Math.round(quantity * unitCost * 100) / 100;
    const poDate = str(payload.poDate ?? payload.po_date ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
    const tenant_id = str(payload.tenantId ?? payload.tenant_id) || null;

    if (!productId) return { success: false, error: "productId is required", data: null };
    if (quantity <= 0) return { success: false, error: "quantity must be greater than zero", data: null };

    const poPayload = {
      po_id: poId,
      tenant_id,
      po_date: poDate,
      product_id: productId,
      product_name: productName || productId,
      quantity,
      received_qty: 0,
      unit_cost: unitCost,
      total_cost: totalCost,
      supplier: supplier || null,
      status,
      notes: str(payload.notes) || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const itemPayload = {
      po_id: poId,
      tenant_id,
      product_id: productId,
      product_name: productName || productId,
      quantity,
      received_qty: 0,
      unit_cost: unitCost,
      total_cost: totalCost,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    console.log("PURCHASE ORDER WRITE PAYLOAD", { po: poPayload, item: itemPayload });

    const poIns = await supabase.from("purchase_orders").insert([poPayload]).select();
    if (poIns.error) {
      return { success: false, error: poIns.error.message || "Purchase order insert failed", data: null };
    }

    const itemIns = await supabase.from("purchase_order_items").insert([itemPayload]).select();
    if (itemIns.error) {
      return { success: false, error: itemIns.error.message || "Purchase order item insert failed", data: null };
    }

    const savedPo = Array.isArray(poIns.data) ? poIns.data[0] : poIns.data;
    const savedItem = Array.isArray(itemIns.data) ? itemIns.data[0] : itemIns.data;
    console.log("SUPABASE PURCHASE ORDER SAVED", { po: savedPo, item: savedItem });

    return {
      success: true,
      data: { poId, purchaseOrder: mapPurchaseOrderRow(savedPo, new Map([[poId, [savedItem]]])) },
      error: null,
    };
  } catch (err) {
    console.warn("[createPurchaseOrderWrite] failed:", err?.message || err);
    return { success: false, error: err?.message || String(err), data: null };
  }
}

/**
 * Predator/runtime contract: inventory stock mutations must scope tenant_id + product_id.
 */
export const INVENTORY_TENANT_SAFETY_CONTRACT = {
  version: 1,
  scopedFunctions: ["receivePurchaseOrderWrite", "applyLabOrderInventoryDeduction"],
  inventoryLookupKeys: ["tenant_id", "product_id"],
  inventoryUpdateKeys: ["tenant_id", "product_id"],
  ledgerTenantMatchesInventory: true,
};

/**
 * Resolve exactly one tenant-scoped inventory row before stock mutation.
 * @returns {Promise<{ success: boolean, row?: object, tenantId?: string, productId?: string, error?: string|null }>}
 */
async function resolveInventoryRowForWrite(tenant_id, product_id) {
  const tenantId = str(tenant_id);
  const productId = str(product_id);
  if (!tenantId) {
    return { success: false, error: "tenant_id is required for inventory write" };
  }
  if (!productId) {
    return { success: false, error: "product_id is required for inventory write" };
  }

  const sel = await supabase
    .from("inventory")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("product_id", productId);

  if (sel.error) {
    return { success: false, error: sel.error.message };
  }

  const rows = Array.isArray(sel.data) ? sel.data : [];
  if (rows.length === 0) {
    return {
      success: false,
      error: `Inventory row not found for tenant_id=${tenantId} product_id=${productId}`,
    };
  }
  if (rows.length > 1) {
    return {
      success: false,
      error: `Multiple inventory rows matched tenant_id=${tenantId} product_id=${productId} (count=${rows.length})`,
    };
  }

  return { success: true, row: rows[0], tenantId, productId, error: null };
}

/**
 * Receive purchase stock: increments inventory.current_stock, appends PURCHASE_IN ledger, updates PO.
 */
export async function receivePurchaseOrderWrite(poId, payload = {}) {
  traceSupabaseRead("PurchaseOrders.receivePurchaseOrderWrite", {
    tables: ["purchase_orders", "purchase_order_items", "inventory", "inventory_ledger"],
  });
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: null };
  }

  try {
    const id = str(poId ?? payload.poId ?? payload.po_id);
    const receivedQty = num(payload.receivedQty ?? payload.received_qty);
    const grnNotes = str(payload.grnNotes ?? payload.grn_notes ?? payload.notes);
    if (!id) return { success: false, error: "poId is required", data: null };
    if (receivedQty <= 0) return { success: false, error: "receivedQty must be greater than zero", data: null };

    const poSel = await supabase.from("purchase_orders").select("*").eq("po_id", id).limit(1);
    if (poSel.error) return { success: false, error: poSel.error.message, data: null };
    const poRow = Array.isArray(poSel.data) && poSel.data[0];
    if (!poRow) return { success: false, error: `Purchase order not found: ${id}`, data: null };

    const itemSel = await supabase.from("purchase_order_items").select("*").eq("po_id", id).limit(1);
    if (itemSel.error) return { success: false, error: itemSel.error.message, data: null };
    const itemRow = Array.isArray(itemSel.data) && itemSel.data[0];
    if (!itemRow) return { success: false, error: `Purchase order item not found: ${id}`, data: null };

    const productId = str(itemRow.product_id ?? poRow.product_id);
    const productName = str(itemRow.product_name ?? poRow.product_name ?? productId);
    if (!productId) return { success: false, error: "Purchase order item product_id is missing", data: null };

    const tenantId = str(itemRow.tenant_id ?? poRow.tenant_id);
    if (!tenantId) {
      return {
        success: false,
        error: "Purchase order tenant_id is required for inventory receipt",
        data: null,
      };
    }

    const inventoryResolved = await resolveInventoryRowForWrite(tenantId, productId);
    if (!inventoryResolved.success) {
      return { success: false, error: inventoryResolved.error || "Inventory row resolution failed", data: null };
    }
    const inventoryRow = inventoryResolved.row;
    const inventoryTenantId = str(inventoryRow.tenant_id ?? inventoryResolved.tenantId);

    const stockBefore = num(inventoryRow.current_stock ?? inventoryRow.currentStock);
    const stockAfter = stockBefore + receivedQty;
    const invUpd = await supabase
      .from("inventory")
      .update({ current_stock: stockAfter, updated_at: new Date().toISOString() })
      .eq("tenant_id", inventoryTenantId)
      .eq("product_id", productId)
      .select("tenant_id, product_id, current_stock");
    if (invUpd.error) return { success: false, error: invUpd.error.message, data: null };
    const updatedRows = Array.isArray(invUpd.data) ? invUpd.data : [];
    if (updatedRows.length !== 1) {
      return {
        success: false,
        error: `Inventory update expected 1 row, got ${updatedRows.length} for tenant_id=${inventoryTenantId} product_id=${productId}`,
        data: null,
      };
    }

    const ledgerRow = {
      movement_type: "PURCHASE_IN",
      product_id: productId,
      product_name: productName,
      order_id: id,
      quantity: receivedQty,
      stock_before: stockBefore,
      stock_after: stockAfter,
      tenant_id: inventoryTenantId,
      created_by: str(payload.receivedBy ?? payload.createdBy ?? payload.created_by) || null,
      created_at: new Date().toISOString(),
    };
    const ledger = await createInventoryLedgerWrite([ledgerRow]);
    if (!ledger.success) return { success: false, error: ledger.error || "Purchase ledger insert failed", data: null };
    console.log("INVENTORY PURCHASE_IN LEDGER SAVED", ledger.data);

    const orderedQty = num(itemRow.quantity ?? poRow.quantity);
    const previousReceived = num(itemRow.received_qty ?? poRow.received_qty);
    const nextReceived = previousReceived + receivedQty;
    const nextStatus = nextReceived >= orderedQty ? "Received" : "Partially Received";
    const updateTs = new Date().toISOString();

    const itemUpdate = await supabase
      .from("purchase_order_items")
      .update({
        received_qty: nextReceived,
        updated_at: updateTs,
      })
      .eq("po_id", id);
    if (itemUpdate.error) return { success: false, error: itemUpdate.error.message, data: null };

    const poUpdatePatch = {
      received_qty: nextReceived,
      status: nextStatus,
      received_at: nextStatus === "Received" ? updateTs : poRow.received_at ?? null,
      grn_notes: grnNotes || poRow.grn_notes || null,
      updated_at: updateTs,
    };
    const poUpdate = await supabase
      .from("purchase_orders")
      .update(poUpdatePatch)
      .eq("po_id", id)
      .select();
    if (poUpdate.error) return { success: false, error: poUpdate.error.message, data: null };

    const savedPo = Array.isArray(poUpdate.data) ? poUpdate.data[0] : poUpdate.data;
    console.log("SUPABASE PURCHASE RECEIVED", {
      poId: id,
      productId,
      receivedQty,
      stockBefore,
      stockAfter,
      status: nextStatus,
      po: savedPo,
    });

    return {
      success: true,
      data: {
        poId: id,
        receivedQty,
        status: nextStatus,
        purchaseOrder: mapPurchaseOrderRow(savedPo, new Map([[id, [{ ...itemRow, received_qty: nextReceived }]]])),
      },
      error: null,
    };
  } catch (err) {
    console.warn("[receivePurchaseOrderWrite] failed:", err?.message || err);
    return { success: false, error: err?.message || String(err), data: null };
  }
}

/**
 * Ensures order lines do not exceed on-hand inventory (no backorder in Year-1 pilot).
 * @param {string|null} tenant_id
 * @param {Array<{ product_id?: string, productId?: string, product_name?: string, productName?: string, quantity?: number }>} lines
 */
async function validateOrderLinesInventoryAvailability(tenant_id, lines) {
  const tid = str(tenant_id);
  if (!tid) {
    return { success: false, error: "tenant_id is required for inventory validation" };
  }

  const shortages = [];
  for (const line of lines || []) {
    const product_id = str(line.product_id ?? line.productId);
    const qty = num(line.quantity);
    if (!product_id || qty <= 0) continue;

    const inventoryResolved = await resolveInventoryRowForWrite(tid, product_id);
    if (!inventoryResolved.success) {
      return {
        success: false,
        error: inventoryResolved.error || `Inventory not found for ${product_id}`,
      };
    }

    const available = num(
      inventoryResolved.row?.current_stock ?? inventoryResolved.row?.currentStock ?? 0
    );
    if (qty > available) {
      shortages.push({
        product_id,
        product_name: str(line.product_name ?? line.productName) || product_id,
        requested: qty,
        available,
      });
    }
  }

  if (shortages.length) {
    const detail = shortages
      .map(
        (s) =>
          `${s.product_name}: requested ${s.requested}, available ${s.available}`
      )
      .join("; ");
    return { success: false, error: `Insufficient inventory — ${detail}` };
  }

  return { success: true, error: null };
}

/**
 * After `order_items` insert: decrement stock on the inventory table and append ledger rows.
 * Failures are logged only; the caller does not roll back the order.
 * @returns {Promise<{ success: boolean, error?: string|null, updatedLines?: number }>}
 */
async function applyLabOrderInventoryDeduction({ savedLineItems, order_id, tenant_id, created_by }) {
  if (!supabase) return { success: false, error: "Supabase is not configured" };

  const scopedTenantId = str(tenant_id);
  if (!scopedTenantId) {
    const message = "tenant_id is required for inventory deduction";
    console.warn("[applyLabOrderInventoryDeduction]", message, { order_id });
    return { success: false, error: message };
  }

  const tableName = "inventory";
  console.log("INVENTORY TABLE TARGET", tableName, { tenant_id: scopedTenantId });

  const oid = str(order_id);
  const lines = Array.isArray(savedLineItems) ? savedLineItems : [];
  const ledgerBatch = [];
  let updatedLines = 0;
  const stockErrors = [];

  for (const line of lines) {
    const product_id = str(line.product_id ?? line.productId ?? "");
    const product_name_line =
      str(line.product_name ?? line.productName ?? "") || null;
    const qty = num(line.quantity);
    if (!product_id || qty <= 0) continue;

    const inventoryResolved = await resolveInventoryRowForWrite(scopedTenantId, product_id);
    if (!inventoryResolved.success) {
      stockErrors.push(
        inventoryResolved.error || `Inventory row not found for ${product_id}`
      );
      console.warn(
        "[applyLabOrderInventoryDeduction] row resolution failed:",
        product_id,
        inventoryResolved.error
      );
      continue;
    }

    const row = inventoryResolved.row;
    const inventoryTenantId = str(row.tenant_id ?? inventoryResolved.tenantId);

    const stock_before = num(row.current_stock ?? row.currentStock ?? 0);
    if (qty > stock_before) {
      const label = product_name_line || product_id;
      stockErrors.push(
        `Insufficient stock for ${label}: requested ${qty}, available ${stock_before}`
      );
      console.warn("[applyLabOrderInventoryDeduction] insufficient stock:", {
        product_id,
        requested: qty,
        available: stock_before,
      });
      continue;
    }

    const stock_after = stock_before - qty;

    console.log("INVENTORY BEFORE UPDATE", {
      table: tableName,
      tenant_id: inventoryTenantId,
      product_id,
      stock_column: "current_stock",
      stock_before,
      quantity_out: qty,
      stock_after,
    });

    const updatePatch = {
      current_stock: stock_after,
      updated_at: new Date().toISOString(),
    };
    console.log("INVENTORY UPDATE PATCH", updatePatch);

    const upd = await supabase
      .from("inventory")
      .update(updatePatch)
      .eq("tenant_id", inventoryTenantId)
      .eq("product_id", product_id)
      .select("tenant_id, product_id, current_stock");

    if (upd.error) {
      console.warn(
        "[createOrderWrite] INVENTORY UPDATE FAILED — order is NOT rolled back:",
        product_id,
        upd.error.message
      );
      console.log("INVENTORY AFTER UPDATE", {
        product_id,
        skipped: true,
        reason: upd.error.message,
      });
      continue;
    }

    const updatedRows = Array.isArray(upd.data) ? upd.data : [];
    if (updatedRows.length !== 1) {
      console.warn(
        "[createOrderWrite] INVENTORY UPDATE row count unexpected — order is NOT rolled back:",
        product_id,
        `expected 1, got ${updatedRows.length}`
      );
      continue;
    }

    updatedLines += 1;
    console.log("INVENTORY AFTER UPDATE", { tenant_id: inventoryTenantId, product_id, stock_after });

    ledgerBatch.push({
      movement_type: "ORDER_OUT",
      product_id,
      product_name:
        product_name_line || str(row.product_name ?? row.productName ?? "") || null,
      order_id: oid,
      quantity: qty,
      stock_before,
      stock_after,
      tenant_id: inventoryTenantId,
      created_by,
      created_at: new Date().toISOString(),
    });
  }

  if (stockErrors.length) {
    return {
      success: false,
      error: stockErrors.join("; "),
      updatedLines,
    };
  }

  if (!ledgerBatch.length) {
    return {
      success: false,
      error: updatedLines === 0 && lines.length ? "No inventory lines updated" : null,
      updatedLines,
    };
  }

  const led = await createInventoryLedgerWrite(ledgerBatch);
  if (!led.success) {
    console.warn(
      "[createOrderWrite] INVENTORY LEDGER insert failed — stock may already be updated; order is NOT rolled back:",
      led.error
    );
    return { success: false, error: led.error || "Ledger insert failed", updatedLines };
  }

  return { success: true, error: null, updatedLines };
}

/**
 * Inserts a lab order into `orders` and line rows into `order_items`.
 * Payload mirrors LabOrderingPage: { labId, labName?, notes?, items: [{ productId, productName?, quantity, unitSellingPrice }], tenantId?, createdBy?, orderId?, orderDate?, status? }
 * Apps Script `submitLabOrder` remains the fallback caller when this returns failure.
 */
export async function createOrderWrite(payload = {}) {
  traceSupabaseRead("LabOrdering.createOrderWrite", { tables: ["orders", "order_items", "inventory", "inventory_ledger"] });
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: null };
  }

  try {
    const lab_id = labIdKey(payload.labId ?? payload.lab_id);
    const tenant_id = str(payload.tenantId ?? payload.tenant_id) || null;
    const created_by =
      str(
        payload.createdBy ??
          payload.created_by ??
          payload.labName ??
          payload.lab_name ??
          ""
      ) || null;
    const order_date = str(
      payload.orderDate ?? payload.order_date ?? new Date().toISOString().slice(0, 10)
    ).slice(0, 10);
    let order_id = str(payload.orderId ?? payload.order_id);
    if (!order_id) {
      order_id = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    }
    const status = str(payload.status ?? "Placed");
    const notesRaw = str(payload.notes);
    const items = Array.isArray(payload.items) ? payload.items : [];

    if (!lab_id) {
      return { success: false, error: "lab_id is required", data: null };
    }
    if (!items.length) {
      return { success: false, error: "items are required", data: null };
    }

    const normalizedLines = items.map((it) => {
      const product_id = str(it.productId ?? it.product_id);
      const product_name =
        str(it.productName ?? it.product_name ?? it.name ?? "") || null;
      const quantity = num(it.quantity);
      const unit_price = num(it.unitSellingPrice ?? it.unitPrice ?? it.unit_price);
      const total_price = Math.round(quantity * unit_price * 100) / 100;
      return { product_id, product_name, quantity, unit_price, total_price };
    });

    const total_amount = normalizedLines.reduce((s, l) => s + l.total_price, 0);

    const stockCheck = await validateOrderLinesInventoryAvailability(tenant_id, normalizedLines);
    if (!stockCheck.success) {
      return { success: false, error: stockCheck.error || "Insufficient inventory", data: null };
    }

    const writePayload = {
      order_id,
      tenant_id,
      lab_id,
      order_date,
      status,
      total_amount,
      created_by,
      created_at: new Date().toISOString(),
      items: normalizedLines,
    };
    console.log("ORDER WRITE PAYLOAD", writePayload);

    const orderRow = {
      order_id,
      tenant_id,
      lab_id,
      order_date,
      status,
      total_amount,
      created_by,
      created_at: writePayload.created_at,
      notes: notesRaw || null,
    };

    const { data: orderData, error: orderError } = await supabase
      .from("orders")
      .insert([orderRow])
      .select();

    if (orderError) {
      console.warn("[createOrderWrite] orders:", orderError.message);
      return { success: false, error: orderError.message || "Order insert failed", data: null };
    }

    const savedOrder = Array.isArray(orderData) ? orderData[0] : orderData;
    console.log("SUPABASE ORDER SAVED", savedOrder);
    await getLabRecentOrdersRead(lab_id);

    const itemsPayload = normalizedLines.map((line, idx) => ({
      order_item_id: `OIN-${order_id}-${idx}-${Date.now()}`,
      order_id,
      tenant_id,
      product_id: line.product_id,
      product_name: line.product_name,
      quantity: line.quantity,
      unit_price: line.unit_price,
      total_price: line.total_price,
      created_by,
    }));
    console.log("SUPABASE ORDER ITEMS PAYLOAD", itemsPayload);

    const { data: itemsData, error: itemsError } = await supabase
      .from("order_items")
      .insert(itemsPayload)
      .select();

    if (itemsError) {
      console.warn("[createOrderWrite] order_items:", itemsError.message);
      return {
        success: false,
        error: itemsError.message || "Order items insert failed",
        data: { order: savedOrder, items: [] },
      };
    }

    console.log("SUPABASE ORDER ITEMS SAVED", itemsData);

    if (str(status).toLowerCase() === "fulfilled") {
      console.log("ORDER STATUS BUSINESS RULE", {
        branch: "createOrderWrite: Fulfill-on-submit — deduct inventory once + AR post once",
        order_id,
        lab_id,
      });
      try {
        await applyLabOrderInventoryDeduction({
          savedLineItems: itemsData,
          order_id,
          tenant_id,
          created_by,
        });
      } catch (invErr) {
        console.warn(
          "[createOrderWrite] Fulfilled order inventory deduction threw — order is NOT rolled back:",
          invErr?.message || invErr
        );
      }

      const amt = normalizedLines.reduce((s, l) => s + num(l.total_price), 0);
      const bump = await bumpArOutstandingForFulfillment({
        lab_id,
        tenant_id,
        deltaAmount: amt,
      });
      if (bump.success && !bump.skipped) {
        console.log("AR POSTED FOR ORDER", {
          phase: "createOrderWrite",
          order_id,
          lab_id,
          delta: amt,
        });
      }

      const flagPatch = {
        fulfilled_at: new Date().toISOString(),
        inventory_updated: true,
        ar_posted: Boolean(bump.success && !bump.skipped),
        updated_at: new Date().toISOString(),
      };
      const uf = await supabase.from("orders").update(flagPatch).eq("order_id", order_id).select();
      if (uf.error) {
        console.warn("[createOrderWrite] Fulfillment flags update:", uf.error.message);
      }
    }

    const notifyBase = {
      sourceModule: "orders",
      sourceId: order_id,
      tenantId: tenant_id,
      targetLabId: lab_id,
      targetRole: "admin",
      severity: "info",
    };

    fireNotificationEvent(
      {
        ...notifyBase,
        eventType: "order_created",
        payload: {
          orderId: order_id,
          labId: lab_id,
          totalAmount: total_amount,
          status,
          lineCount: normalizedLines.length,
        },
      },
      "createOrderWrite"
    );

    if (str(status).toLowerCase() === "fulfilled") {
      fireNotificationEvent(
        {
          ...notifyBase,
          eventType: "order_fulfilled",
          severity: "medium",
          payload: {
            orderId: order_id,
            labId: lab_id,
            totalAmount: total_amount,
            status: "fulfilled",
          },
        },
        "createOrderWrite"
      );
    }

    return {
      success: true,
      data: {
        order: savedOrder,
        items: itemsData,
        orderId: order_id,
      },
      error: null,
    };
  } catch (err) {
    console.warn("[createOrderWrite] failed:", err?.message || err);
    return { success: false, error: err?.message || String(err), data: null };
  }
}

/**
 * Maps `orders` row (snake_case) to OrdersPage list/detail header shape.
 * Primary columns match Supabase `public.orders`: order_id, lab_id, status, total_amount,
 * order_date, created_at, created_by. Null lab_id / order_date does not drop the row.
 */
export function mapOrderRow(row, labNameFallback = "", rowIndex = 0) {
  let orderId = str(row.order_id ?? row.orderId ?? "");
  if (!orderId && row.id != null && String(row.id).trim() !== "") {
    logStaleFieldMapping("Orders.mapOrderRow", "order_id", "id (uuid)", row.id);
    orderId = String(row.id).trim();
  }
  if (!orderId) {
    orderId = `order-row-${rowIndex}`;
  }

  const orderDateRaw = str(row.order_date ?? row.orderDate ?? "");
  const orderDate = orderDateRaw ? orderDateRaw.slice(0, 10) : "";

  const createdAt = str(row.created_at ?? row.createdAt ?? "");
  const createdBy = str(row.created_by ?? row.createdBy ?? "");

  return {
    orderId,
    orderDate,
    tenantId: str(row.tenant_id ?? row.tenantId ?? row.Tenant_ID ?? ""),
    labId: labIdKey(row.lab_id ?? row.labId ?? row.lab_uuid ?? row.labUUID ?? ""),
    labName: str(row.lab_name ?? row.labName ?? row.lab_title ?? labNameFallback),
    contactPerson: str(row.contact_person ?? row.contactPerson ?? row.contact_name ?? ""),
    invoiceId: str(row.invoice_id ?? row.invoiceId ?? row.invoice_number ?? ""),
    invoiceStatus: str(row.invoice_status ?? row.invoiceStatus ?? ""),
    paymentStatus: str(row.payment_status ?? row.paymentStatus ?? row.payment_state ?? ""),
    orderStatus: str(
      row.status ?? row.order_status ?? row.orderStatus ?? row.state ?? "Placed"
    ),
    orderTotal: num(
      row.total_amount ??
        row.totalAmount ??
        row.order_total ??
        row.orderTotal ??
        row.total ??
        row.amount ??
        row.grand_total ??
        0
    ),
    createdAt,
    createdBy,
    updatedAt: str(row.updated_at ?? row.updatedAt ?? ""),
    cancelledAt: str(row.cancelled_at ?? row.cancelledAt ?? ""),
    statusNotes: str(row.status_notes ?? row.statusNotes ?? ""),
    notes: str(row.notes ?? row.order_notes ?? row.remark ?? ""),
    mobileNumber: str(
      row.mobile_number ?? row.mobileNumber ?? row.phone ?? row.contact_phone ?? ""
    ),
  };
}

/**
 * Maps `order_lines` row to OrdersPage line item shape.
 */
export function mapOrderLineRow(row) {
  return {
    orderLineId: str(
      row.order_line_id ??
        row.orderLineId ??
        row.order_item_id ??
        row.orderItemId ??
        row.id ??
        `${row.product_id ?? row.productId ?? "line"}`
    ),
    orderId: str(row.order_id ?? row.orderId ?? ""),
    productId: str(row.product_id ?? row.productId ?? ""),
    productName: str(row.product_name ?? row.productName ?? ""),
    quantity: num(row.quantity),
    unitSellingPrice: num(
      row.unit_selling_price ?? row.unitSellingPrice ?? row.unit_price ?? row.unitPrice
    ),
    taxAmount: num(row.tax_amount ?? row.taxAmount ?? row.tax ?? 0),
    netLineTotal: num(
      row.net_line_total ??
        row.netLineTotal ??
        row.line_total ??
        row.lineTotal ??
        row.total_price ??
        row.totalPrice
    ),
  };
}

async function fetchLabsNameMap() {
  const map = new Map();
  if (!supabase) return map;
  try {
    const { data: labsRows, error } = await supabase.from("labs").select("*");
    if (error || !Array.isArray(labsRows)) return map;
    for (const l of labsRows) {
      const id = str(l.lab_id ?? l.labId ?? l.id);
      const name = str(l.lab_name ?? l.labName ?? l.name ?? "");
      if (id) map.set(id, name);
    }
  } catch {
    /* ignore — orders list still works without lab names */
  }
  return map;
}

/**
 * Recent orders for a single lab from `public.orders` (filtered by `lab_id`).
 * Never throws. Logs raw DB rows as `SUPABASE LAB RECENT ORDERS`.
 */
export async function getLabRecentOrdersRead(labId) {
  traceSupabaseRead("LabOrdering.getLabRecentOrdersRead", { table: "orders", labId });
  const empty = { success: true, data: { orders: [] } };
  if (!supabase) return empty;

  const lid = str(labId);
  if (!lid) return empty;

  try {
    let rows = null;
    let lastError = null;

    const q1 = await supabase
      .from("orders")
      .select("*")
      .eq("lab_id", lid)
      .order("created_at", { ascending: false })
      .limit(50);

    if (!q1.error) {
      rows = q1.data;
    } else {
      lastError = q1.error;
      const q2 = await supabase
        .from("orders")
        .select("*")
        .eq("lab_id", lid)
        .order("order_date", { ascending: false })
        .limit(50);
      if (!q2.error) {
        rows = q2.data;
        lastError = null;
      } else {
        lastError = q2.error;
      }
    }

    if (lastError) {
      console.warn("[getLabRecentOrdersRead]", lastError.message);
      return empty;
    }

    const rawList = Array.isArray(rows) ? rows : [];
    console.log("SUPABASE LAB RECENT ORDERS:", rawList);

    let labMap = new Map();
    try {
      labMap = await fetchLabsNameMap();
    } catch {
      labMap = new Map();
    }

    const orders = rawList.map((r, idx) => {
      const rowLab = str(r.lab_id ?? r.labId ?? r.lab_uuid ?? r.labUUID ?? "");
      return mapOrderRow(r, labMap.get(rowLab) || "", idx);
    });

    return { success: true, data: { orders } };
  } catch (err) {
    console.warn("[getLabRecentOrdersRead] failed:", err?.message || err);
    return empty;
  }
}

async function fetchOrderLineCounts() {
  const counts = new Map();
  if (!supabase) return counts;

  const accumulate = (rows) => {
    for (const line of rows || []) {
      const oid = str(line.order_id ?? line.orderId);
      if (oid) counts.set(oid, (counts.get(oid) || 0) + 1);
    }
  };

  try {
    const { data, error } = await supabase.from("order_lines").select("order_id");
    if (!error && Array.isArray(data)) accumulate(data);
  } catch {
    /* optional */
  }

  try {
    const { data, error } = await supabase.from("order_items").select("order_id");
    if (!error && Array.isArray(data)) {
      for (const line of data) {
        const oid = str(line.order_id ?? line.orderId);
        if (oid && !counts.has(oid)) {
          counts.set(oid, (counts.get(oid) || 0) + 1);
        }
      }
    }
  } catch {
    /* optional */
  }

  return counts;
}

/**
 * Read-only order list: bare `from("orders").select("*")` (no filters, limits, or ranges).
 * Never throws.
 */
export async function getOrdersRead(_params = {}) {
  void _params;
  traceSupabaseRead("Orders.getOrdersRead", { table: "orders" });

  const emptyOrders = { success: false, error: "Supabase is not configured", data: { orders: [] } };

  if (!supabase) {
    return emptyOrders;
  }

  try {
    const { data, error } = await supabase.from("orders").select("*");

    if (error) {
      const message = error.message || String(error);
      console.warn("[getOrdersRead] Supabase error:", message);
      return { success: false, error: message, data: { orders: [] } };
    }

    const rawList = Array.isArray(data) ? data : [];

    let labMap = new Map();
    try {
      labMap = await fetchLabsNameMap();
    } catch {
      labMap = new Map();
    }

    const lineCounts = await fetchOrderLineCounts();

    const orders = rawList.map((r, idx) => {
      const labId = str(r.lab_id ?? r.labId ?? r.lab_uuid ?? r.labUUID ?? "");
      const mapped = mapOrderRow(r, labMap.get(labId) || "", idx);
      const businessId = str(r.order_id ?? r.orderId ?? mapped.orderId);
      const uuidId = r.id != null ? str(r.id) : "";
      const itemCount =
        lineCounts.get(businessId) ??
        (uuidId ? lineCounts.get(uuidId) : 0) ??
        0;
      return { ...mapped, itemCount };
    });

    const orderIds = orders.map((o) => str(o.orderId)).filter(Boolean);
    const meta = {
      rawRowCount: rawList.length,
      mappedRowCount: orders.length,
      orderIds,
    };

    if (rawList.length !== orders.length) {
      console.warn("[getOrdersRead] row count mismatch after mapping", meta);
    }

    return { success: true, data: { orders }, meta, error: null };
  } catch (err) {
    const message = err?.message || String(err);
    console.warn("[getOrdersRead] failed:", message);
    return { success: false, error: message, data: { orders: [] } };
  }
}

/**
 * Read-only single order + lines from `orders`, `order_lines` or `order_items`, and `labs`.
 * `orderId` may match `orders.order_id` or `orders.id`.
 * Never throws.
 */
export async function getOrderDetailsRead(orderId) {
  traceSupabaseRead("Orders.getOrderDetailsRead", {
    tables: ["orders", "order_lines", "order_items", "labs"],
    orderId,
  });
  const empty = { success: true, data: { order: null, lines: [] } };
  if (!supabase) return empty;

  try {
    const oid = str(orderId);
    if (!oid) return empty;

    let orderRow = null;
    const byBusinessId = await supabase.from("orders").select("*").eq("order_id", oid).limit(1);
    if (!byBusinessId.error && Array.isArray(byBusinessId.data) && byBusinessId.data[0]) {
      orderRow = byBusinessId.data[0];
    } else if (byBusinessId.error) {
      console.warn("[getOrderDetailsRead] orders by order_id:", byBusinessId.error.message);
    }

    if (!orderRow) {
      const byPk = await supabase.from("orders").select("*").eq("id", oid).limit(1);
      if (!byPk.error && Array.isArray(byPk.data) && byPk.data[0]) orderRow = byPk.data[0];
      else if (byPk.error) {
        console.warn("[getOrderDetailsRead] orders by id:", byPk.error.message);
      }
    }

    if (!orderRow) {
      return empty;
    }

    const labMap = await fetchLabsNameMap();
    const labId = str(orderRow.lab_id ?? orderRow.labId);
    const order = mapOrderRow(orderRow, labMap.get(labId) || "");

    const fk = orderRow.id ?? orderRow.order_id;
    let lineRows = [];

    const q1 = await supabase.from("order_lines").select("*").eq("order_id", str(fk));
    if (!q1.error && Array.isArray(q1.data)) {
      lineRows = q1.data;
    } else if (q1.error) {
      console.warn("[getOrderDetailsRead] order_lines:", q1.error.message);
    }

    if (!lineRows.length && str(orderRow.order_id)) {
      const q2 = await supabase.from("order_lines").select("*").eq("order_id", str(orderRow.order_id));
      if (!q2.error && Array.isArray(q2.data)) lineRows = q2.data;
    }

    if (!lineRows.length && str(orderRow.order_id)) {
      const qi = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", str(orderRow.order_id));
      if (!qi.error && Array.isArray(qi.data)) lineRows = qi.data;
      else if (qi.error) {
        console.warn("[getOrderDetailsRead] order_items:", qi.error.message);
      }
    }

    const lines = (lineRows || []).map(mapOrderLineRow).filter((l) => l.productId || l.productName);

    return {
      success: true,
      data: {
        order,
        lines,
      },
    };
  } catch (err) {
    console.warn("[getOrderDetailsRead] failed:", err?.message || err);
    return empty;
  }
}

const ORDER_STATUS_ALLOWED = ["Placed", "Processing", "Fulfilled", "Cancelled"];

function isMissingOrdersColumnError(err, columnName) {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  const col = String(columnName ?? "").toLowerCase();
  return (
    (msg.includes("schema cache") ||
      msg.includes("could not find") ||
      msg.includes("does not exist")) &&
    msg.includes(col)
  );
}

function appendOrderStatusNote(existingNotes, nextStatus, noteText) {
  const existing = str(existingNotes);
  const note = str(noteText);
  if (!note) return existing;
  const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
  const line = `[${timestamp}] Status changed to ${nextStatus} - ${note}`;
  return existing ? `${existing}\n${line}` : line;
}

function coercePgBoolTruth(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const s = str(value).toLowerCase();
  return s === "yes" || s === "true" || s === "1";
}

async function ledgerHasOrderOutMovement(orderId) {
  if (!supabase) return false;
  const oid = str(orderId);
  if (!oid) return false;
  const q = await supabase
    .from("inventory_ledger")
    .select("id")
    .eq("order_id", oid)
    .eq("movement_type", "ORDER_OUT")
    .limit(1);
  if (q.error) return false;
  return Array.isArray(q.data) && q.data.length > 0;
}

async function bumpArOutstandingForFulfillment({ lab_id, tenant_id, deltaAmount }) {
  if (!supabase || !lab_id || num(deltaAmount) <= 0) {
    return { success: true, skipped: true };
  }
  const sid = normalizeLabIdKey(lab_id);
  const tid = str(tenant_id);
  if (!tid) {
    return { success: false, error: "tenant_id is required for AR write", skipped: true };
  }

  const sel = await supabase
    .from("ar_credit_control")
    .select("*")
    .eq("tenant_id", tid)
    .eq("lab_id", sid)
    .limit(1);
  if (sel.error) {
    return { success: false, error: sel.error.message, skipped: true };
  }
  const row = Array.isArray(sel.data) && sel.data[0];
  if (!row) {
    console.warn("[bumpArOutstandingForFulfillment] No ar_credit_control row for lab:", sid);
    return { success: false, error: "No AR row for lab", skipped: true };
  }
  const d = num(deltaAmount);
  const curOut = num(
    row.outstanding ??
      row.outstanding_amount ??
      row.outstandingAmount ??
      row.balance ??
      0
  );
  let patch = {
    outstanding: curOut + d,
    updated_at: new Date().toISOString(),
  };
  const td = num(row.total_delivered ?? row.totalDelivered ?? 0);
  if (td >= 0) {
    patch.total_delivered = td + d;
  }
  let upd = await supabase
    .from("ar_credit_control")
    .update(patch)
    .eq("tenant_id", tid)
    .eq("lab_id", sid);
  if (!upd.error) return { success: true, skipped: false };
  delete patch.total_delivered;
  upd = await supabase
    .from("ar_credit_control")
    .update(patch)
    .eq("tenant_id", tid)
    .eq("lab_id", sid);
  if (!upd.error) return { success: true, skipped: false };
  return { success: false, error: upd.error.message, skipped: true };
}

/** Resolves order row and the eq() column for updates (order_id or id). */
async function resolveOrderRowForUpdate(orderId) {
  const oid = str(orderId);
  if (!oid) return { orderRow: null, updateKey: null, updateValue: null };

  const byBusinessId = await supabase.from("orders").select("*").eq("order_id", oid).limit(1);
  if (!byBusinessId.error && Array.isArray(byBusinessId.data) && byBusinessId.data[0]) {
    return {
      orderRow: byBusinessId.data[0],
      updateKey: "order_id",
      updateValue: str(byBusinessId.data[0].order_id ?? oid),
    };
  }

  const byPk = await supabase.from("orders").select("*").eq("id", oid).limit(1);
  if (!byPk.error && Array.isArray(byPk.data) && byPk.data[0]) {
    return {
      orderRow: byPk.data[0],
      updateKey: "id",
      updateValue: byPk.data[0].id,
    };
  }

  return { orderRow: null, updateKey: null, updateValue: null };
}

async function patchOrderRow(updateKey, updateValue, patch) {
  const attempt = (p) => supabase.from("orders").update(p).eq(updateKey, updateValue).select();

  let res = await attempt(patch);
  if (!res.error) return res;

  let slim = { ...patch };
  if (slim.status_notes && isMissingOrdersColumnError(res.error, "status_notes")) {
    delete slim.status_notes;
    console.warn(
      "[updateOrderStatusWrite] orders.status_notes missing — retrying without it. Run order_status_update_migration.sql"
    );
    res = await attempt(slim);
  }
  if (res.error && slim.updated_at && isMissingOrdersColumnError(res.error, "updated_at")) {
    delete slim.updated_at;
    res = await attempt(slim);
  }
  if (res.error && slim.notes && isMissingOrdersColumnError(res.error, "notes")) {
    const updatedAt = slim.updated_at;
    slim = { status: slim.status, ...(updatedAt ? { updated_at: updatedAt } : {}) };
    res = await attempt(slim);
  }
  for (const extraCol of ["fulfilled_at", "cancelled_at", "inventory_updated", "ar_posted"]) {
    if (!res.error) break;
    if (!(extraCol in slim)) continue;
    if (isMissingOrdersColumnError(res.error, extraCol)) {
      delete slim[extraCol];
      console.warn(
        `[updateOrderStatusWrite] orders.${extraCol} missing in schema — retrying without it`
      );
      res = await attempt(slim);
    }
  }
  if (res.error && Object.keys(slim).length > 1) {
    res = await attempt({ status: patch.status });
  }
  return res;
}

/**
 * Updates `orders.status` (and optional notes / updated_at) for Orders Monitor.
 * @param {string} orderId - business order_id or uuid id
 * @param {string} status - Placed | Processing | Fulfilled | Cancelled
 * @param {object} [payload] - { note?, orderStatus? }
 */
export async function updateOrderStatusWrite(orderId, status, payload = {}) {
  traceSupabaseRead("Orders.updateOrderStatusWrite", { table: "orders", orderId });
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: null };
  }

  try {
    const oid = str(orderId);
    const nextStatus = str(status || payload.orderStatus || payload.status);
    const note = str(payload.note ?? payload.statusNote ?? payload.status_notes);

    if (!oid) {
      return { success: false, error: "order_id is required", data: null };
    }
    if (!nextStatus) {
      return { success: false, error: "status is required", data: null };
    }
    if (!ORDER_STATUS_ALLOWED.includes(nextStatus)) {
      return { success: false, error: `Invalid order status: ${nextStatus}`, data: null };
    }

    const { orderRow, updateKey, updateValue } = await resolveOrderRowForUpdate(oid);
    if (!orderRow || !updateKey || updateValue == null) {
      return { success: false, error: `Order not found: ${oid}`, data: null };
    }

    const prevNorm = normalizedOrderRowStatus(orderRow);
    const businessOrderId = str(orderRow.order_id ?? orderRow.orderId ?? oid);
    const labId = normalizeLabIdKey(orderRow.lab_id ?? orderRow.labId);

    console.log("ORDERS STATUS SUPABASE AUTHORITATIVE", {
      orderId: businessOrderId,
      prevStatus: prevNorm,
      nextStatus,
      fallbackDisabledWhenSupabaseConfigured: true,
    });

    console.log("ORDER STATUS BUSINESS RULE", {
      orderId: businessOrderId,
      labId,
      prevStatus: prevNorm,
      nextStatus,
      placedMeansPendingFulfillment:
        prevNorm === "Placed" || nextStatus === "Placed" ? true : undefined,
      processingNoFinanceOrInventoryFinalize: nextStatus === "Processing",
      fulfilmentAddsReceivableOnce: nextStatus === "Fulfilled",
      cancelledExcludedFromAnalytics: nextStatus === "Cancelled",
      inventoryDeductionIdempotentFlag: true,
    });
    console.log("ORDER STATUS SYNC START", {
      orderId: businessOrderId,
      prevStatus: prevNorm,
      nextStatus,
    });

    const prevKey = prevNorm.toLowerCase();
    const becomingFulfilled = nextStatus === "Fulfilled" && prevKey !== "fulfilled";
    const becomingCancelled = nextStatus === "Cancelled" && prevKey !== "cancelled";

    let fetchedLineItems = [];
    if (becomingFulfilled) {
      const li = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", businessOrderId);
      fetchedLineItems = Array.isArray(li.data) ? li.data : [];
    }

    const amtFromLines = (fetchedLineItems || []).reduce(
      (s, l) => s + num(l.total_price ?? l.totalPrice ?? l.net_line_total ?? 0),
      0
    );
    const emptyLineMap = new Map();
    const amtHeader = resolveOrderAmount(orderRow, emptyLineMap);
    const orderAmt = amtHeader > 0 ? amtHeader : amtFromLines;

    let inventoryDoneFlag = coercePgBoolTruth(orderRow.inventory_updated ?? orderRow.inventoryUpdated);
    let arDoneFlag = coercePgBoolTruth(orderRow.ar_posted ?? orderRow.arPosted);

    if (becomingFulfilled) {
      const hasLedgerOut = await ledgerHasOrderOutMovement(businessOrderId);
      if (inventoryDoneFlag || hasLedgerOut) {
        inventoryDoneFlag = true;
        console.log("INVENTORY DEDUCTION SKIPPED_ALREADY_DONE", {
          orderId: businessOrderId,
          reason: hasLedgerOut ? "ledger_ORDER_OUT_present" : "orders.inventory_updated",
        });
      } else if (fetchedLineItems.length) {
        const fulfillTenantId = str(orderRow.tenant_id ?? orderRow.tenantId) || null;
        const stockCheck = await validateOrderLinesInventoryAvailability(
          fulfillTenantId,
          fetchedLineItems
        );
        if (!stockCheck.success) {
          return {
            success: false,
            error: stockCheck.error || "Insufficient inventory to fulfill order",
            data: null,
          };
        }
        await applyLabOrderInventoryDeduction({
          savedLineItems: fetchedLineItems,
          order_id: businessOrderId,
          tenant_id: str(orderRow.tenant_id ?? orderRow.tenantId) || null,
          created_by: str(orderRow.created_by ?? orderRow.createdBy) || null,
        });
        inventoryDoneFlag = Boolean(await ledgerHasOrderOutMovement(businessOrderId));
        if (!inventoryDoneFlag) {
          console.warn(
            "[updateOrderStatusWrite] Fulfilled but no ORDER_OUT ledger rows after deduction attempt:",
            businessOrderId
          );
        }
      } else {
        console.warn("[updateOrderStatusWrite] Fulfilled — no order_items rows:", businessOrderId);
      }

      if (!arDoneFlag && labId && orderAmt > 0) {
        const bump = await bumpArOutstandingForFulfillment({
          lab_id: labId,
          tenant_id: str(orderRow.tenant_id ?? orderRow.tenantId) || null,
          deltaAmount: orderAmt,
        });
        if (bump.success && !bump.skipped) {
          console.log("AR POSTED FOR ORDER", {
            orderId: businessOrderId,
            labId,
            deltaAmount: orderAmt,
          });
          arDoneFlag = true;
        } else if (!bump.skipped) {
          console.warn("[updateOrderStatusWrite] AR bump failed:", bump.error || bump);
        }
      }
    }

    const patch = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };

    if (becomingFulfilled) {
      patch.fulfilled_at = new Date().toISOString();
      patch.inventory_updated = inventoryDoneFlag;
      patch.ar_posted = arDoneFlag;
    }

    if (becomingCancelled) {
      patch.cancelled_at = new Date().toISOString();
    }

    if (note) {
      const mergedNote = appendOrderStatusNote(
        orderRow.notes ?? orderRow.status_notes ?? "",
        nextStatus,
        note
      );
      patch.notes = mergedNote;
      patch.status_notes = mergedNote;
    }

    console.log("ORDER STATUS WRITE PAYLOAD", {
      orderId: oid,
      businessOrderId,
      updateKey,
      updateValue,
      previousStatus: prevNorm,
      patch,
    });

    const { data, error } = await patchOrderRow(updateKey, updateValue, patch);
    if (error) {
      console.warn("[updateOrderStatusWrite] orders update:", error.message);
      return { success: false, error: error.message || "Order status update failed", data: null };
    }

    const saved = Array.isArray(data) ? data[0] : data;
    console.log("SUPABASE ORDER STATUS UPDATED", saved);
    console.log("CROSS MODULE SYNC COMPLETE", {
      orderId: businessOrderId,
      status: nextStatus,
      fulfilmentRan: Boolean(becomingFulfilled),
    });

    return {
      success: true,
      data: {
        order: saved,
        orderId: oid,
        previousStatus: prevNorm,
        orderStatus: nextStatus,
      },
      error: null,
    };
  } catch (err) {
    console.warn("[updateOrderStatusWrite] failed:", err?.message || err);
    return { success: false, error: err?.message || String(err), data: null };
  }
}

// ---------------------------------------------------------------------------
// Operations Center (HQ admin) — agents, platform users, lab assignment
// ---------------------------------------------------------------------------

function mapUsersTableAgentRow(row) {
  return {
    id: str(row.id),
    agentId: str(row.user_code),
    name: str(row.user_name),
    email: str(row.email),
    phone: str(row.lab_id),
    active: row.active !== false,
    createdAt: row.created_at,
    tenantId: str(row.tenant_id),
  };
}

function mapProfilesPlatformUserRow(row, directory = null) {
  const role = str(row.role).toLowerCase();
  const profileEmail = str(row.email);
  return {
    user_id: str(row.user_id),
    display_name: str(row.display_name),
    agent_name: str(row.agent_name),
    user_name: str(directory?.user_name),
    username: str(row.username),
    profile_email: profileEmail,
    phone: str(row.phone),
    role,
    active: row.active !== false,
    created_at: row.created_at,
    tenant_id: str(row.tenant_id),
    agent_id: str(row.agent_id),
    lab_id: str(row.lab_id),
    distributor_id: str(row.distributor_id),
    territory: str(row.territory),
  };
}

const PROFILES_IDENTITY_SELECT =
  "user_id, tenant_id, role, username, display_name, agent_name, agent_id, lab_id, distributor_id, territory, active, created_at, email, phone";
const PROFILES_BASE_SELECT =
  "user_id, tenant_id, role, agent_name, agent_id, lab_id, active, created_at";

function buildUserDirectoryIndex(rows = []) {
  const byAuthUserId = new Map();
  for (const row of rows || []) {
    const authUserId = str(row.user_code).toLowerCase();
    if (authUserId) byAuthUserId.set(authUserId, row);
  }
  return byAuthUserId;
}

function resolveDirectoryRowForProfile(profile, byAuthUserId) {
  return byAuthUserId.get(str(profile.user_id).toLowerCase()) || null;
}

async function syncPlatformUserDirectoryRow({
  tenantId,
  userId,
  name,
  email,
  role,
  active = true,
}) {
  if (!supabase) return { success: false, error: "Supabase is not configured" };

  const tid = str(tenantId);
  const uid = str(userId);
  const mail = str(email);
  if (!tid || !uid) return { success: false, error: "Tenant and user id are required" };
  if (!mail) return { success: false, error: "Email is required" };

  const row = {
    tenant_id: tid,
    user_code: uid,
    user_name: str(name) || mail.split("@")[0],
    email: mail,
    role: directoryRoleFromPlatformRole(role),
    active: active !== false,
  };

  const { data: existing, error: lookupErr } = await supabase
    .from("users")
    .select("id")
    .eq("tenant_id", tid)
    .eq("user_code", uid)
    .maybeSingle();

  if (lookupErr) {
    return { success: false, error: lookupErr.message || "Failed to look up user directory row" };
  }

  if (existing?.id) {
    const { error } = await supabase.from("users").update(row).eq("id", existing.id);
    if (error) return { success: false, error: error.message || "Failed to update user directory row" };
    return { success: true };
  }

  const { error } = await supabase.from("users").insert([row]);
  if (error) return { success: false, error: error.message || "Failed to create user directory row" };
  return { success: true };
}

export async function getOperationsOperationalAgentsRead(options = {}) {
  traceSupabaseRead("OperationsCenter.getOperationsOperationalAgentsRead", { table: "users" });
  if (!supabase) return { success: false, error: "Supabase is not configured", data: { agents: [] } };

  const tenantId = str(options.tenantId ?? options.tenant_id);
  if (!tenantId) return { success: false, error: "Tenant is required", data: { agents: [] } };

  const { data, error } = await supabase
    .from("users")
    .select("id, tenant_id, user_code, user_name, email, lab_id, role, active, created_at")
    .eq("tenant_id", tenantId)
    .order("user_name", { ascending: true });

  if (error) {
    return {
      success: false,
      error: error.message || "Failed to load operational agents",
      data: { agents: [] },
    };
  }

  const agents = (data || [])
    .filter((row) => str(row.role).toLowerCase() === "agent")
    .map(mapUsersTableAgentRow);

  return { success: true, data: { agents } };
}

/** @deprecated Use platform profiles via loadOperationsCenterAdminBundle */
export async function getOperationsAgentsRead(options = {}) {
  return getOperationsOperationalAgentsRead(options);
}

export async function createOperationsAgentWrite(payload = {}) {
  if (!supabase) return { success: false, error: "Supabase is not configured" };

  const tenantId = str(payload.tenantId ?? payload.tenant_id);
  const agentId = str(payload.agentId ?? payload.agent_id ?? payload.userCode);
  const name = str(payload.name ?? payload.userName);
  const email = str(payload.email);
  const phone = str(payload.phone);

  if (!tenantId) return { success: false, error: "Tenant is required" };
  if (!agentId) return { success: false, error: "Agent ID is required" };
  if (!name) return { success: false, error: "Agent name is required" };

  const row = {
    tenant_id: tenantId,
    user_code: agentId,
    user_name: name,
    email: email || null,
    lab_id: phone || null,
    role: "AGENT",
    active: payload.active !== false,
  };

  const { data, error } = await supabase.from("users").insert([row]).select().single();
  if (error) return { success: false, error: error.message || "Failed to create agent" };

  return { success: true, data: mapUsersTableAgentRow(data) };
}

export async function updateOperationsAgentWrite(agentRowId, payload = {}) {
  if (!supabase) return { success: false, error: "Supabase is not configured" };

  const id = str(agentRowId ?? payload.id);
  const tenantId = str(payload.tenantId ?? payload.tenant_id);
  if (!id) return { success: false, error: "Agent record id is required" };
  if (!tenantId) return { success: false, error: "Tenant is required" };

  if (payload.source === "profile" || payload.userId || id.includes("-")) {
    return updateOperationsPlatformUserWrite(payload.userId || id, {
      tenantId,
      displayName: str(payload.name ?? payload.userName),
      agentId: str(payload.agentId ?? payload.agent_id),
      email: str(payload.email),
      phone: str(payload.phone),
      role: "agent",
    });
  }

  const patch = {
    user_name: str(payload.name ?? payload.userName),
    email: str(payload.email) || null,
    lab_id: str(payload.phone) || null,
  };

  const { data, error } = await supabase
    .from("users")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) return { success: false, error: error.message || "Failed to update agent" };
  if (str(data?.role).toLowerCase() !== "agent") {
    return { success: false, error: "Record is not an agent" };
  }
  return { success: true, data: mapUsersTableAgentRow(data) };
}

export async function setOperationsAgentActiveWrite(agentRowId, active, options = {}) {
  if (!supabase) return { success: false, error: "Supabase is not configured" };

  const id = str(agentRowId);
  const tenantId = str(options.tenantId ?? options.tenant_id);
  if (!id || !tenantId) return { success: false, error: "Agent id and tenant are required" };

  if (options.source === "profile" || id.includes("-")) {
    return setOperationsPlatformUserActiveWrite(id, active, { tenantId });
  }

  const { data, error } = await supabase
    .from("users")
    .update({ active: Boolean(active) })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message || `Failed to ${active ? "enable" : "disable"} agent` };
  }

  if (str(data?.role).toLowerCase() !== "agent") {
    return { success: false, error: "Record is not an agent" };
  }

  return { success: true, data: mapUsersTableAgentRow(data) };
}

export async function getOperationsPlatformUsersRead(options = {}) {
  traceSupabaseRead("OperationsCenter.getOperationsPlatformUsersRead", { table: "profiles" });
  if (!supabase) return { success: false, error: "Supabase is not configured", data: { users: [] } };

  const tenantId = str(options.tenantId ?? options.tenant_id);
  if (!tenantId) return { success: false, error: "Tenant is required", data: { users: [] } };

  const [{ data, error }, directoryRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(PROFILES_IDENTITY_SELECT)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false }),
    supabase
      .from("users")
      .select("user_code, user_name, email, role, active")
      .eq("tenant_id", tenantId),
  ]);

  if (error) {
    const missingIdentityColumn = /display_name|username|profiles.*email|column.*email|column.*phone|distributor_id|territory/i.test(
      error.message || ""
    );
    if (missingIdentityColumn) {
      const fallback = await supabase
        .from("profiles")
        .select(PROFILES_BASE_SELECT)
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (fallback.error) {
        return {
          success: false,
          error: fallback.error.message || "Failed to load platform users",
          data: { users: [] },
        };
      }
      const directoryByAuthUserId = buildUserDirectoryIndex(directoryRes?.data);
      const users = (fallback.data || []).map((profile) => {
        const directory = resolveDirectoryRowForProfile(profile, directoryByAuthUserId);
        return mapProfilesPlatformUserRow(profile, directory);
      });
      return { success: true, data: { users } };
    }
    return { success: false, error: error.message || "Failed to load platform users", data: { users: [] } };
  }

  const directoryByAuthUserId = buildUserDirectoryIndex(directoryRes?.data);

  const users = (data || []).map((profile) => {
    const directory = resolveDirectoryRowForProfile(profile, directoryByAuthUserId);
    return mapProfilesPlatformUserRow(profile, directory);
  });

  return { success: true, data: { users } };
}

export async function createOperationsPlatformUserWrite(payload = {}) {
  if (!supabase) return { success: false, error: "Supabase is not configured" };

  const tenantId = str(payload.tenantId ?? payload.tenant_id);
  const userId = str(payload.userId ?? payload.user_id);
  const role = str(payload.role).toLowerCase();
  const name = str(payload.displayName ?? payload.name ?? payload.agentName);
  const username = str(payload.username).toLowerCase();
  const email = str(payload.email);
  const phone = str(payload.phone);
  const agentId = str(payload.agentId ?? payload.agent_id);
  const labId = str(payload.labId ?? payload.lab_id);

  if (!tenantId) return { success: false, error: "Tenant is required" };
  if (!userId) {
    return {
      success: false,
      error: "Supabase Auth user ID is required. Create the user in Supabase Auth first.",
    };
  }
  if (!username) return { success: false, error: "Username is required" };
  if (!email) return { success: false, error: "Email is required" };
  if (!name) return { success: false, error: "Full name is required" };
  if (!role || !["admin", "executive", "agent", "lab", "distributor_admin"].includes(role)) {
    return { success: false, error: "A valid role is required" };
  }

  const row = {
    user_id: userId,
    tenant_id: tenantId,
    role,
    username,
    display_name: name || null,
    agent_name: role === "agent" ? name || null : null,
    email: email || null,
    phone: phone || null,
    agent_id: role === "agent" ? agentId || null : null,
    lab_id: role === "lab" ? normalizeLabIdKey(labId) || null : null,
    distributor_id:
      role === "distributor_admin"
        ? str(payload.distributorId ?? payload.distributor_id) || null
        : null,
    territory: str(payload.territory) || null,
    active: payload.active !== false,
  };

  const { data, error } = await supabase.from("profiles").insert([row]).select().single();
  if (error) return { success: false, error: error.message || "Failed to create platform user profile" };

  const directoryRes = await syncPlatformUserDirectoryRow({
    tenantId,
    userId,
    name,
    email,
    role,
    active: payload.active !== false,
  });
  if (!directoryRes?.success) {
    return {
      success: false,
      error: directoryRes.error || "Profile created but user directory sync failed",
    };
  }

  return {
    success: true,
    data: mapProfilesPlatformUserRow(data, {
      user_name: name || email.split("@")[0],
      email,
    }),
  };
}

export async function updateOperationsPlatformUserWrite(userId, payload = {}) {
  if (!supabase) return { success: false, error: "Supabase is not configured" };

  const uid = str(userId ?? payload.userId ?? payload.user_id);
  const tenantId = str(payload.tenantId ?? payload.tenant_id);
  if (!uid) return { success: false, error: "User id is required" };
  if (!tenantId) return { success: false, error: "Tenant is required" };

  const role = str(payload.role).toLowerCase();
  const name = str(payload.displayName ?? payload.name ?? payload.agentName);
  const username = str(payload.username).toLowerCase();
  const email = str(payload.email);
  const phone = str(payload.phone);
  const patch = {
    display_name: name || null,
  };
  if (username) patch.username = username;
  if (role === "agent") patch.agent_name = name || null;
  if (email) patch.email = email;
  if (phone) patch.phone = phone;
  if (payload.active !== undefined) patch.active = payload.active !== false;
  if (role && ["admin", "executive", "agent", "lab", "distributor_admin"].includes(role)) {
    patch.role = role;
    if (role === "agent") patch.agent_id = str(payload.agentId ?? payload.agent_id) || null;
    if (role === "lab") patch.lab_id = normalizeLabIdKey(payload.labId ?? payload.lab_id) || null;
    if (role === "distributor_admin") {
      patch.distributor_id = str(payload.distributorId ?? payload.distributor_id) || null;
    }
  }
  if (payload.territory !== undefined) patch.territory = str(payload.territory) || null;

  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("user_id", uid)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) return { success: false, error: error.message || "Failed to update platform user" };

  if (email) {
    const directoryRes = await syncPlatformUserDirectoryRow({
      tenantId,
      userId: uid,
      name,
      email,
      role: role || data.role,
      active: payload.active !== undefined ? payload.active !== false : data.active !== false,
    });
    if (!directoryRes?.success) {
      return {
        success: false,
        error: directoryRes.error || "Profile updated but user directory sync failed",
      };
    }
  }

  const directory = email
    ? { user_name: name || email.split("@")[0], email }
    : name
      ? { user_name: name, email: str(data.email) }
      : null;
  return { success: true, data: mapProfilesPlatformUserRow(data, directory) };
}

export async function setOperationsPlatformUserActiveWrite(userId, active, options = {}) {
  if (!supabase) return { success: false, error: "Supabase is not configured" };

  const uid = str(userId);
  const tenantId = str(options.tenantId ?? options.tenant_id);
  if (!uid || !tenantId) return { success: false, error: "User id and tenant are required" };

  const { data, error } = await supabase
    .from("profiles")
    .update({ active: Boolean(active) })
    .eq("user_id", uid)
    .eq("tenant_id", tenantId)
    .select()
    .single();

  if (error) {
    return {
      success: false,
      error: error.message || `Failed to ${active ? "enable" : "disable"} user`,
    };
  }
  return { success: true, data: mapProfilesPlatformUserRow(data) };
}

export async function getOperationsDistributorsRead() {
  traceSupabaseRead("OperationsCenter.getOperationsDistributorsRead", { table: "tenants" });
  if (!supabase) return { success: false, error: "Supabase is not configured", data: { distributors: [] } };

  const { data, error } = await supabase
    .from("tenants")
    .select("id, tenant_code, tenant_name, status")
    .order("tenant_name", { ascending: true });

  if (error) {
    return { success: false, error: error.message || "Failed to load distributors", data: { distributors: [] } };
  }

  return { success: true, data: { distributors: data || [] } };
}

export async function getOperationsDistributorAssignmentsRead(options = {}) {
  traceSupabaseRead("OperationsCenter.getOperationsDistributorAssignmentsRead", {
    table: "agent_distributor_assignments",
  });
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: { distributors: [] } };
  }

  const tenantId = str(options.tenantId ?? options.tenant_id);
  if (!tenantId) return { success: false, error: "Tenant is required", data: { distributors: [] } };

  const [distributorsRes, assignmentsRes, labsRes] = await Promise.all([
    getOperationsDistributorsRead(),
    supabase
      .from("agent_distributor_assignments")
      .select("id, tenant_id, distributor_id, agent_user_id, agent_name, active, created_at, updated_at")
      .eq("tenant_id", tenantId)
      .eq("active", true),
    getLabsCredit(),
  ]);

  if (!distributorsRes?.success) {
    return {
      success: false,
      error: distributorsRes.error || "Failed to load distributors",
      data: { distributors: [] },
    };
  }

  const assignmentsByDistributor = new Map();
  if (!assignmentsRes.error) {
    for (const row of assignmentsRes.data || []) {
      assignmentsByDistributor.set(str(row.distributor_id), row);
    }
  }

  const labCountByDistributor = new Map();
  for (const lab of labsRes?.data || []) {
    const key = str(lab.tenantId);
    if (!key) continue;
    labCountByDistributor.set(key, (labCountByDistributor.get(key) || 0) + 1);
  }

  const distributors = (distributorsRes.data?.distributors || []).map((tenant) => {
    const assignment = assignmentsByDistributor.get(str(tenant.id)) || null;
    return {
      distributorId: str(tenant.id),
      distributorCode: str(tenant.tenant_code),
      distributorName: str(tenant.tenant_name),
      status: str(tenant.status) || "ACTIVE",
      tenantId,
      assignmentId: str(assignment?.id),
      assignedAgentUserId: str(assignment?.agent_user_id),
      assignedAgentName: str(assignment?.agent_name),
      labCount: labCountByDistributor.get(str(tenant.id)) || 0,
    };
  });

  const assignmentError = assignmentsRes.error?.message || "";
  const missingTable = /agent_distributor_assignments|relation.*does not exist/i.test(assignmentError);

  return {
    success: true,
    data: { distributors },
    warning: missingTable
      ? "Distributor assignments table not migrated yet. Run operations_center_agent_distributor_assignments_migration.sql."
      : assignmentsRes.error
        ? assignmentError
        : null,
  };
}

export async function updateDistributorAgentAssignmentWrite(payload = {}) {
  if (!supabase) return { success: false, error: "Supabase is not configured" };

  const tenantId = str(payload.tenantId ?? payload.tenant_id);
  const distributorId = str(payload.distributorId ?? payload.distributor_id);
  const agentUserId = str(payload.agentUserId ?? payload.agent_user_id ?? payload.userId);
  const agentName = str(payload.agentName ?? payload.agent_name);
  const remove = payload.remove === true || (!agentUserId && !agentName);

  if (!tenantId) return { success: false, error: "Tenant is required" };
  if (!distributorId) return { success: false, error: "Distributor is required" };

  if (remove) {
    const { error } = await supabase
      .from("agent_distributor_assignments")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("distributor_id", distributorId)
      .eq("active", true);
    if (error) {
      return { success: false, error: error.message || "Failed to remove distributor assignment" };
    }
    return { success: true, data: { distributorId, removed: true } };
  }

  if (!agentUserId) return { success: false, error: "Agent user id is required" };

  const { data: existing, error: lookupErr } = await supabase
    .from("agent_distributor_assignments")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("distributor_id", distributorId)
    .eq("active", true)
    .maybeSingle();

  if (lookupErr) {
    return { success: false, error: lookupErr.message || "Failed to look up distributor assignment" };
  }

  const row = {
    tenant_id: tenantId,
    distributor_id: distributorId,
    agent_user_id: agentUserId,
    agent_name: agentName || null,
    active: true,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { data, error } = await supabase
      .from("agent_distributor_assignments")
      .update(row)
      .eq("id", existing.id)
      .select()
      .single();
    if (error) return { success: false, error: error.message || "Failed to update distributor assignment" };
    return { success: true, data };
  }

  const { data, error } = await supabase
    .from("agent_distributor_assignments")
    .insert([{ ...row, created_at: new Date().toISOString() }])
    .select()
    .single();
  if (error) return { success: false, error: error.message || "Failed to assign distributor agent" };
  return { success: true, data };
}

export async function getOperationsLabAssignmentsRead(options = {}) {
  const opsTenantId = str(options.tenantId ?? options.tenant_id);
  const res = await getLabsCredit();
  if (!res?.success) {
    return { success: false, error: res?.error || "Failed to load labs", data: { labs: [] } };
  }

  let labs = Array.isArray(res.data) ? res.data : [];

  const tenantsRes = await getOperationsDistributorsRead();
  const tenantNameById = new Map();
  if (tenantsRes?.success) {
    for (const t of tenantsRes.data?.distributors || []) {
      tenantNameById.set(str(t.id), str(t.tenant_name));
    }
  }

  labs.sort((a, b) =>
    str(a.labName ?? a.lab_name).localeCompare(str(b.labName ?? b.lab_name), undefined, {
      sensitivity: "base",
    })
  );

  return {
    success: true,
    data: {
      labs: labs.map((lab) => ({
        ...lab,
        tenantName: tenantNameById.get(str(lab.tenantId)) || str(lab.tenantId),
      })),
      opsTenantId,
    },
  };
}

export async function updateLabAgentAssignmentWrite(payload = {}) {
  if (!supabase) return { success: false, error: "Supabase is not configured" };

  const tenantId = str(payload.tenantId ?? payload.tenant_id);
  const labId = normalizeLabIdKey(payload.labId ?? payload.lab_id);
  const agentId = str(payload.agentId ?? payload.agent_id ?? payload.assignedAgentId);
  const agentName = str(payload.agentName ?? payload.agent_name ?? payload.assignedAgent);
  const remove = payload.remove === true || (!agentId && !agentName);

  if (!tenantId) return { success: false, error: "Tenant is required" };
  if (!labId) return { success: false, error: "Lab ID is required" };

  const patch = remove
    ? { assigned_agent_id: null, agent_id: null, agent_name: null }
    : {
        assigned_agent_id: agentId || null,
        agent_id: agentId || null,
        agent_name: agentName || null,
      };

  if (!remove && !agentId) {
    return { success: false, error: "Agent ID is required to assign a lab" };
  }

  const { data, error } = await supabase
    .from("labs")
    .update(patch)
    .eq("tenant_id", tenantId)
    .eq("lab_id", labId)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message || "Failed to update lab assignment" };
  }

  return {
    success: true,
    data: {
      labId,
      labName: str(data.lab_name),
      assignedAgentId: str(data.assigned_agent_id ?? data.agent_id),
      assignedAgentName: str(data.agent_name),
      tenantId,
    },
  };
}

export async function transferLabAssignmentWrite(payload = {}) {
  if (!supabase) return { success: false, error: "Supabase is not configured" };

  const hqTenantId = str(payload.hqTenantId ?? payload.tenantId ?? payload.tenant_id);
  const labTenantId = str(payload.labTenantId ?? payload.lab_tenant_id);
  const labId = normalizeLabIdKey(payload.labId ?? payload.lab_id);
  const fromAgentId = str(payload.fromAgentId ?? payload.from_agent_id);
  const fromAgentName = str(payload.fromAgentName ?? payload.from_agent_name);
  const toAgentId = str(payload.toAgentId ?? payload.to_agent_id ?? payload.agentId);
  const toAgentName = str(payload.toAgentName ?? payload.to_agent_name ?? payload.agentName);
  const reason = str(payload.reason);
  const subjectUserId = str(payload.subjectUserId ?? payload.subject_user_id);

  if (!labTenantId) return { success: false, error: "Lab tenant is required" };
  if (!labId) return { success: false, error: "Lab ID is required" };
  if (!toAgentId) return { success: false, error: "New agent is required" };

  const assignRes = await updateLabAgentAssignmentWrite({
    tenantId: labTenantId,
    labId,
    agentId: toAgentId,
    agentName: toAgentName,
  });
  if (!assignRes?.success) return assignRes;

  const { insertLabAssignmentHistoryWrite, insertProvisioningEventWrite } = await import(
    "@/api/userProvisioningApi.js"
  );

  const historyRes = await insertLabAssignmentHistoryWrite({
    hqTenantId,
    labTenantId,
    labId,
    fromAgentId,
    fromAgentName,
    toAgentId,
    toAgentName,
    reason,
  });
  if (!historyRes?.success) {
    return {
      success: false,
      error: historyRes.error || "Lab updated but history write failed",
      data: assignRes.data,
    };
  }

  if (subjectUserId) {
    await insertProvisioningEventWrite({
      tenantId: hqTenantId,
      subjectUserId,
      eventType: "lab_transferred",
      payload: {
        labId,
        labTenantId,
        fromAgentId,
        fromAgentName,
        toAgentId,
        toAgentName,
        reason,
      },
    });
  }

  return { success: true, data: assignRes.data };
}

export function getPasswordResetRedirectUrl() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/reset-password`;
  }
  return undefined;
}

/** Resolve username or email to auth email for sign-in (profiles.username → profiles.email). */
export async function resolveLoginEmailForAuth(identifier) {
  if (!supabase) return { success: false, error: "Supabase is not configured" };

  const loginId = str(identifier);
  if (!loginId) return { success: false, error: "Username or email is required" };

  if (loginId.includes("@")) {
    return { success: true, email: loginId };
  }

  const { data, error } = await supabase.rpc("resolve_login_email", { identifier: loginId });
  if (error) {
    return { success: false, error: error.message || "Failed to resolve login identifier" };
  }
  const email = str(data);
  if (!email) {
    return { success: false, error: "Invalid username or email" };
  }
  return { success: true, email };
}

export async function requestPlatformUserPasswordReset(email) {
  if (!supabase) {
    return { success: false, error: "Supabase is not configured" };
  }

  const mail = str(email);
  if (!mail) {
    return { success: false, error: "Email is required" };
  }

  const redirectTo = getPasswordResetRedirectUrl();

  const { error } = await supabase.auth.resetPasswordForEmail(mail, {
    ...(redirectTo ? { redirectTo } : {}),
  });

  if (error) {
    return { success: false, error: error.message || "Failed to send reset link" };
  }

  return { success: true };
}
