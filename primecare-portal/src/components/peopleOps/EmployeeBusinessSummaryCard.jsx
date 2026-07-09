import React from "react";
import { formatPeopleOpsMetricValue } from "@/peopleOps/peopleOpsDataQualityModel.js";

function Field({ label, value }) {
  return (
    <div className="rounded-md border border-border bg-background px-2 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xs font-medium text-foreground">{value ?? "—"}</p>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
    </section>
  );
}

/**
 * RC5 — Employee drawer identity + business summary (compose existing reads only).
 */
export default function EmployeeBusinessSummaryCard({
  overview = {},
  model = null,
  ownershipContext = null,
  businessProfile = null,
}) {
  const labs =
    ownershipContext?.managedLabs?.map((lab) => lab.labName).filter(Boolean).join(", ") ||
    businessProfile?.labsManaged?.rows?.map((lab) => lab.labName).filter(Boolean).join(", ") ||
    "None assigned";
  const territory =
    overview.territory ||
    ownershipContext?.territories ||
    businessProfile?.identity?.territory ||
    "—";
  const lastPayroll = model?.payrollHistory?.[0];
  const phone = overview.phone || overview.mobilePhone || businessProfile?.identity?.phone || "—";
  const email = overview.email || businessProfile?.identity?.email || "—";
  const department = overview.department || businessProfile?.identity?.department || "HQ";

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/10 p-3">
      <Section title="Identity">
        <Field label="Name" value={overview.name} />
        <Field label="Role" value={overview.role} />
        <Field label="Department" value={department} />
        <Field label="Status" value={overview.status} />
        <Field label="Manager" value={overview.manager || ownershipContext?.reportingAdmin || "—"} />
        <Field label="Joined Date" value={overview.joinDateLabel || overview.joinDate || "—"} />
        <Field label="Phone" value={phone} />
        <Field label="Email" value={email} />
      </Section>

      <Section title="Business Summary">
        <Field label="Current Labs" value={labs} />
        <Field label="Current Territory" value={territory} />
        <Field
          label="Monthly Collections"
          value={formatPeopleOpsMetricValue(
            overview.currentMonthCollectionsLabel || businessProfile?.collections?.managed,
            { emptyLabel: "None yet" }
          )}
        />
        <Field
          label="Revenue"
          value={formatPeopleOpsMetricValue(businessProfile?.revenue?.managed, { emptyLabel: "Not available" })}
        />
      </Section>

      <Section title="Payroll Summary">
        <Field label="Current Salary" value={overview.salaryLabel || "—"} />
        <Field
          label="Current Commission"
          value={formatPeopleOpsMetricValue(overview.currentMonthCommissionLabel, { emptyLabel: "None yet" })}
        />
        <Field
          label="Last Payroll"
          value={
            lastPayroll
              ? `${lastPayroll.periodYm || "—"} · ${lastPayroll.netPayLabel || "—"}`
              : "No payroll history yet"
          }
        />
        <Field label="Next Payroll" value="Next approved payroll run" />
      </Section>

      <Section title="Performance Summary">
        <Field label="Orders" value={businessProfile?.orders?.label || "See Commercial"} />
        <Field label="Visits" value={businessProfile?.visits?.note ? "See Visits" : "—"} />
        <Field
          label="Collections"
          value={formatPeopleOpsMetricValue(
            overview.currentMonthCollectionsLabel || businessProfile?.collections?.received,
            { emptyLabel: "None yet" }
          )}
        />
        <Field
          label="Conversion"
          value={formatPeopleOpsMetricValue(overview.collectionEfficiencyLabel || businessProfile?.collections?.efficiency, {
            emptyLabel: "Not available",
          })}
        />
        <Field label="Ranking" value={businessProfile?.performance?.ranking || overview.promotionStatus || "—"} />
      </Section>
    </div>
  );
}
