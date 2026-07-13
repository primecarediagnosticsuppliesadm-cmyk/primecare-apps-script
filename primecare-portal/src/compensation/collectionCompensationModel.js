/**
 * Phase 9.3 — Collection-based compensation dashboard (read-only compose).
 * Derives from executiveCompensationModel previewRows + intelligence.employeeRows.
 */
import { formatInr, num, roundMoney, roundPct, str } from "./analytics/analyticsFormatters.js";

function commissionPctFromLine(line = {}) {
  const cash = num(line.collectedCash);
  const commission = num(line.commissionAmount);
  if (cash <= 0) return 0;
  return roundPct((commission / cash) * 100);
}

/**
 * @param {{ previewRows?: object[], intelligence?: object, reportingContext?: object }} model
 */
export function buildCollectionCompensationDashboard(model = {}) {
  const employeeIndex = new Map();
  for (const row of model.intelligence?.employeeRows || []) {
    const key = str(row.profileUserId || row.agentId);
    if (key) employeeIndex.set(key, row);
  }

  const periodLabel = model.reportingContext?.periodYm || "—";

  return (model.previewRows || [])
    .filter((row) => row.inReportingContext !== false)
    .map((row) => {
      const key = str(row.profileUserId || row.agentId);
      const metrics = employeeIndex.get(key) || {};
      const collectionsManaged = num(metrics.collections ?? row.collectedCash);
      const collectionsReceived = num(row.collectedCash);
      const commissionPct = commissionPctFromLine(row);

      return {
        lineId: row.lineId,
        profileUserId: row.profileUserId,
        agentId: row.agentId,
        employeeName: row.employeeName || row.agentName || "—",
        employeeRole: metrics.employeeRole || "agent",
        territory: metrics.territory || "—",
        collectionsManaged,
        collectionsManagedLabel: formatInr(collectionsManaged),
        collectionsReceived,
        collectionsReceivedLabel: formatInr(collectionsReceived),
        commissionPct,
        commissionPctLabel: `${commissionPct}%`,
        commissionEarned: num(row.commissionAmount),
        commissionEarnedLabel: formatInr(row.commissionAmount),
        salary: num(row.salaryAmount),
        salaryLabel: formatInr(row.salaryAmount),
        fuel: num(row.fuelAllowance),
        fuelLabel: formatInr(row.fuelAllowance),
        mobile: num(row.mobileAllowance),
        mobileLabel: formatInr(row.mobileAllowance),
        adjustments: roundMoney(num(row.adjustments) + num(row.recoveries)),
        adjustmentsLabel: formatInr(roundMoney(num(row.adjustments) + num(row.recoveries))),
        totalPayable: num(row.netPreview),
        totalPayableLabel: formatInr(row.netPreview),
        status: row.lifecycleStatus || "—",
        period: row.periodYm || periodLabel,
        planCode: row.planCode || "—",
        previewOnly: true,
      };
    })
    .sort((a, b) => b.collectionsReceived - a.collectionsReceived);
}
