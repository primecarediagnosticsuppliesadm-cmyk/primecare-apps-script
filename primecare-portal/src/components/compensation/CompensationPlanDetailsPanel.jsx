import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function Field({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm text-slate-900">{value ?? "—"}</p>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="rounded-lg border bg-white p-3">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-700">{title}</h3>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

export default function CompensationPlanDetailsPanel({
  detail,
  permissions,
  editorOpen,
  onCloseEditor,
  onSave,
  busy = false,
  simulation,
  simInputs,
  onSimInputChange,
  promotionRows = [],
}) {
  const [form, setForm] = useState({});

  useEffect(() => {
    if (!detail) return;
    setForm({
      displayName: detail.general.displayName,
      roleScope: detail.general.role,
      planCode: detail.general.planCode,
      effectiveFrom: detail.general.effectiveFrom,
      effectiveTo: detail.general.effectiveTo || "",
      baseSalary: detail.fixedCompensation.salary,
      fuelAllowance: detail.fixedCompensation.fuel,
      mobileAllowance: detail.fixedCompensation.mobile,
      commissionRatePct: detail.variableCompensation.commissionPct,
      promotionCollectionThreshold: detail.variableCompensation.collectionThreshold,
      promotionMinEfficiencyPct: detail.variableCompensation.collectionEfficiencyPct,
      promotionMaxOverdueDays: detail.variableCompensation.maxOverdueDays,
      promotionSalary: detail.promotionRules.promotionSalary,
      promotionCommissionRatePct: detail.promotionRules.promotionCommissionPct,
      promotionMinimumMonths: detail.promotionRules.minimumMonths,
      quarterlyBonusMin: detail.bonuses.quarterlyBonusMin,
      quarterlyBonusMax: detail.bonuses.quarterlyBonusMax,
      annualBonusMin: detail.bonuses.annualBonusMin,
      annualBonusMax: detail.bonuses.annualBonusMax,
      manualAdjustmentAllowed: detail.incentives.manualAdjustmentAllowed,
      penaltiesAllowed: detail.incentives.penaltiesAllowed,
    });
  }, [detail]);

  const canEdit = permissions?.canEditDraftPlan || permissions?.canEditActivePlanViaVersion;

  return (
    <div className="space-y-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-900">{detail.general.displayName}</h2>
          <p className="text-xs text-slate-600">
            {detail.general.planCode} · {detail.general.version} · {detail.general.status}
          </p>
        </div>
        {editorOpen && canEdit ? (
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onCloseEditor}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() =>
                onSave?.({
                  displayName: form.displayName,
                  plan_code: form.planCode,
                  role_scope: form.roleScope,
                  effective_from: form.effectiveFrom,
                  effective_to: form.effectiveTo || null,
                  base_salary: Number(form.baseSalary),
                  fuel_allowance: Number(form.fuelAllowance),
                  mobile_allowance: Number(form.mobileAllowance),
                  commission_rate_bps: Math.round(Number(form.commissionRatePct) * 100),
                  promotion_salary: Number(form.promotionSalary),
                  promotion_commission_rate_bps: Math.round(Number(form.promotionCommissionRatePct) * 100),
                  promotion_collection_threshold: Number(form.promotionCollectionThreshold),
                  promotion_min_efficiency_pct: Number(form.promotionMinEfficiencyPct),
                  promotion_max_overdue_days: Number(form.promotionMaxOverdueDays),
                  quarterlyBonusMin: Number(form.quarterlyBonusMin),
                  quarterlyBonusMax: Number(form.quarterlyBonusMax),
                  annualBonusMin: Number(form.annualBonusMin),
                  annualBonusMax: Number(form.annualBonusMax),
                  manualAdjustmentAllowed: Boolean(form.manualAdjustmentAllowed),
                  penaltiesAllowed: Boolean(form.penaltiesAllowed),
                  promotionMinimumMonths: Number(form.promotionMinimumMonths),
                })
              }
            >
              Save
            </Button>
          </div>
        ) : null}
      </div>

      {editorOpen && canEdit ? (
        <Section title="Edit Plan">
          {[
            ["displayName", "Plan Name"],
            ["planCode", "Plan Code"],
            ["roleScope", "Role"],
            ["effectiveFrom", "Effective From"],
            ["effectiveTo", "Effective To"],
            ["baseSalary", "Salary"],
            ["fuelAllowance", "Fuel"],
            ["mobileAllowance", "Mobile"],
            ["commissionRatePct", "Commission %"],
            ["promotionSalary", "Promotion Salary"],
            ["promotionCommissionRatePct", "Promotion Commission %"],
            ["promotionCollectionThreshold", "Collection Threshold"],
            ["promotionMinEfficiencyPct", "Collection Efficiency %"],
            ["promotionMaxOverdueDays", "Max Overdue Days"],
            ["promotionMinimumMonths", "Minimum Months"],
            ["quarterlyBonusMin", "Quarterly Bonus Min"],
            ["quarterlyBonusMax", "Quarterly Bonus Max"],
            ["annualBonusMin", "Annual Bonus Min"],
            ["annualBonusMax", "Annual Bonus Max"],
          ].map(([key, label]) => (
            <label key={key} className="space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
              <Input
                value={form[key] ?? ""}
                onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
              />
            </label>
          ))}
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={Boolean(form.manualAdjustmentAllowed)}
              onChange={(event) => setForm((prev) => ({ ...prev, manualAdjustmentAllowed: event.target.checked }))}
            />
            Manual Adjustment Allowed
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={Boolean(form.penaltiesAllowed)}
              onChange={(event) => setForm((prev) => ({ ...prev, penaltiesAllowed: event.target.checked }))}
            />
            Penalties Allowed
          </label>
        </Section>
      ) : (
        <>
          <Section title="General">
            <Field label="Role" value={detail.general.role} />
            <Field label="Plan Code" value={detail.general.planCode} />
            <Field label="Version" value={detail.general.version} />
            <Field label="Status" value={detail.general.status} />
            <Field label="Effective From" value={detail.general.effectiveFrom} />
            <Field label="Effective To" value={detail.general.effectiveTo || "—"} />
          </Section>
          <Section title="Fixed Compensation">
            <Field label="Salary" value={detail.fixedCompensation.salary} />
            <Field label="Fuel" value={detail.fixedCompensation.fuel} />
            <Field label="Mobile" value={detail.fixedCompensation.mobile} />
          </Section>
          <Section title="Variable Compensation">
            <Field label="Commission %" value={`${detail.variableCompensation.commissionPct}%`} />
            <Field label="Collection Threshold" value={detail.variableCompensation.collectionThreshold} />
            <Field label="Collection Efficiency %" value={`${detail.variableCompensation.collectionEfficiencyPct}%`} />
            <Field label="Max Overdue Days" value={detail.variableCompensation.maxOverdueDays} />
          </Section>
          <Section title="Promotion Rules">
            <Field label="Promotion Salary" value={detail.promotionRules.promotionSalary} />
            <Field label="Promotion Commission %" value={`${detail.promotionRules.promotionCommissionPct}%`} />
            <Field label="Minimum Months" value={detail.promotionRules.minimumMonths} />
          </Section>
          <Section title="Bonuses">
            <Field label="Quarterly Bonus" value={`${detail.bonuses.quarterlyBonusMin} – ${detail.bonuses.quarterlyBonusMax}`} />
            <Field label="Annual Bonus" value={`${detail.bonuses.annualBonusMin} – ${detail.bonuses.annualBonusMax}`} />
          </Section>
          <Section title="Incentives">
            <Field label="Manual Adjustment Allowed" value={detail.incentives.manualAdjustmentAllowed ? "Yes" : "No"} />
            <Field label="Penalties Allowed" value={detail.incentives.penaltiesAllowed ? "Yes" : "No"} />
          </Section>
          <Section title="Audit">
            <Field label="Created By" value={detail.audit.createdBy} />
            <Field label="Updated By" value={detail.audit.updatedBy} />
            <Field label="Version History" value={`${detail.versionHistory.length} entries`} />
          </Section>
        </>
      )}

      {permissions?.canSimulate ? (
        <section className="rounded-lg border bg-white p-3">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-700">Simulate</h3>
          <p className="mb-3 text-xs text-slate-500">Preview only. Never writes payroll or finance data.</p>
          <div className="grid gap-3 md:grid-cols-5">
            {[
              ["commissionRatePct", "Commission %"],
              ["salary", "Salary"],
              ["fuel", "Fuel"],
              ["mobile", "Mobile"],
              ["collectionAmount", "Collection Amount"],
            ].map(([key, label]) => (
              <label key={key} className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
                <Input
                  type="number"
                  value={simInputs[key]}
                  onChange={(event) => onSimInputChange(key, Number(event.target.value))}
                />
              </label>
            ))}
          </div>
          {simulation ? (
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <Field label="Expected Commission" value={simulation.outputs.expectedCommissionLabel} />
              <Field label="Expected Payroll" value={simulation.outputs.expectedPayrollLabel} />
              <Field label="Net Payroll" value={simulation.outputs.netPayrollLabel} />
            </div>
          ) : null}
        </section>
      ) : null}

      {permissions?.canViewPromotionEligibility ? (
        <section className="rounded-lg border bg-white p-3">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-700">Promotion Eligibility</h3>
          <p className="mb-3 text-xs text-slate-500">No automatic promotion. Review-only recommendations.</p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[11px]">
              <thead className="border-b bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  {["Agent", "Collections", "Efficiency", "Overdue Days", "Months", "Eligible", "Recommended New Plan"].map(
                    (label) => (
                      <th key={label} className="px-2 py-2">
                        {label}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {promotionRows.map((row) => (
                  <tr key={row.agentId} className="border-b border-slate-100 last:border-0">
                    <td className="px-2 py-2">{row.agentName}</td>
                    <td className="px-2 py-2 tabular-nums">{row.collectionsLabel}</td>
                    <td className="px-2 py-2">{row.efficiencyPct}%</td>
                    <td className="px-2 py-2">{row.overdueDays}</td>
                    <td className="px-2 py-2">{row.months}</td>
                    <td className="px-2 py-2">{row.eligibleLabel}</td>
                    <td className="px-2 py-2">{row.recommendedNewPlan}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
