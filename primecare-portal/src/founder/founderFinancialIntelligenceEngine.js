import { summarizeCollectionsList } from "@/metrics/computeReceivableMetrics.js";
import {
  orderCountsTowardDashboardRevenue,
  orderOperationalExcludedFromIndices,
  resolveOrderAmount,
  computeRevenueMetrics,
} from "@/metrics/computeRevenueMetrics.js";
import { buildFinancialPressurePanel } from "@/operations/operationsCommandCenterModel.js";
import { buildLabContractModel } from "@/labContract/labContractEngine.js";
import { CONTRACT_STATUSES } from "@/labContract/labContractTypes.js";
import { buildContractRenewalIntelligence } from "@/contracts/contractRenewalIntelligenceEngine.js";
import { computeFounderOperationalSignals } from "@/founder/founderPilotReadinessCompute.js";
import { YEAR1_TARGETS } from "@/founder/founderStrategyTargets.js";
import { resolveDistributorLifecycleStatus } from "@/distributor/distributorLifecycleEngine.js";
import {
  buildDistributorProfitabilityModel,
  CONTRIBUTION_STATUS,
} from "@/founder/distributorProfitabilityEngine.js";

const RECOVERY_RATE_WARN_PCT = 60;
const COMMISSION_LIABILITY_WARN = 10_000;
const AR_DISTRIBUTOR_WARN = 50_000;

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clamp(n, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function formatInr(n) {
  return `₹${num(n).toLocaleString("en-IN")}`;
}

function currentMonthPrefix() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function computeMtdRevenue(orders = []) {
  const monthPrefix = currentMonthPrefix();
  let mtd = 0;
  for (const o of orders || []) {
    if (orderOperationalExcludedFromIndices(o)) continue;
    if (!orderCountsTowardDashboardRevenue(o)) continue;
    const orderDate = str(o.order_date ?? o.orderDate ?? o.created_at ?? "").slice(0, 7);
    if (orderDate !== monthPrefix) continue;
    mtd += resolveOrderAmount(o, new Map());
  }
  return mtd;
}

function buildRevenueGapView(payload, tenantId) {
  const signals = computeFounderOperationalSignals(payload, tenantId);
  const executive = payload?.dashboard?.executive || {};
  const dailyRevenue = num(executive.todaysRevenue);
  const currentMonthly = signals.dataStale
    ? 0
    : clamp(dailyRevenue * YEAR1_TARGETS.revenueDaysPerMonth);
  const revenueGap = Math.max(0, YEAR1_TARGETS.monthlyRevenue - currentMonthly);
  const revenueProgress =
    YEAR1_TARGETS.monthlyRevenue > 0
      ? clamp((currentMonthly / YEAR1_TARGETS.monthlyRevenue) * 100)
      : 0;
  return {
    currentMonthlyRevenue: currentMonthly,
    currentMonthlyLabel: formatInr(currentMonthly),
    targetMonthlyLabel: formatInr(YEAR1_TARGETS.monthlyRevenue),
    revenueGap,
    revenueGapLabel: formatInr(revenueGap),
    revenueProgressPct: revenueProgress,
    dataStale: signals.dataStale,
  };
}

function contractRevenueByDistributor(contracts = []) {
  const map = new Map();
  for (const c of contracts || []) {
    const did = str(c.distributorId);
    if (!did) continue;
    const status = str(c.status);
    if (status !== CONTRACT_STATUSES.ACTIVE) continue;
    map.set(did, (map.get(did) || 0) + num(c.revenueUnderContract));
  }
  return map;
}

function sumPipelineValue(enriched = []) {
  return enriched
    .filter(
      (c) =>
        c.status === CONTRACT_STATUSES.DRAFT || c.status === CONTRACT_STATUSES.UNDER_REVIEW
    )
    .reduce((s, c) => s + num(c.revenueUnderContract), 0);
}

function buildFinancialRisks({
  contractDashboard,
  contractRenewal = null,
  inventoryEconomics = null,
  distributorProfitability = null,
  billingRows = [],
  commissionByDistributor = {},
  performanceRows = [],
  financialPressure = {},
}) {
  const alerts = [];

  if (num(inventoryEconomics?.deadInventoryValue) > 0) {
    alerts.push({
      id: "inventory_dead_stock",
      severity: "Medium",
      title: "Dead inventory detected",
      detail: `${inventoryEconomics.deadInventoryValueLabel} with no movement in 120+ days`,
    });
  }
  if (num(inventoryEconomics?.lowStockExposure) > 0) {
    alerts.push({
      id: "inventory_low_stock",
      severity: "Medium",
      title: "Low stock exposure",
      detail: `${inventoryEconomics.lowStockExposure} SKU(s) below reorder point`,
    });
  }
  if (
    num(inventoryEconomics?.reorderExposure) > 0 &&
    num(inventoryEconomics?.totalInventoryValue) > 0 &&
    num(inventoryEconomics.reorderExposure) / num(inventoryEconomics.totalInventoryValue) >= 0.25
  ) {
    alerts.push({
      id: "inventory_reorder_exposure",
      severity: "High",
      title: "Reorder exposure above threshold",
      detail: `${inventoryEconomics.reorderExposureLabel} to restore low-stock SKUs`,
    });
  }

  if (num(contractRenewal?.interventionQueueCount) > 0) {
    alerts.push({
      id: "contracts_renewal_intervention",
      severity:
        contractRenewal.expiring30Count > 0
          ? "High"
          : contractRenewal.expiring60Count > 0
            ? "High"
            : "Medium",
      title: "Contract renewal intervention queue",
      detail: `${contractRenewal.interventionQueueCount} contract(s) · ${contractRenewal.revenueAtRiskLabel} revenue at risk`,
    });
  } else if (num(contractDashboard?.expiring90Count) > 0) {
    alerts.push({
      id: "contracts_expiring_90",
      severity: "High",
      title: "Contracts expiring in 90 days",
      detail: `${contractDashboard.expiring90Count} active contract(s) need renewal review`,
    });
  }

  const overdueBilling = billingRows.filter((r) => r.overdue);
  if (overdueBilling.length > 0) {
    alerts.push({
      id: "billing_overdue",
      severity: "High",
      title: "Billing overdue distributors",
      detail: `${overdueBilling.length} distributor(s) with overdue platform billing`,
    });
  }

  for (const [did, liab] of Object.entries(commissionByDistributor)) {
    if (num(liab?.liabilityTotal) >= COMMISSION_LIABILITY_WARN) {
      alerts.push({
        id: `commission_liability_${did}`,
        severity: "Medium",
        title: "Large commission liability",
        detail: `${formatInr(liab.liabilityTotal)} outstanding commission liability`,
      });
    }
  }

  for (const row of performanceRows) {
    if (num(row.outstanding) >= AR_DISTRIBUTOR_WARN) {
      alerts.push({
        id: `ar_high_${row.distributorId}`,
        severity: "Medium",
        title: "High AR distributor",
        detail: `${row.name}: ${row.outstandingLabel || formatInr(row.outstanding)} AR outstanding`,
      });
    }
  }

  if (
    financialPressure.recoveryPct != null &&
    num(financialPressure.recoveryPct) < RECOVERY_RATE_WARN_PCT
  ) {
    alerts.push({
      id: "recovery_rate_low",
      severity: "Medium",
      title: "Recovery rate below threshold",
      detail: `Recovery ${financialPressure.recoveryPct}% (threshold ${RECOVERY_RATE_WARN_PCT}%)`,
    });
  }

  for (const row of distributorProfitability?.rows || []) {
    if (row.status === CONTRIBUTION_STATUS.AT_RISK) {
      alerts.push({
        id: `profitability_at_risk_${row.distributorId}`,
        severity: "High",
        title: "Distributor at risk",
        detail: `${row.name}: score ${row.contributionScore} · ${row.mainRiskDriver}`,
      });
    }
    if (num(row.contributionSignal) < 0) {
      alerts.push({
        id: `profitability_negative_${row.distributorId}`,
        severity: "High",
        title: "Negative contribution signal",
        detail: `${row.name}: ${row.contributionSignalLabel} (operational signal, not accounting profit)`,
      });
    }
    if (num(row.billingOutstanding) > num(row.billingCollected) && num(row.billingOutstanding) > 0) {
      alerts.push({
        id: `profitability_billing_out_${row.distributorId}`,
        severity: "Medium",
        title: "High billing outstanding",
        detail: `${row.name}: ${row.billingOutstandingLabel} outstanding vs ${row.billingCollectedLabel} collected`,
      });
    }
    if (num(row.commissionLiability) >= COMMISSION_LIABILITY_WARN) {
      alerts.push({
        id: `profitability_commission_${row.distributorId}`,
        severity: "Medium",
        title: "High commission liability",
        detail: `${row.name}: ${row.commissionLiabilityLabel} commission liability`,
      });
    }
    if (num(row.arOutstanding) >= AR_DISTRIBUTOR_WARN) {
      alerts.push({
        id: `profitability_ar_${row.distributorId}`,
        severity: "Medium",
        title: "High AR exposure",
        detail: `${row.name}: ${row.arOutstandingLabel} AR outstanding`,
      });
    }
  }

  return alerts;
}

function buildReconciliation({
  billingRollup,
  billingRows = [],
  commissionPortfolio,
  commissionByDistributor = {},
}) {
  const billingCollectedSum = billingRows.reduce((s, r) => s + num(r.collected), 0);
  const billingOutstandingSum = billingRows.reduce((s, r) => s + num(r.outstanding), 0);
  const commissionLiabilitySum = Object.values(commissionByDistributor).reduce(
    (s, l) => s + num(l?.liabilityTotal),
    0
  );

  const billingCollectedOk =
    Math.abs(num(billingRollup?.totalCollected) - billingCollectedSum) <= 0.01;
  const billingOutstandingOk =
    Math.abs(num(billingRollup?.totalOutstanding) - billingOutstandingSum) <= 0.01;
  const commissionOk =
    Math.abs(num(commissionPortfolio?.liabilityTotal) - commissionLiabilitySum) <= 0.01;

  return {
    billingCollectedOk,
    billingOutstandingOk,
    commissionOk,
    valid: billingCollectedOk && billingOutstandingOk && commissionOk,
    deltas: {
      billingCollected: num(billingRollup?.totalCollected) - billingCollectedSum,
      billingOutstanding: num(billingRollup?.totalOutstanding) - billingOutstandingSum,
      commissionLiability: num(commissionPortfolio?.liabilityTotal) - commissionLiabilitySum,
    },
  };
}

/**
 * @param {Awaited<ReturnType<import('@/founder/founderFinancialIntelligenceData.js').loadFounderFinancialIntelligenceData>>} data
 */
export function buildFounderFinancialIntelligenceModel(data) {
  const {
    homeTenantId,
    portfolio,
    opsPayload,
    contracts,
    commissionRes,
    loadStatus,
  } = data;

  const billingRollup = portfolio.dashboard?.billingRollup || {
    totalCollected: 0,
    totalOutstanding: 0,
    totalDue: 0,
  };
  const commissionPortfolio = commissionRes.portfolio || {};
  const commissionByDistributor = commissionRes.byDistributor || {};

  const distributorIds = new Set([homeTenantId, ...data.distributorIds].filter(Boolean));
  const contractModel = buildLabContractModel(contracts, opsPayload, distributorIds);
  const contractDashboard = contractModel.dashboard;
  const pipelineValue = sumPipelineValue(contractModel.contracts);
  const contractRevenueMap = contractRevenueByDistributor(contractModel.contracts);
  const distributorNames = new Map(
    (data.distributors || []).map((d) => [str(d.id), d.name || d.id])
  );
  const contractRenewal = buildContractRenewalIntelligence(contractModel, { distributorNames });

  const collectionsPayload = {
    collections: opsPayload.collections || portfolio.raw?.collections || [],
    dashboard: opsPayload.dashboard,
  };
  const collSummary = summarizeCollectionsList(collectionsPayload.collections);
  const financialPressure = buildFinancialPressurePanel(collectionsPayload);
  const revenueGap = buildRevenueGapView(opsPayload, homeTenantId);

  const orders = opsPayload.orders || portfolio.raw?.orders || [];
  const revenueMetrics = computeRevenueMetrics({
    ordersRaw: orders,
    orderItemsRaw: [],
    todayYmd: new Date().toISOString().slice(0, 10),
  });
  const mtdRevenue = computeMtdRevenue(orders);

  const billingDue = num(billingRollup.totalDue);
  const billingCollected = num(billingRollup.totalCollected);
  const billingCollectionRatePct =
    billingRollup.collectionRatePct != null
      ? num(billingRollup.collectionRatePct)
      : billingDue > 0
        ? Math.round((billingCollected / billingDue) * 100)
        : null;

  const hqSnapshot = {
    realizedRevenueMtd: mtdRevenue,
    realizedRevenueMtdLabel: formatInr(mtdRevenue),
    platformBillingDue: billingDue,
    platformBillingDueLabel: billingRollup.totalDueLabel || formatInr(billingDue),
    platformBillingCollected: billingCollected,
    platformBillingCollectedLabel: billingRollup.totalCollectedLabel || formatInr(billingCollected),
    billingOutstanding: num(billingRollup.totalOutstanding),
    billingOutstandingLabel: billingRollup.totalOutstandingLabel || formatInr(billingRollup.totalOutstanding),
    billingCollectionRatePct,
    billingCollectionRateLabel:
      billingCollectionRatePct != null ? `${billingCollectionRatePct}%` : "—",
    commissionLiability: num(commissionPortfolio.liabilityTotal),
    commissionLiabilityLabel: formatInr(commissionPortfolio.liabilityTotal),
    commissionPaid: num(commissionPortfolio.paidTotal),
    commissionPaidLabel: formatInr(commissionPortfolio.paidTotal),
    arOutstanding: num(collSummary.totalOutstanding),
    arOutstandingLabel: formatInr(collSummary.totalOutstanding),
    todaysRevenue: num(revenueMetrics.todaysRevenue),
    todaysRevenueLabel: formatInr(revenueMetrics.todaysRevenue),
  };

  const revenueIntelligence = {
    revenueUnderContract: num(contractDashboard.revenueUnderContract),
    revenueUnderContractLabel: contractDashboard.revenueUnderContractLabel || formatInr(contractDashboard.revenueUnderContract),
    monthlyCommittedRevenue: num(contractDashboard.monthlyCommittedRevenue),
    monthlyCommittedLabel: contractDashboard.monthlyCommittedLabel || formatInr(contractDashboard.monthlyCommittedRevenue),
    pipelineValue,
    pipelineValueLabel: formatInr(pipelineValue),
    pipelineCount: num(contractDashboard.pipelineCount),
    revenueGap: revenueGap.revenueGap,
    revenueGapLabel: revenueGap.revenueGapLabel,
    revenueProgressPct: revenueGap.revenueProgressPct,
    activeContracts: num(contractDashboard.activeCount),
    expiring90Count: num(contractDashboard.expiring90Count),
    contractHealthScore: num(contractDashboard.contractHealthScore),
    revenueAtRisk: num(contractRenewal.revenueAtRisk),
    revenueAtRiskLabel: contractRenewal.revenueAtRiskLabel,
    committedRevenueAtRisk: num(contractRenewal.committedRevenueAtRisk),
    committedRevenueAtRiskLabel: contractRenewal.committedRevenueAtRiskLabel,
    topLabsByRevenue: revenueMetrics.topLabsByRevenue || [],
  };

  const collectionsCash = {
    totalOutstanding: financialPressure.totalOutstanding,
    totalOverdue: financialPressure.totalOverdue,
    recoveryPct: financialPressure.recoveryPct,
    blockedCount: num(financialPressure.blockedCount),
    topDebtorsCount: (financialPressure.topDebtors || []).length,
    overdueCount: collSummary.overdueCount,
    todayCollections: financialPressure.todayCollections,
  };

  const netHqSpread = num(billingRollup.totalCollected) - num(commissionPortfolio.outstandingTotal);
  const hqObligations = {
    commissionLiability: num(commissionPortfolio.liabilityTotal),
    commissionLiabilityLabel: formatInr(commissionPortfolio.liabilityTotal),
    commissionApproved: num(commissionPortfolio.approvedTotal),
    commissionApprovedLabel: formatInr(commissionPortfolio.approvedTotal),
    commissionPaid: num(commissionPortfolio.paidTotal),
    commissionPaidLabel: formatInr(commissionPortfolio.paidTotal),
    commissionOutstanding: num(commissionPortfolio.outstandingTotal),
    commissionOutstandingLabel: formatInr(commissionPortfolio.outstandingTotal),
    billingCollected: num(billingRollup.totalCollected),
    billingCollectedLabel: billingRollup.totalCollectedLabel || formatInr(billingRollup.totalCollected),
    netHqSpread,
    netHqSpreadLabel: formatInr(netHqSpread),
    netHqSpreadNote: "Billing collected minus commission outstanding (informational)",
  };

  const inventoryEconomics = data.inventoryEconomics || {
    totalInventoryValue: 0,
    totalInventoryValueLabel: formatInr(0),
    slowMovingInventoryValue: 0,
    slowMovingInventoryValueLabel: formatInr(0),
    deadInventoryValue: 0,
    deadInventoryValueLabel: formatInr(0),
    reorderExposure: 0,
    reorderExposureLabel: formatInr(0),
    inventoryHealthScore: 100,
    inventoryHealthLabel: "100%",
    inventoryValueByDistributor: [],
  };
  const inventoryByDistributor = new Map(
    (inventoryEconomics.inventoryValueByDistributor || []).map((r) => [r.distributorId, r])
  );

  const perfById = new Map(portfolio.performanceRows.map((r) => [r.distributorId, r]));
  const billingById = new Map(portfolio.billingRows.map((r) => [r.distributorId, r]));

  const distributorProfitability = buildDistributorProfitabilityModel({
    distributors: portfolio.distributors,
    performanceRows: portfolio.performanceRows,
    billingRows: portfolio.billingRows,
    commissionByDistributor,
    contractRenewal,
    inventoryEconomics,
    contractRevenueByDistributor: contractRevenueMap,
    collectionsRecoveryPct: financialPressure.recoveryPct,
  });

  const distributorEconomics = portfolio.distributors.map((d) => {
    const perf = perfById.get(d.id) || {};
    const billing = billingById.get(d.id) || {};
    const comm = commissionByDistributor[d.id] || {};
    const inv = inventoryByDistributor.get(d.id) || {};
    const lifecycle = resolveDistributorLifecycleStatus(d);
    return {
      distributorId: d.id,
      name: d.name || d.id,
      revenue: num(perf.revenue),
      revenueLabel: perf.revenueLabel || formatInr(perf.revenue),
      collections: num(perf.collectionsTotal),
      collectionsLabel: perf.collectionsTotalLabel || formatInr(perf.collectionsTotal),
      billingDue: num(billing.amountDue),
      billingDueLabel: billing.amountDueLabel || formatInr(billing.amountDue),
      billingCollected: num(billing.collected),
      billingCollectedLabel: billing.collectedLabel || formatInr(billing.collected),
      billingOutstanding: num(billing.outstanding),
      billingOutstandingLabel: billing.outstandingLabel || formatInr(billing.outstanding),
      commissionLiability: num(comm.liabilityTotal),
      commissionLiabilityLabel: formatInr(comm.liabilityTotal),
      commissionPaid: num(comm.paidTotal),
      commissionPaidLabel: formatInr(comm.paidTotal),
      contractRevenue: num(contractRevenueMap.get(d.id)),
      contractRevenueLabel: formatInr(contractRevenueMap.get(d.id)),
      inventoryValue: num(inv.inventoryValue),
      inventoryValueLabel: inv.inventoryValueLabel || formatInr(inv.inventoryValue),
      slowInventoryValue: num(inv.slowMovingInventoryValue),
      slowInventoryValueLabel: inv.slowMovingInventoryValueLabel || formatInr(inv.slowMovingInventoryValue),
      reorderExposure: num(inv.reorderExposure),
      reorderExposureLabel: inv.reorderExposureLabel || formatInr(inv.reorderExposure),
      status: perf.lifecycleLabel || lifecycle,
      billingStatusLabel: billing.billingStatusLabel || "—",
    };
  });

  const risks = buildFinancialRisks({
    contractDashboard,
    contractRenewal,
    inventoryEconomics,
    distributorProfitability,
    billingRows: portfolio.billingRows,
    commissionByDistributor,
    performanceRows: portfolio.performanceRows,
    financialPressure,
  });

  const reconciliation = buildReconciliation({
    billingRollup,
    billingRows: portfolio.billingRows,
    commissionPortfolio,
    commissionByDistributor,
  });

  return {
    version: "p1",
    loadStatus,
    hqSnapshot,
    revenueIntelligence,
    contractRenewal,
    inventoryEconomics,
    collectionsCash,
    hqObligations,
    distributorEconomics,
    distributorProfitability,
    risks,
    reconciliation,
    distributorCount: distributorEconomics.length,
  };
}
