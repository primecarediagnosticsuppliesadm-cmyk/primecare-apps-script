import { supabase } from "./supabaseClient.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v) {
  return String(v ?? "").trim();
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

function buildStockStats(inventory) {
  return {
    totalSkus: inventory.length,
    criticalItems: inventory.filter((x) => x.stockHealth === "Critical").length,
    reorderItems: inventory.filter((x) => x.stockHealth === "Reorder").length,
    healthyItems: inventory.filter((x) => x.stockHealth === "Healthy").length,
    totalSuggestedOrderQty: inventory.reduce(
      (sum, x) => sum + (x.stockHealth !== "Healthy" ? x.reorderQty : 0),
      0
    ),
  };
}

/**
 * Read-only stock dashboard from Supabase view v_stock_dashboard.
 */
export async function getStockDashboard() {
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

  const stats = buildStockStats(inventory);

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
    labId: str(row.lab_id ?? row.labId ?? row.Lab_ID),
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
  const paymentStatus =
    explicitPaymentStatus || (outstandingAmount > 0 ? "Pending" : "Current");

  return {
    labId: m.labId,
    labName: m.labName,
    assignedAgent: m.assignedAgent,
    outstandingAmount,
    overdueDays: num(m.daysOverdue),
    riskStatus: deriveCollectionRiskStatus(m),
    lastFollowUp: lastFollowUp === "-" ? "" : lastFollowUp,
    nextAction,
    paymentStatus: paymentStatus || "Pending",
    area: m.area,
    creditHold: m.creditHold,
    creditLimit: m.creditLimit,
  };
}

function mergeArCreditOntoCollection(base, arRow) {
  if (!arRow) return base;
  const lf = str(arRow.last_follow_up ?? arRow.lastFollowUp ?? arRow.last_followup ?? "");
  const na = str(arRow.next_action ?? arRow.nextAction ?? "");
  const ps = str(arRow.payment_status ?? arRow.paymentStatus ?? arRow.status ?? "");
  const rs = str(arRow.risk_status ?? arRow.riskStatus ?? "");
  return {
    ...base,
    nextAction: na || base.nextAction,
    lastFollowUp: lf || base.lastFollowUp,
    paymentStatus: ps || base.paymentStatus,
    riskStatus: rs || base.riskStatus,
  };
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
      sum += num(p.amount_collected ?? p.amountCollected ?? p.amount ?? p.payment_amount);
    }
  }
  return sum;
}

function buildCollectionsSummary(collections, todayCollections) {
  const totalOutstanding = collections.reduce((s, c) => s + num(c.outstandingAmount), 0);
  const overdueCount = collections.filter((c) => num(c.overdueDays) > 0).length;
  const highRiskCount = collections.filter(
    (c) => String(c.riskStatus || "").toLowerCase() === "high"
  ).length;
  return {
    totalOutstanding,
    overdueCount,
    highRiskCount,
    todayCollections: num(todayCollections),
  };
}

/**
 * Read-only collections / receivables list: v_labs_credit, merged with ar_credit_control
 * when present; optional payments sum for today's collections.
 * Never throws — returns empty payloads on failure (safe for UI).
 */
