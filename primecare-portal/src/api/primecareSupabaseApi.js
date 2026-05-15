import { supabase } from "./supabaseClient.js";
import {
  filterCollectionsForUser,
  filterLabsForUser,
  filterVisitsForUser,
} from "@/utils/accessFilters.js";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v) {
  return String(v ?? "").trim();
}

/** Standard lab key for Supabase writes (e.g. LAB_001). */
function normalizeLabIdKey(labId) {
  const s = String(labId ?? "").trim();
  return s ? s.toUpperCase() : "";
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
    labId: normalizeLabIdKey(m.labId),
    labName: m.labName,
    assignedAgent: m.assignedAgent,
    outstandingAmount,
    totalPaid: num(rawRow.total_paid ?? rawRow.totalPaid ?? 0),
    totalDelivered: num(rawRow.total_delivered ?? rawRow.totalDelivered ?? 0),
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

/**
 * Maps `ar_credit_control` row to CollectionsPage shape (Apps Script AR_Credit_Control equivalent).
 * Optional `labsCreditRow` enriches lab name, agent, area from `v_labs_credit`.
 */
export function mapCollectionsRowFromArCredit(arRow, labsCreditRow = null) {
  const m = labsCreditRow ? mapLabsCreditRow(labsCreditRow) : null;
  const labId = normalizeLabIdKey(arRow.lab_id ?? arRow.labId ?? arRow.Lab_ID ?? m?.labId);

  const outstandingAmount = num(
    arRow.outstanding ??
      arRow.outstanding_amount ??
      arRow.outstandingAmount ??
      arRow.balance ??
      0
  );
  const totalPaid = num(
    arRow.total_paid ?? arRow.totalPaid ?? arRow.amount_paid ?? arRow.amountPaid ?? 0
  );
  const totalDelivered = num(arRow.total_delivered ?? arRow.totalDelivered ?? 0);
  const creditLimit = num(arRow.credit_limit ?? arRow.creditLimit ?? m?.creditLimit ?? 0);
  const overdueDays = num(
    arRow.days_overdue ?? arRow.daysOverdue ?? arRow.overdue_days ?? m?.daysOverdue ?? 0
  );
  const creditHold = str(arRow.credit_hold ?? arRow.creditHold ?? m?.creditHold ?? "");

  const labName = str(arRow.lab_name ?? arRow.labName ?? m?.labName ?? labId);
  const assignedAgent = str(
    arRow.assigned_agent ?? arRow.assignedAgent ?? m?.assignedAgent ?? ""
  );
  const area = str(arRow.area ?? m?.area ?? "");

  let riskStatus = str(arRow.risk_status ?? arRow.riskStatus ?? "");
  if (!riskStatus) {
    if (creditHold.toUpperCase() === "HOLD") riskStatus = "High";
    else if (overdueDays > 0 || outstandingAmount > 0) riskStatus = "Medium";
    else riskStatus = "Low";
  }

  let paymentStatus = str(arRow.payment_status ?? arRow.paymentStatus ?? "");
  if (!paymentStatus) {
    if (outstandingAmount <= 0) paymentStatus = "Paid";
    else if (totalPaid > 0) paymentStatus = "Partially Paid";
    else paymentStatus = "Pending";
  }

  const lastFollowUp = str(
    arRow.last_follow_up ??
      arRow.lastFollowUp ??
      arRow.last_followup ??
      arRow.last_follow_up_date ??
      m?.nextFollowUp ??
      ""
  );
  const nextAction = str(
    arRow.next_action ??
      arRow.nextAction ??
      arRow.collections_notes ??
      arRow.collectionsNotes ??
      ""
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
    nextAction,
    paymentStatus,
    area,
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
 * Records a collection payment in `payments` and rolls `ar_credit_control` forward for the lab.
 * Payload: { labId, amountReceived | amountCollected, paymentMode | mode, paymentDate?, orderId?, tenantId?, outstandingBefore?, collectedBy? }
 */
export async function createPaymentWrite(payload = {}) {
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

    const { data: payData, error: payErr } = await supabase.from("payments").insert([paymentRow]).select();

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
    console.log("SUPABASE COLLECTIONS RAW AR", arRaw ?? []);

    const { data: payRaw, error: payErr } = await supabase.from("payments").select("*");
    if (payErr) {
      console.warn("[getCollectionsRead] payments:", payErr.message);
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
        .map((ar) =>
          mapCollectionsRowFromArCredit(
            ar,
            labsByLab.get(normalizeLabIdKey(ar.lab_id ?? ar.labId ?? ar.Lab_ID))
          )
        )
        .filter((c) => c.labId);
    } else if (Array.isArray(labsRaw) && labsRaw.length) {
      collections = labsRaw.map(mapCollectionsRowFromLabsCredit).filter((c) => c.labId);
    }

    const summary = buildCollectionsSummary(collections, todayCollections);
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
    labId: str(row.lab_id ?? row.Lab_ID ?? row.labId ?? ""),
  };
}

/**
 * Read-only agent workspace: labs/credit (`v_labs_credit`), collections (`getCollectionsRead`),
 * visits (`agent_visits`). Task queue is always `[]` here (no Supabase task query).
 * Shapes match AgentDashboard expectations. Never throws.
 */
export async function getAgentWorkspaceRead(currentUser) {
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
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: null };
  }

  try {
    let visit_id = str(payload.visitId ?? payload.visit_id);
    if (!visit_id) {
      visit_id = `VIS-${Date.now()}`;
    }

    const tenant_id = str(payload.tenantId ?? payload.tenant_id) || null;
    const lab_id = str(payload.labId ?? payload.lab_id);
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
  if (!supabase) {
    return { success: false, error: "Supabase is not configured", data: null };
  }

  try {
    const lab_id = str(payload.labId ?? payload.lab_id);
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

    try {
      await applyLabOrderInventoryDeduction({
        savedLineItems: itemsData,
        order_id,
        tenant_id,
        created_by,
      });
    } catch (invErr) {
      console.warn(
        "[createOrderWrite] inventory deduction threw — order is NOT rolled back:",
        invErr?.message || invErr
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
    labId: str(row.lab_id ?? row.labId ?? row.lab_uuid ?? row.labUUID ?? ""),
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
