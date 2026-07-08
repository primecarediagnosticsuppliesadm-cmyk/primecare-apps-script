import React from "react";
import { EnterpriseDataTable, KpiCard, KpiCardGrid, StatusBadge } from "@/components/ux";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import { IndianRupee, Wallet } from "lucide-react";

const columns = [
  { key: "employeeName", label: "Employee", sortable: true },
  { key: "territory", label: "Territory" },
  { key: "collectionsManagedLabel", label: "Collections Managed" },
  { key: "collectionsReceivedLabel", label: "Collections Received" },
  { key: "commissionPctLabel", label: "Commission %" },
  { key: "commissionEarnedLabel", label: "Commission Earned" },
  { key: "salaryLabel", label: "Salary" },
  { key: "totalPayableLabel", label: "Total Payable" },
  { key: "status", label: "Status" },
  { key: "period", label: "Period" },
];

export default function CollectionCompensationDashboard({ rows = [], reportingContext = null }) {
  const totals = rows.reduce(
    (acc, row) => ({
      collections: acc.collections + Number(row.collectionsReceived || 0),
      commission: acc.commission + Number(row.commissionEarned || 0),
      payable: acc.payable + Number(row.totalPayable || 0),
    }),
    { collections: 0, commission: 0, payable: 0 }
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge variant="info" label="Read only" />
        <StatusBadge variant="neutral" label={`Period ${reportingContext?.periodYm || "—"}`} />
      </div>
      <KpiCardGrid>
        <KpiCard title="Collections Received" value={`₹${totals.collections.toLocaleString("en-IN")}`} icon={Wallet} />
        <KpiCard title="Commission Earned" value={`₹${totals.commission.toLocaleString("en-IN")}`} icon={IndianRupee} />
        <KpiCard title="Total Payable" value={`₹${totals.payable.toLocaleString("en-IN")}`} icon={IndianRupee} />
        <KpiCard title="Employees" value={String(rows.length)} icon={Wallet} />
      </KpiCardGrid>
      <PeopleOpsSectionCard
        title="Collection Compensation"
        subtitle="Derived from payroll preview lines and collection metrics — no write logic"
      >
        <EnterpriseDataTable columns={columns} rows={rows} rowKey="lineId" emptyMessage="No payroll lines in reporting context." />
      </PeopleOpsSectionCard>
    </div>
  );
}
