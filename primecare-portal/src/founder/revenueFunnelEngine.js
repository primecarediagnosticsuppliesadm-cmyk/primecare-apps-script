import { readDistributorCatalogItems } from "@/catalog/distributorCatalogEngine.js";
import {
  collectDistributorLabIds,
  filterContractsByDistributor,
  filterRowsByDistributorLabs,
  filterRowsByTenant,
  rowTenantId,
} from "@/distributor/distributorOsEngine.js";
import { CONTRACT_STATUSES } from "@/labContract/labContractTypes.js";
import { labIdKey } from "@/utils/labId.js";
import { normalizeQualificationPipelineStage } from "@/utils/qualificationPipeline.js";

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

function pct(numerator, denominator) {
  const d = num(denominator);
  if (d <= 0) return null;
  return Math.round((num(numerator) / d) * 100);
}

function isQualifiedLab(qualification = {}) {
  const founder = str(
    qualification.founderReviewStatus || qualification.founder_review_status
  ).toLowerCase();
  if (founder === "approved") return true;
  const stage = normalizeQualificationPipelineStage(
    qualification.pipelineStage || qualification.pipeline_stage
  );
  return stage === "qualified" || stage === "won";
}

function qualificationsForDistributor(qualifications = [], distributorId, labIds = new Set()) {
  const target = str(distributorId);
  return qualifications.filter((q) => {
    const tenant = str(q.tenantId || q.tenant_id);
    const lab = labIdKey(q.labId || q.lab_id);
    return tenant === target || (lab && labIds.has(lab));
  });
}

function isFulfilledOrder(order = {}) {
  const s = str(order.orderStatus || order.status).toLowerCase();
  return s.includes("fulfill") || s.includes("delivered");
}

function inventoryRowTenantId(row = {}) {
  return str(row.tenantId || row.tenant_id);
}

function inventoryStock(row = {}) {
  return num(row.currentStock ?? row.current_stock);
}

function buildDistributorInventoryReadiness(distributorId, inventory = [], config = {}) {
  const tenantId = str(distributorId);
  const scoped = inventory.filter((row) => inventoryRowTenantId(row) === tenantId);
  const inStock = scoped.filter((row) => inventoryStock(row) > 0);
  const catalogItems = readDistributorCatalogItems(config);
  const catalogAssigned = catalogItems.length > 0;

  let status = "Not ready";
  let detail = "No inventory rows for distributor tenant";
  if (inStock.length > 0) {
    status = "Ready";
    detail = `${inStock.length} SKU(s) in stock`;
  } else if (scoped.length > 0) {
    status = "Low stock";
    detail = `${scoped.length} SKU(s) tracked, none in stock`;
  } else if (catalogAssigned) {
    status = "Catalog only";
    detail = `${catalogItems.length} catalog item(s) assigned; inventory not mirrored`;
  }

  return {
    status,
    detail,
    skuCount: scoped.length,
    inStockCount: inStock.length,
    catalogAssigned,
    catalogItemCount: catalogItems.length,
    ready: inStock.length > 0,
  };
}

