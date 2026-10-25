import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import StatusBadge from "@/components/ux/StatusBadge";
import {
  createAgentVisitDiscoveryLinesWrite,
  createAgentVisitWrite,
  updateAgentVisitEvidenceWrite,
} from "@/api/primecareSupabaseApi.js";
import { labIdKey } from "@/utils/labId.js";
import { isProspectLab } from "@/visits/visitEligibleAccounts.js";
import {
  VISIT_COMPLAINT_OPTIONS,
  VISIT_LINE_KIND_LABELS,
  VISIT_OUTCOME_OPTIONS,
  VISIT_SIZE_OPTIONS,
  buildVisitEvidenceWritePayload,
  createEmptyDiscoveryLine,
  createEmptyVisitEvidenceForm,
} from "@/visits/agentVisitEvidenceFormModel.js";
import {
  FOLLOW_UP_OUTCOMES,
  NO_DISCUSSION_REASONS,
  notesForVisitWrite,
  validateFastVisit,
  visitEnteredLate,
} from "@/visits/fastVisitValidation.js";
import { displayVisitNotes } from "@/myBusiness/myBusinessDisplay.js";
import { createVisitHandoffWrite } from "@/visits/visitHandoffsApi.js";
import {
  isHandoffTriggerOutcome,
  prefillRequirementSummary,
} from "@/visits/visitHandoffsContract.js";
import { cn } from "@/lib/utils";

const FIELD =
  "h-11 w-full rounded-lg border border-input bg-background px-3 text-base md:text-sm";

function FieldLabel({ children, optional = false }) {
  return (
    <label className="mb-1 block text-sm font-medium text-foreground">
      {children}
      {optional ? (
        <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>
      ) : null}
    </label>
  );
}

function OptionalSection({ title, hint, children, defaultOpen = false }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <details
      className="rounded-xl border border-border/80 bg-muted/20 px-3 py-2"
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        if (next !== open) setOpen(next);
      }}
    >
      <summary className="cursor-pointer list-none py-1.5 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
        <span className="mr-2 text-muted-foreground">▸</span>
        {title}
        <span className="ml-2 text-xs font-normal text-muted-foreground">Optional</span>
        {hint ? <p className="mt-0.5 pl-5 text-xs font-normal text-muted-foreground">{hint}</p> : null}
      </summary>
      <div className="space-y-3 pb-2 pt-1">{children}</div>
    </details>
  );
}

function DiscoveryLineFields({ line, onChange, onRemove }) {
  const kind = line.lineKind;
  return (
    <div className="space-y-2 rounded-lg border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{VISIT_LINE_KIND_LABELS[kind] || kind}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9 px-2"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
        >
          Remove
        </Button>
      </div>
      {kind === "ANALYZER" ? (
        <>
          <Input className={FIELD} placeholder="Manufacturer" value={line.manufacturer} onChange={(e) => onChange({ manufacturer: e.target.value })} />
          <Input className={FIELD} placeholder="Model" value={line.model} onChange={(e) => onChange({ model: e.target.value })} />
          <Input className={FIELD} placeholder="Notes" value={line.notes} onChange={(e) => onChange({ notes: e.target.value })} />
        </>
      ) : null}
      {kind === "REAGENT" ? (
        <>
          <Input className={FIELD} placeholder="Description / family" value={line.description} onChange={(e) => onChange({ description: e.target.value })} />
          <Input className={FIELD} placeholder="Brand" value={line.brand} onChange={(e) => onChange({ brand: e.target.value })} />
          <Input className={FIELD} inputMode="decimal" placeholder="Approx. monthly spend (₹), if shared" value={line.monthlySpendInr} onChange={(e) => onChange({ monthlySpendInr: e.target.value })} disabled={Boolean(line.quantityDisclosure)} />
          <Input className={FIELD} inputMode="decimal" placeholder="Monthly quantity, if shared" value={line.monthlyQuantity} onChange={(e) => onChange({ monthlyQuantity: e.target.value })} disabled={Boolean(line.quantityDisclosure)} />
          <select className={FIELD} value={line.quantityDisclosure || ""} onChange={(e) => onChange({ quantityDisclosure: e.target.value, monthlyQuantity: e.target.value ? "" : line.monthlyQuantity })}>
            <option value="">Quantity was shared, or leave blank</option>
            <option value="NOT_SHARED">Quantity not shared</option>
            <option value="UNKNOWN">Quantity unknown</option>
            <option value="NOT_DISCUSSED">Quantity not discussed</option>
          </select>
          <Input className={FIELD} placeholder="Supplier, or Not shared" value={line.supplier} onChange={(e) => onChange({ supplier: e.target.value })} />
        </>
      ) : null}
      {kind === "CONSUMABLE" ? (
        <>
          <Input className={FIELD} placeholder="Product / category" value={line.productCategory} onChange={(e) => onChange({ productCategory: e.target.value })} />
          <Input className={FIELD} placeholder="Brand, or Not shared" value={line.brand} onChange={(e) => onChange({ brand: e.target.value })} />
          <Input className={FIELD} placeholder="Pack size, if shared" value={line.description} onChange={(e) => onChange({ description: e.target.value })} />
          <Input className={FIELD} inputMode="decimal" placeholder="Monthly quantity, if shared" value={line.approxVolume} onChange={(e) => onChange({ approxVolume: e.target.value })} disabled={Boolean(line.quantityDisclosure)} />
          <select className={FIELD} value={line.quantityDisclosure || ""} onChange={(e) => onChange({ quantityDisclosure: e.target.value, approxVolume: e.target.value ? "" : line.approxVolume, approxPricePack: e.target.value ? "" : line.approxPricePack })}>
            <option value="">Quantity was shared, or leave blank</option>
            <option value="NOT_SHARED">Quantity not shared</option>
            <option value="UNKNOWN">Quantity unknown</option>
            <option value="NOT_DISCUSSED">Quantity not discussed</option>
          </select>
          <Input className={FIELD} inputMode="decimal" placeholder="Current price, if disclosed" value={line.approxPricePack} onChange={(e) => onChange({ approxPricePack: e.target.value })} disabled={Boolean(line.quantityDisclosure)} />
          <Input className={FIELD} placeholder="Supplier, or Not shared" value={line.supplier} onChange={(e) => onChange({ supplier: e.target.value })} />
        </>
      ) : null}
    </div>
  );
}

