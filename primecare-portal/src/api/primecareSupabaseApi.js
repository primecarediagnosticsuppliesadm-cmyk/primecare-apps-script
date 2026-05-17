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
import {
  buildOrdersByLabDateIndex,
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
 * Derives display payment status from AR + payment totals.
 * Avoids "Paid" when nothing was ever paid and outstanding is zero.
 */
export function deriveCollectionPaymentStatus({
  outstandingAmount,
  totalPaid,
  explicitStatus = "",
}) {
  const outstanding = num(outstandingAmount);
  const paid = num(totalPaid);
  const explicit = str(explicitStatus).trim();
  const explicitLower = explicit.toLowerCase();

  let derived;
  if (outstanding > 0) {
    derived = paid > 0 ? "Partially Paid" : "Pending";
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

  console.log("COLLECTION STATUS DERIVED", {
    outstanding,
    totalPaid: paid,
    explicitStatus: explicit || null,
    derived,
  });

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
    .select("product_id,product_name,current_stock,min_stock,reorder_qty,reorder_status");
}

/**
 * Lab order catalog from Supabase. Prefers `v_lab_catalog` when present, otherwise
 * reads `inventory` directly. Shape matches legacy getLabCatalog payload.
 */
export async function getLabCatalogRead() {
  traceSupabaseRead("LabOrdering.getLabCatalogRead", {
    tables: ["v_lab_catalog", "inventory"],
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

    const products = (data || [])
      .map(mapLabCatalogRow)
      .filter((item) => item.productId)
      .sort((a, b) => {
        if (a.canOrder !== b.canOrder) return a.canOrder ? -1 : 1;
        return a.productName.localeCompare(b.productName);
      });

    console.log("SUPABASE LAB CATALOG", {
      source,
      count: products.length,
      products,
    });

    return { success: true, data: { products, source }, error: null };
  } catch (err) {
    console.warn("[getLabCatalogRead] failed:", err?.message || err);
    return { success: false, error: err?.message || String(err), data: { products: [] } };
  }
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
    labId: normalizeLabIdKey(row.lab_id ?? row.labId ?? row.Lab_ID),
    labName: str(row.lab_name ?? row.labName ?? row.Lab_Name),
    ownerName: str(row.owner_name ?? row.ownerName ?? row.Owner_Name),
    phone: str(row.phone ?? row.Phone ?? row.phone_number ?? row.phoneNumber),
    area: str(row.area ?? row.Area),
    assignedAgent: str(
      row.assigned_agent ?? row.assignedAgent ?? row.Assigned_Agent ?? row.agent_name
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
  const explicitPaymentStatus = str(
    rawRow.payment_status ?? rawRow.paymentStatus ?? rawRow.ar_payment_status ?? ""
  );

  const outstandingAmount = m.outstandingAmount;
  const totalPaid = num(rawRow.total_paid ?? rawRow.totalPaid ?? 0);
  const paymentStatus = deriveCollectionPaymentStatus({
    outstandingAmount,
    totalPaid,
    explicitStatus: explicitPaymentStatus,
  });

  return {
    labId: normalizeLabIdKey(m.labId),
    labName: m.labName,
    assignedAgent: cleanCollectionAgentName(m.assignedAgent),
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
    explicitStatus: arRow.payment_status ?? arRow.paymentStatus ?? "",
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

  return {
    labId,
    labName,
    assignedAgent,
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

    const arSel = await supabase.from("ar_credit_control").select("*").eq("lab_id", lab_id).limit(1);

    if (arSel.error) {
      console.warn("[createPaymentWrite] ar_credit_control select:", arSel.error.message);
      return { success: false, error: arSel.error.message || "AR read failed", data: null };
    }

    const arRow = Array.isArray(arSel.data) && arSel.data[0];
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
      tenant_id,
      order_id,
      lab_id,
      amount_received,
      payment_date,
      mode,
      outstanding_balance: new_outstanding,
      created_at,
    };

    console.log("PAYMENT WRITE PAYLOAD", writePayload);
    console.log("AR BEFORE PAYMENT", arRow || { lab_id, total_paid: old_total_paid, outstanding: old_outstanding });

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
    console.log("SUPABASE PAYMENT SAVED", savedPay);

    const arPatch = {
      total_paid: new_total_paid,
      outstanding: new_outstanding,
      updated_at: new Date().toISOString(),
    };

    const arUpd = await supabase.from("ar_credit_control").update(arPatch).eq("lab_id", lab_id);

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

    console.log("AR AFTER PAYMENT", { lab_id, ...arPatch });

    return {
      success: true,
      data: { payment: savedPay, ar: { lab_id, ...arPatch } },
      error: null,
    };
  } catch (err) {
    console.warn("[createPaymentWrite] failed:", err?.message || err);
    return { success: false, error: err?.message || String(err), data: null };
  }
}

/**
 * Read-only collections: `ar_credit_control` (outstanding, total_paid) + `payments` (today's total),
 * enriched from `v_labs_credit` when present. Never throws.
 */
export async function getCollectionsRead() {
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
    console.log("COLLECTION RAW AR", arRaw ?? []);

    const { data: payRaw, error: payErr } = await supabase.from("payments").select("*");
    if (payErr) {
      console.warn("[getCollectionsRead] payments:", payErr.message);
    }
    console.log("COLLECTION RAW PAYMENTS", payRaw ?? []);
    const { byLab: paymentsByLab, casingVariants } = buildPaymentsByNormalizedLabId(payRaw);
    if (casingVariants.length) {
      console.warn("COLLECTION PAYMENT LAB_ID CASING VARIANTS", casingVariants.slice(0, 10));
    }

    const todayPaymentRows = (payRaw || []).filter((p) => {
      const d = str(p.payment_date ?? p.paymentDate ?? p.collected_at ?? "").slice(0, 10);
      return d === today;
    });
    const todayCollections = sumTodayPayments(payRaw);
    console.log("SUPABASE PAYMENTS TODAY", {
      today,
      count: todayPaymentRows.length,
      rows: todayPaymentRows,
      total: todayCollections,
    });

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
              explicitStatus: mapped.paymentStatus,
            });
          }
          return mapped;
        })
        .filter((c) => c.labId && hasCollectionArRelevance(c));
    }

    auditCollectionDataInconsistencies(arRaw, payRaw, collections);

    const summary = summarizeCollectionsList(collections, todayCollections);
    console.log("SUPABASE COLLECTIONS SUMMARY", summary);

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

    const eqOnly = (payRaw || []).filter(
      (p) => str(p.lab_id ?? p.labId) === labKey
    );

    console.log("COLLECTION HISTORY MATCH", {
      requestedLabId: labId,
      normalizedLabId: labKey,
      matchedByNormalizedKey: matchedRaw.length,
      matchedByStrictEq: eqOnly.length,
      orderIdNullCount: matchedRaw.filter((p) => !str(p.order_id ?? p.orderId)).length,
      latestPaymentDate: matchedRaw[0]?.payment_date ?? matchedRaw[0]?.created_at ?? null,
    });

    const history = matchedRaw.map(mapPaymentHistoryRow).filter((h) => h.amountCollected > 0);
    console.log("COLLECTION HISTORY SUPABASE", {
      labId: labKey,
      count: history.length,
      history,
    });
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
        console.log("COLLECTION DETAIL SUPABASE", {
          labId: labKey,
          source: "v_labs_credit_only",
          collection,
        });
        return { success: true, data: { collection } };
      }
      console.log("COLLECTION DETAIL SUPABASE", { labId: labKey, source: "none", collection: null });
      return { success: true, data: { collection: null } };
    }

    const collection = buildCollectionDetailFromSources(arRow, labsCreditRow, paymentsForLab || []);
    console.log("COLLECTION DETAIL SUPABASE", {
      labId: labKey,
      source: "ar_credit_control",
      collection,
    });
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

    const arSel = await supabase.from("ar_credit_control").select("*").eq("lab_id", lab_id).limit(1);
    if (arSel.error) {
      console.warn("[updateCollectionNotesWrite] ar_credit_control select:", arSel.error.message);
      return { success: false, error: arSel.error.message, data: null };
    }

    const arRow = Array.isArray(arSel.data) && arSel.data[0];
    if (!arRow) {
      return { success: false, error: `Lab not found in ar_credit_control: ${lab_id}`, data: null };
    }

    const outstandingAmount = num(
      arRow.outstanding ?? arRow.outstanding_amount ?? arRow.outstandingAmount ?? arRow.balance ?? 0
    );
    const totalPaid = num(arRow.total_paid ?? arRow.totalPaid ?? arRow.amount_paid ?? 0);
    const patch = {
      updated_at: new Date().toISOString(),
      payment_status: deriveCollectionPaymentStatus({
        outstandingAmount,
        totalPaid,
        explicitStatus: arRow.payment_status ?? arRow.paymentStatus ?? "",
      }),
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

    console.log("COLLECTION NOTES WRITE PAYLOAD", {
      lab_id,
      note,
      next_follow_up_date: next_follow_up_date || null,
      next_action: next_action || null,
      patch,
    });

    const arUpd = await supabase
      .from("ar_credit_control")
      .update(patch)
      .eq("lab_id", lab_id)
      .select();

    if (arUpd.error) {
      console.warn("[updateCollectionNotesWrite] ar_credit_control update:", arUpd.error.message);
      return { success: false, error: arUpd.error.message, data: null };
    }

    const saved = Array.isArray(arUpd.data) ? arUpd.data[0] : arUpd.data;
    console.log("SUPABASE COLLECTION NOTES SAVED", saved);

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
  console.log("RECENT VISIT RAW", rawRow ?? visit);

  const storedSold = num(
    rawRow?.sold_value ??
      rawRow?.soldValue ??
      rawRow?.Sold_Value ??
      visit?.soldValue ??
      0
  );

  if (storedSold > 0) {
    const out = {
      soldValue: storedSold,
      showRevenue: true,
      valueSource: "sold_value",
      linkedOrderId: null,
    };
    console.log("RECENT VISIT VALUE SOURCE", out);
    return out;
  }

  const salesLinked = visitIsSalesLinked({ ...visit, soldValue: storedSold });
  const hideByType = visitTypeHidesRevenueByDefault(visit.visitType) && !salesLinked;

  if (hideByType) {
    const out = {
      soldValue: 0,
      showRevenue: false,
      valueSource: "hidden",
      linkedOrderId: null,
    };
    console.log("RECENT VISIT VALUE SOURCE", out);
    return out;
  }

  if (salesLinked) {
    const linked = findBestLinkedOrderForVisit(visit, ordersByLabDate);
    if (linked) {
      console.log("RECENT VISIT LINKED ORDER", linked);
      const out = {
        soldValue: num(linked.amount),
        showRevenue: true,
        valueSource: "linked_order",
        linkedOrderId: linked.orderId || null,
      };
      console.log("RECENT VISIT VALUE SOURCE", out);
      return out;
    }
  }

  const out = {
    soldValue: 0,
    showRevenue: false,
    valueSource: "none",
    linkedOrderId: null,
  };
  console.log("RECENT VISIT VALUE SOURCE", out);
  return out;
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

/**
 * Admin dashboard aggregates from Supabase: orders, AR, inventory, visits, payments.
 * Never throws.
 */
export async function getAdminDashboardRead() {
  traceSupabaseRead("AdminDashboard.getAdminDashboardRead", {
    tables: ["orders", "order_items", "ar_credit_control", "inventory", "agent_visits", "payments", "labs"],
  });
  if (!supabase) {
    return { success: true, data: { ...EMPTY_ADMIN_DASHBOARD } };
  }

  try {
    const today = localDateYmd();

    const [ordersRes, itemsRes, arRes, invRes, visitsRes, payRes, labsRes] = await Promise.all([
      supabase.from("orders").select("*"),
      supabase.from("order_items").select("*"),
      supabase.from("ar_credit_control").select("*"),
      supabase.from("inventory").select("*"),
      supabase.from("agent_visits").select("*"),
      supabase.from("payments").select("*"),
      supabase.from("labs").select("*"),
    ]);

    const ordersRaw = ordersRes.error ? [] : ordersRes.data || [];
    const orderItemsRaw = itemsRes.error ? [] : itemsRes.data || [];
    const arRaw = arRes.error ? [] : arRes.data || [];
    const invRaw = invRes.error ? [] : invRes.data || [];
    const visitsRaw = visitsRes.error ? [] : visitsRes.data || [];
    const payRaw = payRes.error ? [] : payRes.data || [];
    const labsRaw = labsRes.error ? [] : labsRes.data || [];

    if (ordersRes.error) console.warn("[getAdminDashboardRead] orders:", ordersRes.error.message);
    if (itemsRes.error) console.warn("[getAdminDashboardRead] order_items:", itemsRes.error.message);

    if (arRes.error) console.warn("[getAdminDashboardRead] ar_credit_control:", arRes.error.message);
    if (invRes.error) console.warn("[getAdminDashboardRead] inventory:", invRes.error.message);
    if (visitsRes.error) console.warn("[getAdminDashboardRead] agent_visits:", visitsRes.error.message);

    console.log("SUPABASE DASHBOARD RAW ORDERS", ordersRaw);
    console.log("SUPABASE DASHBOARD RAW AR", arRaw);
    console.log("SUPABASE DASHBOARD RAW INVENTORY", invRaw);
    console.log("SUPABASE DASHBOARD RAW VISITS", visitsRaw);

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

    console.log("DASHBOARD SOURCE RECALCULATED", {
      source: "Supabase",
      definitions: {
        revenue: "sum non-Cancelled orders with status=Fulfilled (order_date for today)",
        receivables: "ar_credit_control.outstanding sums",
      },
      todaysRevenue: revenue.todaysRevenue,
      fulfilledTotalAllTimeApprox: revenue.totalSoldValue,
      activeOrdersNonCancelled: revenue.activeOrdersCount,
      fulfilledOrdersForRevenue: revenue.fulfilledOrdersCount,
    });

    const { outstandingReceivables, labsAtCreditRisk } = computeReceivableMetrics(arRaw);

    let stockStats = rollupInventoryTableRows(invRaw);
    if (!invRaw.length) {
      try {
        const stockDash = await getStockDashboard();
        if (stockDash?.data?.stats) stockStats = stockDash.data.stats;
      } catch {
        /* keep empty stats */
      }
    }
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
      recentVisits: visitsRaw.length,
      totalSoldValue: revenue.totalSoldValue,
      todayCollections,
    };

    const dashboardInsights = buildDashboardInsightsFromMetrics({
      ...executive,
      outstandingReceivables,
    });

    const payload = {
      executive,
      summary,
      visits: { visits },
      insights: dashboardInsights,
    };

    logAdminDashboardSupabaseAudit({
      today,
      ordersRaw,
      arRaw,
      orderItemsRawLength: orderItemsRaw.length,
      arRawLength: arRaw.length,
      invRawLength: invRaw.length,
      visitsRawLength: visitsRaw.length,
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

    console.log("SUPABASE DASHBOARD SUMMARY", { executive, summary });

    return { success: true, data: payload };
  } catch (err) {
    console.warn("[getAdminDashboardRead] failed:", err?.message || err);
    return { success: true, data: { ...EMPTY_ADMIN_DASHBOARD } };
  }
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
  const agent = str(row.agent_name ?? row.Agent_Name ?? row.agent ?? row.agentName ?? "");
  return {
    visitId: str(row.visit_id ?? row.id ?? row.Visit_ID ?? ""),
    visitDate: visitDate || created.slice(0, 10),
    labName: str(row.lab_name ?? row.Lab_Name ?? row.labName ?? ""),
    area: str(row.area ?? row.Area ?? ""),
    visitType: str(row.visit_type ?? row.Visit_Type ?? row.visitType ?? ""),
    labResponse: str(row.lab_response ?? row.Lab_Response ?? row.labResponse ?? ""),
    agent,
    agentName: agent,
    labId: labIdKey(row.lab_id ?? row.Lab_ID ?? row.labId ?? ""),
  };
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
 * Inserts one row into `agent_visits` (PrimeCare agent visit log).
 * Maps frontend payload to: tenant_id, visit_id, lab_id, agent_id, visit_date, visit_type,
 * notes, follow_up_required, next_follow_up_date.
 * @returns {{ success: boolean, data?: object, error?: string }}
 */
export async function createAgentVisitWrite(payload = {}) {
  traceSupabaseRead("Visits.createAgentVisitWrite", { table: "agent_visits" });
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: null };
  }

  try {
    let visit_id = str(payload.visitId ?? payload.visit_id);
    if (!visit_id) {
      visit_id = `VIS-${Date.now()}`;
    }

    const tenant_id = str(payload.tenantId ?? payload.tenant_id) || null;
    const lab_id = labIdKey(payload.labId ?? payload.lab_id);
    const agent_id = str(
      payload.agentId ?? payload.agent_id ?? payload.userId ?? payload.agentName ?? ""
    );
    const visit_date = str(payload.visitDate ?? payload.visit_date).slice(0, 10);
    const visit_type = str(payload.visitType ?? payload.visit_type);
    const notesRaw = str(payload.notes);
    const next_follow_up_date = str(
      payload.nextFollowUpDate ?? payload.next_follow_up_date ?? ""
    ).slice(0, 10);
    const labResponse = str(payload.labResponse ?? payload.lab_response);

    if (!lab_id) {
      return { success: false, error: "lab_id is required", data: null };
    }
    if (!visit_date) {
      return { success: false, error: "visit_date is required", data: null };
    }
    if (!visit_type) {
      return { success: false, error: "visit_type is required", data: null };
    }

    const follow_up_required =
      Boolean(next_follow_up_date) || labResponse === "Need Follow-up";

    const sold_value = num(payload.soldValue ?? payload.sold_value ?? 0);
    const lab_name = str(payload.labName ?? payload.lab_name) || null;
    const area = str(payload.area ?? payload.Area) || null;
    const agent_name = str(payload.agentName ?? payload.agent_name ?? agent_id) || null;

    const insertRow = {
      tenant_id,
      visit_id,
      lab_id,
      agent_id: agent_id || null,
      visit_date,
      visit_type,
      notes: notesRaw || null,
      follow_up_required,
      next_follow_up_date: next_follow_up_date || null,
      lab_response: labResponse || null,
      sold_value: sold_value > 0 ? sold_value : null,
      lab_name,
      area,
      agent_name,
    };

    const { data, error } = await supabase.from("agent_visits").insert([insertRow]).select();

    if (error) {
      console.warn("[createAgentVisitWrite]", error.message);
      return { success: false, error: error.message || "Insert failed", data: null };
    }

    const saved = Array.isArray(data) ? data[0] : data;
    console.log("SUPABASE AGENT VISIT SAVED:", saved);
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

    if (!productId) return { success: false, error: "productId is required", data: null };
    if (quantity <= 0) return { success: false, error: "quantity must be greater than zero", data: null };

    const poPayload = {
      po_id: poId,
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

    const invSel = await supabase.from("inventory").select("*").eq("product_id", productId).limit(1);
    if (invSel.error) return { success: false, error: invSel.error.message, data: null };
    const inventoryRow = Array.isArray(invSel.data) && invSel.data[0];
    if (!inventoryRow) return { success: false, error: `Inventory row not found: ${productId}`, data: null };

    const stockBefore = num(inventoryRow.current_stock ?? inventoryRow.currentStock);
    const stockAfter = stockBefore + receivedQty;
    const invUpd = await supabase
      .from("inventory")
      .update({ current_stock: stockAfter, updated_at: new Date().toISOString() })
      .eq("product_id", productId);
    if (invUpd.error) return { success: false, error: invUpd.error.message, data: null };

    const ledgerRow = {
      movement_type: "PURCHASE_IN",
      product_id: productId,
      product_name: productName,
      order_id: id,
      quantity: receivedQty,
      stock_before: stockBefore,
      stock_after: stockAfter,
      tenant_id: str(payload.tenantId ?? payload.tenant_id) || null,
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
 * After `order_items` insert: decrement stock on the inventory table and append ledger rows.
 * Failures are logged only; the caller does not roll back the order.
 */
async function applyLabOrderInventoryDeduction({ savedLineItems, order_id, tenant_id, created_by }) {
  if (!supabase) return;

  const tableName = "inventory";
  console.log("INVENTORY TABLE TARGET", tableName);

  const oid = str(order_id);
  const lines = Array.isArray(savedLineItems) ? savedLineItems : [];
  const ledgerBatch = [];

  for (const line of lines) {
    const product_id = str(line.product_id ?? line.productId ?? "");
    const product_name_line =
      str(line.product_name ?? line.productName ?? "") || null;
    const qty = num(line.quantity);
    if (!product_id || qty <= 0) continue;

    const sel = await supabase.from("inventory").select("*").eq("product_id", product_id).limit(1);

    if (sel.error) {
      console.warn(
        "[createOrderWrite] INVENTORY: product fetch failed — order is NOT rolled back:",
        product_id,
        sel.error.message
      );
      continue;
    }

    const row = Array.isArray(sel.data) && sel.data[0];
    if (!row) {
      console.warn(
        "[createOrderWrite] INVENTORY: no stock row for product — order is NOT rolled back:",
        product_id,
        "table:",
        tableName
      );
      continue;
    }

    const stock_before = num(row.current_stock ?? row.currentStock ?? 0);
    const stock_after = Math.max(0, stock_before - qty);

    console.log("INVENTORY BEFORE UPDATE", {
      table: tableName,
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

    const upd = await supabase.from("inventory").update(updatePatch).eq("product_id", product_id);

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

    console.log("INVENTORY AFTER UPDATE", { product_id, stock_after });

    ledgerBatch.push({
      movement_type: "ORDER_OUT",
      product_id,
      product_name:
        product_name_line || str(row.product_name ?? row.productName ?? "") || null,
      order_id: oid,
      quantity: qty,
      stock_before,
      stock_after,
      tenant_id,
      created_by,
      created_at: new Date().toISOString(),
    });
  }

  if (!ledgerBatch.length) return;

  const led = await createInventoryLedgerWrite(ledgerBatch);
  if (!led.success) {
    console.warn(
      "[createOrderWrite] INVENTORY LEDGER insert failed — stock may already be updated; order is NOT rolled back:",
      led.error
    );
  }
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
      const bump = await bumpArOutstandingForFulfillment({ lab_id, deltaAmount: amt });
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

/**
 * Read-only order list: bare `from("orders").select("*")` (no filters, limits, or ranges).
 * Never throws.
 */
export async function getOrdersRead(_params = {}) {
  void _params;
  traceSupabaseRead("Orders.getOrdersRead", { table: "orders" });
  console.log("SUPABASE URL:", import.meta.env.VITE_SUPABASE_URL);

  if (!supabase) {
    return { success: true, data: { orders: [] } };
  }

  try {
    const { data, error } = await supabase.from("orders").select("*");

    console.log("SUPABASE ORDERS RAW:", data);
    console.log("SUPABASE ORDERS ERROR:", error);

    if (error) {
      return { success: true, data: { orders: [] } };
    }

    const rawList = Array.isArray(data) ? data : [];

    let labMap = new Map();
    try {
      labMap = await fetchLabsNameMap();
    } catch {
      labMap = new Map();
    }

    const orders = rawList.map((r, idx) => {
      const labId = str(r.lab_id ?? r.labId ?? r.lab_uuid ?? r.labUUID ?? "");
      return mapOrderRow(r, labMap.get(labId) || "", idx);
    });

    return { success: true, data: { orders } };
  } catch (err) {
    console.warn("[getOrdersRead] failed:", err?.message || err);
    return { success: true, data: { orders: [] } };
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

async function bumpArOutstandingForFulfillment({ lab_id, deltaAmount }) {
  if (!supabase || !lab_id || num(deltaAmount) <= 0) {
    return { success: true, skipped: true };
  }
  const sid = normalizeLabIdKey(lab_id);
  const sel = await supabase.from("ar_credit_control").select("*").eq("lab_id", sid).limit(1);
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
  let upd = await supabase.from("ar_credit_control").update(patch).eq("lab_id", sid);
  if (!upd.error) return { success: true, skipped: false };
  delete patch.total_delivered;
  upd = await supabase.from("ar_credit_control").update(patch).eq("lab_id", sid);
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