function buildLabCommercialContexts({
  distributorId,
  labs = [],
  qualifications = [],
  contracts = [],
  orders = [],
  collections = [],
  inventoryReady = false,
}) {
  const scopedLabs = filterRowsByTenant(labs, distributorId);
  const labIds = collectDistributorLabIds(scopedLabs, distributorId);
  const scopedQuals = qualificationsForDistributor(qualifications, distributorId, labIds);
  const scopedContracts = filterContractsByDistributor(contracts, distributorId);
  const activeContracts = scopedContracts.filter(
    (c) => str(c.status) === CONTRACT_STATUSES.ACTIVE
  );

  let scopedOrders = filterRowsByTenant(orders, distributorId);
  if (!scopedOrders.length && labIds.size) {
    scopedOrders = filterRowsByDistributorLabs(orders, labIds, "labId");
  }
  let scopedCollections = filterRowsByTenant(collections, distributorId);
  if (!scopedCollections.length && labIds.size) {
    scopedCollections = filterRowsByDistributorLabs(collections, labIds, "labId");
  }

  const qualByLab = new Map();
  for (const q of scopedQuals) {
    const lid = labIdKey(q.labId || q.lab_id);
    if (lid) qualByLab.set(lid, q);
  }

  const activeContractLabs = new Set(
    activeContracts.map((c) => labIdKey(c.labId || c.lab_id)).filter(Boolean)
  );

  const ordersByLab = new Map();
  for (const o of scopedOrders) {
    const lid = labIdKey(o.labId || o.lab_id);
    if (!lid) continue;
    const list = ordersByLab.get(lid) || [];
    list.push(o);
    ordersByLab.set(lid, list);
  }

  const collectionsByLab = new Map();
  for (const c of scopedCollections) {
    const lid = labIdKey(c.labId || c.lab_id);
    if (!lid) continue;
    collectionsByLab.set(lid, c);
  }

  const universe = new Set([
    ...scopedLabs.map((l) => labIdKey(l.labId || l.lab_id)).filter(Boolean),
    ...qualByLab.keys(),
    ...activeContractLabs,
    ...ordersByLab.keys(),
    ...collectionsByLab.keys(),
  ]);

  const labRows = [...universe].map((labId) => {
    const labRow = scopedLabs.find((l) => labIdKey(l.labId || l.lab_id) === labId);
    const qual = qualByLab.get(labId) || null;
    const labOrders = ordersByLab.get(labId) || [];
    const collection = collectionsByLab.get(labId) || null;
    const qualified = qual ? isQualifiedLab(qual) : false;
    const contracted = activeContractLabs.has(labId);
    const readyToOrder = contracted && inventoryReady;
    const ordered = labOrders.length > 0;
    const fulfilled = labOrders.some(isFulfilledOrder);
    const arOutstanding = num(
      collection?.outstandingAmount ?? collection?.outstanding ?? collection?.balance
    );
    const totalPaid = num(collection?.totalPaid ?? collection?.total_paid);
    const hasAr = Boolean(collection) || arOutstanding > 0 || totalPaid > 0;

    return {
      labId,
      labName: labRow?.labName || labRow?.lab_name || collection?.labName || labId,
      qualified,
      qualificationStatus: qual
        ? str(qual.founderReviewStatus || qual.founder_review_status) ||
          normalizeQualificationPipelineStage(qual.pipelineStage || qual.pipeline_stage) ||
          "Captured"
        : "No qualification row",
      contracted,
      contractStatus: contracted ? CONTRACT_STATUSES.ACTIVE : "No active contract",
      readyToOrder,
      ordered,
      orderCount: labOrders.length,
      fulfilled,
      fulfilledCount: labOrders.filter(isFulfilledOrder).length,
      hasAr,
      arOutstanding,
      totalPaid,
      paid: totalPaid > 0,
    };
  });

  return {
    labRows,
    scopedLabs,
    scopedOrders,
    scopedCollections,
    activeContracts,
    qualifiedCount: labRows.filter((l) => l.qualified).length,
    contractedCount: labRows.filter((l) => l.contracted).length,
    readyToOrderCount: labRows.filter((l) => l.readyToOrder).length,
    orderedLabCount: labRows.filter((l) => l.ordered).length,
    fulfilledLabCount: labRows.filter((l) => l.fulfilled).length,
    arLabCount: labRows.filter((l) => l.arOutstanding > 0).length,
    paidLabCount: labRows.filter((l) => l.paid).length,
    ordersCreatedCount: scopedOrders.length,
    ordersFulfilledCount: scopedOrders.filter(isFulfilledOrder).length,
    arOutstandingTotal: labRows.reduce((s, l) => s + l.arOutstanding, 0),
    paymentsReceivedTotal: labRows.reduce((s, l) => s + l.totalPaid, 0),
  };
}

function stageRow(id, label, count, priorCount, blockingReason) {
  return {
    id,
    label,
    count,
    conversionPct: pct(count, priorCount),
    blockingReason: count > 0 ? null : blockingReason,
  };
}

