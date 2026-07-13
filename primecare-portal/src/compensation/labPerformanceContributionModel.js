/**
 * Phase 9.3 — Lab performance contribution for Lab 360 drawers (read-only).
 * Reuses buildLab360Model output from businessOwnershipModel.
 */
import { formatInr, num, str } from "./analytics/analyticsFormatters.js";

/**
 * @param {{
 *   ownershipLab360?: object,
 *   commercialLab?: object,
 *   visitsCount?: number,
 *   ordersCount?: number,
 * }} input
 */
export function buildLabPerformanceContribution(input = {}) {
  const lab = input.ownershipLab360 || {};
  const commercial = input.commercialLab || {};

  const outstanding = num(commercial.outstanding ?? lab.outstanding);
  const collections = num(lab.collections);
  const revenue = num(lab.ordersVolume ?? commercial.revenue);

  let growth = "stable";
  if (collections > 0 && outstanding > collections * 0.5) growth = "risk";
  else if (collections > 0) growth = "positive";

  let risk = "low";
  if (outstanding > collections) risk = "high";
  else if (outstanding > collections * 0.3) risk = "medium";

  return {
    previewOnly: true,
    labId: lab.labId || commercial.labId,
    labName: lab.labName || commercial.labName,
    revenue,
    revenueLabel: lab.ordersVolumeLabel || formatInr(revenue),
    collections,
    collectionsLabel: lab.collectionsLabel || formatInr(collections),
    outstanding,
    outstandingLabel: lab.outstandingLabel || formatInr(outstanding),
    ordersCount: input.ordersCount ?? 0,
    ordersNote: lab.ordersNote || "Read-only order/AR totals",
    contracts: commercial.contract ? 1 : 0,
    contractStatus: commercial.contract?.status || lab.contractStatus || "—",
    visitsCount: input.visitsCount ?? commercial.visitsCount ?? 0,
    primaryAgent: lab.agentName || commercial.primaryAgent || "—",
    reportingAdmin: lab.adminName || "—",
    executive: lab.executiveName || "—",
    payrollContribution: lab.compensationAttribution?.agentDirectCommissionLabel || "—",
    commissionContribution: lab.compensationAttribution?.agentDirectCommissionLabel || "—",
    growth,
    risk,
    deepLinks: {
      orders: "orders",
      collections: "collections",
      commercial: "commercialCrm",
      peopleOps: "compensationPayroll",
    },
  };
}
