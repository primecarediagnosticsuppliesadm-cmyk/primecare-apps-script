import { loadFounderFinancialIntelligenceData } from "@/founder/founderFinancialIntelligenceData.js";

function str(v) {
  return String(v ?? "").trim();
}

/**
 * Load read-only sources for Revenue Funnel (reuses FI / portfolio bundle).
 */
export async function loadRevenueFunnelData(currentUser, options = {}) {
  const data = await loadFounderFinancialIntelligenceData(currentUser, options);
  const portfolio = data.portfolio || {};
  const opsPayload = data.opsPayload || {};

  return {
    homeTenantId: data.homeTenantId,
    distributors: data.distributors || [],
    labs: portfolio.raw?.labs || opsPayload.labs || [],
    orders: portfolio.raw?.orders || opsPayload.orders || [],
    collections: portfolio.raw?.collections || opsPayload.collections || [],
    contracts: data.contracts || [],
    qualifications: opsPayload.qualifications || [],
    inventory: opsPayload.inventory || [],
    catalogMirrorSummary: data.catalogMirrorSummary || null,
    loadStatus: data.loadStatus || {},
  };
}

export function normalizeRevenueFunnelBundle(bundle = {}) {
  return {
    homeTenantId: str(bundle.homeTenantId),
    distributors: Array.isArray(bundle.distributors) ? bundle.distributors : [],
    labs: Array.isArray(bundle.labs) ? bundle.labs : [],
    orders: Array.isArray(bundle.orders) ? bundle.orders : [],
    collections: Array.isArray(bundle.collections) ? bundle.collections : [],
    contracts: Array.isArray(bundle.contracts) ? bundle.contracts : [],
    qualifications: Array.isArray(bundle.qualifications) ? bundle.qualifications : [],
    inventory: Array.isArray(bundle.inventory) ? bundle.inventory : [],
    catalogMirrorSummary: bundle.catalogMirrorSummary || null,
  };
}
