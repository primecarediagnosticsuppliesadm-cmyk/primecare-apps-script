import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ActionErrorSummary from "@/components/ux/ActionErrorSummary.jsx";
import {
  COMPENSATION_ROLE_SCOPES,
  roleScopePlanDefaults,
} from "@/compensation/enterpriseCompensationRoles.js";
import { nextPlanVersionLabel } from "@/compensation/compensationPlanAdminWorkflow.js";
import { cn } from "@/lib/utils";

export const COMPENSATION_PLAN_ACTION_MODES = Object.freeze({
  CREATE: "create",
  EDIT: "edit",
  DUPLICATE: "duplicate",
  ACTIVATE: "activate",
  DEACTIVATE: "deactivate",
});

const MODE_COPY = {
  create: { title: "Create Compensation Plan", submit: "Save Draft" },
  edit: { title: "Edit Compensation Plan", submit: "Save Changes" },
  duplicate: { title: "Duplicate Compensation Plan", submit: "Save Duplicate" },
  activate: { title: "Activate Compensation Plan", submit: "Activate Plan" },
  deactivate: { title: "Deactivate Compensation Plan", submit: "Deactivate Plan" },
};

function buildFormFromRow(row, mode) {
  if (!row) return roleScopePlanDefaults("agent");
  const defaults = roleScopePlanDefaults(row.roleScope || row.role_scope || "agent");
  const nextVersion =
    mode === COMPENSATION_PLAN_ACTION_MODES.DUPLICATE
      ? nextPlanVersionLabel(row.version || "v1")
      : row.version || "v1";
  return {
    displayName: row.planName || row.displayName || defaults.displayName,
    planCode: row.planCode || row.plan_code || defaults.planCode,
    version: nextVersion,
    roleScope: row.roleScope || row.role_scope || "agent",
    baseSalary: row.salary ?? row.base_salary ?? defaults.baseSalary,
    fuelAllowance: row.fuelAllowance ?? row.fuel_allowance ?? defaults.fuelAllowance,
    mobileAllowance: row.mobileAllowance ?? row.mobile_allowance ?? defaults.mobileAllowance,
    commissionRateBps: Math.round(Number(row.commissionPct ?? 0) * 100) || defaults.commissionRateBps,
    promotionSalary: row.promotionSalary ?? defaults.promotionSalary,
    promotionCommissionRateBps:
      Math.round(Number(row.promotionCommissionPct ?? 0) * 100) || defaults.promotionCommissionRateBps,
    promotionCollectionThreshold: defaults.promotionCollectionThreshold,
    promotionMinEfficiencyPct: defaults.promotionMinEfficiencyPct,
    promotionMaxOverdueDays: defaults.promotionMaxOverdueDays,
    quarterlyBonusMin: defaults.quarterlyBonusMin,
    quarterlyBonusMax: defaults.quarterlyBonusMax,
    annualBonusMin: defaults.annualBonusMin,
    annualBonusMax: defaults.annualBonusMax,
    manualAdjustmentAllowed: defaults.manualAdjustmentAllowed,
    penaltiesAllowed: defaults.penaltiesAllowed,
    promotionEnabled: defaults.promotionEnabled,
  };
}

function fieldClass(hasError) {
  return cn(hasError && "border-red-400 ring-1 ring-red-200");
}

