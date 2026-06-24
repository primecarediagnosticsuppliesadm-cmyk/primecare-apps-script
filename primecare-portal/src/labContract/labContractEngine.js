import {
  CONTRACT_STATUSES,
  CONTRACT_TYPES,
  HEALTH_BANDS,
  REAGENT_COMPLIANCE,
} from "@/labContract/labContractTypes.js";
import { labIdKey } from "@/utils/labId.js";
import { hqDebugLog, hqDebugWarn } from "@/utils/hqDebugLog.js";
import {
  buildLineTotalByOrderId,
  orderCountsTowardDashboardRevenue,
  orderOperationalExcludedFromIndices,
  resolveOrderAmount,
} from "@/metrics/computeRevenueMetrics.js";

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

export function formatContractInr(n) {
  return `₹${num(n).toLocaleString("en-IN")}`;
}

function parseDate(iso) {
  const s = str(iso).slice(0, 10);
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function daysBetween(startIso, endIso) {
  const a = parseDate(startIso);
  const b = parseDate(endIso);
  if (a == null || b == null) return 0;
  return Math.max(0, Math.floor((b - a) / 86400000));
}

function daysUntil(iso) {
  const end = parseDate(iso);
  if (end == null) return null;
  return Math.floor((end - Date.now()) / 86400000);
}

function isActiveStatus(status) {
  return str(status) === CONTRACT_STATUSES.ACTIVE;
}

function isPipelineStatus(status) {
  const s = str(status);
  return (
    s === CONTRACT_STATUSES.DRAFT ||
    s === CONTRACT_STATUSES.UNDER_REVIEW ||
    s === CONTRACT_STATUSES.ACTIVE
  );
}

function normalizeLabName(name) {
  return str(name).toLowerCase().replace(/\s+/g, " ");
}

function registerLab(labs, row = {}) {
  const lid = labIdKey(row.labId ?? row.lab_id ?? row.id);
  if (!lid) return;
  labs.set(lid, {
    labId: lid,
    labName: str(row.labName ?? row.lab_name ?? row.name) || lid,
    tenantId: str(row.tenantId ?? row.tenant_id),
  });
}

/**
 * Resolve contract lab against ops lookups — ID first, then normalized name (readiness only).
 */
export function resolveContractLabMatch(contract = {}, labs = new Map()) {
  const contractLabId = labIdKey(contract.labId);
  const contractLabName = str(contract.labName);
  const contractTenantId = str(contract.tenantId || contract.distributorId);

  if (contractLabId && labs.has(contractLabId)) {
    return {
      pass: true,
      matchBy: "id",
      matched: labs.get(contractLabId),
      contractLabId,
      contractLabName,
      contractTenantId,
    };
  }

  const normalizedContractName = normalizeLabName(contractLabName);
  if (normalizedContractName) {
    for (const [, lab] of labs.entries()) {
      const labTenantId = str(lab.tenantId);
      if (contractTenantId && labTenantId && labTenantId !== contractTenantId) continue;
      if (normalizeLabName(lab.labName) === normalizedContractName) {
        return {
          pass: true,
          matchBy: "name",
          matched: lab,
          contractLabId,
          contractLabName,
          contractTenantId,
        };
      }
    }
  }

  return {
    pass: false,
    matchBy: null,
    matched: null,
    contractLabId,
    contractLabName,
    contractTenantId,
  };
}

/**
 * Build lab + distributor lookup maps from ops (memoized per payload ref).
 */
export function buildOpsLookups(payload) {
  const labs = new Map();
  for (const l of payload?.dashboard?.labs || []) {
    registerLab(labs, l);
  }
  for (const l of payload?.creditLabs || []) {
    registerLab(labs, l);
  }
  for (const c of payload?.collections || []) {
    const lid = labIdKey(c.labId);
    if (!lid || labs.has(lid)) continue;
    registerLab(labs, {
      labId: lid,
      labName: c.labName,
      tenantId: c.tenantId ?? c.tenant_id,
    });
  }
  for (const o of payload?.orders || []) {
    const lid = labIdKey(o.lab_id ?? o.labId);
    if (!lid || labs.has(lid)) continue;
    registerLab(labs, {
      labId: lid,
      labName: o.labName ?? o.lab_name,
      tenantId: o.tenantId ?? o.tenant_id,
    });
  }

  const collectionsByLab = new Map();
  for (const c of payload?.collections || []) {
    const lid = labIdKey(c.labId);
    if (!lid) continue;
    const prev = collectionsByLab.get(lid) || {
      collected: 0,
      outstanding: 0,
      targetPct: 0,
    };
    prev.collected += num(c.totalPaid);
    prev.outstanding += num(c.outstandingAmount);
    collectionsByLab.set(lid, prev);
  }

  const lineTotals = buildLineTotalByOrderId(payload?.orderLines || []);
  const ordersByLab = new Map();
  for (const o of payload?.orders || []) {
    if (orderOperationalExcludedFromIndices(o)) continue;
    const lid = labIdKey(o.lab_id ?? o.labId);
    if (!lid) continue;
    const prev = ordersByLab.get(lid) || { revenue: 0, fulfilled: 0, total: 0 };
    const amt = resolveOrderAmount(o, lineTotals);
    prev.total += 1;
    if (orderCountsTowardDashboardRevenue(o)) {
      prev.revenue += amt;
      const st = str(o.orderStatus ?? o.order_status).toLowerCase();
      if (st.includes("fulfill") || st.includes("deliver")) prev.fulfilled += 1;
    }
    ordersByLab.set(lid, prev);
  }

  return { labs, collectionsByLab, ordersByLab, lineTotals };
}

export function computeContractReadiness(contract, { labs, distributors }) {
  const checks = [];
  const distributorOk = Boolean(
    contract.distributorId && distributors.has(str(contract.distributorId))
  );
  checks.push({
    id: "distributor",
    label: "Distributor exists",
    pass: distributorOk,
    weight: 20,
  });

  const labMatch = resolveContractLabMatch(contract, labs);
  const labDetail = labMatch.pass
    ? `PASS · ${labMatch.matchBy} match · ${labMatch.matched?.labName || "—"} (${labMatch.matched?.labId || "—"})`
    : `FAIL · contract lab ${labMatch.contractLabId || "—"} "${labMatch.contractLabName || "—"}" · tenant ${labMatch.contractTenantId || "—"} · ${labs.size} lab(s) indexed`;
  if (!labMatch.pass) {
    hqDebugWarn("[contractReadiness] lab match failed", {
      contractLabId: labMatch.contractLabId,
      lookupCount: labs.size,
    });
  } else {
    hqDebugLog("[contractReadiness] lab match ok", {
      contractLabId: labMatch.contractLabId,
      matchBy: labMatch.matchBy,
    });
  }
  checks.push({
    id: "lab",
    label: "Lab exists",
    detail: labDetail,
    pass: labMatch.pass,
    weight: 20,
    matchBy: labMatch.matchBy,
    matchedLab: labMatch.matched,
  });

  const commercial = contract.commercial || {};
  const paymentOk = Boolean(str(commercial.paymentTerms));
  checks.push({
    id: "payment_terms",
    label: "Payment terms configured",
    pass: paymentOk,
    weight: 15,
  });

  const termsOk =
    num(commercial.monthlyCommitment) > 0 ||
    num(commercial.creditLimit) > 0 ||
    num(commercial.collectionTargetPct) > 0;
  checks.push({
    id: "commercial_terms",
    label: "Commercial terms configured",
    pass: termsOk,
    weight: 25,
  });

  const ownerOk = Boolean(str(contract.owner));
  checks.push({
    id: "owner",
    label: "Contract owner assigned",
    pass: ownerOk,
    weight: 20,
  });

  const earned = checks.filter((c) => c.pass).reduce((s, c) => s + c.weight, 0);
  return {
    score: clamp(earned),
    checks,
    canActivate: earned >= 100 && checks.every((c) => c.pass),
  };
}

export function computeContractHealth(contract, labMetrics) {
  const commercial = contract.commercial || {};
  const commitment = num(commercial.monthlyCommitment);
  const targetPct = num(commercial.collectionTargetPct) || 85;
  const collected = num(labMetrics?.collected);
  const outstanding = num(labMetrics?.outstanding);
  const revenue = num(labMetrics?.revenue);
  const fulfillmentPct = num(labMetrics?.fulfillmentPct);

  const collectionPct =
    collected + outstanding > 0 ? clamp((collected / (collected + outstanding)) * 100) : collected > 0 ? 100 : 0;

  const commitmentPct =
    commitment > 0 ? clamp((revenue / commitment) * 100) : revenue > 0 ? 100 : 0;

  let band = HEALTH_BANDS.HEALTHY;
  if (
    collectionPct < targetPct - 15 ||
    commitmentPct < 50 ||
    fulfillmentPct < 40
  ) {
    band = HEALTH_BANDS.RISK;
  } else if (
    collectionPct < targetPct ||
    commitmentPct < 75 ||
    fulfillmentPct < 60
  ) {
    band = HEALTH_BANDS.WATCH;
  }

  const healthScore = clamp(
    collectionPct * 0.35 + commitmentPct * 0.35 + fulfillmentPct * 0.3
  );

  return {
    band,
    healthScore,
    collectionPct,
    commitmentPct,
    fulfillmentPct,
    revenueUnderContract: revenue,
  };
}

export function computeL1bTracking(contract, labMetrics) {
  const l1b = contract.l1b || {};
  const commitment = num(l1b.monthlyCommitment || contract.commercial?.monthlyCommitment);
  const revenue = num(labMetrics?.revenue);
  const fulfilled = num(labMetrics?.fulfilled);
  const total = num(labMetrics?.total);
  const fulfillmentPct = total > 0 ? clamp((fulfilled / total) * 100) : 0;
  const utilizationPct =
    commitment > 0 ? clamp((revenue / commitment) * 100) : revenue > 0 ? 100 : 0;

  const lockInRemaining = num(l1b.lockInMonthsRemaining ?? l1b.lockInMonths);
  let compliance = REAGENT_COMPLIANCE.COMPLIANT;
  if (utilizationPct < 40 || fulfillmentPct < 40) compliance = REAGENT_COMPLIANCE.BREACH_RISK;
  else if (utilizationPct < 60 || fulfillmentPct < 60 || lockInRemaining > 0 && utilizationPct < 50) {
    compliance = REAGENT_COMPLIANCE.AT_RISK;
  }

  return {
    instrumentName: str(l1b.instrumentName) || "—",
    instrumentValue: num(l1b.instrumentValue),
    monthlyCommitment: commitment,
    lockInMonthsRemaining: lockInRemaining,
    utilizationPct,
    fulfillmentPct,
    compliance,
  };
}

function enrichContract(contract, lookups, distributors) {
  const lid = labIdKey(contract.labId);
  const labMetrics = lookups.collectionsByLab.get(lid) || {};
  const orderMetrics = lookups.ordersByLab.get(lid) || {};
  const mergedLab = {
    collected: labMetrics.collected,
    outstanding: labMetrics.outstanding,
    revenue: orderMetrics.revenue,
    fulfilled: orderMetrics.fulfilled,
    total: orderMetrics.total,
    fulfillmentPct:
      orderMetrics.total > 0
        ? clamp((orderMetrics.fulfilled / orderMetrics.total) * 100)
        : 0,
  };

  const readiness = computeContractReadiness(contract, {
    labs: lookups.labs,
    distributors,
  });
  const health = computeContractHealth(contract, mergedLab);
  const daysToExpiry = daysUntil(contract.endDate);
  const l1b =
    contract.contractType === CONTRACT_TYPES.L1B_REAGENT_RENTAL ||
    contract.contractType === CONTRACT_TYPES.HYBRID
      ? computeL1bTracking(contract, mergedLab)
      : null;

  return {
    ...contract,
    labName: contract.labName || lookups.labs.get(lid)?.labName || lid,
    readiness,
    health,
    healthBand: health.band,
    healthScore: health.healthScore,
    revenueUnderContract: health.revenueUnderContract,
    daysToExpiry,
    expiryBucket:
      daysToExpiry != null && daysToExpiry <= 30
        ? 30
        : daysToExpiry != null && daysToExpiry <= 60
          ? 60
          : daysToExpiry != null && daysToExpiry <= 90
            ? 90
            : null,
    l1b,
  };
}

export function buildContractDashboard(enrichedContracts) {
  const active = enrichedContracts.filter((c) => isActiveStatus(c.status));
  const pipeline = enrichedContracts.filter((c) => isPipelineStatus(c.status));
  const expiring90 = active.filter(
    (c) => c.daysToExpiry != null && c.daysToExpiry >= 0 && c.daysToExpiry <= 90
  );
  const reagentActive = active.filter(
    (c) =>
      c.contractType === CONTRACT_TYPES.L1B_REAGENT_RENTAL ||
      c.contractType === CONTRACT_TYPES.HYBRID
  );

  const monthlyCommitted = active.reduce(
    (s, c) => s + num(c.commercial?.monthlyCommitment),
    0
  );
  const revenueUnderContract = active.reduce(
    (s, c) => s + num(c.revenueUnderContract),
    0
  );
  const healthScore =
    active.length > 0
      ? clamp(active.reduce((s, c) => s + num(c.healthScore), 0) / active.length)
      : 0;

  return {
    activeCount: active.length,
    pipelineCount: pipeline.length,
    monthlyCommittedRevenue: monthlyCommitted,
    monthlyCommittedLabel: formatContractInr(monthlyCommitted),
    revenueUnderContract,
    revenueUnderContractLabel: formatContractInr(revenueUnderContract),
    expiring90Count: expiring90.length,
    reagentRentalsActive: reagentActive.length,
    contractHealthScore: healthScore,
    draftCount: enrichedContracts.filter((c) => c.status === CONTRACT_STATUSES.DRAFT).length,
    underReviewCount: enrichedContracts.filter(
      (c) => c.status === CONTRACT_STATUSES.UNDER_REVIEW
    ).length,
  };
}

export function buildRenewalCenter(enrichedContracts) {
  const renewals = enrichedContracts.filter(
    (c) =>
      isActiveStatus(c.status) &&
      c.daysToExpiry != null &&
      c.daysToExpiry >= 0 &&
      c.daysToExpiry <= 90
  );
  return {
    expiring30: renewals.filter((c) => c.expiryBucket === 30),
    expiring60: renewals.filter((c) => c.expiryBucket === 60 || c.expiryBucket === 30),
    expiring90: renewals,
  };
}

export function buildContractGrowthMetrics(contracts) {
  const enriched = contracts;
  const active = enriched.filter((c) => isActiveStatus(c.status));
  const pipeline = enriched.filter(
    (c) =>
      c.status === CONTRACT_STATUSES.DRAFT ||
      c.status === CONTRACT_STATUSES.UNDER_REVIEW
  );
  const monthlyCommitted = active.reduce(
    (s, c) => s + num(c.commercial?.monthlyCommitment),
    0
  );
  return {
    activeContractCount: active.length,
    monthlyCommittedRevenue: monthlyCommitted,
    monthlyCommittedLabel: formatContractInr(monthlyCommitted),
    pipelineCount: pipeline.length,
    expiring90Count: active.filter(
      (c) => c.daysToExpiry != null && c.daysToExpiry >= 0 && c.daysToExpiry <= 90
    ).length,
  };
}

export function buildContractSummaryForDistributor(distributorId, contracts, payload) {
  const safeContracts = Array.isArray(contracts) ? contracts : [];
  const lookups = buildOpsLookups(payload || {});
  const distributors = new Set([str(distributorId)]);
  const scoped = safeContracts
    .filter((c) => str(c.distributorId) === str(distributorId))
    .map((c) => enrichContract(c, lookups, distributors));

  const active = scoped.filter((c) => isActiveStatus(c.status));
  const alerts = scoped.filter(
    (c) =>
      (c.daysToExpiry != null && c.daysToExpiry >= 0 && c.daysToExpiry <= 90) ||
      c.healthBand === HEALTH_BANDS.RISK
  );

  return {
    activeContracts: active.length,
    monthlyContractValue: active.reduce(
      (s, c) => s + num(c.commercial?.monthlyCommitment),
      0
    ),
    contractHealthScore:
      active.length > 0
        ? clamp(active.reduce((s, c) => s + num(c.healthScore), 0) / active.length)
        : 0,
    contractHealthBand:
      active.some((c) => c.healthBand === HEALTH_BANDS.RISK)
        ? HEALTH_BANDS.RISK
        : active.some((c) => c.healthBand === HEALTH_BANDS.WATCH)
          ? HEALTH_BANDS.WATCH
          : HEALTH_BANDS.HEALTHY,
    expiryAlerts: alerts.slice(0, 5).map((c) => ({
      contractNumber: c.contractNumber,
      labName: c.labName,
      daysToExpiry: c.daysToExpiry,
      healthBand: c.healthBand,
    })),
  };
}

/**
 * @param {object[]} contracts
 * @param {object} payload
 * @param {Set<string>} distributors
 */
export function buildLabContractModel(contracts, payload, distributors) {
  const lookups = buildOpsLookups(payload);
  const enriched = contracts.map((c) => enrichContract(c, lookups, distributors));
  const dashboard = buildContractDashboard(enriched);
  const renewal = buildRenewalCenter(enriched);
  const growth = buildContractGrowthMetrics(enriched);

  return {
    contracts: enriched,
    dashboard,
    renewal,
    growth,
    lookups,
  };
}

export function validateContractDates(contract) {
  const start = parseDate(contract.startDate);
  const end = parseDate(contract.endDate);
  if (start != null && end != null && end < start) return false;
  return true;
}

export function nextContractNumber(tenantId, labId, existing) {
  const seq = (existing?.length || 0) + 1;
  const labPart = labIdKey(labId).replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase() || "LAB";
  const tenantPart = str(tenantId).slice(0, 6).toUpperCase() || "HQ";
  return `PC-${tenantPart}-${labPart}-${String(seq).padStart(4, "0")}`;
}
