import React from "react";
import { KpiCard, KpiCardGrid } from "@/components/ux";
import { DollarSign, Minus, Plus, Users, Wallet } from "lucide-react";

export default function PeopleOpsPayrollSummary({ summary }) {
  if (!summary) return null;

  return (
    <KpiCardGrid columns={3}>
      <KpiCard title="Employees" value={String(summary.employees)} subtitle="In selected payroll run" icon={Users} />
      <KpiCard title="Gross Payroll" value={summary.grossPayrollLabel} subtitle="Salary + allowances + commission + bonuses" icon={Wallet} />
      <KpiCard title="Commission" value={summary.commissionLabel} subtitle="Cash-only commission total" icon={DollarSign} />
      <KpiCard title="Adjustments" value={summary.adjustmentsLabel} subtitle="Manual adjustments" icon={Plus} />
      <KpiCard title="Recoveries" value={summary.recoveriesLabel} subtitle="Recoveries and penalties" icon={Minus} />
      <KpiCard title="Net Payroll" value={summary.netPayrollLabel} subtitle="Net payable for selected run" icon={Wallet} />
    </KpiCardGrid>
  );
}
