import React, { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import StatusBadge from "@/components/ux/StatusBadge";
import {
  createAgentVisitDiscoveryLinesWrite,
  createAgentVisitWrite,
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
          <Input className={FIELD} inputMode="decimal" placeholder="Approx. monthly spend (₹)" value={line.monthlySpendInr} onChange={(e) => onChange({ monthlySpendInr: e.target.value })} />
          <Input className={FIELD} inputMode="decimal" placeholder="Approx. monthly quantity" value={line.monthlyQuantity} onChange={(e) => onChange({ monthlyQuantity: e.target.value })} />
          <Input className={FIELD} placeholder="Supplier" value={line.supplier} onChange={(e) => onChange({ supplier: e.target.value })} />
        </>
      ) : null}
      {kind === "CONSUMABLE" ? (
        <>
          <Input className={FIELD} placeholder="Product / category" value={line.productCategory} onChange={(e) => onChange({ productCategory: e.target.value })} />
          <Input className={FIELD} placeholder="Brand" value={line.brand} onChange={(e) => onChange({ brand: e.target.value })} />
          <Input className={FIELD} inputMode="decimal" placeholder="Approx. volume" value={line.approxVolume} onChange={(e) => onChange({ approxVolume: e.target.value })} />
          <Input className={FIELD} inputMode="decimal" placeholder="Approx. price / pack (₹)" value={line.approxPricePack} onChange={(e) => onChange({ approxPricePack: e.target.value })} />
          <Input className={FIELD} placeholder="Supplier" value={line.supplier} onChange={(e) => onChange({ supplier: e.target.value })} />
        </>
      ) : null}
    </div>
  );
}

export default function AgentVisitEvidenceForm({
  currentUser,
  accounts = { operational: [], prospects: [], all: [] },
  initialLabId = "",
  onSuccess,
}) {
  const [form, setForm] = useState(() => ({
    ...createEmptyVisitEvidenceForm(),
    labId: initialLabId ? labIdKey(initialLabId) : "",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [partial, setPartial] = useState(null);
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
      agentName: currentUser?.agentName || currentUser?.name || "",
      userId: currentUser?.id || "",
    });
  }

  async function handleSave(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (savingRef.current) return;
    if (!form.labId) {
      setError("Select a lab or prospect first.");
      return;
    }
    if (!form.visitDate) {
      setError("Visit date is required.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError("");
    setPartial(null);
    try {
      const payload = buildVisitEvidenceWritePayload(form, {
        labName: selected?.labName,
        area: selected?.area,
        agentName: currentUser?.agentName || currentUser?.name,
        userId: currentUser?.id,
      });
      const res = await persist(payload);
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
      setForm({
        ...createEmptyVisitEvidenceForm(),
        labId: form.labId,
      });
      onSuccess?.(res);
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
      onSuccess?.({ success: true, persistence: "complete", data: { id: partial.visitUuid } });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={handleSave} data-ve3-fast-form="true" data-ve3-uat-fix="idempotent-20260907">
      <div className="rounded-xl border border-border bg-card p-3">
        <FieldLabel>Lab or prospect</FieldLabel>
        <select
          className={FIELD}
          value={form.labId}
          onChange={(e) => patch({ labId: e.target.value })}
          disabled={saving}
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
            disabled={saving}
          />
        </div>
        <div>
          <FieldLabel>Visit result</FieldLabel>
          <select
            className={FIELD}
            value={form.commercialOutcome}
            onChange={(e) => patch({ commercialOutcome: e.target.value })}
            disabled={saving}
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
        <FieldLabel optional>Notes</FieldLabel>
        <Textarea
          className="min-h-[88px] text-base md:text-sm"
          placeholder="What happened on this visit?"
          value={form.notes}
          onChange={(e) => patch({ notes: e.target.value })}
          disabled={saving}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel optional>Next action</FieldLabel>
          <Input className={FIELD} value={form.nextAction} onChange={(e) => patch({ nextAction: e.target.value })} disabled={saving} />
        </div>
        <div>
          <FieldLabel optional>Follow-up date</FieldLabel>
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

      {error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" className={cn("h-12 w-full text-base")} disabled={saving}>
        {saving ? "Saving…" : "Save visit"}
      </Button>
    </form>
  );
}
