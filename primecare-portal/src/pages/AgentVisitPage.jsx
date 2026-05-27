import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  StatusBadge,
  PageSkeleton,
  ListSkeleton,
  EmptyState,
  usePortalToast,
} from "@/components/ux";
import { typography } from "@/styles/designTokens";
import { cn } from "@/lib/utils";
import {
  qualificationBandToVariant,
  pipelineStageToVariant,
  visitTypeToVariant,
} from "@/utils/statusTokens";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import { usePredatorRenderTrace, recordPredatorRenderStep } from "@/predator/renderTrace.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { isPredatorEnabled } from "@/predator/predatorGuards.js";
import { createPredatorEntry } from "@/predator/predatorSchema.js";
import { predatorStore } from "@/predator/predatorStore.js";
import {
  ClipboardCheck,
  MapPin,
  PlusCircle,
  Users,
  CalendarDays,
  PhoneCall,
  IndianRupee,
  Clock3,
  Package,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCircle2,
  Building2,
  Pencil,
  Sparkles,
  X,
} from "lucide-react";

import {
  saveAgentVisitDraft,
  loadAgentVisitDraft,
  clearAgentVisitDraft,
} from "@/pages/agentVisitDraftStorage.js";
import {
  AGENT_VISIT_STEP_SUBTITLES,
  getWizardMotivationMessage,
  formatRelativeVisitTime,
} from "@/pages/agentVisitWizardUx.js";
import {
  recordAgentVisitDraftRestore,
  recordAgentVisitMissingFields,
  recordAgentVisitStepAbandonment,
  recordAgentVisitStepTiming,
  recordAgentVisitUxStep,
  recordAgentVisitWizardCompletion,
} from "@/pages/agentVisitWizardPredatorUx.js";

import { saveAgentVisit } from "@/api/primecareApi";
import {
  createAgentVisitWrite,
  getAgentVisitPageContextRead,
  getLabsCredit,
  getLabQualificationRead,
  upsertLabQualificationWrite,
} from "@/api/primecareSupabaseApi";
import { supabase } from "@/api/supabaseClient.js";
import { ROLES } from "@/config/roles";
import { labIdKey } from "@/utils/labId";
import {
  logAppsScriptFallbackUsed,
  logSupabaseFeatureSource,
} from "@/utils/migrationTrace.js";
import { logClientError } from "@/utils/debugLogger";
import { filterLabsForUser } from "@/utils/accessFilters";
import {
  buildLabSelectOptions,
  extractLabsCreditRows,
  normalizePortalLab,
} from "@/utils/portalLabMapper";
import { ALLOW_LEGACY_APPS_SCRIPT, IS_DEV, IS_QA } from "@/config/environment";
import {
  computeQualificationScore,
  formatQualificationBandLabel,
} from "@/utils/computeQualificationScore";
import {
  getPipelineStageLabel,
  mapPipelineFieldsFromRow,
} from "@/utils/qualificationPipeline";

function AgentVisitLoading() {
  return (
    <div className="space-y-3 pb-6">
      <PageSkeleton kpiCount={4} kpiColumns={4} showList={false} />
      <div className="animate-pulse rounded-lg border border-border bg-card p-3 shadow-sm">
        <ListSkeleton rows={5} />
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, subtitle, accent = false }) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          "rounded-2xl p-2.5 shadow-sm",
          accent
            ? "bg-[var(--pc-brand-primary)]/15 text-[var(--pc-brand-primary)]"
            : "bg-white text-slate-700 ring-1 ring-border/60"
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-lg font-semibold tracking-tight text-slate-900">{title}</div>
        {subtitle ? <div className="text-sm text-slate-600">{subtitle}</div> : null}
      </div>
    </div>
  );
}

function FieldLabel({ children, helper }) {
  return (
    <div className="mb-2">
      <label className="block text-sm font-semibold text-slate-800">{children}</label>
      {helper ? <p className="mt-1 text-xs text-slate-500">{helper}</p> : null}
    </div>
  );
}

const STEP_PANEL_CLASS =
  "space-y-4 rounded-2xl border border-border/60 bg-gradient-to-b from-card via-card to-[var(--pc-brand-primary)]/[0.03] p-4 shadow-sm md:max-w-3xl md:p-5";

const QUALIFICATION_PANEL_CLASS =
  "space-y-4 rounded-2xl border-2 border-violet-200/80 bg-gradient-to-br from-violet-50/80 via-card to-[var(--pc-brand-primary)]/[0.04] p-4 shadow-md ring-1 ring-violet-100 md:max-w-3xl md:p-5";

const FIELD_INPUT_CLASS = "h-11 w-full rounded-xl border-input text-base md:max-w-xl";

const STEP_MOTION = {
  initial: { opacity: 0, x: 12 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -12 },
  transition: { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] },
};

function CompactVisitKpiStrip({ labs, todayVisits, followUps, salesLogged }) {
  const items = [
    { label: "My labs", value: labs, icon: Users },
    { label: "Today", value: todayVisits, icon: ClipboardCheck },
    { label: "Follow-ups", value: followUps, icon: PhoneCall },
    { label: "Sales", value: `₹${Number(salesLogged || 0).toLocaleString("en-IN")}`, icon: IndianRupee },
  ];
  return (
    <>
      <div className="flex gap-2 overflow-x-auto pb-0.5 sm:hidden">
        {items.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="flex min-w-[4.75rem] shrink-0 items-center gap-1.5 rounded-lg border border-border/50 bg-muted/20 px-2 py-1.5"
          >
            <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <p className="truncate text-xs font-semibold text-slate-900">{value}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="hidden gap-2 sm:grid sm:grid-cols-4">
        {items.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-2.5 py-2"
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <p className="truncate text-sm font-semibold text-slate-900">{value}</p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function LabHeroCard({ lab, collection, latestVisit, form }) {
  if (!lab) return null;
  const outstanding = Number(collection?.outstandingAmount || 0);
  const creditHold = String(collection?.creditHold || "").toUpperCase() === "HOLD";
  const riskLabel = creditHold
    ? "Credit hold"
    : String(collection?.riskStatus || "").trim() || "OK";
  const riskVariant = creditHold ? "danger" : outstanding > 0 ? "warning" : "success";

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--pc-brand-primary)]/25 bg-gradient-to-br from-[var(--pc-brand-primary)]/10 via-card to-amber-50/40 p-4 shadow-md">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-white/90 p-2.5 shadow-sm">
          <Building2 className="h-5 w-5 text-[var(--pc-brand-primary)]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold text-slate-900">{lab.labName}</p>
          <p className="text-xs text-muted-foreground">
            {lab.area || form.area || "—"} · ID {lab.labId}
          </p>
        </div>
        <StatusBadge variant={riskVariant} compact>
          {riskLabel}
        </StatusBadge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-xl bg-white/80 p-2.5 ring-1 ring-border/50">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Outstanding
          </p>
          <p className="mt-0.5 text-sm font-bold text-slate-900">
            ₹{outstanding.toLocaleString("en-IN")}
          </p>
        </div>
        <div className="rounded-xl bg-white/80 p-2.5 ring-1 ring-border/50">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Last visit
          </p>
          <p className="mt-0.5 text-sm font-bold text-slate-900">
            {latestVisit?.date || "None"}
          </p>
        </div>
        <div className="rounded-xl bg-white/80 p-2.5 ring-1 ring-border/50">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Last response
          </p>
          <p className="mt-0.5 text-xs font-semibold text-slate-900">
            {displayResponseLabel(latestVisit?.labResponse || "")}
          </p>
        </div>
        <div className="rounded-xl bg-white/80 p-2.5 ring-1 ring-border/50">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Next follow-up
          </p>
          <p className="mt-0.5 text-xs font-semibold text-slate-900">
            {latestVisit?.nextFollowUpDate
              ? `${latestVisit.nextFollowUpType || "Call"} · ${latestVisit.nextFollowUpDate}`
              : "Not set"}
          </p>
        </div>
      </div>
    </div>
  );
}

function WizardMotivationStrip({
  currentIndex,
  total,
  labSelected,
  canSaveVisit,
  missingItems,
}) {
  const message = getWizardMotivationMessage(
    currentIndex,
    total,
    labSelected,
    canSaveVisit,
    missingItems.length
  );

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-[var(--pc-brand-primary)]/15 bg-[var(--pc-brand-primary)]/[0.04] px-3 py-2">
      <Sparkles className="h-4 w-4 shrink-0 text-[var(--pc-brand-primary)]" />
      <p className="text-xs font-medium text-slate-700 sm:text-sm">{message}</p>
    </div>
  );
}

