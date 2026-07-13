import React from "react";
import { KpiCard, KpiCardGrid } from "@/components/ux";
import { DollarSign, Minus, Plus, Users, Wallet } from "lucide-react";
import { formatPeopleOpsMetricValue } from "@/peopleOps/peopleOpsDataQualityModel.js";

export default function PeopleOpsPayrollSummary({ summary }) {
  if (!summary) return null;

  return (
    <KpiCardGrid columns={3} dense>
      <KpiCard dense title="Employees" value={summary.employeesLabel || String(summary.employees)} subtitle="In selected Payroll Preview" icon={Users} />
      <KpiCard dense title="Gross Payroll" value={formatPeopleOpsMetricValue(summary.grossPayrollLabel, { emptyLabel: "No Payroll Preview yet" })} subtitle="Salary + allowances + commission + bonuses" icon={Wallet} />
      <KpiCard dense title="Commission" value={formatPeopleOpsMetricValue(summary.commissionLabel, { emptyLabel: "No commission yet" })} subtitle="From cash collections" icon={DollarSign} />
      <KpiCard dense title="Adjustments" value={formatPeopleOpsMetricValue(summary.adjustmentsLabel, { emptyLabel: "None" })} subtitle="From Payroll Review" icon={Plus} />
      <KpiCard dense title="Recoveries" value={formatPeopleOpsMetricValue(summary.recoveriesLabel, { emptyLabel: "None" })} subtitle="Recoveries and penalties" icon={Minus} />
      <KpiCard dense title="Net Payroll" value={formatPeopleOpsMetricValue(summary.netPayrollLabel, { emptyLabel: "Not calculated yet" })} subtitle="Net payable for this Payroll Run" icon={Wallet} highlight />
    </KpiCardGrid>
  );
}
