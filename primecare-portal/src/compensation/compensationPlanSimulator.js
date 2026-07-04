/**
 * Phase 5A compensation plan simulator — preview only, no persistence.
 */

import { calculatePromotionEligibility } from "./compensationCalculationEngine.js";
import {
  commissionBpsFromPct,
  commissionPctFromBps,
  normalizePlanRulesJson,
} from "./compensationPlanAdminWorkflow.js";

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(value) {
  return Math.round((num(value) + Number.EPSILON) * 100) / 100;
}

function formatInr(value) {
  return `₹${roundMoney(value).toLocaleString("en-IN")}`;
}

export function simulateCompensationPlan({
  salary = 0,
  fuel = 0,
  mobile = 0,
  commissionRatePct = 0,
  collectionAmount = 0,
  promotionSalary = 0,
  promotionCommissionRatePct = 0,
  promotionCollectionThreshold = 0,
  promotionMinEfficiencyPct = 0,
  promotionMaxOverdueDays = 0,
  cumulativeCollectionAmount = 0,
  collectionEfficiencyPct = 0,
  maxOverdueDays = 0,
  monthsInPlan = 0,
  rulesJson = {},
} = {}) {
  const commissionRateBps = commissionBpsFromPct(commissionRatePct);
  const expectedCommission = roundMoney((num(collectionAmount) * commissionRateBps) / 10_000);
  const fixedPay = roundMoney(num(salary) + num(fuel) + num(mobile));
  const expectedPayroll = roundMoney(fixedPay + expectedCommission);
  const netPayroll = expectedPayroll;

  const promotion = calculatePromotionEligibility({
    cumulativeCollectedCash: num(cumulativeCollectionAmount || collectionAmount),
    collectionEfficiencyPct: num(collectionEfficiencyPct),
    maxOverdueDays: num(maxOverdueDays),
    monthsInPlan: num(monthsInPlan),
    plan: {
      promotion_collection_threshold: num(promotionCollectionThreshold),
      promotion_min_efficiency_pct: num(promotionMinEfficiencyPct),
      promotion_max_overdue_days: num(promotionMaxOverdueDays),
      promotion_salary: num(promotionSalary),
      promotion_commission_rate_bps: commissionBpsFromPct(promotionCommissionRatePct),
    },
  });

  const rules = normalizePlanRulesJson(rulesJson);

  return {
    previewOnly: true,
    writesData: false,
    inputs: {
      salary: num(salary),
      fuel: num(fuel),
      mobile: num(mobile),
      commissionRatePct: num(commissionRatePct),
      collectionAmount: num(collectionAmount),
    },
    outputs: {
      expectedCommission,
      expectedCommissionLabel: formatInr(expectedCommission),
      expectedPayroll,
      expectedPayrollLabel: formatInr(expectedPayroll),
      netPayroll,
      netPayrollLabel: formatInr(netPayroll),
      fixedPay,
      fixedPayLabel: formatInr(fixedPay),
      commissionRateBps,
      commissionRatePct: commissionPctFromBps(commissionRateBps),
    },
    promotionPreview: {
      eligible: promotion.eligible,
      status: promotion.status,
      blockedReasons: promotion.blockedReasons,
      recommendedPromotionSalary: num(promotionSalary),
      recommendedPromotionCommissionPct: num(promotionCommissionRatePct),
    },
    rules,
  };
}
