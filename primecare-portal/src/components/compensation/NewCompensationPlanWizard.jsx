import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  COMPENSATION_ROLE_SCOPES,
  roleScopePlanDefaults,
} from "@/compensation/enterpriseCompensationRoles.js";

export default function NewCompensationPlanWizard({ open, onClose, onCreate, busy = false }) {
  const [step, setStep] = useState(1);
  const [roleScope, setRoleScope] = useState("agent");
  const [form, setForm] = useState(() => roleScopePlanDefaults("agent"));

  const defaults = useMemo(() => roleScopePlanDefaults(roleScope), [roleScope]);

  if (!open) return null;

  const applyRole = (nextRole) => {
    setRoleScope(nextRole);
    setForm(roleScopePlanDefaults(nextRole));
    setStep(2);
  };

  return (
    <section className="rounded-xl border border-indigo-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">New Compensation Plan</h3>
          <p className="text-xs text-slate-600">Step {step} of 2 · role-aware defaults · save as draft</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>

      {step === 1 ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {COMPENSATION_ROLE_SCOPES.map((scope) => (
            <button
              key={scope}
              type="button"
              className="rounded-lg border px-3 py-2 text-left text-xs hover:border-indigo-400"
              onClick={() => applyRole(scope)}
            >
              <p className="font-semibold capitalize text-slate-900">{scope}</p>
              <p className="text-slate-500">{roleScopePlanDefaults(scope).displayName}</p>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-slate-600">
            Role scope: <span className="font-semibold capitalize">{roleScope}</span>
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {[
              ["displayName", "Plan Name"],
              ["planCode", "Plan Code"],
              ["baseSalary", "Salary"],
              ["fuelAllowance", "Fuel Allowance"],
              ["mobileAllowance", "Mobile Allowance"],
              ["commissionRateBps", "Commission (bps)"],
              ["promotionSalary", "Promotion Salary"],
              ["promotionCommissionRateBps", "Promotion Commission (bps)"],
            ].map(([key, label]) => (
              <label key={key} className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
                <Input
                  value={form[key] ?? defaults[key] ?? ""}
                  onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
                />
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() =>
                onCreate?.({
                  role_scope: roleScope,
                  plan_code: form.planCode || defaults.planCode,
                  displayName: form.displayName || defaults.displayName,
                  base_salary: Number(form.baseSalary ?? defaults.baseSalary),
                  fuel_allowance: Number(form.fuelAllowance ?? defaults.fuelAllowance),
                  mobile_allowance: Number(form.mobileAllowance ?? defaults.mobileAllowance),
                  commission_rate_bps: Number(form.commissionRateBps ?? defaults.commissionRateBps),
                  promotion_salary: Number(form.promotionSalary ?? defaults.promotionSalary),
                  promotion_commission_rate_bps: Number(
                    form.promotionCommissionRateBps ?? defaults.promotionCommissionRateBps
                  ),
                  promotion_collection_threshold: defaults.promotionCollectionThreshold,
                  promotion_min_efficiency_pct: defaults.promotionMinEfficiencyPct,
                  promotion_max_overdue_days: defaults.promotionMaxOverdueDays,
                  quarterlyBonusMin: defaults.quarterlyBonusMin,
                  quarterlyBonusMax: defaults.quarterlyBonusMax,
                  annualBonusMin: defaults.annualBonusMin,
                  annualBonusMax: defaults.annualBonusMax,
                  manualAdjustmentAllowed: defaults.manualAdjustmentAllowed,
                  penaltiesAllowed: defaults.penaltiesAllowed,
                  promotionEnabled: defaults.promotionEnabled,
                  status: "draft",
                })
              }
            >
              Save Draft
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
