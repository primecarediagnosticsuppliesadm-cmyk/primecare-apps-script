import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge, EmptyState, usePortalToast } from "@/components/ux";
import {
  getQualificationReviewRead,
  updateQualificationPipelineWrite,
  upsertLabQualificationWrite,
} from "@/api/primecareSupabaseApi.js";
import { labIdKey } from "@/utils/labId.js";
import { formatQualificationBandLabel } from "@/utils/computeQualificationScore";
import {
  getPipelineStageLabel,
  isQualificationPipelineReady,
  PIPELINE_STAGE_SELECT_OPTIONS,
} from "@/utils/qualificationPipeline.js";
import { qualificationBandToVariant, pipelineStageToVariant } from "@/utils/statusTokens";
import { ClipboardCheck, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

function str(v) {
  return String(v ?? "").trim();
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `₹${n.toLocaleString("en-IN")}`;
}

const TIER_OPTIONS = ["Low", "Medium", "High"];

const EMPTY_FORM = {
  labSize: "",
  monthlyConsumablesEstimate: "",
  currentSupplier: "",
  paymentTerms: "",
  decisionMaker: "",
  reagentRentalPotential: "",
  labOsFit: "",
  nextFollowUpDate: "",
  notes: "",
};

function mergeLabRows(labs = [], qualifications = [], tenantId) {
  const qualByLab = new Map();
  for (const q of qualifications) {
    const lid = labIdKey(q.labId);
    if (lid) qualByLab.set(lid, q);
  }
  const rows = [];
  const seen = new Set();
  for (const lab of labs) {
    const lid = labIdKey(lab.labId || lab.lab_id);
    if (!lid || seen.has(lid)) continue;
    seen.add(lid);
    const qual = qualByLab.get(lid) || null;
    rows.push({
      labId: lid,
      labName: lab.labName || lab.lab_name || lid,
      qualification: qual,
      pipelineReady: qual ? isQualificationPipelineReady(qual) : false,
    });
  }
  for (const q of qualifications) {
    const lid = labIdKey(q.labId);
    if (!lid || seen.has(lid)) continue;
    seen.add(lid);
    rows.push({
      labId: lid,
      labName: q.labName || lid,
      qualification: q,
      pipelineReady: isQualificationPipelineReady(q),
    });
  }
  return rows.sort((a, b) => a.labName.localeCompare(b.labName));
}

function QualificationEditor({ row, tenantId, currentUser, onSaved }) {
  const qual = row.qualification;
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [stage, setStage] = useState(qual?.pipelineStage || "new");
  const [nextAction, setNextAction] = useState(qual?.pipelineNextAction || "");
  const [expectedValue, setExpectedValue] = useState(
    qual?.pipelineExpectedValue != null ? String(qual.pipelineExpectedValue) : ""
  );
  const [probability, setProbability] = useState(
    qual?.pipelineProbability != null ? String(qual.pipelineProbability) : ""
  );
  const [pipelineNotes, setPipelineNotes] = useState(qual?.pipelineNotes || "");
  const [lostReason, setLostReason] = useState(qual?.pipelineLostReason || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { showToast } = usePortalToast();

  useEffect(() => {
    if (!qual) {
      setForm({ ...EMPTY_FORM });
      setStage("new");
      setNextAction("");
      setExpectedValue("");
      setProbability("");
      setPipelineNotes("");
      setLostReason("");
      return;
    }
    setForm({
      labSize: qual.labSize || "",
      monthlyConsumablesEstimate:
        qual.monthlyConsumablesEstimate != null ? String(qual.monthlyConsumablesEstimate) : "",
      currentSupplier: qual.currentSupplier || "",
      paymentTerms: qual.paymentTerms || "",
      decisionMaker: qual.decisionMaker || "",
      reagentRentalPotential: qual.reagentRentalPotential || "",
      labOsFit: qual.labOsFit || "",
      nextFollowUpDate: qual.nextFollowUpDate || "",
      notes: qual.notes || "",
    });
    setStage(qual.pipelineStage || "new");
    setNextAction(qual.pipelineNextAction || "");
    setExpectedValue(
      qual.pipelineExpectedValue != null ? String(qual.pipelineExpectedValue) : ""
    );
    setProbability(qual.pipelineProbability != null ? String(qual.pipelineProbability) : "");
    setPipelineNotes(qual.pipelineNotes || "");
    setLostReason(qual.pipelineLostReason || "");
  }, [qual, row.labId]);

  async function saveProfile() {
    setSaving(true);
    setError("");
    try {
      const res = await upsertLabQualificationWrite({
        tenantId,
        labId: row.labId,
        ...form,
        monthlyConsumablesEstimate: form.monthlyConsumablesEstimate,
        writerRole: currentUser?.role || "admin",
        updatedBy: currentUser?.id || currentUser?.userId,
      });
      if (!res?.success) throw new Error(res?.error || "Failed to save qualification");
      showToast("success", qual ? "Qualification updated" : "Qualification created");
      onSaved?.(res.data);
    } catch (err) {
      const msg = err?.message || "Save failed";
      setError(msg);
      showToast("error", msg);
    } finally {
      setSaving(false);
    }
  }

  async function savePipeline(nextStage = stage) {
    setSaving(true);
    setError("");
    try {
      if (!qual) {
        const createRes = await upsertLabQualificationWrite({
          tenantId,
          labId: row.labId,
          writerRole: currentUser?.role || "admin",
          updatedBy: currentUser?.id || currentUser?.userId,
        });
        if (!createRes?.success) {
          throw new Error(createRes?.error || "Create qualification before updating pipeline");
        }
      }
      const res = await updateQualificationPipelineWrite({
        tenantId,
        labId: row.labId,
        writerRole: currentUser?.role || "admin",
        pipelineStage: nextStage,
        pipelineNextAction: nextAction,
        pipelineLostReason: lostReason,
        pipelineExpectedValue: expectedValue,
        pipelineProbability: probability,
        pipelineNotes,
        updatedBy: currentUser?.id || currentUser?.userId,
      });
      if (!res?.success) throw new Error(res?.error || "Failed to update pipeline");
      setStage(nextStage);
      showToast("success", `Pipeline → ${getPipelineStageLabel(nextStage)}`);
      onSaved?.(res.data);
    } catch (err) {
      const msg = err?.message || "Pipeline update failed";
      setError(msg);
      showToast("error", msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase text-slate-500">Lab size</label>
          <Input
            value={form.labSize}
            onChange={(e) => setForm((f) => ({ ...f, labSize: e.target.value }))}
            className="h-9 rounded-lg text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase text-slate-500">
            Monthly estimate (₹)
          </label>
          <Input
            type="number"
            value={form.monthlyConsumablesEstimate}
            onChange={(e) =>
              setForm((f) => ({ ...f, monthlyConsumablesEstimate: e.target.value }))
            }
            className="h-9 rounded-lg text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase text-slate-500">
            Current supplier
          </label>
          <Input
            value={form.currentSupplier}
            onChange={(e) => setForm((f) => ({ ...f, currentSupplier: e.target.value }))}
            className="h-9 rounded-lg text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase text-slate-500">
            Payment terms
          </label>
          <Input
            value={form.paymentTerms}
            onChange={(e) => setForm((f) => ({ ...f, paymentTerms: e.target.value }))}
            className="h-9 rounded-lg text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase text-slate-500">
            Decision maker
          </label>
          <Input
            value={form.decisionMaker}
            onChange={(e) => setForm((f) => ({ ...f, decisionMaker: e.target.value }))}
            className="h-9 rounded-lg text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase text-slate-500">Follow-up date</label>
          <Input
            type="date"
            value={form.nextFollowUpDate}
            onChange={(e) => setForm((f) => ({ ...f, nextFollowUpDate: e.target.value }))}
            className="h-9 rounded-lg text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase text-slate-500">
            Reagent rental
          </label>
          <Select
            value={form.reagentRentalPotential || ""}
            onValueChange={(v) => setForm((f) => ({ ...f, reagentRentalPotential: v }))}
          >
            <SelectTrigger className="h-9 rounded-lg text-sm">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {TIER_OPTIONS.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase text-slate-500">Lab OS fit</label>
          <Select
            value={form.labOsFit || ""}
            onValueChange={(v) => setForm((f) => ({ ...f, labOsFit: v }))}
          >
            <SelectTrigger className="h-9 rounded-lg text-sm">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {TIER_OPTIONS.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className="text-[10px] font-medium uppercase text-slate-500">Notes</label>
          <Textarea
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            rows={2}
            className="rounded-lg text-sm"
          />
        </div>
      </div>
      <Button type="button" size="sm" disabled={saving} onClick={() => void saveProfile()}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {qual ? "Save qualification" : "Create qualification"}
      </Button>

      <div className="space-y-2 border-t border-slate-200 pt-3">
        <p className="text-xs font-semibold text-slate-700">Pipeline</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase text-slate-500">Stage</label>
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger className="h-9 rounded-lg text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PIPELINE_STAGE_SELECT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase text-slate-500">
              Expected value (₹)
            </label>
            <Input
              type="number"
              value={expectedValue}
              onChange={(e) => setExpectedValue(e.target.value)}
              className="h-9 rounded-lg text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium uppercase text-slate-500">
              Win probability (%)
            </label>
            <Input
              type="number"
              min={0}
              max={100}
              value={probability}
              onChange={(e) => setProbability(e.target.value)}
              className="h-9 rounded-lg text-sm"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-[10px] font-medium uppercase text-slate-500">Next action</label>
            <Input
              value={nextAction}
              onChange={(e) => setNextAction(e.target.value)}
              className="h-9 rounded-lg text-sm"
            />
          </div>
          {stage === "lost" ? (
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[10px] font-medium uppercase text-slate-500">
                Lost reason
              </label>
              <Textarea
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                rows={2}
                className="rounded-lg text-sm"
              />
            </div>
          ) : null}
          <div className="space-y-1 sm:col-span-2">
            <label className="text-[10px] font-medium uppercase text-slate-500">
              Pipeline notes
            </label>
            <Textarea
              value={pipelineNotes}
              onChange={(e) => setPipelineNotes(e.target.value)}
              rows={2}
              className="rounded-lg text-sm"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => void savePipeline()}
          >
            Save pipeline
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={saving}
            onClick={() => void savePipeline("qualified")}
          >
            Mark qualified
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={saving}
            onClick={() => void savePipeline("won")}
          >
            Mark won
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => void savePipeline("lost")}
          >
            Mark lost
          </Button>
        </div>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

export default function DistributorQualificationPanel({
  currentUser,
  distributorScope,
  labs = [],
}) {
  const tenantId = str(distributorScope?.tenantId);
  const [qualifications, setQualifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedLabId, setExpandedLabId] = useState(null);
  const { showToast } = usePortalToast();

  const load = useCallback(async () => {
    if (!tenantId) {
      setQualifications([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError("");
      const res = await getQualificationReviewRead();
      if (!res?.success) throw new Error(res?.error || "Failed to load qualifications");
      const scoped = (res.data || []).filter((q) => str(q.tenantId) === tenantId);
      setQualifications(scoped);
    } catch (err) {
      setError(err?.message || "Failed to load qualifications");
      setQualifications([]);
      showToast("error", err?.message || "Failed to load qualifications");
    } finally {
      setLoading(false);
    }
  }, [tenantId, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(
    () => mergeLabRows(labs, qualifications, tenantId),
    [labs, qualifications, tenantId]
  );

  const qualifiedCount = rows.filter((r) => r.pipelineReady).length;

  function handleSaved(updated) {
    if (!updated?.labId) {
      void load();
      return;
    }
    setQualifications((prev) => {
      const idx = prev.findIndex((q) => labIdKey(q.labId) === labIdKey(updated.labId));
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...updated };
        return next;
      }
      return [...prev, updated];
    });
  }

  if (!tenantId) {
    return (
      <p className="text-sm text-slate-600">Select a distributor to manage lab qualifications.</p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-slate-900">Lab Qualification</h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-600">
            Distributor-owned pipeline — qualify labs before contract activation.
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {qualifiedCount} qualified · {rows.length} lab(s) in scope
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-xs text-slate-500">Loading qualifications…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No labs in scope"
          description="Add labs under the Labs registry tab, then create qualifications here."
        />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => {
            const qual = row.qualification;
            const expanded = expandedLabId === row.labId;
            const band = str(qual?.qualificationBand).toLowerCase();
            const stage = qual?.pipelineStage || "new";
            return (
              <div
                key={row.labId}
                className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
              >
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-2 p-3 text-left hover:bg-slate-50"
                  onClick={() => setExpandedLabId(expanded ? null : row.labId)}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{row.labName}</p>
                    <p className="text-[11px] text-slate-400">{row.labId}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {qual ? (
                        <>
                          <StatusBadge variant={pipelineStageToVariant(stage)} compact>
                            {qual.pipelineStageLabel || getPipelineStageLabel(stage)}
                          </StatusBadge>
                          {band ? (
                            <StatusBadge variant={qualificationBandToVariant(band)} compact>
                              {formatQualificationBandLabel(band)}
                            </StatusBadge>
                          ) : null}
                          {qual.qualificationScore != null ? (
                            <span className="text-[11px] font-medium text-slate-600">
                              Score {qual.qualificationScore}
                            </span>
                          ) : null}
                          {qual.pipelineExpectedValue != null ? (
                            <span className="text-[11px] text-slate-500">
                              {formatMoney(qual.pipelineExpectedValue)}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <StatusBadge variant="warning" compact>
                          No qualification
                        </StatusBadge>
                      )}
                      {row.pipelineReady ? (
                        <StatusBadge variant="success" compact>
                          Contract-ready
                        </StatusBadge>
                      ) : null}
                    </div>
                  </div>
                  <span className={cn("text-xs font-medium", expanded ? "text-indigo-700" : "text-slate-500")}>
                    {expanded ? "Close" : qual ? "Edit" : "Create"}
                  </span>
                </button>
                {expanded ? (
                  <div className="border-t border-slate-100 px-3 pb-3">
                    <QualificationEditor
                      row={row}
                      tenantId={tenantId}
                      currentUser={currentUser}
                      onSaved={handleSaved}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
