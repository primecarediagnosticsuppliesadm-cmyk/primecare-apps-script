import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EnterpriseDataTable, StatusBadge } from "@/components/ux";
import { ArrowLeft, Eye, History, TrendingUp, Wallet } from "lucide-react";

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

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "payrollHistory", label: "Payroll History" },
  { id: "commissionHistory", label: "Commission History" },
  { id: "compensationPlan", label: "Compensation Plan" },
  { id: "adjustments", label: "Adjustments" },
  { id: "promotion", label: "Promotion" },
  { id: "auditTimeline", label: "Audit Timeline" },
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

export default function AgentCompensation360Panel({
  model,
  permissions,
  loading = false,
  error = "",
  onBack,
  onChangePlan,
  busy = false,
  selectablePlans = [],
}) {
  const [activeSection, setActiveSection] = useState("overview");
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [newPlanId, setNewPlanId] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));

  const overview = model?.overview || {};
  const activeAssignment = model?.activeAssignment;

  const planOptions = useMemo(
    () => selectablePlans.length ? selectablePlans : model?.selectablePlans || [],
    [model, selectablePlans]
  );

  if (loading && !model) {
    return <p className="text-sm text-slate-500">Loading Agent Compensation 360…</p>;
  }
  if (error && !model) {
    return (
      <div className="space-y-3">
        <Button type="button" size="sm" variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Agents
        </Button>
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      </div>
    );
  }
  if (!model) {
    return <p className="text-sm text-slate-500">Select an agent to open Agent Compensation 360.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Button type="button" size="sm" variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Agents
          </Button>
          <h2 className="mt-2 text-lg font-bold text-slate-900">Agent Compensation 360</h2>
          <p className="text-xs text-slate-600">
            {overview.name} · {overview.employeeId} · single employee compensation profile
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((section) => (
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
        <SectionShell title="Overview" icon={Eye}>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
            <Field label="Name" value={overview.name} />
            <Field label="Employee ID" value={overview.employeeId} />
            <Field label="Role" value={overview.role} />
            <Field label="Status" value={overview.status} />
            <Field label="Territory" value={overview.territory} />
            <Field label="Manager" value={overview.manager} />
            <Field label="Join Date" value={overview.joinDateLabel} />
            <Field label="Compensation Plan" value={overview.compensationPlan} />
            <Field label="Current Version" value={overview.planVersion} />
            <Field label="Salary" value={overview.salaryLabel} />
            <Field label="Fuel" value={overview.fuelLabel} />
            <Field label="Mobile" value={overview.mobileLabel} />
            <Field label="Commission %" value={`${overview.commissionPct}%`} />
            <Field label="Promotion Status" value={overview.promotionStatus} />
            <Field label="Collection Efficiency" value={overview.collectionEfficiencyLabel} />
            <Field label="Current Month Collections" value={overview.currentMonthCollectionsLabel} />
            <Field label="Current Month Commission" value={overview.currentMonthCommissionLabel} />
          </div>
        </SectionShell>
      ) : null}

      {activeSection === "payrollHistory" ? (
        <EnterpriseDataTable
          hasRows={(model.payrollHistory || []).length > 0}
          emptyTitle="No payroll history"
          emptyDescription="Payroll run lines appear after payroll preview generation."
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

      {activeSection === "commissionHistory" ? (
        <EnterpriseDataTable
          hasRows={(model.commissionHistory || []).length > 0}
          emptyTitle="No commission history"
          emptyDescription="Commission entries appear after payroll preview generation."
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
          <SectionShell title="Assigned Plan" icon={Wallet}>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Assigned Plan" value={overview.compensationPlan} />
              <Field label="Version" value={overview.planVersion} />
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
                            {(plan.rules_json?.displayName || plan.plan_code || plan.planName) + " · " + plan.version}
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
                          onChangePlan?.({
                            id: activeAssignment.id,
                            employeeName: overview.name,
                            planId: activeAssignment.plan_id,
                          }, { newPlanId: newPlanId || activeAssignment.plan_id, effectiveDate });
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

      {activeSection === "promotion" ? (
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
              <p className="text-xs text-slate-500">No audit events for this agent yet.</p>
            )}
          </div>
        </SectionShell>
      ) : null}
    </div>
  );
}
