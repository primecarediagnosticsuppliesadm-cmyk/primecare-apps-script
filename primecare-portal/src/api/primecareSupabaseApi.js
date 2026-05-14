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
