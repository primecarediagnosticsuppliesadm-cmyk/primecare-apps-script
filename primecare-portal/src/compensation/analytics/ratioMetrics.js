import {
  labsWithPaymentInPeriod,
  paymentsInPeriod,
  periodRevenueByAgent,
} from "./employeeMetrics.js";
import { formatInr, num, ratioPct, roundMoney } from "./analyticsFormatters.js";

export function buildRatioMetrics({
  payrollLiability = 0,
  employeeRows = [],
  payments = [],
  arRows = [],
  labs = [],
  period = null,
} = {}) {
  const periodPayments = paymentsInPeriod(payments, period);
  const totalCollections = roundMoney(
    periodPayments.reduce((sum, payment) => sum + num(payment.amount_received), 0)
  );

  const activeLabIds = labsWithPaymentInPeriod(periodPayments);
  const revenueByAgent = periodRevenueByAgent(arRows, labs, activeLabIds);
  const totalRevenue = roundMoney(
    [...revenueByAgent.values()].reduce((sum, value) => sum + num(value), 0)
  );

  const employeeCount = Math.max(1, employeeRows.length);
  const totalAgentCollections = roundMoney(
    employeeRows.reduce((sum, row) => sum + num(row.collections), 0)
  );
  const totalAgentRevenue = roundMoney(employeeRows.reduce((sum, row) => sum + num(row.revenue), 0));
  const totalAgentCommission = roundMoney(
    employeeRows.reduce((sum, row) => sum + num(row.commission), 0)
  );
  const totalAgentPayroll = roundMoney(employeeRows.reduce((sum, row) => sum + num(row.payrollCost), 0));

  const payrollPctRevenue = ratioPct(payrollLiability, totalRevenue);
  const payrollPctCollections = ratioPct(payrollLiability, totalCollections);

  return {
    payrollPctRevenue,
    payrollPctRevenueLabel: `${payrollPctRevenue}%`,
    payrollPctCollections,
    payrollPctCollectionsLabel: `${payrollPctCollections}%`,
    revenuePerAgent: roundMoney(totalAgentRevenue / employeeCount),
    revenuePerAgentLabel: formatInr(totalAgentRevenue / employeeCount),
    collectionsPerAgent: roundMoney(totalAgentCollections / employeeCount),
    collectionsPerAgentLabel: formatInr(totalAgentCollections / employeeCount),
    commissionPerAgent: roundMoney(totalAgentCommission / employeeCount),
    commissionPerAgentLabel: formatInr(totalAgentCommission / employeeCount),
    periodYm: period?.period_ym || "—",
    totalRevenue,
    totalRevenueLabel: formatInr(totalRevenue),
    totalCollections,
    totalCollectionsLabel: formatInr(totalCollections),
    totalAgentPayroll,
    totalAgentPayrollLabel: formatInr(totalAgentPayroll),
  };
}
