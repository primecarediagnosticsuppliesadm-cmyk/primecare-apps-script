/**
 * Executive Financial Intelligence — read-only analytics model (composes existing KPI engines).
 */
import {
  buildLineTotalByOrderId,
  computeRevenueMetrics,
  normalizedOrderRowStatus,
  orderCountsTowardDashboardRevenue,
  orderOperationalExcludedFromIndices,
  resolveOrderAmount,
} from "@/metrics/computeRevenueMetrics.js";
import { summarizeCollectionsList } from "@/metrics/computeReceivableMetrics.js";
import { buildFinancialPressurePanel } from "@/operations/operationsCommandCenterModel.js";
import { buildExecutiveDailySnapshot } from "@/operations/operationsCommandCenterModel.js";
import { buildDistributorProfitabilityModel } from "@/founder/distributorProfitabilityEngine.js";
import { computeLogisticsKpis } from "@/logistics/logisticsShipmentEngine.js";
import { computeEstimatedDeliveryRevenue } from "@/logistics/deliveryChargeEngine.js";
import { normalizeLabIdKey } from "@/utils/labId.js";

const OUTSTANDING_ALERT_THRESHOLD = 500_000;
const DELIVERY_FAILURE_ALERT_THRESHOLD = 5;
const LARGE_CANCELLED_ORDER_THRESHOLD = 50_000;

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatInr(n) {
  return `₹${num(n).toLocaleString("en-IN")}`;
}

function localDateYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeekYmd(ref = new Date()) {
  const d = new Date(ref);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return localDateYmd(d);
}

function startOfYearYmd(ref = new Date()) {
  return `${ref.getFullYear()}-01-01`;
}

function currentMonthPrefix(ref = new Date()) {
  return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
}

function orderDateYmd(orderRow) {
  return str(orderRow.order_date ?? orderRow.orderDate ?? orderRow.created_at ?? "").slice(0, 10);
}

function fulfilledRevenueInRange(orders, orderItems, lineTotalByOrderId, { fromYmd, toYmd }) {
  let total = 0;
  for (const o of orders || []) {
    if (orderOperationalExcludedFromIndices(o)) continue;
    if (!orderCountsTowardDashboardRevenue(o)) continue;
    const ymd = orderDateYmd(o);
    if (!ymd || ymd < fromYmd || ymd > toYmd) continue;
    total += resolveOrderAmount(o, lineTotalByOrderId);
  }
  return total;
}

function buildRevenueTrend(orders, orderItems, lineTotalByOrderId, days = 14) {
  const today = new Date();
  const points = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ymd = localDateYmd(d);
    const revenue = fulfilledRevenueInRange(orders, orderItems, lineTotalByOrderId, {
      fromYmd: ymd,
      toYmd: ymd,
    });
    points.push({
      date: ymd,
      label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      revenue,
      revenueLabel: formatInr(revenue),
    });
  }
  return points;
}

function computeCollectedInMonth(payments = [], monthPrefix = currentMonthPrefix()) {
  return (payments || []).reduce((sum, p) => {
    const pd = str(p.payment_date ?? p.paymentDate).slice(0, 7);
    if (pd !== monthPrefix) return sum;
    return sum + num(p.amount_received ?? p.amountReceived ?? p.amount);
  }, 0);
}

function computeAverageCollectionDays(collections = []) {
  const withOverdue = (collections || []).filter((c) => num(c.outstandingAmount) > 0);
  if (!withOverdue.length) return null;
  const totalDays = withOverdue.reduce((s, c) => s + num(c.overdueDays), 0);
  return Math.round(totalDays / withOverdue.length);
}

function buildOrdersSection(orders = [], orderItems = []) {
  const todayYmd = localDateYmd();
  const lineTotalByOrderId = buildLineTotalByOrderId(orderItems);
  let ordersToday = 0;
  let pending = 0;
  let fulfilled = 0;
  let cancelled = 0;
  let fulfilledAmount = 0;
  let fulfilledCount = 0;
  let highValueCancelled = null;

  for (const o of orders || []) {
    const status = normalizedOrderRowStatus(o);
    const ymd = orderDateYmd(o);
    if (ymd === todayYmd) ordersToday += 1;
    if (status === "cancelled") {
      cancelled += 1;
      const amt = resolveOrderAmount(o, lineTotalByOrderId);
      if (amt >= LARGE_CANCELLED_ORDER_THRESHOLD) {
        highValueCancelled = {
          orderId: str(o.order_id ?? o.orderId),
          amount: amt,
          amountLabel: formatInr(amt),
          labId: str(o.lab_id ?? o.labId),
        };
      }
      continue;
    }
    if (orderCountsTowardDashboardRevenue(o)) {
      fulfilled += 1;
      const amt = resolveOrderAmount(o, lineTotalByOrderId);
      fulfilledAmount += amt;
      fulfilledCount += 1;
    } else if (status !== "delivered") {
      pending += 1;
    }
  }

  const averageOrderValue = fulfilledCount > 0 ? fulfilledAmount / fulfilledCount : 0;

  return {
    ordersToday,
    pendingOrders: pending,
    fulfilledOrders: fulfilled,
    cancelledOrders: cancelled,
    averageOrderValue,
    averageOrderValueLabel: formatInr(averageOrderValue),
    highValueCancelled,
  };
}

