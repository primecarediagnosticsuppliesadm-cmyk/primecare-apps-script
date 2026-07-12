import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RoleChip } from "@/components/ux";
import ActionErrorSummary from "@/components/ux/ActionErrorSummary.jsx";
import {
  COMPENSATION_ACTION_MODES,
  buildPlanPreview,
} from "@/compensation/compensationActionDrawerModel.js";
import { cn } from "@/lib/utils";

const AVATAR_STYLES = {
  executive: "bg-violet-100 text-violet-800 ring-violet-200",
  admin: "bg-blue-100 text-blue-800 ring-blue-200",
  agent: "bg-emerald-100 text-emerald-800 ring-emerald-200",
  hr: "bg-slate-100 text-slate-700 ring-slate-200",
  default: "bg-[var(--pc-neutral-bg)] text-[var(--pc-brand-primary)] ring-border",
};

function avatarClass(role) {
  return AVATAR_STYLES[String(role || "").toLowerCase()] || AVATAR_STYLES.default;
}

function PreviewField({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value ?? "—"}</p>
    </div>
  );
}

function SectionShell({ title, children, className }) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-foreground">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Reusable compensation workflow drawer (assign, change, future modes).
 */
export default function CompensationActionDrawer({
  open = false,
  mode = "assign",
  busy = false,
  lockEmployee = false,
  employee = null,
  currentAssignment = null,
  availablePlans = [],
  selectableEmployees = [],
  promotionEligibilityRows = [],
  payrollCycleLabel = "—",
  mutationError = null,
  onSubmit,
  onCancel,
  onDismissError,
}) {
  const panelRef = useRef(null);
  const copy = COMPENSATION_ACTION_MODES[mode] || COMPENSATION_ACTION_MODES.assign;

  const [profileUserId, setProfileUserId] = useState("");
  const [planId, setPlanId] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [initialSnapshot, setInitialSnapshot] = useState("");

  const resetForm = useCallback(() => {
    const today = new Date().toISOString().slice(0, 10);
    const nextProfile = employee?.profileUserId || "";
    const nextPlan =
      mode === "change" && currentAssignment?.planId ? String(currentAssignment.planId) : "";
    setProfileUserId(nextProfile);
    setPlanId(nextPlan);
    setEffectiveDate(today);
    setNotes("");
    setInitialSnapshot(
      JSON.stringify({ profileUserId: nextProfile, planId: nextPlan, effectiveDate: today, notes: "" })
    );
  }, [currentAssignment?.planId, employee?.profileUserId, mode]);

  useEffect(() => {
    if (!open) return;
    resetForm();
  }, [open, resetForm]);

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => {
      const focusable = panelRef.current?.querySelector(
        "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
      );
      focusable?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const promotionRow = useMemo(() => {
    const agentId = String(employee?.agentId || "").trim();
    if (!agentId) return null;
    return (promotionEligibilityRows || []).find((row) => String(row.agentId || "") === agentId) || null;
  }, [employee?.agentId, promotionEligibilityRows]);

  const selectedPlan = useMemo(
    () => (availablePlans || []).find((plan) => plan.id === planId) || null,
    [availablePlans, planId]
  );

  const currentPlanPreview = useMemo(() => {
    if (!currentAssignment) return null;
    const plan =
      (availablePlans || []).find((row) => row.id === currentAssignment.planId) ||
      ({
        planName: currentAssignment.planName,
        planCode: currentAssignment.currentPlan || currentAssignment.planName,
        version: currentAssignment.planVersion,
        effectiveFromLabel: currentAssignment.effectiveFromLabel,
      });
    return buildPlanPreview(plan, { promotionRow, payrollCycleLabel });
  }, [availablePlans, currentAssignment, payrollCycleLabel, promotionRow]);

  const selectedPlanPreview = useMemo(
    () => buildPlanPreview(selectedPlan, { promotionRow, payrollCycleLabel }),
    [payrollCycleLabel, promotionRow, selectedPlan]
  );

  const isDirty = useMemo(() => {
    const snapshot = JSON.stringify({ profileUserId, planId, effectiveDate, notes });
    return snapshot !== initialSnapshot;
  }, [effectiveDate, initialSnapshot, notes, planId, profileUserId]);

  const requestClose = useCallback(() => {
    if (isDirty && typeof window !== "undefined") {
      const confirmed = window.confirm("Discard unsaved compensation changes?");
      if (!confirmed) return;
    }
    onCancel?.();
  }, [isDirty, onCancel]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
      }
      if (event.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll(
          "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, requestClose]);

  const canSubmit =
    Boolean(profileUserId) &&
    Boolean(planId) &&
    Boolean(effectiveDate) &&
    (mode !== "change" || planId !== String(currentAssignment?.planId || ""));

  const submitLabel = busy
    ? mode === "change"
      ? "Saving change…"
      : "Assigning plan…"
    : copy.submitLabel;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit?.({
      mode,
      profileUserId,
      planId,
      effectiveDate,
      notes: notes.trim(),
      assignmentRow: currentAssignment,
    });
  };

  if (!open) return null;

  const displayEmployee =
    employee ||
    selectableEmployees.find((row) => row.profileUserId === profileUserId) ||
    (profileUserId ? { profileUserId, employeeName: "Employee", role: "—", department: "HQ" } : null);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close compensation action drawer"
        onClick={requestClose}
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="compensation-action-title"
        aria-describedby="compensation-action-subtitle"
        className={cn(
          "relative flex h-full w-[min(42vw,40rem)] min-w-[320px] max-w-[45vw] flex-col border-l border-border bg-background shadow-2xl",
          "animate-in slide-in-from-right duration-200"
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id="compensation-action-title" className="text-lg font-semibold text-foreground">
              {copy.title}
            </h2>
            <p id="compensation-action-subtitle" className="mt-1 text-sm text-muted-foreground">
              {copy.subtitle}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 shrink-0 p-0"
            onClick={requestClose}
            aria-label="Close drawer"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {mutationError ? (
            <ActionErrorSummary
              title={mutationError.title}
              message={mutationError.message}
              fieldErrors={mutationError.fieldErrors}
              actions={mutationError.suggestedActions}
              technicalReference={mutationError.rawErrorForLogging}
              onDismiss={onDismissError}
            />
          ) : null}

          <SectionShell title="Employee">
            {lockEmployee && displayEmployee ? (
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold uppercase ring-1",
                    avatarClass(displayEmployee.role)
                  )}
                  aria-hidden
                >
                  {(displayEmployee.employeeName || "?").slice(0, 2)}
                </span>
                <div>
                  <p className="font-semibold text-foreground">{displayEmployee.employeeName}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <RoleChip role={displayEmployee.role} />
                    <span className="text-xs text-muted-foreground">{displayEmployee.department || "HQ"}</span>
                  </div>
                </div>
              </div>
            ) : (
              <label className="block space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Select employee
                </span>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={profileUserId}
                  onChange={(event) => setProfileUserId(event.target.value)}
                >
                  <option value="">Choose an employee</option>
                  {selectableEmployees.map((row) => (
                    <option key={row.profileUserId} value={row.profileUserId}>
                      {row.employeeName} · {row.role}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </SectionShell>

          <SectionShell title="Current Plan">
            {currentPlanPreview ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">{currentPlanPreview.planName}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <PreviewField label="Version" value={`V${currentPlanPreview.version}`} />
                  <PreviewField label="Effective Date" value={currentAssignment?.effectiveFromLabel || currentPlanPreview.effectiveFromLabel} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No active plan</p>
            )}
          </SectionShell>

          <SectionShell title={mode === "change" ? "New Plan" : "Assignment"}>
            {mode === "change" && currentPlanPreview ? (
              <div className="mb-3 flex items-center justify-center gap-2 text-muted-foreground" aria-hidden>
                <span className="rounded-md border border-border px-2 py-1 text-xs">{currentPlanPreview.planCode}</span>
                <ArrowDown className="h-4 w-4" />
                <span className="rounded-md border border-[var(--pc-brand-primary)]/30 bg-[var(--pc-brand-primary)]/5 px-2 py-1 text-xs text-foreground">
                  {selectedPlan?.planCode || "New plan"}
                </span>
              </div>
            ) : null}
            <div className="grid gap-3">
              <label className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Plan</span>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={planId}
                  onChange={(event) => setPlanId(event.target.value)}
                >
                  <option value="">Select plan</option>
                  {(availablePlans || []).map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.planName} · {plan.roleScope} · V{plan.version}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Effective Date
                </span>
                <Input type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Notes (optional)
                </span>
                <Textarea
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Internal note for your team — not sent to payroll."
                  className="text-sm"
                />
              </label>
            </div>
          </SectionShell>

          {selectedPlanPreview ? (
            <SectionShell title={mode === "change" ? "Preview Changes" : "Business Impact Preview"}>
              <div className="grid gap-3 sm:grid-cols-2">
                <PreviewField label="Salary" value={selectedPlanPreview.salary} />
                <PreviewField label="Fuel Allowance" value={selectedPlanPreview.fuelAllowance} />
                <PreviewField label="Mobile Allowance" value={selectedPlanPreview.mobileAllowance} />
                <PreviewField label="Commission %" value={selectedPlanPreview.commissionPct} />
                <PreviewField label="Payroll Cycle" value={selectedPlanPreview.payrollCycle} />
                <PreviewField label="Promotion Eligibility" value={selectedPlanPreview.promotionEligibility} />
                <PreviewField label="Plan Version" value={`V${selectedPlanPreview.version}`} />
                <PreviewField label="Plan Effective Date" value={selectedPlanPreview.effectiveFromLabel} />
              </div>
            </SectionShell>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
          <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={busy || !canSubmit} aria-busy={busy}>
            {submitLabel}
          </Button>
        </footer>
      </aside>
    </div>
  );
}
