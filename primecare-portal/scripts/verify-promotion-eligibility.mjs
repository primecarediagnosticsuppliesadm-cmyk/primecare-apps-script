#!/usr/bin/env node
/**
 * Phase 3B promotion eligibility verification.
 * Read-only/unit: validates Year-1 promotion rules.
 */
import { calculatePromotionEligibility } from "../src/compensation/compensationCalculationEngine.js";

let failures = 0;
function pass(id, detail) {
  console.log(`PASS  ${id}: ${detail}`);
}
function fail(id, detail) {
  console.error(`FAIL  ${id}: ${detail}`);
  failures += 1;
}
function assert(condition, id, detail) {
  if (condition) pass(id, detail);
  else fail(id, detail);
}

const base = {
  cumulativeCollectedCash: 500000,
  collectionEfficiencyPct: 80,
  maxOverdueDays: 90,
  monthsInPlan: 3,
  plan: {
    promotion_collection_threshold: 500000,
    promotion_min_efficiency_pct: 80,
    promotion_max_overdue_days: 90,
  },
};

const eligible = calculatePromotionEligibility(base);
assert(eligible.eligible === true, "promotion.eligible", "all thresholds met");
assert(eligible.status === "promoted", "promotion.status", "promoted status returned");

const cashBlocked = calculatePromotionEligibility({ ...base, cumulativeCollectedCash: 499999 });
assert(cashBlocked.eligible === false, "promotion.cash_block", "cash threshold enforced");
assert(cashBlocked.blockedReasons.includes("collectedCash"), "promotion.cash_reason", "cash blocker recorded");

const efficiencyBlocked = calculatePromotionEligibility({ ...base, collectionEfficiencyPct: 79.99 });
assert(efficiencyBlocked.eligible === false, "promotion.efficiency_block", "80% efficiency enforced");
assert(
  efficiencyBlocked.blockedReasons.includes("collectionEfficiency"),
  "promotion.efficiency_reason",
  "efficiency blocker recorded"
);

const overdueBlocked = calculatePromotionEligibility({ ...base, maxOverdueDays: 91 });
assert(overdueBlocked.eligible === false, "promotion.overdue_block", ">90 day overdue blocker enforced");
assert(overdueBlocked.blockedReasons.includes("overdue"), "promotion.overdue_reason", "overdue blocker recorded");

const monthsBlocked = calculatePromotionEligibility({ ...base, monthsInPlan: 2 });
assert(monthsBlocked.eligible === false, "promotion.months_block", "first 3 months baseline enforced");
assert(
  monthsBlocked.blockedReasons.includes("baselineMonthsComplete"),
  "promotion.months_reason",
  "baseline month blocker recorded"
);

if (failures) {
  console.error(`\nOverall: NO-GO (${failures} failure(s))`);
  process.exit(1);
}
console.log("\nOverall: GO\n");