function savedVisitUuidFromWrite(res) {
  return String(res?.data?.id || "").trim();
}

const SAVE_BAR_ABOVE_NAV = "calc(5.5rem + env(safe-area-inset-bottom, 0px))";

function useFastVisitSaveOffset() {
  const [offset, setOffset] = useState(SAVE_BAR_ABOVE_NAV);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    const update = () => {
      const keyboard = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setOffset(keyboard > 80 ? `${Math.round(keyboard + 8)}px` : SAVE_BAR_ABOVE_NAV);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  return offset;
}

export default function AgentVisitEvidenceForm({
  currentUser,
  accounts = { operational: [], prospects: [], all: [] },
  initialLabId = "",
  existingVisit = null,
  onSuccess,
  onReadyForNextVisit,
}) {
  const [form, setForm] = useState(() => {
    const empty = {
      ...createEmptyVisitEvidenceForm(),
      labId: initialLabId ? labIdKey(initialLabId) : "",
    };
    if (!existingVisit?.id) return empty;
    return {
      ...empty,
      labId: labIdKey(existingVisit.labId || initialLabId),
      visitDate: String(existingVisit.visitDate || empty.visitDate).slice(0, 10),
      commercialOutcome: existingVisit.commercialOutcome || "UNKNOWN",
      notes: displayVisitNotes(existingVisit.notes),
      noDiscussionReason: existingVisit.noDiscussionReason || "",
      nextAction: existingVisit.nextAction || "",
      nextFollowUpDate: String(existingVisit.followUpDate || "").slice(0, 10),
      clientRequestId: empty.clientRequestId,
    };
  });
  const [saving, setSaving] = useState(false);
  const saveOffset = useFastVisitSaveOffset();
  const [error, setError] = useState("");
  const [partial, setPartial] = useState(null);
  const [handoffStep, setHandoffStep] = useState(null);
  const savingRef = useRef(false);

  const selected = useMemo(
    () => (accounts.all || []).find((lab) => labIdKey(lab.labId) === labIdKey(form.labId)) || null,
    [accounts.all, form.labId]
  );
  const prospect = selected ? isProspectLab(selected) : false;

  function patch(next) {
    setForm((prev) => ({ ...prev, ...next }));
  }

  function patchLine(id, next) {
    setForm((prev) => ({
      ...prev,
      discoveryLines: prev.discoveryLines.map((line) => (line.id === id ? { ...line, ...next } : line)),
    }));
  }

  function addDiscoveryLine(kind, event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    setForm((prev) => ({
      ...prev,
      discoveryLines: [...prev.discoveryLines, createEmptyDiscoveryLine(kind)],
    }));
  }

  async function persist(payload) {
    return createAgentVisitWrite({
      ...payload,
      tenantId: currentUser?.tenantId || currentUser?.tenant_id,
      agentId: currentUser?.agentId || currentUser?.agent_id || "",
      agentName: currentUser?.agentName || currentUser?.name || "",
      userId: currentUser?.id || "",
    });
  }

  const visitLocked = Boolean(handoffStep);

  function beginQualifyingHandoff(visitUuid, payload) {
    const outcome = String(payload?.commercialOutcome || form.commercialOutcome || "").toUpperCase();
    setHandoffStep({
      visitUuid,
      labId: form.labId,
      labName: selected?.labName || form.labId,
      prospect,
      outcome,
      requirementSummary: prefillRequirementSummary({
        notes: form.notes,
        nextAction: form.nextAction,
        discoveryLines: payload?.discoveryLines || form.discoveryLines,
      }),
      neededBy: "",
      sending: false,
      error: "",
      handoff: null,
    });
  }

  async function handleSave(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (savingRef.current || handoffStep) return;
    const editing = Boolean(existingVisit?.id);
    const validationErrors = validateFastVisit(form, {
      mode: editing ? "update" : "create",
      storedNotes: existingVisit?.notes || "",
      storedOutcome: existingVisit?.commercialOutcome || "",
      storedFollowUpDate: existingVisit?.followUpDate || "",
    });
    if (validationErrors.length) {
      setError(validationErrors[0]);
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError("");
    setPartial(null);
    try {
      const editing = Boolean(existingVisit?.id);
      const payload = buildVisitEvidenceWritePayload(form, {
        labName: selected?.labName,
        area: selected?.area,
        agentName: currentUser?.agentName || currentUser?.name,
        userId: currentUser?.id,
        fastVisit: !editing,
        notesForWrite: notesForVisitWrite(form, {
          mode: editing ? "update" : "create",
          storedNotes: existingVisit?.notes || "",
        }),
      });
      const res = editing
        ? await updateAgentVisitEvidenceWrite({
            id: existingVisit.id,
            ...payload,
            notes: payload.notes,
          })
        : await persist(payload);
      if (editing && res?.success && payload.discoveryLines?.length) {
        const linesRes = await createAgentVisitDiscoveryLinesWrite({
          visitUuid: existingVisit.id,
          discoveryLines: payload.discoveryLines,
          labId: form.labId,
        });
        if (!linesRes?.success) {
          setPartial({
            visitUuid: existingVisit.id,
            lines: payload.discoveryLines,
            error: linesRes?.error || "Evidence details could not be saved.",
          });
          setError("");
          return;
        }
      }
      if (res?.persistence === "header_only") {
        setPartial({
          visitUuid: res.data?.id,
          lines: payload.discoveryLines,
          error: res.discoveryLineError || res.error,
        });
        setError("");
        return;
      }
      if (!res?.success) {
        setError(res?.error || "Visit could not be saved.");
        return;
      }
      const visitUuid = savedVisitUuidFromWrite(res);
      const outcome = String(payload.commercialOutcome || "").toUpperCase();
      if (visitUuid && isHandoffTriggerOutcome(outcome)) {
        beginQualifyingHandoff(visitUuid, payload);
        onSuccess?.(res, { deferRemount: true });
      } else {
        setHandoffStep(null);
        setForm({
          ...createEmptyVisitEvidenceForm(),
          labId: form.labId,
        });
        onSuccess?.(res);
      }
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function handleRetryLines() {
    if (savingRef.current || !partial?.visitUuid) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const res = await createAgentVisitDiscoveryLinesWrite({
        visitUuid: partial.visitUuid,
        discoveryLines: partial.lines,
      });
      if (!res?.success) {
        setPartial({ ...partial, error: res?.error || "Evidence details could not be saved." });
        return;
      }
      setPartial(null);
      const retryRes = { success: true, persistence: "complete", data: { id: partial.visitUuid } };
      const outcome = String(form.commercialOutcome || "").toUpperCase();
      if (partial.visitUuid && isHandoffTriggerOutcome(outcome)) {
        beginQualifyingHandoff(partial.visitUuid, { commercialOutcome: outcome, discoveryLines: form.discoveryLines });
        onSuccess?.(retryRes, { deferRemount: true });
      } else {
        setHandoffStep(null);
        setForm({
          ...createEmptyVisitEvidenceForm(),
          labId: form.labId,
        });
        onSuccess?.(retryRes);
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <form
      className="space-y-3 pb-28 md:pb-0"
      onSubmit={handleSave}
      data-ve3-fast-form="true"
      data-ve3-uat-fix="idempotent-20260907"
      data-ve3-p1-fix="followup-compact-20260907"
    >
      {existingVisit?.id ? (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          This visit is already saved. Correct a field here, or add an observation if you have one.
          {visitEnteredLate(existingVisit) ? " It was entered after the visit date." : ""}
        </p>
      ) : null}
      <div className="rounded-xl border border-border bg-card p-3">
        <FieldLabel>Lab or prospect</FieldLabel>
        <select
          className={FIELD}
          value={form.labId}
          onChange={(e) => patch({ labId: e.target.value })}
          disabled={saving || visitLocked || Boolean(existingVisit?.id)}
        >
          <option value="">Select…</option>
          {(accounts.operational || []).length ? (
            <optgroup label="Assigned labs">
              {accounts.operational.map((lab) => (
                <option key={lab.labId} value={labIdKey(lab.labId)}>
                  {lab.labName || lab.labId}
                </option>
              ))}
            </optgroup>
          ) : null}
          {(accounts.prospects || []).length ? (
            <optgroup label="Sourced prospects">
              {accounts.prospects.map((lab) => (
                <option key={lab.labId} value={labIdKey(lab.labId)}>
                  {lab.labName || lab.labId} (Prospect)
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        {selected ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">{selected.labName}</p>
            <StatusBadge variant={prospect ? "warning" : "success"} compact>
              {prospect ? "Prospect" : selected.status || "Lab"}
            </StatusBadge>
            {selected.area ? (
              <span className="text-xs text-muted-foreground">{selected.area}</span>
            ) : null}
          </div>
        ) : null}
        {prospect ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Logging a visit does not activate this prospect. No orders, payments, or AR from this screen.
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel>Visit date</FieldLabel>
          <Input
            type="date"
            className={FIELD}
            value={form.visitDate}
            onChange={(e) => patch({ visitDate: e.target.value })}
            disabled={saving || visitLocked}
          />
        </div>
        <div>
          <FieldLabel>Visit result</FieldLabel>
          <select
            className={FIELD}
            value={form.commercialOutcome}
            onChange={(e) => patch({ commercialOutcome: e.target.value })}
            disabled={saving || visitLocked}
          >
            {VISIT_OUTCOME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <FieldLabel optional={Boolean(form.noDiscussionReason)}>What the customer said</FieldLabel>
        <Textarea
          className="min-h-[88px] text-base md:text-sm"
          placeholder="One real observation. The area and lab name are not enough."
          value={form.notes}
          onChange={(e) => patch({ notes: e.target.value })}
          disabled={saving}
        />
      </div>
      <div>
        <FieldLabel optional>If there was no discussion</FieldLabel>
        <select
          className={FIELD}
          value={form.noDiscussionReason}
          onChange={(e) => patch({ noDiscussionReason: e.target.value })}
          disabled={saving || visitLocked}
        >
          <option value="">We discussed the work</option>
          {NO_DISCUSSION_REASONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Reception-only and unavailable decision-makers do not need product details.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel optional={!FOLLOW_UP_OUTCOMES.has(form.commercialOutcome) && !form.nextFollowUpDate}>Next action</FieldLabel>
          <Input className={FIELD} value={form.nextAction} onChange={(e) => patch({ nextAction: e.target.value })} disabled={saving} />
        </div>
        <div>
          <FieldLabel optional={!FOLLOW_UP_OUTCOMES.has(form.commercialOutcome)}>Follow-up date</FieldLabel>
          <Input type="date" className={FIELD} value={form.nextFollowUpDate} onChange={(e) => patch({ nextFollowUpDate: e.target.value })} disabled={saving} />
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Wallet, size, and product notes are field estimates — not PrimeCare revenue, AR, or inventory.
      </p>

      <OptionalSection title="Lab size & wallet" hint="Discovery only. No rupee thresholds.">
        <div>
          <FieldLabel optional>Lab size</FieldLabel>
          <select
            className={FIELD}
            value={form.labSizeBand}
            onChange={(e) => patch({ labSizeBand: e.target.value })}
            data-ve3-lab-size="true"
          >
            {VISIT_SIZE_OPTIONS.map((opt) => (
              <option key={opt.value || "skip"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel optional>Estimated monthly wallet (₹)</FieldLabel>
          <Input className={FIELD} inputMode="decimal" placeholder="Estimated monthly wallet (₹)" value={form.estimatedMonthlyWalletInr} onChange={(e) => patch({ estimatedMonthlyWalletInr: e.target.value })} />
        </div>
        <div>
          <FieldLabel optional>Wallet range in their words</FieldLabel>
          <Input className={FIELD} placeholder="Wallet range in their words" value={form.walletRangeBand} onChange={(e) => patch({ walletRangeBand: e.target.value })} />
        </div>
      </OptionalSection>

      <OptionalSection title="Decision maker">
        <FieldLabel optional>Decision maker</FieldLabel>
        <select className={FIELD} value={form.decisionMakerMet} onChange={(e) => patch({ decisionMakerMet: e.target.value })}>
          <option value="">Skip</option>
          <option value="true">Met decision maker</option>
          <option value="false">Did not meet</option>
        </select>
        {form.decisionMakerMet !== "false" ? (
          <>
            <Input className={FIELD} placeholder="Name" value={form.decisionMakerName} onChange={(e) => patch({ decisionMakerName: e.target.value })} />
            <Input className={FIELD} placeholder="Role" value={form.decisionMakerRole} onChange={(e) => patch({ decisionMakerRole: e.target.value })} />
          </>
        ) : null}
      </OptionalSection>

      <OptionalSection title="Analyzers, reagents, consumables" hint="What you observed. Not inventory.">
        <div className="flex flex-wrap gap-2">
          {["ANALYZER", "REAGENT", "CONSUMABLE"].map((kind) => (
            <Button
              key={kind}
              type="button"
              variant="outline"
              className="h-11"
              data-ve3-add-line={kind}
              onClick={(event) => addDiscoveryLine(kind, event)}
            >
              + Add {VISIT_LINE_KIND_LABELS[kind]}
            </Button>
          ))}
        </div>
        {form.discoveryLines.map((line) => (
          <DiscoveryLineFields
            key={line.id}
            line={line}
            onChange={(next) => patchLine(line.id, next)}
            onRemove={() =>
              patch({ discoveryLines: form.discoveryLines.filter((row) => row.id !== line.id) })
            }
          />
        ))}
      </OptionalSection>

      <OptionalSection title="Terms / reordering">
        <Input className={FIELD} placeholder="Reorder interval (weekly, monthly…)" value={form.reorderInterval} onChange={(e) => patch({ reorderInterval: e.target.value })} />
        <Input className={FIELD} placeholder="Payment method or terms" value={form.paymentMethodOrTerms} onChange={(e) => patch({ paymentMethodOrTerms: e.target.value })} />
        <Input className={FIELD} inputMode="numeric" placeholder="Approx. credit days" value={form.approxCreditDays} onChange={(e) => patch({ approxCreditDays: e.target.value })} />
      </OptionalSection>

      <OptionalSection title="Main pain / complaint">
        <FieldLabel optional>Main pain</FieldLabel>
        <select className={FIELD} value={form.topComplaint} onChange={(e) => patch({ topComplaint: e.target.value })}>
          {VISIT_COMPLAINT_OPTIONS.map((opt) => (
            <option key={opt.value || "skip"} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <Textarea className="min-h-[72px]" placeholder="Notes" value={form.topComplaintNotes} onChange={(e) => patch({ topComplaintNotes: e.target.value })} />
      </OptionalSection>

      {partial ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <p className="font-semibold">Visit was saved, but some evidence details could not be saved.</p>
          <p className="mt-1 text-xs">{partial.error}</p>
          <Button type="button" className="mt-2 h-11" disabled={saving} onClick={handleRetryLines}>
            Retry evidence details
          </Button>
        </div>
      ) : null}

      <div
        className="fixed inset-x-0 z-50 border-t border-border bg-background/95 px-3 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur md:static md:z-auto md:border-0 md:bg-transparent md:px-0 md:py-0 md:shadow-none"
        style={{ bottom: saveOffset }}
        data-testid="fast-visit-save-bar"
      >
        {error ? (
          <p className="mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {visitLocked ? (
          <p className="text-sm font-medium text-emerald-800" data-ae1c-visit-saved="true">
            Visit saved.
          </p>
        ) : (
          <Button type="submit" className={cn("h-12 w-full text-base")} disabled={saving} data-ae1c-save-visit="true">
            {saving ? "Saving…" : existingVisit?.id ? "Save corrections" : "Save visit"}
          </Button>
        )}
      </div>

      {isHandoffTriggerOutcome(form.commercialOutcome) && !handoffStep ? (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3" data-ae1c-support-needed="true">
          <h3 className="text-sm font-semibold text-slate-900">PrimeCare Support Needed</h3>
          <p className="mt-0.5 text-[11px] text-slate-600">
            Save this visit first. Then you can send the lab&apos;s need to PrimeCare.
          </p>
        </section>
      ) : null}

      {handoffStep ? (
        <PrimeCareSupportNeeded
          step={handoffStep}
          saving={saving}
          onChange={(next) =>
            setHandoffStep((prev) => ({
              ...prev,
              ...next,
              visitUuid: prev.visitUuid,
              labId: prev.labId,
              outcome: prev.outcome,
            }))
          }
          onSent={(handoff) => {
            setHandoffStep((prev) => ({
              ...prev,
              handoff: handoff || { humanStatus: "Waiting on PrimeCare" },
              sending: false,
              error: "",
            }));
          }}
          onNotNow={() => onReadyForNextVisit?.()}
          onLogAnother={() => onReadyForNextVisit?.()}
        />
      ) : null}
    </form>
  );
}

function PrimeCareSupportNeeded({ step, saving, onChange, onSent, onNotNow, onLogAnother }) {
  const sent = Boolean(step.handoff);
  const sendingRef = useRef(false);

  async function send(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (sendingRef.current || step.sending || sent) return;
    if (!String(step.requirementSummary || "").trim()) {
      onChange({ error: "Tell PrimeCare what the lab needs." });
      return;
    }
    sendingRef.current = true;
    onChange({ sending: true, error: "" });
    try {
      const res = await createVisitHandoffWrite({
        visitUuid: step.visitUuid,
        requirementSummary: step.requirementSummary,
        neededBy: step.neededBy || null,
      });
      const persisted = Boolean(res?.success) || String(res?.code || "") === "already_exists";
      if (!persisted) {
        onChange({ sending: false, error: res?.error || "Could not send to PrimeCare." });
        return;
      }
      onSent(res.handoff || { humanStatus: "Waiting on PrimeCare" });
    } finally {
      sendingRef.current = false;
    }
  }

  return (
    <section
      className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3"
      data-ae1c-support-needed="true"
      data-ae1c-prospect={step.prospect ? "true" : "false"}
      data-ae1c-saved-visit-uuid={step.visitUuid || ""}
      data-ae1c-saved-outcome={step.outcome || ""}
    >
      <h3 className="text-sm font-semibold text-slate-900">PrimeCare Support Needed</h3>
      <p className="mt-0.5 text-[11px] text-slate-600">
        {step.prospect
          ? "Prospects can wait on PrimeCare. This does not activate the account or create an order."
          : "Send only if the lab asked PrimeCare to source, price, or respond."}
      </p>
      {sent ? (
        <>
          <p className="mt-2 text-sm font-medium text-indigo-900" data-ae1c-waiting="true">
            {step.handoff?.humanStatus || "Waiting on PrimeCare"}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 h-11 w-full"
            onClick={onLogAnother}
            data-ae1c-log-another="true"
          >
            Log another visit
          </Button>
        </>
      ) : (
        <>
          <label className="mt-3 block text-xs font-medium text-slate-700">
            What does the lab need?
            <Textarea
              className="mt-1 min-h-[72px] text-sm"
              value={step.requirementSummary}
              onChange={(e) => onChange({ requirementSummary: e.target.value, error: "" })}
              disabled={saving || step.sending}
              data-ae1c-requirement-summary="true"
            />
          </label>
          <label className="mt-2 block text-xs font-medium text-slate-700">
            Needed by
            <Input
              type="date"
              className="mt-1 h-10 text-sm"
              value={step.neededBy}
              onChange={(e) => onChange({ neededBy: e.target.value })}
              disabled={saving || step.sending}
              data-ae1c-needed-by="true"
            />
          </label>
          {step.error ? (
            <p className="mt-2 text-xs text-destructive" role="alert">
              {step.error}
            </p>
          ) : null}
          <Button
            type="button"
            className="mt-3 h-11 w-full"
            disabled={saving || step.sending}
            onClick={send}
            data-ae1c-send="true"
          >
            {step.sending ? "Sending…" : "Send to PrimeCare"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="mt-1 h-11 w-full"
            disabled={saving || step.sending}
            onClick={onNotNow}
            data-ae1c-not-now="true"
          >
            Not now
          </Button>
        </>
      )}
    </section>
  );
}
