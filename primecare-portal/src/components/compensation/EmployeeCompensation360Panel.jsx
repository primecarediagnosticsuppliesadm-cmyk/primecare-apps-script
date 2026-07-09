import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EnterpriseDataTable, StatusBadge } from "@/components/ux";
import { ArrowLeft, Eye, History, TrendingUp, Wallet, GitBranch } from "lucide-react";
import CompensationAttributionPreview from "@/components/peopleOps/ownership/CompensationAttributionPreview.jsx";
import EmployeeBusinessSummaryCard from "@/components/peopleOps/EmployeeBusinessSummaryCard.jsx";

const STATUS_VARIANT = {
  draft: "neutral",
  previewed: "info",
  submitted: "warning",
  approved: "info",
  locked: "warning",
  exported: "success",
  paid: "success",
  active: "success",
  ended: "neutral",
  retired: "warning",
};

const SECTION_LABELS = {
  overview: "Identity & Business",
  payrollHistory: "Payroll History",
  commissionHistory: "Collections",
  compensationPlan: "Current Pay Structure",
  adjustments: "Adjustments",
  promotion: "Promotion",
  auditTimeline: "Audit & Timeline",
};

const SECTION_ORDER = [
  "overview",
  "commissionHistory",
  "compensationPlan",
  "payrollHistory",
  "promotion",
  "adjustments",
  "auditTimeline",
];

function Field({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm text-slate-900">{value ?? "—"}</p>
    </div>
  );
}

