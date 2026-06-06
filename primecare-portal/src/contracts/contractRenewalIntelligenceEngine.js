import { CONTRACT_STATUSES } from "@/labContract/labContractTypes.js";
import { formatContractInr } from "@/labContract/labContractEngine.js";

export const RENEWAL_RISK_LEVELS = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  HEALTHY: "Healthy",
};

const PENALTY_BY_RISK = {
  [RENEWAL_RISK_LEVELS.CRITICAL]: 20,
  [RENEWAL_RISK_LEVELS.HIGH]: 12,
  [RENEWAL_RISK_LEVELS.MEDIUM]: 6,
};

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

function isActiveContract(contract) {
  return str(contract?.status) === CONTRACT_STATUSES.ACTIVE;
}

/**
 * Risk band from days until contract end (active contracts only).
 * 0–30 → Critical · 31–60 → High · 61–90 → Medium · 90+ → Healthy
 */
export function renewalRiskLevelFromDays(daysToExpiry) {
  if (daysToExpiry == null || daysToExpiry < 0) return RENEWAL_RISK_LEVELS.HEALTHY;
  if (daysToExpiry <= 30) return RENEWAL_RISK_LEVELS.CRITICAL;
  if (daysToExpiry <= 60) return RENEWAL_RISK_LEVELS.HIGH;
  if (daysToExpiry <= 90) return RENEWAL_RISK_LEVELS.MEDIUM;
  return RENEWAL_RISK_LEVELS.HEALTHY;
}

function isInterventionContract(contract) {
  return (
    isActiveContract(contract) &&
    contract.daysToExpiry != null &&
    contract.daysToExpiry >= 0 &&
    contract.daysToExpiry <= 90
  );
}

function bucketForDays(daysToExpiry) {
  if (daysToExpiry == null || daysToExpiry < 0 || daysToExpiry > 90) return null;
  if (daysToExpiry <= 30) return 30;
  if (daysToExpiry <= 60) return 60;
  return 90;
}

function monthlyCommitment(contract) {
  return num(contract.commercial?.monthlyCommitment);
}

function penaltyForContract(contract) {
  const risk = renewalRiskLevelFromDays(contract.daysToExpiry);
  return PENALTY_BY_RISK[risk] || 0;
}

function renewalHealthScoreFromContracts(contracts = []) {
  const penalty = contracts.reduce((s, c) => s + penaltyForContract(c), 0);
  return clamp(100 - penalty);
}

function portfolioRenewalRiskLevel({ expiring30Count = 0, expiring60Count = 0, expiring90Count = 0 }) {
  if (expiring30Count > 0) return RENEWAL_RISK_LEVELS.CRITICAL;
  if (expiring60Count > 0) return RENEWAL_RISK_LEVELS.HIGH;
  if (expiring90Count > 0) return RENEWAL_RISK_LEVELS.MEDIUM;
  return RENEWAL_RISK_LEVELS.HEALTHY;
}

function buildInterventionQueueRow(contract, distributorNames = new Map()) {
  const distributorId = str(contract.distributorId);
  const riskLevel = renewalRiskLevelFromDays(contract.daysToExpiry);
  const monthlyRevenue = monthlyCommitment(contract);
  const revenueAtRisk = num(contract.revenueUnderContract);

  return {
    contractId: contract.id,
    contractNumber: contract.contractNumber || "—",
    distributorId,
    distributorName:
      contract.distributorName || distributorNames.get(distributorId) || distributorId || "—",
    labId: contract.labId,
    labName: contract.labName || contract.labId || "—",
    expiryDate: str(contract.endDate).slice(0, 10) || "—",
    daysRemaining: contract.daysToExpiry,
    monthlyRevenue,
    monthlyRevenueLabel: formatContractInr(monthlyRevenue),
    revenueAtRisk,
    revenueAtRiskLabel: formatContractInr(revenueAtRisk),
    riskLevel,
    expiryBucket: bucketForDays(contract.daysToExpiry),
  };
}

