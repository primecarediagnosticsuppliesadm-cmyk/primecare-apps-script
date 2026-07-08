/**
 * Phase 9.3 — Employee 360 business profile (read-only compose).
 */
import { formatInr, num, str } from "./analytics/analyticsFormatters.js";

/**
 * @param {{
 *   employee360?: object,
 *   ownershipContext?: object,
 *   employeeMetrics?: object,
 *   reportingContext?: object,
 * }} input
 */
export function buildEmployee360BusinessProfile(input = {}) {
  const base = input.employee360 || {};
  const ownership = input.ownershipContext || {};
  const metrics = input.employeeMetrics || {};

  return {
    previewOnly: true,
    identity: {
      name: base.overview?.name || "—",
      employeeId: base.overview?.employeeId || base.profileUserId || "—",
      role: base.overview?.role || base.employeeRole || "—",
      territory: metrics.territory || ownership.territories || "—",
      joinDate: base.overview?.joinDate || "—",
    },
    compensation: {
      plan: base.overview?.compensationPlan || "—",
      version: base.overview?.currentVersion || "—",
      salary: base.overview?.salary || "—",
      fuel: base.overview?.fuel || "—",
      mobile: base.overview?.mobile || "—",
      commissionPct: base.overview?.commissionPct || "—",
    },
    labsManaged: {
      count: ownership.managedLabCount ?? 0,
      rows: ownership.managedLabs || [],
    },
    collections: {
      managed: metrics.collectionsLabel || base.overview?.currentMonthCollections || "—",
      received: metrics.collectionsLabel || base.overview?.currentMonthCollections || "—",
      efficiency: metrics.collectionEfficiencyLabel || base.overview?.collectionEfficiency || "—",
    },
    revenue: {
      managed: metrics.revenueLabel || "—",
    },
    visits: {
      note: "Visit activity available in Commercial workspace and Agent Visits.",
      deepLinkPage: "visits",
    },
    contracts: {
      note: "Contract context available in Commercial Lab 360.",
      deepLinkPage: "commercialCrm",
    },
    ownership: {
      chain: ownership.ownershipChain || "—",
      reportingTo: ownership.reportingTo || "—",
      manages: ownership.manages || "—",
      attribution: ownership.collectionAttributionLabel || "—",
      overridePreview: ownership.potentialOverrideCompensation || null,
    },
    payroll: {
      history: base.payrollHistory || [],
      currentStatus: base.payrollHistory?.[0]?.status || "—",
    },
    promotion: {
      eligible: base.overview?.promotionStatus || metrics.promotionEligible ? "Eligible" : "—",
      pipelineNote: metrics.promotionEligible ? "In promotion pipeline for selected period" : "—",
    },
    performance: {
      commission: metrics.commissionLabel || base.overview?.currentMonthCommission || "—",
      payrollCost: metrics.payrollCostLabel || "—",
      period: input.reportingContext?.periodYm || "—",
    },
    commissionHistory: base.commissionHistory || [],
    trend: {
      payrollHistory: (base.payrollHistory || []).slice(0, 6),
    },
    forecast: {
      note: "Forecast uses existing compensation intelligence — no duplicate engine.",
    },
  };
}