export async function getCollectionsRead() {
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
    const { data: labsRaw, error: labsErr } = await supabase.from("v_labs_credit").select("*");
    if (labsErr) {
      console.warn("[getCollectionsRead] v_labs_credit:", labsErr.message);
      return {
        success: true,
        data: {
          summary: { ...EMPTY_COLLECTIONS_SUMMARY },
          collections: [],
        },
      };
    }

    const { data: arRaw, error: arErr } = await supabase.from("ar_credit_control").select("*");
    const arByLab = new Map();
    if (!arErr && Array.isArray(arRaw)) {
      for (const r of arRaw) {
        const id = str(r.lab_id ?? r.labId ?? r.Lab_ID);
        if (id) arByLab.set(id, r);
      }
    } else if (arErr) {
      console.warn("[getCollectionsRead] ar_credit_control:", arErr.message);
    }

    let todayCollections = 0;
    const { data: payRaw, error: payErr } = await supabase.from("payments").select("*");
    if (!payErr && Array.isArray(payRaw)) {
      todayCollections = sumTodayPayments(payRaw);
    } else if (payErr) {
      console.warn("[getCollectionsRead] payments:", payErr.message);
    }

    const collections = (labsRaw || [])
      .map((row) => {
        const base = mapCollectionsRowFromLabsCredit(row);
        const ar = arByLab.get(base.labId);
        return mergeArCreditOntoCollection(base, ar);
      })
      .filter((c) => c.labId);

    const summary = buildCollectionsSummary(collections, todayCollections);

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

/**
 * Maps `orders` row (snake_case) to OrdersPage list/detail header shape.
 */
export function mapOrderRow(row, labNameFallback = "") {
  return {
    orderId: str(row.order_id ?? row.orderId ?? row.id),
    orderDate: str(row.order_date ?? row.orderDate ?? row.created_at ?? "").slice(0, 10),
    labId: str(row.lab_id ?? row.labId ?? ""),
    labName: str(row.lab_name ?? row.labName ?? labNameFallback),
    contactPerson: str(row.contact_person ?? row.contactPerson ?? ""),
    invoiceId: str(row.invoice_id ?? row.invoiceId ?? ""),
    invoiceStatus: str(row.invoice_status ?? row.invoiceStatus ?? ""),
    paymentStatus: str(row.payment_status ?? row.paymentStatus ?? ""),
    orderStatus: str(row.order_status ?? row.orderStatus ?? row.status ?? "Placed"),
    orderTotal: num(row.order_total ?? row.orderTotal ?? row.total ?? row.amount),
    createdAt: str(row.created_at ?? row.createdAt ?? ""),
    notes: str(row.notes ?? row.order_notes ?? ""),
    mobileNumber: str(row.mobile_number ?? row.mobileNumber ?? row.phone ?? row.contact_phone ?? ""),
  };
}

/**
 * Maps `order_lines` row to OrdersPage line item shape.
 */
export function mapOrderLineRow(row) {
  return {
    orderLineId: str(
      row.order_line_id ?? row.orderLineId ?? row.id ?? `${row.product_id ?? row.productId ?? "line"}`
    ),
    orderId: str(row.order_id ?? row.orderId ?? ""),
    productId: str(row.product_id ?? row.productId ?? ""),
    productName: str(row.product_name ?? row.productName ?? ""),
    quantity: num(row.quantity),
    unitSellingPrice: num(
      row.unit_selling_price ?? row.unitSellingPrice ?? row.unit_price ?? row.unitPrice
    ),
    taxAmount: num(row.tax_amount ?? row.taxAmount ?? row.tax ?? 0),
    netLineTotal: num(row.net_line_total ?? row.netLineTotal ?? row.line_total ?? row.lineTotal),
  };
}

async function fetchLabsNameMap() {
  const map = new Map();
  if (!supabase) return map;
  const { data: labsRows, error } = await supabase.from("labs").select("*");
  if (error || !Array.isArray(labsRows)) return map;
  for (const l of labsRows) {
    const id = str(l.lab_id ?? l.labId ?? l.id);
    const name = str(l.lab_name ?? l.labName ?? l.name ?? "");
    if (id) map.set(id, name);
  }
  return map;
}

/**
 * Read-only order list from `orders` (+ optional `labs` for lab name).
 * Filters `status` query param client-side against mapped `orderStatus`.
 * Never throws.
 */
export async function getOrdersRead(params = {}) {
  if (!supabase) {
    return { success: true, data: { orders: [] } };
  }

  try {
    const statusFilter = str(params.status);
    const labMap = await fetchLabsNameMap();

    const { data: rows, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.warn("[getOrdersRead] orders:", error.message);
      return { success: true, data: { orders: [] } };
    }

    let orders = (rows || [])
      .map((r) => {
        const labId = str(r.lab_id ?? r.labId);
        return mapOrderRow(r, labMap.get(labId) || "");
      })
      .filter((o) => o.orderId);

    if (statusFilter) {
      const want = statusFilter.toLowerCase();
      orders = orders.filter((o) => String(o.orderStatus || "").toLowerCase() === want);
    }

    return { success: true, data: { orders } };
  } catch (err) {
    console.warn("[getOrdersRead] failed:", err?.message || err);
    return { success: true, data: { orders: [] } };
  }
}

/**
 * Read-only single order + lines from `orders`, `order_lines`, and `labs`.
 * `orderId` may match `orders.order_id` or `orders.id`.
 * Never throws.
 */
export async function getOrderDetailsRead(orderId) {
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
