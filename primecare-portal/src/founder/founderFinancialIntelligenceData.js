import { loadDistributorOsPortfolio } from "@/distributor/distributorOsPortfolioData.js";
import { loadOperationsCommandCenterData } from "@/operations/operationsCommandCenterLoader.js";
import { loadVisibleLabContracts } from "@/labContract/labContractStore.js";
import { loadFounderCommissionMetrics } from "@/commission/commissionData.js";
import { filterDistributorRegistry } from "@/distributor/distributorOsEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

/**
 * Load all durable sources for Founder Financial Intelligence (executive HQ layer).
 * @param {object|null} currentUser
 * @param {{ force?: boolean }} [options]
 */
export async function loadFounderFinancialIntelligenceData(currentUser, options = {}) {
  const homeTenantId = str(currentUser?.tenantId || currentUser?.tenant_id);
  const loadOpts = { force: options.force };

  const [portfolio, opsPayload, contracts] = await Promise.all([
    loadDistributorOsPortfolio(currentUser, loadOpts),
    loadOperationsCommandCenterData(currentUser, loadOpts),
    loadVisibleLabContracts(),
  ]);

  const distributors = filterDistributorRegistry(portfolio.bundle?.registry || portfolio.distributors || [], homeTenantId);
  const distributorIds = distributors.map((d) => d.id).filter(Boolean);

  const commissionRes = await loadFounderCommissionMetrics(distributorIds, {
    homeTenantId,
  });

  return {
    homeTenantId,
    portfolio,
    opsPayload,
    contracts,
    commissionRes,
    distributors,
    distributorIds,
    loadStatus: {
      billing: {
        ok: portfolio.billingLedgerLoadOk !== false,
        error: portfolio.billingLedgerLoadError || null,
      },
      commissions: {
        ok: commissionRes.ok === true,
        error: commissionRes.error || null,
      },
      contracts: {
        ok: Array.isArray(contracts),
        error: null,
      },
      collections: {
        ok: Array.isArray(opsPayload?.collections) || Array.isArray(portfolio.raw?.collections),
        error: null,
      },
      ops: {
        ok: Boolean(opsPayload?.dashboard),
        error: null,
      },
    },
  };
}