export default function CompensationPlanActionDrawer({
  open = false,
  mode = COMPENSATION_PLAN_ACTION_MODES.CREATE,
  busy = false,
  planRow = null,
  mutationError = null,
  onSubmit,
  onCancel,
  onErrorAction,
}) {
  const panelRef = useRef(null);
  const versionRef = useRef(null);
  const planCodeRef = useRef(null);
  const copy = MODE_COPY[mode] || MODE_COPY.create;
  const isConfirmMode =
    mode === COMPENSATION_PLAN_ACTION_MODES.ACTIVATE ||
    mode === COMPENSATION_PLAN_ACTION_MODES.DEACTIVATE ||
    mode === COMPENSATION_PLAN_ACTION_MODES.DUPLICATE;

  const [step, setStep] = useState(1);
  const [roleScope, setRoleScope] = useState("agent");
  const [form, setForm] = useState(() => roleScopePlanDefaults("agent"));

  const resetForm = useCallback(() => {
    if (mode === COMPENSATION_PLAN_ACTION_MODES.CREATE) {
      setStep(1);
      setRoleScope("agent");
      setForm(roleScopePlanDefaults("agent"));
      return;
    }
    const nextForm = buildFormFromRow(planRow, mode);
    setRoleScope(nextForm.roleScope || "agent");
    setForm(nextForm);
    setStep(2);
  }, [mode, planRow]);

  useEffect(() => {
    if (!open) return;
    resetForm();
  }, [open, resetForm]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => {
      panelRef.current?.querySelector("button, input, select, textarea")?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !mutationError) return;
    const target =
      mutationError.focusField === "planCode"
        ? planCodeRef.current
        : mutationError.focusField === "version"
          ? versionRef.current
          : null;
    target?.focus();
  }, [mutationError, open]);

  const defaults = useMemo(() => roleScopePlanDefaults(roleScope), [roleScope]);

  const payload = useMemo(
    () => ({
      role_scope: roleScope,
      plan_code: form.planCode || defaults.planCode,
      version: form.version || "v1",
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
    }),
    [defaults, form, roleScope]
  );

  const handleSubmit = () => {
    if (isConfirmMode) {
      onSubmit?.({ mode, planRow, payload: null });
      return;
    }
    onSubmit?.({ mode, planRow, payload });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close compensation plan drawer"
        onClick={onCancel}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="compensation-plan-action-title"
        className="relative flex h-full w-full max-w-xl flex-col border-l border-border bg-background shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 id="compensation-plan-action-title" className="text-base font-semibold text-foreground">
              {copy.title}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {isConfirmMode
                ? "Confirm this compensation plan action."
                : mode === COMPENSATION_PLAN_ACTION_MODES.CREATE
                  ? "Step-by-step draft creation · saved as draft"
                  : "Review fields before saving."}
            </p>
          </div>
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {mutationError ? (
            <ActionErrorSummary
              title={mutationError.title}
              message={mutationError.message}
              fieldErrors={mutationError.fieldErrors}
              actions={mutationError.suggestedActions}
              onAction={onErrorAction}
              technicalReference={mutationError.rawErrorForLogging}
            />
          ) : null}

          {isConfirmMode ? (
            <div className="rounded-xl border border-border bg-card p-4 text-sm">
              <p className="font-medium text-foreground">
                {planRow?.planName || planRow?.planCode || "Compensation Plan"}
              </p>
              <p className="mt-1 text-muted-foreground">
                {planRow?.planCode} · {planRow?.version} · {planRow?.status}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                {mode === COMPENSATION_PLAN_ACTION_MODES.ACTIVATE
                  ? "Activating makes this plan available for employee assignments."
                  : mode === COMPENSATION_PLAN_ACTION_MODES.DEACTIVATE
                    ? "Deactivating retires this plan version. Existing assignments are preserved per workflow rules."
                    : "Creates a draft copy with a new plan code. You can edit it after duplication."}
              </p>
            </div>
          ) : step === 1 && mode === COMPENSATION_PLAN_ACTION_MODES.CREATE ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {COMPENSATION_ROLE_SCOPES.map((scope) => (
                <button
                  key={scope}
                  type="button"
                  className="rounded-lg border border-border px-3 py-2 text-left text-xs hover:border-[var(--pc-brand-primary)]"
                  onClick={() => {
                    setRoleScope(scope);
                    setForm(roleScopePlanDefaults(scope));
                    setStep(2);
                  }}
                >
                  <p className="font-semibold capitalize text-foreground">{scope}</p>
                  <p className="text-muted-foreground">{roleScopePlanDefaults(scope).displayName}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Role scope: <span className="font-semibold capitalize text-foreground">{roleScope}</span>
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ["displayName", "Plan Name", false],
                  ["planCode", "Plan Code", true],
                  ["version", "Version", true],
                  ["baseSalary", "Salary", false],
                  ["fuelAllowance", "Fuel Allowance", false],
                  ["mobileAllowance", "Mobile Allowance", false],
                  ["commissionRateBps", "Commission (bps)", false],
                  ["promotionSalary", "Promotion Salary", false],
                  ["promotionCommissionRateBps", "Promotion Commission (bps)", false],
                ].map(([key, label, duplicateField]) => (
                  <label key={key} className="space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {label}
                    </span>
                    <Input
                      ref={
                        key === "version"
                          ? versionRef
                          : key === "planCode"
                            ? planCodeRef
                            : undefined
                      }
                      aria-invalid={
                        duplicateField && mutationError?.fieldErrors?.[key] ? "true" : undefined
                      }
                      className={fieldClass(duplicateField && mutationError?.fieldErrors?.[key])}
                      value={form[key] ?? defaults[key] ?? ""}
                      onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-border px-5 py-4">
          <div>
            {mode === COMPENSATION_PLAN_ACTION_MODES.CREATE && step === 2 ? (
              <Button type="button" size="sm" variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            {!isConfirmMode && mode === COMPENSATION_PLAN_ACTION_MODES.CREATE && step === 1 ? null : (
              <Button type="button" size="sm" disabled={busy} onClick={handleSubmit}>
                {copy.submit}
              </Button>
            )}
          </div>
        </footer>
      </aside>
    </div>
  );
}
