import { buildProfileMaps } from "./analyticsExclusions.js";
import {
  formatInr,
  num,
  roundMoney,
  roundPct,
  snapshotField,
  str,
} from "./analyticsFormatters.js";

function paymentsInPeriod(payments = [], period = null) {
  if (!period) return payments || [];
  const start = str(period.period_start);
  const end = str(period.period_end);
  return (payments || []).filter((payment) => {
    const d = str(payment.payment_date).slice(0, 10);
    if (!d) return false;
    if (start && d < start) return false;
    if (end && d > end) return false;
    return num(payment.amount_received) > 0;
  });
}

function agentTerritoryMap(labs = []) {
  const map = new Map();
  for (const lab of labs || []) {
    const agentId = str(lab.assigned_agent_id);
    if (!agentId) continue;
    const territory = str(lab.area || lab.territory) || "Unassigned";
    const existing = map.get(agentId) || new Set();
    existing.add(territory);
    map.set(agentId, existing);
  }
  return map;
}

function labsWithPaymentInPeriod(periodPayments = []) {
  const labs = new Set();
  for (const payment of periodPayments || []) {
    const labId = str(payment.lab_id);
    if (labId) labs.add(labId);
  }
  return labs;
}

function periodRevenueByAgent(arRows = [], labs = [], activeLabIds = new Set()) {
  const labAgent = new Map(
    (labs || [])
      .filter((lab) => str(lab.assigned_agent_id))
      .map((lab) => [str(lab.lab_id), str(lab.assigned_agent_id)])
  );
  const totals = new Map();
  for (const row of arRows || []) {
    const labId = str(row.lab_id);
    if (activeLabIds.size > 0 && !activeLabIds.has(labId)) continue;
    const agentId = labAgent.get(labId);
    if (!agentId) continue;
    totals.set(agentId, roundMoney((totals.get(agentId) || 0) + num(row.total_delivered)));
  }
  return totals;
}

function collectionsByAgent(payments = []) {
  const totals = new Map();
  for (const payment of payments || []) {
    const agentId = str(payment.agent_id);
    if (!agentId) continue;
    totals.set(agentId, roundMoney((totals.get(agentId) || 0) + num(payment.amount_received)));
  }
  return totals;
}

function profileTerritory(profile, agentId, territoryMap) {
  if (agentId && territoryMap.has(agentId)) {
    return [...territoryMap.get(agentId)].join(", ");
  }
  return str(profile?.area) || "—";
}

/**
 * Build profile-primary employee metric rows for the selected reporting context.
 */
export function buildEmployeeMetrics({
  contextLines = [],
  profiles = [],
  assignments = [],
  labs = [],
  payments = [],
  arRows = [],
  period = null,
} = {}) {
  const { profileById, profileByAgentId } = buildProfileMaps(profiles);
  const periodPayments = paymentsInPeriod(payments, period);
  const activeLabIds = labsWithPaymentInPeriod(periodPayments);
  const revenueByAgent = periodRevenueByAgent(arRows, labs, activeLabIds);
  const collectionsMap = collectionsByAgent(periodPayments);
  const territoryMap = agentTerritoryMap(labs);

  const rows = [];
  for (const line of contextLines) {
    const profileUserId = str(line.profile_user_id);
    const agentId = str(line.agent_id);
    const profile =
      (profileUserId ? profileById.get(profileUserId) : null) ||
      (agentId ? profileByAgentId.get(agentId) : null);
    const assignment =
      (assignments || []).find(
        (row) =>
          str(row.profile_user_id) === profileUserId ||
          (agentId && str(row.agent_id) === agentId && row.assignment_status === "active")
      ) || null;

    const payrollCost = roundMoney(num(line.net_payable));
    const commission = roundMoney(num(line.commission_amount));
    const collectionEfficiency = roundPct(num(snapshotField(line, "collection_efficiency_pct")));
    const collections = agentId ? collectionsMap.get(agentId) || 0 : 0;
    const revenue = agentId ? revenueByAgent.get(agentId) || 0 : 0;
    const employeeRole = str(
      line.employee_role || profile?.role || assignment?.employee_role || "agent"
    ).toLowerCase();

    rows.push({
      profileUserId: profileUserId || null,
      agentId: agentId || null,
      employeeRole,
      agentName:
        line.employee_name ||
        line.agent_name ||
        profile?.display_name ||
        profile?.agent_name ||
        profileUserId ||
        agentId ||
        "—",
      territory: profileTerritory(profile, agentId, territoryMap),
      collections,
      collectionsLabel: formatInr(collections),
      revenue,
      revenueLabel: formatInr(revenue),
      commission,
      commissionLabel: formatInr(commission),
      collectionEfficiency,
      collectionEfficiencyLabel: `${collectionEfficiency}%`,
      payrollCost,
      payrollCostLabel: formatInr(payrollCost),
      promotionEligible: snapshotField(line, "promotion_eligible", false) === true,
    });
  }

  return rows;
}

export { paymentsInPeriod, labsWithPaymentInPeriod, periodRevenueByAgent, collectionsByAgent };