function buildFirstRevenueBlockers(ctx, inventory) {
  const blockers = [];
  if (ctx.qualifiedCount <= 0) {
    blockers.push({
      stage: "qualification",
      reason: "No founder-approved or qualified-stage lab qualifications",
      action: "Open Qualification Review and approve the lab pipeline",
    });
  }
  if (ctx.contractedCount <= 0) {
    blockers.push({
      stage: "contract",
      reason: "No active lab contracts for distributor labs",
      action: "Distributor OS → Contracts → activate lab contract",
    });
  }
  if (!inventory.ready) {
    blockers.push({
      stage: "inventory",
      reason: inventory.detail,
      action: "Distributor Catalog → sync inventory with stock on hand",
    });
  }
  if (ctx.readyToOrderCount <= 0 && ctx.contractedCount > 0 && inventory.ready) {
    blockers.push({
      stage: "ready_to_order",
      reason: "Contracted labs exist but none are inventory-ready",
      action: "Verify lab_ids on contracts match labs in scope",
    });
  }
  if (ctx.ordersCreatedCount <= 0) {
    blockers.push({
      stage: "order",
      reason: "No orders created for scoped labs",
      action: "Lab Ordering (LAB user) → place first order",
    });
  }
  if (ctx.ordersFulfilledCount <= 0 && ctx.ordersCreatedCount > 0) {
    blockers.push({
      stage: "fulfillment",
      reason: "Orders exist but none are Fulfilled",
      action: "Orders → mark order Fulfilled to post AR",
    });
  }
  if (
    ctx.ordersFulfilledCount > 0 &&
    ctx.arOutstandingTotal <= 0 &&
    ctx.paymentsReceivedTotal <= 0
  ) {
    blockers.push({
      stage: "ar",
      reason: "Fulfilled orders but no AR outstanding recorded",
      action: "Verify ar_credit_control row exists for lab and fulfillment posted AR",
    });
  }
  if (ctx.paymentsReceivedTotal <= 0 && ctx.arOutstandingTotal > 0) {
    blockers.push({
      stage: "payment",
      reason: "AR outstanding exists but no payments recorded",
      action: "Collections → record payment for lab",
    });
  }
  return blockers;
}

function buildDistributorFunnelRow(distributor, context) {
  const distributorId = str(distributor.id);
  const inventory = buildDistributorInventoryReadiness(
    distributorId,
    context.inventory,
    distributor.config || {}
  );
  const ctx = buildLabCommercialContexts({
    distributorId,
    labs: context.labs,
    qualifications: context.qualifications,
    contracts: context.contracts,
    orders: context.orders,
    collections: context.collections,
    inventoryReady: inventory.ready,
  });

  const stages = [
    stageRow(
      "qualified",
      "Qualified",
      ctx.qualifiedCount,
      Math.max(ctx.labRows.length, 1),
      "No approved qualification for distributor labs"
    ),
    stageRow(
      "contracted",
      "Contracted",
      ctx.contractedCount,
      ctx.qualifiedCount || ctx.labRows.length,
      "No active lab contracts"
    ),
    stageRow(
      "ready_to_order",
      "Ready to order",
      ctx.readyToOrderCount,
      ctx.contractedCount,
      inventory.ready ? "No contracted labs in scope" : inventory.detail
    ),
    stageRow(
      "ordered",
      "Ordered",
      ctx.orderedLabCount,
      ctx.readyToOrderCount || ctx.contractedCount,
      "No lab orders placed"
    ),
    stageRow(
      "fulfilled",
      "Fulfilled",
      ctx.fulfilledLabCount,
      ctx.orderedLabCount,
      "No fulfilled orders"
    ),
    stageRow(
      "ar",
      "AR outstanding",
      ctx.arLabCount,
      ctx.fulfilledLabCount,
      "No AR outstanding after fulfillment"
    ),
    stageRow(
      "paid",
      "Paid",
      ctx.paidLabCount,
      ctx.arLabCount || ctx.fulfilledLabCount,
      "No payments recorded"
    ),
  ];

  const blockers = buildFirstRevenueBlockers(ctx, inventory);
  const pathComplete =
    ctx.qualifiedCount > 0 &&
    ctx.contractedCount > 0 &&
    inventory.ready &&
    ctx.ordersCreatedCount > 0 &&
    ctx.ordersFulfilledCount > 0 &&
    ctx.paymentsReceivedTotal > 0;

  return {
    distributorId,
    name: distributor.name || distributorId,
    lifecycleStatus: distributor.lifecycleStatus || distributor.status || "—",
    labCount: ctx.labRows.length,
    inventory,
    stages,
    summary: {
      qualified: ctx.qualifiedCount,
      contracted: ctx.contractedCount,
      readyToOrder: ctx.readyToOrderCount,
      ordered: ctx.orderedLabCount,
      ordersCreated: ctx.ordersCreatedCount,
      fulfilled: ctx.fulfilledLabCount,
      ordersFulfilled: ctx.ordersFulfilledCount,
      arLabs: ctx.arLabCount,
      arOutstanding: ctx.arOutstandingTotal,
      arOutstandingLabel: formatInr(ctx.arOutstandingTotal),
      paidLabs: ctx.paidLabCount,
      paymentsReceived: ctx.paymentsReceivedTotal,
      paymentsReceivedLabel: formatInr(ctx.paymentsReceivedTotal),
      revenueCollected: ctx.paymentsReceivedTotal,
      revenueCollectedLabel: formatInr(ctx.paymentsReceivedTotal),
    },
    labs: ctx.labRows,
    activeContractCount: ctx.activeContracts.length,
    blockers,
    pathComplete,
    detail: {
      qualificationStatus:
        ctx.qualifiedCount > 0
          ? `${ctx.qualifiedCount} qualified lab(s)`
          : "No qualified labs",
      contractStatus:
        ctx.activeContracts.length > 0
          ? `${ctx.activeContracts.length} active contract(s)`
          : "No active contracts",
      inventoryReadiness: inventory.status,
      inventoryDetail: inventory.detail,
      orderCount: ctx.ordersCreatedCount,
      fulfillmentCount: ctx.ordersFulfilledCount,
      arBalance: ctx.arOutstandingTotal,
      arBalanceLabel: formatInr(ctx.arOutstandingTotal),
      paymentBalance: ctx.paymentsReceivedTotal,
      paymentBalanceLabel: formatInr(ctx.paymentsReceivedTotal),
    },
  };
}