function buildLabPerformanceSection({
  orders = [],
  orderItems = [],
  collections = [],
  shipments = [],
  labNameById = new Map(),
}) {
  const lineTotalByOrderId = buildLineTotalByOrderId(orderItems);
  const monthPrefix = currentMonthPrefix();
  const prevMonth = new Date();
  prevMonth.setMonth(prevMonth.getMonth() - 1);
  const prevMonthPrefix = currentMonthPrefix(prevMonth);

  const revenueByLab = new Map();
  const revenueByLabPrev = new Map();
  const deliveryVolumeByLab = new Map();

  for (const o of orders || []) {
    if (orderOperationalExcludedFromIndices(o)) continue;
    if (!orderCountsTowardDashboardRevenue(o)) continue;
    const labId = normalizeLabIdKey(o.lab_id ?? o.labId);
    if (!labId) continue;
    const ymd = orderDateYmd(o);
    const amt = resolveOrderAmount(o, lineTotalByOrderId);
    const month = ymd.slice(0, 7);
    if (month === monthPrefix) {
      revenueByLab.set(labId, (revenueByLab.get(labId) || 0) + amt);
    } else if (month === prevMonthPrefix) {
      revenueByLabPrev.set(labId, (revenueByLabPrev.get(labId) || 0) + amt);
    }
  }

  for (const s of shipments || []) {
    const labId = normalizeLabIdKey(s.labId ?? s.lab_id);
    if (!labId) continue;
    deliveryVolumeByLab.set(labId, (deliveryVolumeByLab.get(labId) || 0) + 1);
  }

  const topRevenueLabs = [...revenueByLab.entries()]
    .map(([labId, revenue]) => ({
      labId,
      labName: labNameById.get(labId) || labId,
      revenue,
      revenueLabel: formatInr(revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const topCollectionLabs = [...(collections || [])]
    .map((c) => ({
      labId: str(c.labId),
      labName: str(c.labName) || str(c.labId),
      collected: num(c.totalPaid),
      collectedLabel: formatInr(c.totalPaid),
    }))
    .sort((a, b) => b.collected - a.collected)
    .slice(0, 5);

  const highestGrowthLabs = [...revenueByLab.entries()]
    .map(([labId, current]) => {
      const prev = num(revenueByLabPrev.get(labId));
      const growth = prev > 0 ? ((current - prev) / prev) * 100 : current > 0 ? 100 : 0;
      return {
        labId,
        labName: labNameById.get(labId) || labId,
        currentRevenue: current,
        previousRevenue: prev,
        growthPct: Math.round(growth),
        currentRevenueLabel: formatInr(current),
      };
    })
    .filter((r) => r.currentRevenue > 0)
    .sort((a, b) => b.growthPct - a.growthPct)
    .slice(0, 5);

  const mostDelayedPaymentLabs = [...(collections || [])]
    .filter((c) => num(c.outstandingAmount) > 0)
    .map((c) => ({
      labId: str(c.labId),
      labName: str(c.labName) || str(c.labId),
      outstanding: num(c.outstandingAmount),
      outstandingLabel: formatInr(c.outstandingAmount),
      overdueDays: num(c.overdueDays),
    }))
    .sort((a, b) => b.overdueDays - a.overdueDays || b.outstanding - a.outstanding)
    .slice(0, 5);

  const largestDeliveryVolumeLabs = [...deliveryVolumeByLab.entries()]
    .map(([labId, count]) => ({
      labId,
      labName: labNameById.get(labId) || labId,
      shipmentCount: count,
    }))
    .sort((a, b) => b.shipmentCount - a.shipmentCount)
    .slice(0, 5);

  const profitableLabs = [...(collections || [])]
    .map((c) => {
      const labId = normalizeLabIdKey(c.labId);
      const revenue = num(revenueByLab.get(labId));
      const outstanding = num(c.outstandingAmount);
      const collected = num(c.totalPaid);
      const score = collected - outstanding;
      return {
        labId,
        labName: str(c.labName) || labId,
        revenue,
        collected,
        outstanding,
        netPosition: score,
        netPositionLabel: formatInr(score),
      };
    })
    .filter((r) => r.revenue > 0 || r.collected > 0)
    .sort((a, b) => b.netPosition - a.netPosition)
    .slice(0, 5);

  return {
    topRevenueLabs,
    topCollectionLabs,
    highestGrowthLabs,
    mostDelayedPaymentLabs,
    largestDeliveryVolumeLabs,
    profitableLabs,
  };
}

function buildExecutiveAlerts({
  collections = [],
  logisticsKpis = {},
  inventoryEconomics = null,
  financialPressure = {},
  ordersSection = {},
  totalOutstanding = 0,
}) {
  const alerts = [];

  if (num(totalOutstanding) >= OUTSTANDING_ALERT_THRESHOLD) {
    alerts.push({
      id: "outstanding_high",
      severity: "High",
      title: "Outstanding receivables above ₹5L",
      detail: formatInr(totalOutstanding),
    });
  }

  if (num(logisticsKpis.failedDeliveries) > DELIVERY_FAILURE_ALERT_THRESHOLD) {
    alerts.push({
      id: "delivery_failures",
      severity: "High",
      title: "Delivery failures elevated",
      detail: `${logisticsKpis.failedDeliveries} failed deliveries in queue`,
    });
  }

  const criticalStock = num(inventoryEconomics?.lowStockExposure);
  if (criticalStock > 0) {
    alerts.push({
      id: "critical_inventory",
      severity: criticalStock >= 5 ? "High" : "Medium",
      title: "Critical / low stock SKUs",
      detail: `${criticalStock} SKU(s) below reorder point`,
    });
  }

  const topDebtor = financialPressure.topDebtors?.[0];
  if (topDebtor && num(topDebtor.outstandingAmount) >= 100_000) {
    alerts.push({
      id: "large_pending_payment",
      severity: "Medium",
      title: "Large pending payment",
      detail: `${topDebtor.labName || topDebtor.labId}: ${formatInr(topDebtor.outstandingAmount)} outstanding`,
    });
  }

  if (ordersSection.highValueCancelled) {
    alerts.push({
      id: "high_value_cancelled",
      severity: "Medium",
      title: "High-value cancelled order",
      detail: `${ordersSection.highValueCancelled.orderId} — ${ordersSection.highValueCancelled.amountLabel}`,
    });
  }

  return alerts;
}

/**
 * @param {Awaited<ReturnType<import('@/founder/executiveFinancialIntelligenceData.js').loadExecutiveFinancialIntelligenceData>>} data
 */
export function buildExecutiveFinancialIntelligenceModel(data) {
  const opsPayload = data.opsPayload || {};
  const orders = opsPayload.orders || data.portfolio?.raw?.orders || [];
  const collections = opsPayload.collections || data.portfolio?.raw?.collections || [];
  const orderItems = data.orderItems || [];
  const payments = data.payments || [];
  const shipments = data.shipments || [];
  const inventoryEconomics = data.inventoryEconomics || null;

  const todayYmd = localDateYmd();
  const weekStart = startOfWeekYmd();
  const monthStart = `${currentMonthPrefix()}-01`;
  const yearStart = startOfYearYmd();

  const lineTotalByOrderId = buildLineTotalByOrderId(orderItems);
  const revenueMetrics = computeRevenueMetrics({
    ordersRaw: orders,
    orderItemsRaw: orderItems,
    todayYmd,
  });

  const weekRevenue = fulfilledRevenueInRange(orders, orderItems, lineTotalByOrderId, {
    fromYmd: weekStart,
    toYmd: todayYmd,
  });
  const monthRevenue = fulfilledRevenueInRange(orders, orderItems, lineTotalByOrderId, {
    fromYmd: monthStart,
    toYmd: todayYmd,
  });
  const ytdRevenue = fulfilledRevenueInRange(orders, orderItems, lineTotalByOrderId, {
    fromYmd: yearStart,
    toYmd: todayYmd,
  });

  const revenue = {
    today: num(revenueMetrics.todaysRevenue),
    todayLabel: formatInr(revenueMetrics.todaysRevenue),
    thisWeek: weekRevenue,
    thisWeekLabel: formatInr(weekRevenue),
    thisMonth: monthRevenue,
    thisMonthLabel: formatInr(monthRevenue),
    yearToDate: ytdRevenue,
    yearToDateLabel: formatInr(ytdRevenue),
    trend: buildRevenueTrend(orders, orderItems, lineTotalByOrderId, 14),
    totalFulfilledRevenue: num(revenueMetrics.totalSoldValue),
    totalFulfilledRevenueLabel: formatInr(revenueMetrics.totalSoldValue),
  };

  const collSummary = summarizeCollectionsList(collections);
  const financialPressure = buildFinancialPressurePanel({
    collections,
    dashboard: opsPayload.dashboard,
  });
  const collectedThisMonth = computeCollectedInMonth(payments);
  const avgCollectionDays = computeAverageCollectionDays(collections);

  const collectionsSection = {
    outstandingReceivables: num(collSummary.totalOutstanding),
    outstandingReceivablesLabel: formatInr(collSummary.totalOutstanding),
    collectedThisMonth,
    collectedThisMonthLabel: formatInr(collectedThisMonth),
    averageCollectionDays: avgCollectionDays,
    averageCollectionDaysLabel: avgCollectionDays != null ? `${avgCollectionDays} days` : "—",
    largestOutstandingLabs: (financialPressure.topDebtors || []).slice(0, 5).map((c) => ({
      labId: str(c.labId),
      labName: str(c.labName) || str(c.labId),
      outstanding: num(c.outstandingAmount),
      outstandingLabel: formatInr(c.outstandingAmount),
      overdueDays: num(c.overdueDays),
    })),
    recoveryPct: financialPressure.recoveryPct,
  };

  const ordersSection = buildOrdersSection(orders, orderItems);

  const logisticsKpis = computeLogisticsKpis(shipments);
  const estimatedDeliveryRevenue = computeEstimatedDeliveryRevenue(shipments);
  const logisticsSection = {
    estimatedDeliveryRevenue,
    estimatedDeliveryRevenueLabel: formatInr(estimatedDeliveryRevenue),
    deliveredToday: logisticsKpis.deliveredToday,
    pendingDispatch: logisticsKpis.readyForDispatch,
    failedDeliveries: logisticsKpis.failedDeliveries,
    customerPickups: logisticsKpis.customerPickup,
  };

  const inventorySection = {
    inventoryValue: num(inventoryEconomics?.totalInventoryValue),
    inventoryValueLabel: inventoryEconomics?.totalInventoryValueLabel || formatInr(0),
    slowMovingInventory: num(inventoryEconomics?.slowMovingInventoryValue),
    slowMovingInventoryLabel:
      inventoryEconomics?.slowMovingInventoryValueLabel || formatInr(0),
    criticalStock: num(inventoryEconomics?.lowStockExposure),
    projectedReorderCost: num(inventoryEconomics?.reorderExposure),
    projectedReorderCostLabel: inventoryEconomics?.reorderExposureLabel || formatInr(0),
    inventoryHealthScore: num(inventoryEconomics?.inventoryHealthScore),
  };

  const labNameById = new Map(
    (collections || []).map((c) => [normalizeLabIdKey(c.labId), str(c.labName) || str(c.labId)])
  );
  const labPerformance = buildLabPerformanceSection({
    orders,
    orderItems,
    collections,
    shipments,
    labNameById,
  });

  const dailySnapshot = buildExecutiveDailySnapshot(opsPayload);

  const distributorProfitability = buildDistributorProfitabilityModel({
    distributors: data.distributors || data.portfolio?.distributors || [],
    performanceRows: data.portfolio?.performanceRows || [],
    billingRows: data.portfolio?.billingRows || [],
    commissionByDistributor: data.commissionRes?.byDistributor || {},
    inventoryEconomics,
    contractRenewal: null,
    collectionsRecoveryPct: collectionsSection.recoveryPct,
  });

  const alerts = buildExecutiveAlerts({
    collections,
    logisticsKpis,
    inventoryEconomics,
    financialPressure,
    ordersSection,
    totalOutstanding: collSummary.totalOutstanding,
  });

  return {
    loadStatus: data.loadStatus,
    revenue,
    collections: collectionsSection,
    orders: ordersSection,
    logistics: logisticsSection,
    inventory: inventorySection,
    labPerformance,
    alerts,
    dailySnapshot,
    distributorProfitability,
    generatedAt: new Date().toISOString(),
  };
}