function SectionShell({ title, icon: Icon, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-700">
        {Icon ? <Icon className="h-4 w-4 text-indigo-600" aria-hidden /> : null}
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function EmployeeCompensation360Panel({
  model,
  ownershipContext = null,
  businessProfile = null,
  permissions,
  loading = false,
  error = "",
  onBack,
  onChangePlan,
  onAssignPlan,
  busy = false,
  selectablePlans = [],
  embedded = false,
}) {
  const [activeSection, setActiveSection] = useState("overview");
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [newPlanId, setNewPlanId] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));

  const overview = model?.overview || {};
  const activeAssignment = model?.activeAssignment;
  const commissionEligible = model?.commissionEligible !== false && overview.role === "agent";

  const sections = useMemo(() => {
    const ids = model?.sections || SECTION_ORDER;
    const ordered = SECTION_ORDER.filter((id) => ids.includes(id));
    const rest = ids.filter((id) => !SECTION_ORDER.includes(id));
    return [...ordered, ...rest].map((id) => ({ id, label: SECTION_LABELS[id] || id }));
  }, [model]);

  const planOptions = useMemo(
    () => (selectablePlans.length ? selectablePlans : model?.selectablePlans || []),
    [model, selectablePlans]
  );

  if (loading && !model) {
    return <p className="text-sm text-slate-500">Loading Employee Compensation 360…</p>;
  }
  if (error && !model) {
    return (
      <div className="space-y-3">
        {!embedded ? (
          <Button type="button" size="sm" variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Employees
          </Button>
        ) : null}
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      </div>
    );
  }
  if (!model) {
    return <p className="text-sm text-slate-500">Select an employee to open Employee Compensation 360.</p>;
  }

  return (
    <div className="space-y-4">
      {!embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Button type="button" size="sm" variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to Employees
            </Button>
            <h2 className="mt-2 text-lg font-bold text-slate-900">Employee Compensation 360</h2>
            <p className="text-xs text-slate-600">
              {overview.name} · {overview.role} · profile {model.profileUserId || overview.employeeId}
            </p>
          </div>
        </div>
      ) : null}

      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap gap-1 rounded-lg border border-border bg-muted/30 p-1 backdrop-blur">
        {sections.map((section) => (
          <Button
            key={section.id}
            type="button"
            size="sm"
            variant={activeSection === section.id ? "default" : "outline"}
            onClick={() => setActiveSection(section.id)}
          >
            {section.label}
          </Button>
        ))}
      </div>

      {activeSection === "overview" ? (
        <>
          <EmployeeBusinessSummaryCard
            overview={overview}
            model={model}
            ownershipContext={ownershipContext}
            businessProfile={businessProfile}
          />
          <SectionShell title="Overview" icon={Eye}>
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
              <Field label="Name" value={overview.name} />
              <Field label="Role" value={overview.role} />
              <Field label="Status" value={overview.status} />
              {commissionEligible ? <Field label="Territory" value={overview.territory} /> : null}
              <Field label="Manager" value={overview.manager} />
              <Field label="Joined Date" value={overview.joinDateLabel} />
              <Field label="Compensation Plan" value={overview.compensationPlan} />
              <Field label="Plan Version" value={overview.planVersion} />
              <Field label="Salary" value={overview.salaryLabel} />
              <Field label="Fuel" value={overview.fuelLabel} />
              <Field label="Mobile" value={overview.mobileLabel} />
              {commissionEligible ? (
                <>
                  <Field label="Commission %" value={`${overview.commissionPct}%`} />
                  <Field label="Promotion Status" value={overview.promotionStatus} />
                  <Field label="Collection Efficiency" value={overview.collectionEfficiencyLabel} />
                  <Field label="Current Month Collections" value={overview.currentMonthCollectionsLabel} />
                  <Field label="Current Month Commission" value={overview.currentMonthCommissionLabel} />
                </>
              ) : null}
            </div>
          </SectionShell>
        </>
      ) : null}

      {activeSection === "overview" && ownershipContext ? (
        <SectionShell title="Business Ownership" icon={GitBranch}>
          <p className="mb-3 text-xs text-muted-foreground">
            These laboratories generate this employee&apos;s commission.
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Territories" value={ownershipContext.territories} />
            <Field label="Managed Laboratories" value={ownershipContext.managedLabCount} />
            <Field label="Executive" value={ownershipContext.reportingExecutive || ownershipContext.reportingTo} />
            <Field label="Reporting Admin" value={ownershipContext.reportingAdmin || ownershipContext.managedBy} />
            <Field label="Reporting Structure" value={ownershipContext.ownershipChain} />
            <Field label="Commission Path" value={ownershipContext.collectionAttributionLabel} />
          </div>
          {ownershipContext.managedLabs?.length ? (
            <div className="mt-3 overflow-x-auto rounded-lg border">
              <table className="min-w-full text-left text-[11px]">
                <thead className="border-b bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    {["Lab", "Territory"].map((label) => (
                      <th key={label} className="px-2 py-2">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ownershipContext.managedLabs.map((lab) => (
                    <tr key={lab.labId} className="border-b border-slate-100 last:border-0">
                      <td className="px-2 py-2">{lab.labName}</td>
                      <td className="px-2 py-2">{lab.territory}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="mt-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Future Hierarchical Compensation
            </p>
            <CompensationAttributionPreview preview={ownershipContext.potentialOverrideCompensation} compact />
          </div>
        </SectionShell>
      ) : null}

      {activeSection === "overview" && businessProfile ? (
        <SectionShell title="Performance" icon={TrendingUp}>
          <p className="mb-3 text-xs text-muted-foreground">
            How this employee is performing on collections, revenue, and pay for the selected period.
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Territory" value={businessProfile.identity?.territory} />
            <Field label="Collections (managed)" value={businessProfile.collections?.managed} />
            <Field label="Collections (received)" value={businessProfile.collections?.received} />
            <Field label="Collection efficiency" value={businessProfile.collections?.efficiency} />
            <Field label="Managed revenue" value={businessProfile.revenue?.managed} />
            <Field label="Commission (period)" value={businessProfile.performance?.commission} />
            <Field label="Payroll cost" value={businessProfile.performance?.payrollCost} />
            <Field label="Laboratories managed" value={businessProfile.labsManaged?.count} />
            <Field label="Promotion" value={businessProfile.promotion?.eligible} />
            <Field label="Reporting Structure" value={businessProfile.ownership?.chain} />
            <Field label="Reports to" value={businessProfile.ownership?.reportingTo} />
            <Field label="Period" value={businessProfile.performance?.period} />
          </div>
          {businessProfile.labsManaged?.rows?.length ? (
            <div className="mt-3 overflow-x-auto rounded-lg border">
              <table className="min-w-full text-left text-[11px]">
                <thead className="border-b bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    {["Lab", "Territory"].map((label) => (
                      <th key={label} className="px-2 py-2">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {businessProfile.labsManaged.rows.map((lab) => (
                    <tr key={lab.labId} className="border-b border-slate-100 last:border-0">
                      <td className="px-2 py-2">{lab.labName}</td>
                      <td className="px-2 py-2">{lab.territory}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {businessProfile.ownership?.overridePreview ? (
            <div className="mt-4">
              <CompensationAttributionPreview preview={businessProfile.ownership.overridePreview} compact />
            </div>
          ) : null}
          {businessProfile.commissionHistory?.length ? (
            <div className="mt-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Commission history</p>
              <div className="space-y-1 text-xs text-slate-600">
                {businessProfile.commissionHistory.slice(0, 5).map((row) => (
                  <p key={row.id || row.periodYm}>
                    {row.periodYm}: {row.commissionLabel || row.commission}
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </SectionShell>
      ) : null}

      {activeSection === "payrollHistory" ? (
        <EnterpriseDataTable
          hasRows={(model.payrollHistory || []).length > 0}
          emptyTitle="No payroll history yet"
          emptyDescription="Generate a Payroll Preview to see salary and commission history for this employee."
          desktop={
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="min-w-full text-left text-[11px]">
                <thead className="border-b bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    {["Period", "Salary", "Commission", "Allowances", "Adjustments", "Net Pay", "Status"].map(
                      (label) => (
                        <th key={label} className="px-2 py-2">
                          {label}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {model.payrollHistory.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-2 py-2 font-medium">{row.periodYm}</td>
                      <td className="px-2 py-2 tabular-nums">{row.salaryLabel}</td>
                      <td className="px-2 py-2 tabular-nums">{row.commissionLabel}</td>
                      <td className="px-2 py-2 tabular-nums">{row.allowancesLabel}</td>
                      <td className="px-2 py-2 tabular-nums">{row.adjustmentsLabel}</td>
                      <td className="px-2 py-2 tabular-nums">{row.netPayLabel}</td>
                      <td className="px-2 py-2">
                        <StatusBadge variant={STATUS_VARIANT[row.status] || "neutral"} label={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        />
      ) : null}

      {activeSection === "commissionHistory" && commissionEligible ? (
        <EnterpriseDataTable
          hasRows={(model.commissionHistory || []).length > 0}
          emptyTitle="No commission history yet"
          emptyDescription="Commission appears after collections are recorded and a Payroll Preview is generated."
          desktop={
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="min-w-full text-left text-[11px]">
                <thead className="border-b bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    {[
                      "Period",
                      "Collected Cash",
                      "Commission %",
                      "Commission Earned",
                      "Source Payments",
                      "Calculation Version",
                    ].map((label) => (
                      <th key={label} className="px-2 py-2">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {model.commissionHistory.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-2 py-2">{row.periodYm}</td>
                      <td className="px-2 py-2 tabular-nums">{row.collectedCashLabel}</td>
                      <td className="px-2 py-2">{row.commissionPct}%</td>
                      <td className="px-2 py-2 tabular-nums">{row.commissionEarnedLabel}</td>
                      <td className="px-2 py-2">{row.sourcePayments}</td>
                      <td className="px-2 py-2">{row.calculationVersion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        />
      ) : null}

      {activeSection === "compensationPlan" ? (
        <div className="space-y-4">
          <SectionShell title="Current Pay Structure" icon={Wallet}>
            <p className="mb-3 text-xs text-muted-foreground">
              This Compensation Plan is the template used for salary, allowances, and commission.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Compensation Plan" value={overview.compensationPlan} />
              <Field label="Plan Version" value={overview.planVersion} />
              <Field label="Effective From" value={model.planHistory?.[0]?.effectiveFromLabel} />
              <Field label="Effective To" value={model.planHistory?.[0]?.effectiveToLabel} />
            </div>
            {permissions?.canChangePlan && activeAssignment ? (
              <div className="mt-3">
                {!changePlanOpen ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => setChangePlanOpen(true)}>
                    Change Plan
                  </Button>
                ) : (
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        New Plan
                      </span>
                      <select
                        className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"
                        value={newPlanId || activeAssignment.plan_id}
                        onChange={(event) => setNewPlanId(event.target.value)}
                      >
                        {planOptions.map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {(plan.rules_json?.displayName || plan.plan_code || plan.planName) +
                              " · " +
                              plan.version}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Effective Date
                      </span>
                      <Input
                        type="date"
                        value={effectiveDate}
                        onChange={(event) => setEffectiveDate(event.target.value)}
                      />
                    </label>
                    <div className="flex items-end gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setChangePlanOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          onChangePlan?.(
                            {
                              id: activeAssignment.id,
                              employeeName: overview.name,
                              profileUserId: model.profileUserId,
                              planId: activeAssignment.plan_id,
                            },
                            { newPlanId: newPlanId || activeAssignment.plan_id, effectiveDate }
                          );
                          setChangePlanOpen(false);
                        }}
                      >
                        Save Change
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
            {permissions?.canAssignPlan && !activeAssignment ? (
              <div className="mt-3">
                {!assignOpen ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
                    Assign Plan
                  </Button>
                ) : (
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Plan</span>
                      <select
                        className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"
                        value={newPlanId}
                        onChange={(event) => setNewPlanId(event.target.value)}
                      >
                        <option value="">Select plan</option>
                        {planOptions.map((plan) => (
                          <option key={plan.id} value={plan.id}>
                            {(plan.rules_json?.displayName || plan.plan_code) + " · " + plan.version}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Effective Date
                      </span>
                      <Input
                        type="date"
                        value={effectiveDate}
                        onChange={(event) => setEffectiveDate(event.target.value)}
                      />
                    </label>
                    <div className="flex items-end gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setAssignOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy || !newPlanId}
                        onClick={() => {
                          onAssignPlan?.(
                            { profileUserId: model.profileUserId, employeeName: overview.name },
                            { planId: newPlanId, effectiveDate }
                          );
                          setAssignOpen(false);
                        }}
                      >
                        Save Assignment
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </SectionShell>
          <SectionShell title="Plan History" icon={History}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[11px]">
                <thead className="border-b bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    {["Plan", "Version", "Effective From", "Effective To", "Status", "Assigned By"].map((label) => (
                      <th key={label} className="px-2 py-2">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(model.planHistory || []).map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-2 py-2">{row.planName}</td>
                      <td className="px-2 py-2">{row.version}</td>
                      <td className="px-2 py-2">{row.effectiveFromLabel}</td>
                      <td className="px-2 py-2">{row.effectiveToLabel}</td>
                      <td className="px-2 py-2">
                        <StatusBadge variant={STATUS_VARIANT[row.status] || "neutral"} label={row.status} />
                      </td>
                      <td className="px-2 py-2">{row.assignedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionShell>
        </div>
      ) : null}

      {activeSection === "adjustments" ? (
        <EnterpriseDataTable
          hasRows={(model.adjustments || []).length > 0}
          emptyTitle="No adjustments"
          emptyDescription="Bonuses, penalties, recoveries, and manual adjustments appear here when recorded."
          desktop={
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="min-w-full text-left text-[11px]">
                <thead className="border-b bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    {["Category", "Component", "Amount", "Reason", "Approved By", "Status", "Recorded"].map(
                      (label) => (
                        <th key={label} className="px-2 py-2">
                          {label}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {model.adjustments.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-2 py-2">{row.category}</td>
                      <td className="px-2 py-2">{row.component}</td>
                      <td className="px-2 py-2 tabular-nums">{row.amountLabel}</td>
                      <td className="px-2 py-2">{row.reason}</td>
                      <td className="px-2 py-2">{row.approvedBy}</td>
                      <td className="px-2 py-2">{row.status}</td>
                      <td className="px-2 py-2">{row.atLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        />
      ) : null}

      {activeSection === "promotion" && commissionEligible ? (
        <SectionShell title="Promotion Eligibility" icon={TrendingUp}>
          <p className="mb-3 text-xs text-slate-500">Review-only recommendation. No automatic promotion.</p>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
            <Field label="Collections" value={model.promotion.collectionsLabel} />
            <Field label="Efficiency" value={`${model.promotion.efficiencyPct}%`} />
            <Field label="Overdue Days" value={model.promotion.overdueDays} />
            <Field label="Months" value={model.promotion.months} />
            <Field label="Eligible" value={model.promotion.eligibleLabel} />
            <Field label="Recommended Plan" value={model.promotion.recommendedPlan} />
          </div>
        </SectionShell>
      ) : null}

      {activeSection === "auditTimeline" ? (
        <SectionShell title="Audit Timeline" icon={History}>
          <div className="space-y-2">
            {(model.auditTimeline || []).length ? (
              model.auditTimeline.map((event) => (
                <div key={event.id} className="rounded-lg border bg-slate-50 px-3 py-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900">{event.title}</p>
                      <p className="text-slate-600">{event.subtitle}</p>
                    </div>
                    <StatusBadge variant={STATUS_VARIANT[event.category] || "neutral"} label={event.category} />
                  </div>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {event.atLabel} · {event.actorRole}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500">No audit events for this employee yet.</p>
            )}
          </div>
        </SectionShell>
      ) : null}
    </div>
  );
}