function buildDistributorRenewalHealthRows(contracts = [], distributorNames = new Map()) {
  const byDistributor = new Map();

  for (const contract of contracts) {
    const distributorId = str(contract.distributorId);
    if (!distributorId) continue;
    const prev = byDistributor.get(distributorId) || {
      distributorId,
      distributorName:
        contract.distributorName || distributorNames.get(distributorId) || distributorId,
      activeContracts: 0,
      expiringContracts: 0,
      revenueAtRisk: 0,
      interventionContracts: [],
    };

    if (isActiveContract(contract)) {
      prev.activeContracts += 1;
      if (isInterventionContract(contract)) {
        prev.expiringContracts += 1;
        prev.revenueAtRisk += num(contract.revenueUnderContract);
        prev.interventionContracts.push(contract);
      }
    }

    byDistributor.set(distributorId, prev);
  }

  return [...byDistributor.values()]
    .map((row) => ({
      distributorId: row.distributorId,
      distributorName: row.distributorName,
      activeContracts: row.activeContracts,
      expiringContracts: row.expiringContracts,
      revenueAtRisk: row.revenueAtRisk,
      revenueAtRiskLabel: formatContractInr(row.revenueAtRisk),
      renewalHealthScore: renewalHealthScoreFromContracts(row.interventionContracts),
      renewalHealthLabel: `${renewalHealthScoreFromContracts(row.interventionContracts)}%`,
    }))
    .sort((a, b) => a.renewalHealthScore - b.renewalHealthScore || b.revenueAtRisk - a.revenueAtRisk);
}

/**
 * Authoritative contract renewal intelligence from an existing lab contract model.
 * @param {{ contracts?: object[] }} contractModel — output of buildLabContractModel()
 * @param {{ distributorNames?: Map<string,string>, distributorId?: string }} [options]
 */
export function buildContractRenewalIntelligence(contractModel, options = {}) {
  const allContracts = Array.isArray(contractModel?.contracts) ? contractModel.contracts : [];
  const distributorId = str(options.distributorId);
  const distributorNames = options.distributorNames || new Map();

  const contracts = distributorId
    ? allContracts.filter((c) => str(c.distributorId) === distributorId)
    : allContracts;

  const interventionContracts = contracts.filter(isInterventionContract);

  const expiring30Count = interventionContracts.filter((c) => c.daysToExpiry <= 30).length;
  const expiring60Count = interventionContracts.filter(
    (c) => c.daysToExpiry > 30 && c.daysToExpiry <= 60
  ).length;
  const expiring90Count = interventionContracts.filter(
    (c) => c.daysToExpiry > 60 && c.daysToExpiry <= 90
  ).length;

  const revenueAtRisk = interventionContracts.reduce(
    (s, c) => s + num(c.revenueUnderContract),
    0
  );
  const committedRevenueAtRisk = interventionContracts.reduce(
    (s, c) => s + monthlyCommitment(c),
    0
  );

  const renewalRiskLevel = portfolioRenewalRiskLevel({
    expiring30Count,
    expiring60Count,
    expiring90Count,
  });
  const renewalHealthScore = renewalHealthScoreFromContracts(interventionContracts);

  const interventionQueue = interventionContracts
    .map((c) => buildInterventionQueueRow(c, distributorNames))
    .sort((a, b) => num(a.daysRemaining) - num(b.daysRemaining));

  const distributorRenewalHealth = buildDistributorRenewalHealthRows(contracts, distributorNames);

  const activeContracts = contracts.filter(isActiveContract).length;
  const expiringSoon = interventionContracts.length;

  return {
    expiring30Count,
    expiring60Count,
    expiring90Count,
    expiringIn90Total: expiring30Count + expiring60Count + expiring90Count,
    revenueAtRisk,
    revenueAtRiskLabel: formatContractInr(revenueAtRisk),
    committedRevenueAtRisk,
    committedRevenueAtRiskLabel: formatContractInr(committedRevenueAtRisk),
    renewalRiskLevel,
    renewalHealthScore,
    renewalHealthLabel: `${renewalHealthScore}%`,
    interventionQueueCount: interventionQueue.length,
    interventionQueue,
    distributorRenewalHealth,
    activeContracts,
    expiringSoon,
    scopedDistributorId: distributorId || null,
  };
}