/**
 * Build read-only commercial revenue funnel for executive portfolio.
 */
export function buildRevenueFunnelModel({
  distributors = [],
  homeTenantId = "",
  labs = [],
  orders = [],
  collections = [],
  contracts = [],
  qualifications = [],
  inventory = [],
} = {}) {
  const context = { labs, orders, collections, contracts, qualifications, inventory };
  const rows = distributors.map((d) => buildDistributorFunnelRow(d, context));

  const portfolio = {
    qualified: rows.reduce((s, r) => s + r.summary.qualified, 0),
    contracted: rows.reduce((s, r) => s + r.summary.contracted, 0),
    ordered: rows.reduce((s, r) => s + r.summary.ordersCreated, 0),
    fulfilled: rows.reduce((s, r) => s + r.summary.ordersFulfilled, 0),
    arOutstanding: rows.reduce((s, r) => s + r.summary.arOutstanding, 0),
    paymentsReceived: rows.reduce((s, r) => s + r.summary.paymentsReceived, 0),
    revenueCollected: rows.reduce((s, r) => s + r.summary.revenueCollected, 0),
  };

  const gunturRow =
    rows.find((r) => str(r.name).toLowerCase().includes("guntur")) ||
    rows.find((r) => r.distributorId && r.distributorId !== homeTenantId) ||
    rows[0] ||
    null;

  return {
    homeTenantId,
    generatedAt: new Date().toISOString(),
    distributors: rows,
    portfolio: {
      ...portfolio,
      arOutstandingLabel: formatInr(portfolio.arOutstanding),
      paymentsReceivedLabel: formatInr(portfolio.paymentsReceived),
      revenueCollectedLabel: formatInr(portfolio.revenueCollected),
    },
    guntur: gunturRow,
    stageColumns: [
      { key: "qualified", label: "Qualified" },
      { key: "contracted", label: "Contracted" },
      { key: "ordered", label: "Ordered" },
      { key: "fulfilled", label: "Fulfilled" },
      { key: "ar", label: "AR" },
      { key: "paid", label: "Paid" },
      { key: "revenue", label: "Revenue" },
    ],
  };
}

export function evaluateCommercialPathComplete(funnelRow = null) {
  if (!funnelRow) {
    return { complete: false, blockers: [{ stage: "data", reason: "No funnel row" }] };
  }
  return {
    complete: funnelRow.pathComplete === true,
    blockers: funnelRow.blockers || [],
    distributorId: funnelRow.distributorId,
    name: funnelRow.name,
  };
}