function ReviewSummaryCard({ title, icon: Icon, onEdit, missing = [], children }) {
  const isValid = missing.length === 0;
  return (
    <div
      className={cn(
        "rounded-xl border p-3 shadow-sm transition-colors",
        isValid ? "border-border/60 bg-card" : "border-amber-200/80 bg-amber-50/40"
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-[var(--pc-brand-primary)]" />
          <span className="text-sm font-semibold text-slate-900">{title}</span>
          <StatusBadge variant={isValid ? "success" : "warning"} compact>
            {isValid ? "Ready" : "Check"}
          </StatusBadge>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 px-2 text-xs"
          onClick={onEdit}
        >
          <Pencil className="mr-1 h-3.5 w-3.5" />
          Edit
        </Button>
      </div>
      {missing.length > 0 ? (
        <ul className="mb-2 list-inside list-disc text-xs font-medium text-amber-800">
          {missing.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      <div className="text-sm text-slate-700">{children}</div>
    </div>
  );
}

function RecentVisitTimelineCard({ visit }) {
  const sold = Number(visit.soldValue || 0);
  const relativeTime = formatRelativeVisitTime(visit.date);
  const nextPreview =
    visit.nextAction ||
    (visit.nextFollowUpDate
      ? `${visit.nextFollowUpType || "Call"} · ${visit.nextFollowUpDate}`
      : null);

  return (
    <div className="relative flex gap-2.5 pb-2 pl-3" role="listitem">
      <div className="absolute bottom-0 left-[5px] top-2 w-0.5 bg-border/80" aria-hidden />
      <div className="relative z-[1] mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-[var(--pc-brand-primary)] bg-card" />
      <div className="min-w-0 flex-1 rounded-lg border border-border/50 bg-card px-2.5 py-2 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">
              {visit.labName || "—"}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              <StatusBadge variant={visitTypeToVariant(visit.visitType)} compact>
                {visit.visitType || "—"}
              </StatusBadge>
              <StatusBadge variant="info" compact>
                {displayResponseLabel(visit.labResponse)}
              </StatusBadge>
              {visit.qualificationBand ? (
                <StatusBadge
                  variant={qualificationBandToVariant(visit.qualificationBand)}
                  compact
                >
                  {formatQualificationBandLabel(visit.qualificationBand)}
                </StatusBadge>
              ) : null}
            </div>
          </div>
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {relativeTime}
          </span>
        </div>
        {sold > 0 ? (
          <p className="mt-1 text-[11px] font-semibold text-emerald-700">
            Sold ₹{sold.toLocaleString("en-IN")}
          </p>
        ) : null}
        {nextPreview ? (
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">→ {nextPreview}</p>
        ) : null}
      </div>
    </div>
  );
}

function normalizeLab(lab) {
  return normalizePortalLab(lab);
}

function normalizeVisit(v) {
  return {
    id: v.id || v.Visit_ID || "",
    agent: v.agent || v.agentName || v.Agent_Name || "",
    date: v.date || v.visitDate || v.Visit_Date || "",
    labId: v.labId || v.Lab_ID || "",
    labName: v.labName || v.Lab_Name || "",
    area: v.area || v.Area || "",
    visitType: v.visitType || v.Visit_Type || "",
    labResponse: v.labResponse || v.Lab_Response || "",
    soldValue: Number(v.soldValue || v.Sold_Value || 0),
    nextAction: v.nextAction || v.Next_Action || "",
    nextFollowUpDate: v.nextFollowUpDate || v.Next_Follow_Up_Date || "",
    nextFollowUpType: v.nextFollowUpType || v.Next_Follow_Up_Type || "",
  };
}

function normalizeCollection(c) {
  return {
    labId: c.labId || c.Lab_ID || "",
    labName: c.labName || c.Lab_Name || "",
    outstandingAmount: Number(
      c.outstandingAmount ?? c.outstanding ?? c.Outstanding ?? 0
    ),
    overdueDays: Number(c.overdueDays ?? c.daysOverdue ?? c.Days_Overdue ?? 0),
    riskStatus: c.riskStatus || c.Risk_Status || "",
    creditHold: c.creditHold || c.Credit_Hold || "",
    nextAction: c.nextAction || c.Next_Action || "",
    paymentStatus: c.paymentStatus || c.Payment_Status || "",
    lastFollowUp: c.lastFollowUp || c.Last_Follow_Up_Date || "",
  };
}

function mapWorkspaceVisitToPageVisit(visit) {
  return normalizeVisit({
    id: visit.visitId || visit.id,
    agent: visit.agentName || visit.agent,
    agentName: visit.agentName || visit.agent,
    agentId: visit.agentId,
    date: visit.visitDate || visit.date,
    labId: visit.labId,
    labName: visit.labName,
    area: visit.area,
    visitType: visit.visitType,
    labResponse: visit.labResponse,
    soldValue: visit.soldValue,
    nextAction: visit.nextAction,
    nextFollowUpDate: visit.nextFollowUpDate,
    nextFollowUpType: visit.nextFollowUpType,
  });
}

const WIZARD_STEP_COUNT = 6;

/** Wizard steps for Agent Visit page (includes mandatory qualification step). */
export const AGENT_VISIT_SECTION_STEPS = [
  { key: "basics", title: "Select Lab", shortTitle: "Lab", icon: Users },
  { key: "outcome", title: "Visit Outcome", shortTitle: "Outcome", icon: MapPin },
  { key: "stock", title: "Stock Feedback", shortTitle: "Stock", icon: Package },
  { key: "followup", title: "Follow-up", shortTitle: "Follow-up", icon: CalendarDays },
  { key: "qualification", title: "Qualification", shortTitle: "Qualify", icon: ClipboardCheck },
  { key: "review", title: "Review & Save", shortTitle: "Review", icon: CheckCircle2 },
];

function assertAgentVisitSectionSteps() {
  if (!(IS_DEV || IS_QA)) return;
  const sectionSteps = AGENT_VISIT_SECTION_STEPS;
  const hasQualification = sectionSteps.some((s) => s.key === "qualification");
  if (!hasQualification) {
    throw new Error("[AgentVisit] sectionSteps must include qualification step");
  }
  if (sectionSteps.length !== WIZARD_STEP_COUNT) {
    throw new Error(
      `[AgentVisit] sectionSteps must have ${WIZARD_STEP_COUNT} steps, got ${sectionSteps.length}`
    );
  }
}

assertAgentVisitSectionSteps();

const QUALIFICATION_DEFAULT = {
  labSize: "",
  monthlyConsumablesEstimate: "",
  currentSupplier: "",
  paymentTerms: "",
  decisionMaker: "",
  reagentRentalPotential: "",
  labOsFit: "",
  nextFollowUpDate: "",
  founderReviewStatus: "pending",
  notes: "",
  qualificationScore: null,
  qualificationBand: "",
  qualificationReasons: [],
  pipelineStage: "new",
  pipelineStageLabel: "New",
  pipelineNextAction: "",
};

function normalizeQualificationRow(row) {
  if (!row) return { ...QUALIFICATION_DEFAULT };
  const scoring = computeQualificationScore(row);
  const pipeline = mapPipelineFieldsFromRow(row);
  return {
    labSize: row.lab_size || "",
    monthlyConsumablesEstimate:
      row.monthly_consumables_estimate == null
        ? ""
        : String(row.monthly_consumables_estimate),
    currentSupplier: row.current_supplier || "",
    paymentTerms: row.payment_terms || "",
    decisionMaker: row.decision_maker || "",
    reagentRentalPotential: row.reagent_rental_potential || "",
    labOsFit: row.lab_os_fit || "",
    nextFollowUpDate: row.next_follow_up_date || "",
    founderReviewStatus: row.founder_review_status || "pending",
    notes: row.notes || "",
    qualificationScore:
      row.qualification_score != null
        ? Number(row.qualification_score)
        : scoring.qualification_score,
    qualificationBand: row.qualification_band || scoring.qualification_band || "",
    qualificationReasons: scoring.qualification_reasons || [],
    pipelineStage: pipeline.pipelineStage,
    pipelineStageLabel: pipeline.pipelineStageLabel,
    pipelineNextAction: pipeline.pipelineNextAction,
  };
}

function displayResponseLabel(value) {
  const v = String(value || "").trim();
  if (v === "Interested") return "Interested";
  if (v === "Warm") return "Moderately Interested";
  if (v === "Not Interested") return "Not Interested";
  if (v === "Converted") return "Order Confirmed";
  if (v === "Need Follow-up") return "Follow-up Needed";
  return v || "-";
}

/** Match dropdown value to a lab (native select string values). */
function resolveLabByOptionValue(labs, value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const rawKey = labIdKey(raw);
  let lab = labs.find((l) => labIdKey(l.labId) === rawKey);
  if (!lab) {
    lab = labs.find((l) => String(l.labName ?? "").trim() === raw);
  }
  return lab || null;
}

function isAgentUser(user) {
  return String(user?.role ?? "").trim().toLowerCase() === ROLES.AGENT;
}

function hasPersistedQualificationData(form, lastUpdated) {
  if (lastUpdated) return true;
  if (!form) return false;
  return Boolean(
    form.qualificationBand ||
      form.qualificationScore != null ||
      (Array.isArray(form.qualificationReasons) && form.qualificationReasons.length > 0) ||
      (form.pipelineStage && form.pipelineStage !== "new") ||
      String(form.labSize || "").trim() ||
      String(form.monthlyConsumablesEstimate || "").trim() ||
      String(form.currentSupplier || "").trim() ||
      String(form.paymentTerms || "").trim() ||
      String(form.decisionMaker || "").trim() ||
      String(form.reagentRentalPotential || "").trim() ||
      String(form.labOsFit || "").trim() ||
      String(form.nextFollowUpDate || "").trim() ||
      String(form.notes || "").trim() ||
      String(form.pipelineNextAction || "").trim()
  );
}

function WizardProgressBar({ currentIndex, total, stepKey }) {
  const progressPct = Math.round(((currentIndex + 1) / total) * 100);
  const subtitle = AGENT_VISIT_STEP_SUBTITLES[stepKey] || "";
  return (
    <div className="space-y-2">
      <div className="space-y-0.5">
        <p className="text-sm font-bold tracking-tight text-slate-900">
          Step {currentIndex + 1} of {total}
          {subtitle ? (
            <span className="font-semibold text-[var(--pc-brand-primary)]"> — {subtitle}</span>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground">{progressPct}% complete</p>
      </div>
      <div
        className="h-3 w-full overflow-hidden rounded-full bg-muted/80"
        role="progressbar"
        aria-valuenow={currentIndex + 1}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label={`Step ${currentIndex + 1} of ${total}, ${progressPct} percent`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-[var(--pc-brand-primary)] to-emerald-500 transition-all duration-300 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  );
}

function VisitWizardStepper({ steps, currentIndex, labSelected, onGoToStep }) {
  const qualificationIndex = steps.findIndex((s) => s.key === "qualification");

  return (
    <nav aria-label="Visit wizard progress" className="-mx-1 overflow-x-auto pb-1">
      <ol className="flex min-w-max items-center px-1">
        {steps.map((step, index) => {
          const StepIcon = step.icon || ClipboardCheck;
          const isActive = index === currentIndex;
          const isComplete = index < currentIndex;
          const needsLab = index > 0 && !labSelected;
          const isQualification = index === qualificationIndex;
          return (
            <li key={step.key} className="flex items-center">
              <button
                type="button"
                disabled={needsLab}
                onClick={() => {
                  if (!needsLab) onGoToStep(index);
                }}
                className={cn(
                  "flex min-w-[4.75rem] flex-col items-center rounded-2xl px-2 py-2 text-center transition-all duration-200 sm:min-w-[5.25rem] sm:px-2.5 sm:py-2.5",
                  "hover:scale-[1.02] disabled:hover:scale-100",
                  isActive &&
                    "min-w-[5.5rem] scale-[1.04] bg-[var(--pc-brand-primary)] text-white shadow-lg shadow-[var(--pc-brand-primary)]/30 ring-2 ring-[var(--pc-brand-primary)] sm:min-w-[6rem]",
                  isComplete && !isActive && "bg-emerald-50 ring-1 ring-emerald-200/90",
                  isQualification &&
                    labSelected &&
                    !isActive &&
                    !isComplete &&
                    "ring-2 ring-violet-300/50",
                  needsLab && "cursor-not-allowed opacity-45"
                )}
              >
                <span
                  className={cn(
                    "flex items-center justify-center rounded-full transition-all duration-200",
                    isActive ? "h-11 w-11 bg-white/20 text-white" : "h-9 w-9",
                    !isActive && isComplete && "bg-emerald-500 text-white",
                    !isActive && !isComplete && "bg-muted text-muted-foreground"
                  )}
                >
                  {isComplete && !isActive ? (
                    <Check className="h-5 w-5" strokeWidth={3} />
                  ) : (
                    <StepIcon className={cn("h-4 w-4", isActive && "h-[1.125rem] w-[1.125rem]")} />
                  )}
                </span>
                <span
                  className={cn(
                    "mt-2 text-[10px] font-semibold leading-tight sm:text-[11px]",
                    isActive ? "text-white" : "text-slate-700"
                  )}
                >
                  {step.shortTitle}
                </span>
              </button>
              {index < steps.length - 1 ? (
                <div
                  className={cn(
                    "mx-0.5 h-2 w-5 shrink-0 rounded-full transition-colors duration-200 sm:w-8",
                    index < currentIndex ? "bg-emerald-500" : "bg-muted/90"
                  )}
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function WizardNavButtons({ currentIndex, maxIndex, onBack, onNext, nextDisabled, nextLabel = "Continue" }) {
  return (
    <div className="mt-4 hidden gap-3 border-t border-border/70 pt-4 md:flex">
      <Button
        type="button"
        variant="outline"
        onClick={onBack}
        disabled={currentIndex === 0}
        className="h-12 min-h-12 flex-1 rounded-xl text-base"
      >
        <ChevronLeft className="mr-1 h-5 w-5" />
        Back
      </Button>
      {currentIndex < maxIndex ? (
        <Button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className="h-12 min-h-12 flex-1 rounded-xl bg-[var(--pc-brand-primary)] text-base font-semibold text-white hover:opacity-95"
        >
          {nextLabel}
          <ChevronRight className="ml-1 h-5 w-5" />
        </Button>
      ) : null}
    </div>
  );
}

function WizardMobileNavBar({ currentIndex, maxIndex, onBack, onNext, nextDisabled, nextLabel = "Continue" }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 md:hidden">
      <div className="mx-auto flex max-w-5xl gap-3 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] shadow-[0_-4px_20px_rgba(15,23,42,0.14)] backdrop-blur supports-[backdrop-filter]:bg-background/90">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={currentIndex === 0}
          className="h-12 min-h-12 flex-1 rounded-xl text-base"
        >
          <ChevronLeft className="mr-1 h-5 w-5" />
          Back
        </Button>
        {currentIndex < maxIndex ? (
          <Button
            type="button"
            onClick={onNext}
            disabled={nextDisabled}
            className="h-12 min-h-12 flex-1 rounded-xl bg-[var(--pc-brand-primary)] text-base font-semibold"
          >
            {nextLabel}
            <ChevronRight className="ml-1 h-5 w-5" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function WizardReviewFooter({ onBack, onSave, saving, saveDisabled }) {
  return (
    <>
      <div className="mt-4 hidden gap-3 border-t border-border pt-4 md:flex">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="h-12 min-h-12 flex-1 rounded-xl text-base"
        >
          <ChevronLeft className="mr-1 h-5 w-5" />
          Back
        </Button>
        <SaveVisitButton
          saving={saving}
          onClick={onSave}
          disabled={saveDisabled}
          className="flex-1"
        />
      </div>
      <div className="fixed inset-x-0 bottom-0 z-50 md:hidden">
        <div className="mx-auto flex max-w-5xl gap-3 border-t border-border bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] shadow-[0_-4px_20px_rgba(15,23,42,0.14)] backdrop-blur supports-[backdrop-filter]:bg-background/90">
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            className="h-12 min-h-12 flex-1 rounded-xl text-base"
          >
            <ChevronLeft className="mr-1 h-5 w-5" />
            Back
          </Button>
          <SaveVisitButton
            saving={saving}
            onClick={onSave}
            disabled={saveDisabled}
            className="flex-1"
          />
        </div>
      </div>
    </>
  );
}

function getMissingVisitRequirements(form) {
  const missing = [];
  if (!String(form.agentName || "").trim()) missing.push("Agent name");
  if (!String(form.visitDate || "").trim()) missing.push("Visit date");
  if (!String(form.labId || "").trim()) missing.push("Lab selection");
  if (!String(form.visitType || "").trim()) missing.push("Visit type");
  if (form.labResponse === "Converted" && !Number(form.soldValue || 0)) {
    missing.push("Order value (required for Order Confirmed)");
  }
  if (
    (form.labResponse === "Need Follow-up" || form.nextFollowUpDate) &&
    !form.nextFollowUpType
  ) {
    missing.push("Follow-up type");
  }
  return missing;
}

function SaveVisitButton({ saving, onClick, className, disabled = false }) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={saving || disabled}
      className={cn(
        "h-12 min-h-12 w-full rounded-xl bg-[var(--pc-brand-primary)] text-base font-semibold text-white shadow-md hover:opacity-95",
        className
      )}
    >
      {saving ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Completing visit…
        </>
      ) : (
        <>
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Complete Visit Log
        </>
      )}
    </Button>
  );
}

export default function AgentVisitPage({ currentUser, authToken }) {
  const { showToast } = usePortalToast();
  const [labs, setLabs] = useState([]);
  /** Last agent workspace payload when loaded via getAgentWorkspaceRead (Supabase). */
  const [agentWorkspace, setAgentWorkspace] = useState(null);
  const [recentVisits, setRecentVisits] = useState([]);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [qualificationForm, setQualificationForm] = useState(QUALIFICATION_DEFAULT);
  const [qualificationEditing, setQualificationEditing] = useState(false);
  const [qualificationLoading, setQualificationLoading] = useState(false);
  const [qualificationSaving, setQualificationSaving] = useState(false);
  const [qualificationLastUpdated, setQualificationLastUpdated] = useState("");
  const [draftBannerVisible, setDraftBannerVisible] = useState(false);

  const hasLoadedDataRef = useRef(false);
  const authTokenRef = useRef(authToken);
  authTokenRef.current = authToken;
  const draftRestoreAttemptedRef = useRef(false);
  const wizardStartedAtRef = useRef(Date.now());
  const stepEnteredAtRef = useRef(Date.now());
  const prevStepIndexRef = useRef(0);
  const currentStepIndexRef = useRef(0);
  const wizardStepAnchorRef = useRef(null);

  const loadUserKey = useMemo(
    () =>
      [
        currentUser?.id,
        currentUser?.role,
        currentUser?.agentId,
        currentUser?.tenantId,
      ]
        .map((v) => String(v ?? ""))
        .join("|"),
    [currentUser?.id, currentUser?.role, currentUser?.agentId, currentUser?.tenantId]
  );

  const [form, setForm] = useState({
    agentName: currentUser?.agentName || currentUser?.name || "",
    visitDate: new Date().toISOString().slice(0, 10),
    labId: "",
    labName: "",
    area: currentUser?.assignedArea || "",
    visitType: "Follow-up",
    samplesGiven: "",
    demoGiven: "No",
    labResponse: "Warm",
    soldValue: "",
    stockAvailable: "Yes",
    needsNewStock: "No",
    nextAction: "",
    nextFollowUpDate: "",
    nextFollowUpType: "Call",
    notes: "",
  });

  const loadPageData = useCallback(async () => {
    return predatorTrace("Agent Visits", "page.load", async () => {
      const isInitialLoad = !hasLoadedDataRef.current;
      try {
        if (isInitialLoad) {
          setLoading(true);
        }
        setLoadError("");

        const token = authTokenRef.current;
        const params = token ? { sessionToken: token } : {};

        let workspace = null;
        let labList = [];
        let visitRows = [];
        let collectionRows = [];

        if (supabase) {
          logSupabaseFeatureSource("AgentVisit.load", {
            apis: ["getAgentVisitPageContextRead", "getLabsCredit"],
          });
          const isAgent = isAgentUser(currentUser);

          if (isAgent) {
            const ctxRes = await getAgentVisitPageContextRead(currentUser);
            if (!ctxRes?.success) {
              throw new Error(ctxRes?.error || "Failed to load agent visit context");
            }
            const ctx = ctxRes.data || {};
            workspace = {
              assignedLabs: ctx.labs || [],
              recentVisits: ctx.recentVisits || [],
              pendingCollections: ctx.collections || [],
            };
            visitRows = (ctx.recentVisits || []).map(mapWorkspaceVisitToPageVisit);
            collectionRows = (ctx.collections || []).map(normalizeCollection);

            labList = (ctx.labs || []).map(normalizePortalLab);
            if (labList.length === 0) {
              const cr = await getLabsCredit();
              const rawLabs = extractLabsCreditRows(cr);
              labList = rawLabs.map(normalizePortalLab);
            }
          } else {
            try {
              const cr = await getLabsCredit();
              if (cr?.success && Array.isArray(cr.data)) {
                labList = cr.data
                  .map(normalizeLab)
                  .filter((l) => String(l.labId).trim() !== "");
              }
            } catch (e) {
              console.warn("[AgentVisitPage] getLabsCredit failed:", e?.message || e);
            }
          }
        } else {
          if (!ALLOW_LEGACY_APPS_SCRIPT) {
            throw new Error("Supabase visit data is required for pilot access.");
          }
          const { getLabs, getRecentVisits, getCollections } = await import(
            "@/api/primecareApi"
          );
          const labsRes = await getLabs(params);
          if (!labsRes.success) throw new Error(labsRes.error || "Failed to load labs");
          labList = (labsRes.data?.labs || []).map(normalizeLab).filter((l) => String(l.labId).trim() !== "");

          const [visitsRes, collectionsRes] = await Promise.all([
            getRecentVisits(params),
            getCollections(params),
          ]);
          if (visitsRes?.success) {
            visitRows = (visitsRes.data?.visits || []).map(normalizeVisit);
          }
          if (collectionsRes?.success) {
            collectionRows = (collectionsRes.data?.collections || []).map(normalizeCollection);
          }
        }

        setAgentWorkspace(workspace);
        setLabs(labList);
        setRecentVisits(visitRows);
        setCollections(collectionRows);
        hasLoadedDataRef.current = true;
        setLoading(false);
      } catch (err) {
        await logClientError({
          authToken: authTokenRef.current,
          page: "AgentVisitPage",
          component: "AgentVisitPage",
          actionType: "LOAD_FAIL",
          errorCode: "VISIT_PAGE_LOAD_FAIL",
          errorMessage: err?.message || "Failed to load agent visit page",
          stackTrace: err?.stack || "",
          payload: {
            currentUser,
          },
        });

        setLoadError(err.message || "Failed to load agent visit page");
        setLabs([]);
        setAgentWorkspace(null);
        setLoading(false);
      }
    });
  }, [currentUser]);

  useEffect(() => {
    loadPageData();
  }, [loadUserKey, loadPageData]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      agentName: currentUser?.agentName || currentUser?.name || prev.agentName,
    }));
  }, [currentUser?.id, currentUser?.agentName, currentUser?.name]);

  const visibleLabs = useMemo(() => {
    if (isAgentUser(currentUser)) {
      return filterLabsForUser(labs, currentUser);
    }
    return labs;
  }, [labs, currentUser]);

  useEffect(() => {
    if (loading || draftRestoreAttemptedRef.current) return;
    if (typeof window !== "undefined" && sessionStorage.getItem("primecare_pending_visit_task")) {
      draftRestoreAttemptedRef.current = true;
      return;
    }

    draftRestoreAttemptedRef.current = true;
    const { restored, draft } = loadAgentVisitDraft(currentUser, visibleLabs);
    if (!restored || !draft) return;

    if (draft.form && typeof draft.form === "object") {
      setForm((prev) => ({ ...prev, ...draft.form }));
    }
    if (draft.qualificationForm && typeof draft.qualificationForm === "object") {
      setQualificationForm((prev) => ({ ...prev, ...draft.qualificationForm }));
    }
    if (typeof draft.qualificationEditing === "boolean") {
      setQualificationEditing(draft.qualificationEditing);
    }
    const stepIdx = Math.min(
      Math.max(0, Number(draft.currentStepIndex) || 0),
      AGENT_VISIT_SECTION_STEPS.length - 1
    );
    setCurrentStepIndex(stepIdx);
    prevStepIndexRef.current = stepIdx;
    stepEnteredAtRef.current = Date.now();
    wizardStartedAtRef.current = Date.now();
    setDraftBannerVisible(true);
    showToast("info", "Draft restored — continue where you left off.");
    recordAgentVisitDraftRestore({
      stepIndex: stepIdx,
      stepKey: AGENT_VISIT_SECTION_STEPS[stepIdx]?.key,
    });
  }, [loading, currentUser, visibleLabs, showToast]);

  useEffect(() => {
    if (loading || saving) return;
    saveAgentVisitDraft({
      user: currentUser,
      currentStepIndex,
      form,
      qualificationForm,
      qualificationEditing,
    });
  }, [
    loading,
    saving,
    currentStepIndex,
    form,
    qualificationForm,
    qualificationEditing,
    currentUser,
  ]);

  useEffect(() => {
    currentStepIndexRef.current = currentStepIndex;
    recordAgentVisitUxStep({
      stepIndex: currentStepIndex,
      stepKey: AGENT_VISIT_SECTION_STEPS[currentStepIndex]?.key,
    });

    if (prevStepIndexRef.current !== currentStepIndex) {
      recordAgentVisitStepTiming({
        fromStepIndex: prevStepIndexRef.current,
        fromStepKey: AGENT_VISIT_SECTION_STEPS[prevStepIndexRef.current]?.key,
        toStepIndex: currentStepIndex,
        toStepKey: AGENT_VISIT_SECTION_STEPS[currentStepIndex]?.key,
        durationMs: Date.now() - stepEnteredAtRef.current,
      });
      stepEnteredAtRef.current = Date.now();
      prevStepIndexRef.current = currentStepIndex;
    }
  }, [currentStepIndex]);

  useEffect(() => {
    const anchor = wizardStepAnchorRef.current;
    if (!anchor || typeof window === "undefined") return;
    const top = anchor.getBoundingClientRect().top + window.scrollY - 12;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [currentStepIndex]);

  useEffect(() => {
    return () => {
      const idx = currentStepIndexRef.current;
      const isComplete = idx >= AGENT_VISIT_SECTION_STEPS.length - 1;
      if (idx > 0 && !isComplete) {
        recordAgentVisitStepAbandonment({
          lastStepIndex: idx,
          lastStepKey: AGENT_VISIT_SECTION_STEPS[idx]?.key,
          elapsedMs: Date.now() - wizardStartedAtRef.current,
        });
      }
    };
  }, []);

  const labSelectOptions = useMemo(
    () => buildLabSelectOptions(visibleLabs),
    [visibleLabs]
  );

  const visibleVisits = useMemo(() => recentVisits, [recentVisits]);

  const todayVisits = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return visibleVisits.filter((v) => String(v.date).slice(0, 10) === today).length;
  }, [visibleVisits]);

  usePredatorModuleValidation(
    "Agent Visits",
    currentUser,
    {
      recentVisitsCount: visibleVisits.length,
      todayVisits,
      wizardStepCount: AGENT_VISIT_SECTION_STEPS.length,
      hasQualificationStep: AGENT_VISIT_SECTION_STEPS.some((s) => s.key === "qualification"),
      labSelected: Boolean(String(form.labId || "").trim()),
      currentWizardStep: AGENT_VISIT_SECTION_STEPS[currentStepIndex]?.key ?? null,
    },
    !loading
  );

  usePredatorRenderTrace("Agent Visits", {
    ready: !loading,
    hasData: visibleLabs.length > 0 || visibleVisits.length > 0,
  });
  const visibleCollections = useMemo(() => collections, [collections]);

  useEffect(() => {
    function handleOpenVisitTask(event) {
      const detail = event?.detail || {};
      const task = detail.task || {};
      if (!task) return;

      const matchingLab =
        visibleLabs.find((lab) => String(lab.labId) === String(task.labId)) || null;

      setForm((prev) => ({
        ...prev,
        labId: task.labId || "",
        labName: task.labName || matchingLab?.labName || "",
        area: matchingLab?.area || prev.area || "",
        visitType: task.visitType || "Follow-up",
        nextAction: task.nextAction || prev.nextAction || "",
        nextFollowUpType: task.followUpType || prev.nextFollowUpType || "Call",
        nextFollowUpDate: task.followUpDate || prev.nextFollowUpDate || "",
      }));

      showToast(
        "info",
        `Task loaded for ${task.labName || "selected lab"}. Review and save your visit update.`
      );
    }

    window.addEventListener("primecare:openVisitTask", handleOpenVisitTask);

    return () => {
      window.removeEventListener("primecare:openVisitTask", handleOpenVisitTask);
    };
  }, [visibleLabs, showToast]);

  useEffect(() => {
    const raw = sessionStorage.getItem("primecare_pending_visit_task");
    if (!raw) return;

    try {
      const task = JSON.parse(raw);
      const matchingLab =
        visibleLabs.find((lab) => String(lab.labId) === String(task.labId)) || null;

      setForm((prev) => ({
        ...prev,
        labId: task.labId || "",
        labName: task.labName || matchingLab?.labName || "",
        area: matchingLab?.area || prev.area || "",
        visitType: task.visitType || "Follow-up",
        nextAction: task.nextAction || prev.nextAction || "",
        nextFollowUpType: task.followUpType || prev.nextFollowUpType || "Call",
        nextFollowUpDate: task.followUpDate || prev.nextFollowUpDate || "",
      }));

      showToast(
        "info",
        `Task loaded for ${task.labName || "selected lab"}. Review and save your visit update.`
      );

      sessionStorage.removeItem("primecare_pending_visit_task");
    } catch (err) {
      console.error("Failed to read pending visit task", err);
      sessionStorage.removeItem("primecare_pending_visit_task");
    }
  }, [visibleLabs, showToast]);

  const selectedLab = useMemo(() => {
    const labId = String(form.labId || "").trim();
    if (!labId) return null;
    return resolveLabByOptionValue(visibleLabs, labId);
  }, [visibleLabs, form.labId]);

  const hasQualificationData = useMemo(
    () => hasPersistedQualificationData(qualificationForm, qualificationLastUpdated),
    [qualificationForm, qualificationLastUpdated]
  );

  const labSelected = Boolean(String(form.labId || "").trim());

  const canSaveVisit = useMemo(() => {
    return Boolean(
      String(form.agentName || "").trim() &&
        String(form.visitDate || "").trim() &&
        String(form.visitType || "").trim() &&
        labSelected
    );
  }, [form.agentName, form.visitDate, form.visitType, labSelected]);

  const currentStep = AGENT_VISIT_SECTION_STEPS[currentStepIndex] ?? AGENT_VISIT_SECTION_STEPS[0];
  const qualificationStepIndex = AGENT_VISIT_SECTION_STEPS.findIndex(
    (s) => s.key === "qualification"
  );

  useEffect(() => {
    if (!labSelected || qualificationLoading) return;
    setQualificationEditing(!hasQualificationData);
  }, [labSelected, qualificationLoading, hasQualificationData, form.labId]);

  useEffect(() => {
    if (!isPredatorEnabled() || loading) return;

    const hasQualStep = AGENT_VISIT_SECTION_STEPS.some((s) => s.key === "qualification");
    if (!hasQualStep) {
      predatorStore.recordError(
        createPredatorEntry({
          status: "FAIL",
          module: "Agent Visits",
          step: "ui.qualification_step.missing",
          expected: "qualification step in AGENT_VISIT_SECTION_STEPS",
          actual: AGENT_VISIT_SECTION_STEPS.map((s) => s.key),
          rootCauseGuess: "Wizard sectionSteps drift removed qualification step",
          suggestedFix: "Restore qualification step in AGENT_VISIT_SECTION_STEPS",
          severity: "high",
          issueClass: "render",
        })
      );
    }

    if (AGENT_VISIT_SECTION_STEPS.length !== WIZARD_STEP_COUNT) {
      predatorStore.recordError(
        createPredatorEntry({
          status: "WARN",
          module: "Agent Visits",
          step: "ui.wizard_step_count_drift",
          expected: WIZARD_STEP_COUNT,
          actual: AGENT_VISIT_SECTION_STEPS.length,
          rootCauseGuess: "Agent visit wizard step list length changed",
          suggestedFix: `Keep exactly ${WIZARD_STEP_COUNT} steps in AGENT_VISIT_SECTION_STEPS`,
          severity: "medium",
          issueClass: "render",
        })
      );
    }

    recordPredatorRenderStep("Agent Visits", "ui.wizard_steps.config", {
      stepCount: AGENT_VISIT_SECTION_STEPS.length,
      hasQualificationStep: hasQualStep,
      stepKeys: AGENT_VISIT_SECTION_STEPS.map((s) => s.key),
    });

    if (isAgentUser(currentUser) && labSelected) {
      recordPredatorRenderStep("Agent Visits", "ui.qualification_step.eligible", {
        labId: form.labId,
        currentStep: currentStep.key,
        qualificationStepIndex,
      });
    }
  }, [
    loading,
    currentUser,
    labSelected,
    form.labId,
    currentStep.key,
    qualificationStepIndex,
  ]);

  useEffect(() => {
    if (
      loading ||
      !isAgentUser(currentUser) ||
      !labSelected ||
      currentStepIndex !== qualificationStepIndex
    ) {
      return;
    }
    recordPredatorRenderStep("Agent Visits", "ui.qualification_step.render", {
      labId: form.labId,
      hasQualificationData,
      qualificationEditing,
    });
  }, [
    loading,
    currentUser,
    labSelected,
    form.labId,
    currentStepIndex,
    qualificationStepIndex,
    hasQualificationData,
    qualificationEditing,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadQualification() {
      const labId = labIdKey(form.labId);
      if (!labId) {
        setQualificationForm({ ...QUALIFICATION_DEFAULT });
        setQualificationLastUpdated("");
        return;
      }

      try {
        setQualificationLoading(true);
        const res = await getLabQualificationRead({
          tenantId: currentUser?.tenantId || currentUser?.tenant_id || "",
          labId,
        });

        if (cancelled) return;
        if (!res?.success) {
          throw new Error(res?.error || "Failed to load qualification");
        }

        setQualificationForm(normalizeQualificationRow(res.data));
        setQualificationLastUpdated(res?.data?.updated_at || "");
      } catch (err) {
        if (cancelled) return;
        setQualificationForm({ ...QUALIFICATION_DEFAULT });
        showToast("error", err?.message || "Failed to load qualification");
      } finally {
        if (!cancelled) setQualificationLoading(false);
      }
    }

    loadQualification();
    return () => {
      cancelled = true;
    };
  }, [form.labId, currentUser, showToast]);

  const selectedLabVisits = useMemo(() => {
    return visibleVisits
      .filter((visit) => String(visit.labId) === String(form.labId))
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [visibleVisits, form.labId]);

  const latestLabVisit = selectedLabVisits[0] || null;

  const selectedLabCollection = useMemo(() => {
    return visibleCollections.find((c) => String(c.labId) === String(form.labId)) || null;
  }, [visibleCollections, form.labId]);

  const pendingFollowUps = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return visibleVisits.filter((v) => {
      const due = String(v.nextFollowUpDate || "").slice(0, 10);
      return due && due >= today;
    }).length;
  }, [visibleVisits]);

  const totalSalesLogged = useMemo(() => {
    return visibleVisits.reduce((sum, v) => sum + Number(v.soldValue || 0), 0);
  }, [visibleVisits]);

  useEffect(() => {
    if (!form.labId) return;

    if (Number(selectedLabCollection?.outstandingAmount || 0) > 0) {
      setForm((prev) => ({
        ...prev,
        nextAction: prev.nextAction || "Follow up for payment collection",
        nextFollowUpType: prev.nextFollowUpType || "Collection",
      }));
      return;
    }

    if (latestLabVisit?.labResponse === "Need Follow-up") {
      setForm((prev) => ({
        ...prev,
        nextAction: prev.nextAction || latestLabVisit.nextAction || "Follow up with lab",
        nextFollowUpType: prev.nextFollowUpType || latestLabVisit.nextFollowUpType || "Call",
      }));
    }
  }, [form.labId, latestLabVisit, selectedLabCollection]);

  function handleLabChange(value) {
    const raw = String(value ?? "").trim();
    if (!raw) {
      setQualificationEditing(false);
      setCurrentStepIndex(0);
      setForm((prev) => ({
        ...prev,
        labId: "",
        labName: "",
        area: currentUser?.assignedArea || prev.area || "",
        nextAction: "",
        nextFollowUpDate: "",
        nextFollowUpType: "Call",
      }));
      return;
    }

    const selected = resolveLabByOptionValue(visibleLabs, raw);
    const labId = selected ? labIdKey(selected.labId) : labIdKey(raw);
    const labName = selected ? String(selected.labName ?? "").trim() : "";

    setQualificationEditing(false);
    setForm((prev) => ({
      ...prev,
      labId,
      labName: labName || prev.labName,
      area:
        selected && String(selected.area ?? "").trim() !== ""
          ? String(selected.area).trim()
          : prev.area,
      nextAction: "",
      nextFollowUpDate: "",
      nextFollowUpType: "Call",
    }));
  }

  function validateStepBeforeNext(stepIndex) {
    switch (stepIndex) {
      case 0:
        if (!String(form.agentName || "").trim() || !String(form.visitDate || "").trim()) {
          showToast("error", "Fill agent name and visit date.");
          return false;
        }
        if (!labSelected) {
          showToast("error", "Select a lab to continue.");
          return false;
        }
        return true;
      case 1:
        if (form.labResponse === "Converted" && !Number(form.soldValue || 0)) {
          showToast("error", "Enter order value when the visit outcome is Order Confirmed.");
          return false;
        }
        return true;
      case 3:
        if (
          (form.labResponse === "Need Follow-up" || form.nextFollowUpDate) &&
          !form.nextFollowUpType
        ) {
          showToast("error", "Please choose a follow-up type.");
          return false;
        }
        return true;
      case 4:
        if (!labSelected) {
          showToast("error", "Select a lab before qualification capture.");
          return false;
        }
        return true;
      default:
        return true;
    }
  }

  function handleWizardBack() {
    setCurrentStepIndex((idx) => Math.max(0, idx - 1));
  }

  function handleWizardNext() {
    if (!validateStepBeforeNext(currentStepIndex)) return;
    setCurrentStepIndex((idx) =>
      Math.min(idx + 1, AGENT_VISIT_SECTION_STEPS.length - 1)
    );
  }

  function handleWizardGoToStep(index) {
    if (index > 0 && !labSelected) {
      showToast("error", "Select a lab in step 1 first.");
      return;
    }
    if (index > currentStepIndex) {
      for (let step = currentStepIndex; step < index; step += 1) {
        if (!validateStepBeforeNext(step)) return;
      }
    }
    setCurrentStepIndex(index);
  }

  async function handleSaveQualification() {
    const labId = labIdKey(form.labId);
    if (!labId) {
      showToast("error", "Select a lab before saving qualification.");
      return;
    }

    return predatorTrace("Agent Visits", "page.saveQualification", async () => {
    try {
      setQualificationSaving(true);

      const payload = {
        tenantId: currentUser?.tenantId || currentUser?.tenant_id || "",
        labId,
        labSize: qualificationForm.labSize,
        monthlyConsumablesEstimate: qualificationForm.monthlyConsumablesEstimate,
        currentSupplier: qualificationForm.currentSupplier,
        paymentTerms: qualificationForm.paymentTerms,
        decisionMaker: qualificationForm.decisionMaker,
        reagentRentalPotential: qualificationForm.reagentRentalPotential,
        labOsFit: qualificationForm.labOsFit,
        nextFollowUpDate: qualificationForm.nextFollowUpDate,
        founderReviewStatus: qualificationForm.founderReviewStatus || "pending",
        notes: qualificationForm.notes,
        agentId: currentUser?.agentId || currentUser?.agent_id || "",
        agentName:
          currentUser?.agentName || currentUser?.name || form.agentName || "",
        updatedBy: currentUser?.id || currentUser?.userId || "",
        writerRole: currentUser?.role || "agent",
        pipelineNextAction: qualificationForm.pipelineNextAction,
      };

      const res = await upsertLabQualificationWrite(payload);
      if (!res?.success) {
        throw new Error(res?.error || "Failed to save qualification");
      }

      setQualificationForm(normalizeQualificationRow(res.data));
      setQualificationLastUpdated(res?.data?.updated_at || "");
      setQualificationEditing(false);
      showToast("success", "Qualification saved");
    } catch (err) {
      showToast("error", err?.message || "Failed to save qualification");
    } finally {
      setQualificationSaving(false);
    }
    });
  }

  async function handleSaveVisit() {
    if (!form.agentName || !form.visitDate || !form.visitType) {
      showToast("error", "Please fill agent name, date, and visit type.");
      return;
    }

    if (!String(form.labId ?? "").trim()) {
      showToast("error", "Please select a lab from the dropdown.");
      return;
    }

    return predatorTrace("Agent Visits", "page.saveVisit", async () => {

    const resolvedLab =
      selectedLab ||
      resolveLabByOptionValue(visibleLabs, form.labId) ||
      resolveLabByOptionValue(visibleLabs, form.labName);

    const normalizedLabId = String(resolvedLab?.labId ?? form.labId ?? "").trim();
    const normalizedLabName = String(resolvedLab?.labName ?? form.labName ?? "").trim();

    if (!normalizedLabName) {
      showToast("error", "Please fill agent name, lab, date, and visit type.");
      return;
    }

    if (form.labResponse === "Converted" && !Number(form.soldValue || 0)) {
      showToast("error", "Enter order value when the visit outcome is Order Confirmed.");
      return;
    }

    if ((form.labResponse === "Need Follow-up" || form.nextFollowUpDate) && !form.nextFollowUpType) {
      showToast("error", "Please choose a follow-up type.");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        sessionToken: authToken || "",
        visitDate: form.visitDate,
        agentName: form.agentName,
        labId: normalizedLabId,
        labName: normalizedLabName,
        area: form.area,
        visitType: form.visitType,
        samplesGiven: Number(form.samplesGiven || 0),
        demoGiven: form.demoGiven,
        labResponse: form.labResponse,
        soldValue: Number(form.soldValue || 0),
        stockAvailable: form.stockAvailable,
        needsNewStock: form.needsNewStock,
        nextAction: form.nextAction,
        nextFollowUpDate: form.nextFollowUpDate,
        nextFollowUpType: form.nextFollowUpType,
        notes: form.notes,
      };

      let res;
      if (supabase) {
        logSupabaseFeatureSource("AgentVisit.save", { api: "createAgentVisitWrite" });
        const sbRes = await createAgentVisitWrite({
          tenantId: currentUser?.tenantId || currentUser?.tenant_id,
          agentId: currentUser?.agentId || currentUser?.agent_id || "",
          agentName:
            currentUser?.agentName ||
            currentUser?.name ||
            form.agentName ||
            "",
          visitDate: form.visitDate,
          visitType: form.visitType,
          labId: normalizedLabId,
          labName: normalizedLabName,
          area: form.area,
          notes: form.notes,
          nextFollowUpDate: form.nextFollowUpDate,
          labResponse: form.labResponse,
          soldValue: form.soldValue,
        });

        if (sbRes?.success && sbRes.data) {
          const vid =
            sbRes.data.visit_id ??
            sbRes.data.visitId ??
            sbRes.data.id ??
            "";
          res = { success: true, data: { visitId: vid } };
        } else {
          if (!ALLOW_LEGACY_APPS_SCRIPT) {
            throw new Error(sbRes?.error || "Supabase visit write failed.");
          }
          logAppsScriptFallbackUsed("AgentVisit.save", sbRes?.error || "unknown");
          res = await saveAgentVisit(payload);
        }
      } else {
        if (!ALLOW_LEGACY_APPS_SCRIPT) {
          throw new Error("Supabase visit write is required for pilot access.");
        }
        res = await saveAgentVisit(payload);
      }

      if (!res.success) throw new Error(res.error || "Failed to save visit");

      const newVisit = normalizeVisit({
        id: res.data?.visitId || `VISIT-${Date.now()}`,
        agent: form.agentName,
        date: form.visitDate,
        labId: normalizedLabId,
        labName: normalizedLabName,
        area: form.area,
        visitType: form.visitType,
        labResponse: form.labResponse,
        soldValue: form.soldValue,
        nextAction: form.nextAction,
        nextFollowUpDate: form.nextFollowUpDate,
        nextFollowUpType: form.nextFollowUpType,
      });

      setRecentVisits((prev) => [newVisit, ...prev]);

      clearAgentVisitDraft(currentUser);
      setDraftBannerVisible(false);
      recordAgentVisitWizardCompletion({
        totalMs: Date.now() - wizardStartedAtRef.current,
        stepCount: AGENT_VISIT_SECTION_STEPS.length,
      });
      wizardStartedAtRef.current = Date.now();
      stepEnteredAtRef.current = Date.now();
      prevStepIndexRef.current = 0;

      showToast(
        "success",
        `Visit saved${res.data?.visitId ? `: ${res.data.visitId}` : ""}`
      );

      setForm((prev) => ({
        ...prev,
        visitDate: new Date().toISOString().slice(0, 10),
        labId: "",
        labName: "",
        area: currentUser?.assignedArea || "",
        visitType: "Follow-up",
        samplesGiven: "",
        demoGiven: "No",
        labResponse: "Warm",
        soldValue: "",
        stockAvailable: "Yes",
        needsNewStock: "No",
        nextAction: "",
        nextFollowUpDate: "",
        nextFollowUpType: "Call",
        notes: "",
      }));
      setCurrentStepIndex(0);
      setQualificationEditing(false);
    } catch (err) {
      await logClientError({
        authToken,
        page: "AgentVisitPage",
        component: "AgentVisitPage",
        actionType: "SAVE_FAIL",
        errorCode: "SAVE_AGENT_VISIT_FAIL",
        errorMessage: err?.message || "Failed to save visit",
        stackTrace: err?.stack || "",
        payload: {
          form,
        },
      });

      showToast("error", err.message || "Failed to save visit");
    } finally {
      setSaving(false);
    }
    });
  }

  const isReviewStep = currentStepIndex === AGENT_VISIT_SECTION_STEPS.length - 1;
  const missingRequired = useMemo(() => getMissingVisitRequirements(form), [form]);
  const showMobileNav = !isReviewStep;

  useEffect(() => {
    if (!isReviewStep) return;
    recordAgentVisitMissingFields(missingRequired);
  }, [isReviewStep, missingRequired]);

  function handleDismissDraftBanner() {
    clearAgentVisitDraft(currentUser);
    setDraftBannerVisible(false);
    showToast("info", "Draft cleared.");
  }

  if (loading) {
    return <AgentVisitLoading />;
  }

  return (
    <div
      className={cn(
        "mx-auto max-w-5xl space-y-4",
        showMobileNav || isReviewStep
          ? "pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:pb-6"
          : "pb-6"
      )}
    >
      <header>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-[var(--pc-brand-primary)]" />
          <h1 className={typography.pageTitle}>Agent Visits</h1>
        </div>
        <p className={cn(typography.pageSubtitle, "mt-0.5")}>
          Quick guided visit log — tap through each step, then save on review.
        </p>
      </header>

      <CompactVisitKpiStrip
        labs={visibleLabs.length}
        todayVisits={todayVisits}
        followUps={pendingFollowUps}
        salesLogged={totalSalesLogged}
      />

      {draftBannerVisible ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-blue-200/80 bg-blue-50/80 px-3 py-2 text-sm text-blue-900">
          <span className="min-w-0">Draft restored — pick up where you left off.</span>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={handleDismissDraftBanner}
            >
              Clear draft
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              aria-label="Dismiss draft banner"
              onClick={() => setDraftBannerVisible(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {loadError}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 h-9 rounded-lg"
            onClick={() => loadPageData()}
          >
            Retry
          </Button>
        </div>
      ) : null}

      <Card className="overflow-hidden rounded-2xl border-border/80 shadow-[var(--pc-shadow-card)]">
        <CardHeader className="space-y-3 border-b border-border/50 bg-muted/20 pb-4">
          <div>
            <CardTitle className="text-lg">Log field visit</CardTitle>
            <CardDescription className="text-sm">
              Guided workflow — save only when you reach review.
            </CardDescription>
          </div>
          <WizardProgressBar
            currentIndex={currentStepIndex}
            total={AGENT_VISIT_SECTION_STEPS.length}
            stepKey={currentStep.key}
          />
        </CardHeader>

        <CardContent className="space-y-4 pt-4">
          <div ref={wizardStepAnchorRef} className="h-0 w-full scroll-mt-4" aria-hidden />
          <VisitWizardStepper
            steps={AGENT_VISIT_SECTION_STEPS}
            currentIndex={currentStepIndex}
            labSelected={labSelected}
            onGoToStep={handleWizardGoToStep}
          />

          <WizardMotivationStrip
            currentIndex={currentStepIndex}
            total={AGENT_VISIT_SECTION_STEPS.length}
            labSelected={labSelected}
            canSaveVisit={canSaveVisit && missingRequired.length === 0}
            missingItems={missingRequired}
          />

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentStep.key}
              initial={STEP_MOTION.initial}
              animate={STEP_MOTION.animate}
              exit={STEP_MOTION.exit}
              transition={STEP_MOTION.transition}
              layout
              layoutRoot
              className="overflow-hidden md:mx-auto md:max-w-3xl"
            >
          {currentStepIndex === 0 ? (
          <section className={STEP_PANEL_CLASS}>
            <SectionTitle
              icon={Users}
              title={currentStep.title}
              subtitle="Pick the lab you visited today"
              accent
            />

            <div className="grid grid-cols-1 gap-4">
              <div>
                <FieldLabel helper="Filled from your login">Your name</FieldLabel>
                <Input
                  value={form.agentName}
                  onChange={(e) => setForm({ ...form, agentName: e.target.value })}
                  className={FIELD_INPUT_CLASS}
                  disabled={String(currentUser?.role || "").toLowerCase() === "agent"}
                />
              </div>

              <div>
                <FieldLabel helper="When did you visit?">Visit date</FieldLabel>
                <Input
                  type="date"
                  value={form.visitDate}
                  onChange={(e) => setForm({ ...form, visitDate: e.target.value })}
                  className={FIELD_INPUT_CLASS}
                />
              </div>

              <div>
                <FieldLabel helper="Start typing or pick from your assigned labs">
                  Which lab are you visiting today?
                </FieldLabel>
                <select
                  className={cn(FIELD_INPUT_CLASS, "border border-input bg-background px-3 shadow-sm")}
                  value={form.labId ? labIdKey(form.labId) : ""}
                  onChange={(e) => handleLabChange(e.target.value)}
                >
                  <option value="">Select lab…</option>
                  {labSelectOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <LabHeroCard
              lab={selectedLab}
              collection={selectedLabCollection}
              latestVisit={latestLabVisit}
              form={form}
            />
          </section>
          ) : null}

          {currentStepIndex === 1 ? (
          <section className={STEP_PANEL_CLASS}>
            <SectionTitle
              icon={MapPin}
              title={currentStep.title}
              subtitle="How did the visit go?"
              accent
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:max-w-xl">
                <FieldLabel helper="Why were you at this lab?">What type of visit was this?</FieldLabel>
                <Select value={form.visitType} onValueChange={(value) => setForm({ ...form, visitType: value })}>
                  <SelectTrigger className="h-12 rounded-xl text-base">
                    <SelectValue placeholder="Visit type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="New Lead">New Lead</SelectItem>
                    <SelectItem value="Follow-up">Follow-up</SelectItem>
                    <SelectItem value="Closing">Closing</SelectItem>
                    <SelectItem value="Collection">Collection</SelectItem>
                    <SelectItem value="Support Visit">Support Visit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:max-w-xl">
                <FieldLabel helper="Pick the closest match">How did the lab respond?</FieldLabel>
                <Select value={form.labResponse} onValueChange={(value) => setForm({ ...form, labResponse: value })}>
                  <SelectTrigger className="h-12 rounded-xl text-base">
                    <SelectValue placeholder="Lead / lab response" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Interested">Interested</SelectItem>
                    <SelectItem value="Warm">Moderately Interested</SelectItem>
                    <SelectItem value="Not Interested">Not Interested</SelectItem>
                    <SelectItem value="Converted">Order Confirmed</SelectItem>
                    <SelectItem value="Need Follow-up">Follow-up Needed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.labResponse === "Converted" ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                Order confirmed — enter the order value below.
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <FieldLabel helper="How many samples were given?">Samples given</FieldLabel>
                <Input
                  value={form.samplesGiven}
                  onChange={(e) => setForm({ ...form, samplesGiven: e.target.value })}
                  placeholder="e.g. 2"
                  className="h-11 rounded-lg text-sm"
                />
              </div>

              <div>
                <FieldLabel helper="Did you demo the product?">Demo given</FieldLabel>
                <Select value={form.demoGiven} onValueChange={(value) => setForm({ ...form, demoGiven: value })}>
                  <SelectTrigger className="h-11 rounded-lg text-sm">
                    <SelectValue placeholder="Demo given?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Yes">Yes — demo given</SelectItem>
                    <SelectItem value="No">No demo</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:col-span-2">
                <FieldLabel helper="Fill only when order value is confirmed">Order / sold value (₹)</FieldLabel>
                <Input
                  value={form.soldValue}
                  onChange={(e) => setForm({ ...form, soldValue: e.target.value })}
                  placeholder="Confirmed order value"
                  className={cn(
                    "h-11 rounded-lg text-sm",
                    form.labResponse === "Converted" && "border-green-400 ring-1 ring-green-200"
                  )}
                />
              </div>
            </div>
          </section>
          ) : null}

          {currentStepIndex === 2 ? (
          <section className={STEP_PANEL_CLASS}>
            <SectionTitle
              icon={Package}
              title={currentStep.title}
              subtitle="Quick stock check at the lab"
              accent
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:max-w-xl">
                <FieldLabel helper="Was stock on hand?">Was stock available?</FieldLabel>
                <Select
                  value={form.stockAvailable}
                  onValueChange={(value) => setForm({ ...form, stockAvailable: value })}
                >
                  <SelectTrigger className="h-12 rounded-xl text-base">
                    <SelectValue placeholder="Stock available?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Yes">Yes - Fully Available</SelectItem>
                    <SelectItem value="No">No - Not Available</SelectItem>
                    <SelectItem value="Partial">Partial Availability</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="md:max-w-xl">
                <FieldLabel helper="Replenishment request">Do they need fresh stock?</FieldLabel>
                <Select
                  value={form.needsNewStock}
                  onValueChange={(value) => setForm({ ...form, needsNewStock: value })}
                >
                  <SelectTrigger className="h-12 rounded-xl text-base">
                    <SelectValue placeholder="Needs new stock?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(form.stockAvailable === "No" || form.stockAvailable === "Partial") ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Stock was not fully available. Mention the stock recovery plan clearly in <strong>Next Action</strong>.
              </div>
            ) : null}
          </section>
          ) : null}

          {currentStepIndex === 3 ? (
          <section className={STEP_PANEL_CLASS}>
            <SectionTitle
              icon={CalendarDays}
              title={currentStep.title}
              subtitle="Plan the next touchpoint"
              accent
            />

            <div className="grid grid-cols-1 gap-4">
              <div>
                <FieldLabel helper="Be specific so the team can follow up">What should happen next?</FieldLabel>
                <Input
                  value={form.nextAction}
                  onChange={(e) => setForm({ ...form, nextAction: e.target.value })}
                  placeholder="e.g. Call manager Friday, send pricing"
                  className={FIELD_INPUT_CLASS}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <FieldLabel helper="When should the next follow-up happen?">Next Follow-up Date</FieldLabel>
                  <Input
                    type="date"
                    value={form.nextFollowUpDate}
                    onChange={(e) => setForm({ ...form, nextFollowUpDate: e.target.value })}
                    className={`h-12 rounded-xl text-base ${
                      form.labResponse === "Need Follow-up" ? "border-blue-400 ring-1 ring-blue-200" : ""
                    }`}
                  />
                </div>

                <div>
                  <FieldLabel helper="What kind of follow-up is required?">Follow-up Type</FieldLabel>
                  <Select
                    value={form.nextFollowUpType}
                    onValueChange={(value) => setForm({ ...form, nextFollowUpType: value })}
                  >
                    <SelectTrigger className={`h-12 rounded-xl text-base ${
                      form.labResponse === "Need Follow-up" ? "border-blue-400 ring-1 ring-blue-200" : ""
                    }`}>
                      <SelectValue placeholder="Follow-up type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Call">Call</SelectItem>
                      <SelectItem value="Visit">Visit</SelectItem>
                      <SelectItem value="Send Pricing">Send Pricing</SelectItem>
                      <SelectItem value="Demo">Demo</SelectItem>
                      <SelectItem value="Collection">Collection</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {form.labResponse === "Need Follow-up" ? (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
                  This visit is marked as <strong>Follow-up Needed</strong>. Please make sure follow-up date and type are filled.
                </div>
              ) : null}

              <div>
                <FieldLabel helper="Anything important the team should know later?">Notes / Observations</FieldLabel>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Decision-maker feedback, objections, competitor pricing, demand notes, buying signals..."
                  className="min-h-[110px] rounded-xl text-base"
                />
              </div>
            </div>
          </section>
          ) : null}

          {currentStepIndex === qualificationStepIndex ? (
            <section
              className={cn(QUALIFICATION_PANEL_CLASS, "md:max-w-none")}
              data-wizard-step="qualification"
            >
              <div className="rounded-xl border border-violet-200/70 bg-violet-50/60 px-3 py-2.5">
                <p className="text-sm font-semibold text-violet-900">Strategic lab intelligence</p>
                <p className="text-xs text-violet-700/90">
                  Help PrimeCare understand this lab better
                </p>
              </div>

              <SectionTitle
                icon={ClipboardCheck}
                title={currentStep.title}
                subtitle="Capture signals that improve prioritization and follow-up"
                accent
              />

              {!labSelected ? (
                <p className="text-sm text-muted-foreground">
                  Select a lab in step 1 to capture or review qualification.
                </p>
              ) : qualificationLoading ? (
                <ListSkeleton rows={3} />
              ) : hasQualificationData && !qualificationEditing ? (
                <div className="space-y-3 rounded-xl border border-violet-200/60 bg-white/70 p-3 shadow-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge variant="info" compact>
                      Prior qualification
                    </StatusBadge>
                    <StatusBadge
                      variant={pipelineStageToVariant(qualificationForm.pipelineStage)}
                      compact
                    >
                      {qualificationForm.pipelineStageLabel ||
                        getPipelineStageLabel(qualificationForm.pipelineStage)}
                    </StatusBadge>
                    {qualificationForm.qualificationBand ? (
                      <StatusBadge
                        variant={qualificationBandToVariant(qualificationForm.qualificationBand)}
                        compact
                      >
                        {formatQualificationBandLabel(qualificationForm.qualificationBand)}
                      </StatusBadge>
                    ) : null}
                    {qualificationForm.qualificationScore != null ? (
                      <span className="rounded-md bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-900">
                        Score {qualificationForm.qualificationScore}
                        {qualificationForm.qualificationBand
                          ? ` · ${formatQualificationBandLabel(qualificationForm.qualificationBand)}`
                          : ""}
                      </span>
                    ) : null}
                  </div>
                  {qualificationForm.qualificationReasons?.length > 0 ? (
                    <ul className="list-inside list-disc text-xs text-muted-foreground">
                      {qualificationForm.qualificationReasons.slice(0, 4).map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  ) : null}
                  {qualificationForm.pipelineNextAction ? (
                    <p className="text-xs text-muted-foreground">
                      Next action: {qualificationForm.pipelineNextAction}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {qualificationLastUpdated
                      ? `Last updated: ${new Date(qualificationLastUpdated).toLocaleString()}`
                      : "Qualification on file for this lab."}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-lg"
                    onClick={() => setQualificationEditing(true)}
                  >
                    Edit Qualification
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {qualificationForm.qualificationBand || qualificationForm.pipelineStage ? (
                    <div className="rounded-lg border bg-muted/30 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          variant={pipelineStageToVariant(qualificationForm.pipelineStage)}
                          compact
                        >
                          {qualificationForm.pipelineStageLabel ||
                            getPipelineStageLabel(qualificationForm.pipelineStage)}
                        </StatusBadge>
                        <span className="text-[10px] text-muted-foreground">read-only</span>
                        {qualificationForm.qualificationBand ? (
                          <StatusBadge
                            variant={qualificationBandToVariant(
                              qualificationForm.qualificationBand
                            )}
                            compact
                          >
                            {formatQualificationBandLabel(qualificationForm.qualificationBand)}
                          </StatusBadge>
                        ) : null}
                        {qualificationForm.qualificationScore != null ? (
                          <span className="text-sm text-slate-700">
                            Score: {qualificationForm.qualificationScore}
                          </span>
                        ) : null}
                      </div>
                      {qualificationForm.qualificationReasons?.length > 0 ? (
                        <ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">
                          {qualificationForm.qualificationReasons.slice(0, 6).map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}

                  <div>
                    <FieldLabel helper="Your next step for this lab in the pipeline">
                      Pipeline next action
                    </FieldLabel>
                    <Input
                      value={qualificationForm.pipelineNextAction}
                      onChange={(e) =>
                        setQualificationForm((prev) => ({
                          ...prev,
                          pipelineNextAction: e.target.value,
                        }))
                      }
                      placeholder="e.g. Send sample kit, schedule demo call"
                      className="h-11 rounded-lg text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <FieldLabel>Lab size</FieldLabel>
                      <Select
                        value={qualificationForm.labSize || ""}
                        onValueChange={(value) =>
                          setQualificationForm((prev) => ({ ...prev, labSize: value }))
                        }
                      >
                        <SelectTrigger className="h-11 rounded-lg text-sm">
                          <SelectValue placeholder="Select lab size" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Small">Small</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="Large">Large</SelectItem>
                          <SelectItem value="Enterprise">Enterprise</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <FieldLabel>Monthly consumables (₹)</FieldLabel>
                      <Input
                        type="number"
                        value={qualificationForm.monthlyConsumablesEstimate}
                        onChange={(e) =>
                          setQualificationForm((prev) => ({
                            ...prev,
                            monthlyConsumablesEstimate: e.target.value,
                          }))
                        }
                        placeholder="e.g. 50000"
                        className="h-11 rounded-lg text-sm"
                      />
                    </div>

                    <div>
                      <FieldLabel>Current supplier</FieldLabel>
                      <Input
                        value={qualificationForm.currentSupplier}
                        onChange={(e) =>
                          setQualificationForm((prev) => ({
                            ...prev,
                            currentSupplier: e.target.value,
                          }))
                        }
                        className="h-11 rounded-lg text-sm"
                      />
                    </div>

                    <div>
                      <FieldLabel>Payment terms</FieldLabel>
                      <Input
                        value={qualificationForm.paymentTerms}
                        onChange={(e) =>
                          setQualificationForm((prev) => ({
                            ...prev,
                            paymentTerms: e.target.value,
                          }))
                        }
                        className="h-11 rounded-lg text-sm"
                      />
                    </div>

                    <div>
                      <FieldLabel>Decision maker</FieldLabel>
                      <Input
                        value={qualificationForm.decisionMaker}
                        onChange={(e) =>
                          setQualificationForm((prev) => ({
                            ...prev,
                            decisionMaker: e.target.value,
                          }))
                        }
                        className="h-11 rounded-lg text-sm"
                      />
                    </div>

                    <div>
                      <FieldLabel>Reagent rental potential</FieldLabel>
                      <Select
                        value={qualificationForm.reagentRentalPotential || ""}
                        onValueChange={(value) =>
                          setQualificationForm((prev) => ({
                            ...prev,
                            reagentRentalPotential: value,
                          }))
                        }
                      >
                        <SelectTrigger className="h-11 rounded-lg text-sm">
                          <SelectValue placeholder="Select potential" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Low">Low</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="High">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <FieldLabel>Lab OS fit</FieldLabel>
                      <Select
                        value={qualificationForm.labOsFit || ""}
                        onValueChange={(value) =>
                          setQualificationForm((prev) => ({ ...prev, labOsFit: value }))
                        }
                      >
                        <SelectTrigger className="h-11 rounded-lg text-sm">
                          <SelectValue placeholder="Select fit" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Low">Low</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="High">High</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <FieldLabel>Qualification follow-up date</FieldLabel>
                      <Input
                        type="date"
                        value={qualificationForm.nextFollowUpDate}
                        onChange={(e) =>
                          setQualificationForm((prev) => ({
                            ...prev,
                            nextFollowUpDate: e.target.value,
                          }))
                        }
                        className="h-11 rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <FieldLabel>Founder review (read-only)</FieldLabel>
                    <Input
                      value={qualificationForm.founderReviewStatus || "pending"}
                      readOnly
                      className="h-11 rounded-lg bg-muted/40 text-sm"
                    />
                  </div>

                  <div>
                    <FieldLabel>Qualification notes</FieldLabel>
                    <Textarea
                      value={qualificationForm.notes}
                      onChange={(e) =>
                        setQualificationForm((prev) => ({ ...prev, notes: e.target.value }))
                      }
                      placeholder="Objections, buying cycle, competitor notes…"
                      className="min-h-[88px] rounded-lg text-sm"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      onClick={handleSaveQualification}
                      disabled={qualificationSaving || qualificationLoading}
                      className="h-11 rounded-lg"
                    >
                      {qualificationSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving qualification…
                        </>
                      ) : (
                        "Save qualification"
                      )}
                    </Button>
                    {hasQualificationData ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-11 rounded-lg"
                        onClick={() => setQualificationEditing(false)}
                      >
                        Cancel edit
                      </Button>
                    ) : null}
                  </div>
                </div>
              )}
            </section>
          ) : null}

          {currentStepIndex === AGENT_VISIT_SECTION_STEPS.length - 1 ? (
            <section className={cn(STEP_PANEL_CLASS, "md:max-w-none")}>
              <SectionTitle
                icon={CheckCircle2}
                title={currentStep.title}
                subtitle="Confirm details, then complete your visit log"
                accent
              />

              {missingRequired.length > 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-900">
                  <p className="font-semibold">Fix before submitting:</p>
                  <ul className="mt-1 list-inside list-disc">
                    {missingRequired.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-2 text-sm font-medium text-emerald-800">
                  All required fields look good — ready to complete visit log.
                </div>
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <ReviewSummaryCard
                  title="Lab"
                  icon={Building2}
                  onEdit={() => handleWizardGoToStep(0)}
                  missing={
                    !form.labId
                      ? ["Lab not selected"]
                      : !form.visitDate
                        ? ["Visit date missing"]
                        : []
                  }
                >
                  <p className="font-medium">{form.labName || selectedLab?.labName || "—"}</p>
                  <p className="text-xs text-muted-foreground">{form.visitDate || "—"}</p>
                </ReviewSummaryCard>

                <ReviewSummaryCard
                  title="Visit outcome"
                  icon={MapPin}
                  onEdit={() => handleWizardGoToStep(1)}
                  missing={
                    !form.visitType
                      ? ["Visit type missing"]
                      : form.labResponse === "Converted" && !Number(form.soldValue || 0)
                        ? ["Order value required"]
                        : []
                  }
                >
                  <p>
                    {form.visitType || "—"} · {displayResponseLabel(form.labResponse)}
                  </p>
                  <p className="mt-1 text-xs">
                    Sold ₹{Number(form.soldValue || 0).toLocaleString("en-IN")}
                    {form.samplesGiven ? ` · Samples: ${form.samplesGiven}` : ""}
                  </p>
                </ReviewSummaryCard>

                <ReviewSummaryCard title="Stock feedback" icon={Package} onEdit={() => handleWizardGoToStep(2)}>
                  <p>
                    Stock: {form.stockAvailable || "—"} · Needs new stock: {form.needsNewStock || "—"}
                  </p>
                </ReviewSummaryCard>

                <ReviewSummaryCard
                  title="Follow-up"
                  icon={CalendarDays}
                  onEdit={() => handleWizardGoToStep(3)}
                  missing={
                    (form.labResponse === "Need Follow-up" || form.nextFollowUpDate) &&
                    !form.nextFollowUpType
                      ? ["Follow-up type missing"]
                      : []
                  }
                >
                  <p>{form.nextAction || "No next action set"}</p>
                  {form.nextFollowUpDate ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {form.nextFollowUpType || "Call"} · {form.nextFollowUpDate}
                    </p>
                  ) : null}
                </ReviewSummaryCard>

                <ReviewSummaryCard
                  title="Qualification"
                  icon={ClipboardCheck}
                  onEdit={() => handleWizardGoToStep(qualificationStepIndex)}
                  missing={[]}
                >
                  {hasQualificationData ? (
                    <p>
                      {qualificationForm.qualificationBand
                        ? formatQualificationBandLabel(qualificationForm.qualificationBand)
                        : qualificationForm.pipelineStageLabel || "On file"}
                    </p>
                  ) : (
                    <p className="text-muted-foreground">Not captured (optional)</p>
                  )}
                </ReviewSummaryCard>
              </div>
            </section>
          ) : null}
            </motion.div>
          </AnimatePresence>

          {isReviewStep ? (
            <WizardReviewFooter
              onBack={handleWizardBack}
              onSave={handleSaveVisit}
              saving={saving}
              saveDisabled={!canSaveVisit}
            />
          ) : (
            <>
              <WizardNavButtons
                currentIndex={currentStepIndex}
                maxIndex={AGENT_VISIT_SECTION_STEPS.length - 1}
                onBack={handleWizardBack}
                onNext={handleWizardNext}
                nextDisabled={currentStepIndex === 0 && !labSelected}
                nextLabel="Continue"
              />
              <WizardMobileNavBar
                currentIndex={currentStepIndex}
                maxIndex={AGENT_VISIT_SECTION_STEPS.length - 1}
                onBack={handleWizardBack}
                onNext={handleWizardNext}
                nextDisabled={currentStepIndex === 0 && !labSelected}
                nextLabel="Continue"
              />
            </>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <SectionTitle icon={Clock3} title="Recent visits" subtitle="Your latest field activity" />

        {visibleVisits.length === 0 ? (
          <EmptyState
            title="No recent visits"
            description="Saved visits will appear here as a timeline."
          />
        ) : (
          <div className="space-y-0" role="list">
            {visibleVisits.slice(0, 6).map((visit, idx) => (
              <RecentVisitTimelineCard
                key={`${visit.id || visit.labName}-${idx}`}
                visit={visit}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}