import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  getQualificationReviewRead,
  updateQualificationFounderReviewWrite,
  updateQualificationPipelineWrite,
} from "@/api/primecareSupabaseApi";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Loader2, ClipboardCheck, RefreshCw } from "lucide-react";
import {
  formatQualificationBandLabel,
  qualificationBandBadgeClass,
} from "@/utils/computeQualificationScore";
import { ROLES } from "@/config/roles";
import {
  getPipelineStageLabel,
  getPipelineStageOrder,
  PIPELINE_STAGE_SELECT_OPTIONS,
  pipelineStageBadgeClass,
} from "@/utils/qualificationPipeline";

function canEditPipeline(currentUser) {
  const role = String(currentUser?.role || "").toLowerCase();
  return role === ROLES.ADMIN || role === ROLES.EXECUTIVE;
}

const STATUS_OPTIONS = [
  { value: "ALL", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "needs_info", label: "Needs info" },
];

const RENTAL_OPTIONS = [
  { value: "ALL", label: "All rental potential" },
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Medium" },
  { value: "High", label: "High" },
];

const FIT_OPTIONS = [
  { value: "ALL", label: "All Lab OS fit" },
  { value: "Low", label: "Low" },
  { value: "Medium", label: "Medium" },
  { value: "High", label: "High" },
];

const BAND_OPTIONS = [
  { value: "ALL", label: "All bands" },
  { value: "hot", label: "HOT" },
  { value: "warm", label: "WARM" },
  { value: "cold", label: "COLD" },
];

const PIPELINE_FILTER_OPTIONS = [
  { value: "ALL", label: "All pipeline stages" },
  ...PIPELINE_STAGE_SELECT_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
];

const SORT_OPTIONS = [
  { value: "updated", label: "Recently updated" },
  { value: "score", label: "Score (high → low)" },
  { value: "stage", label: "Pipeline stage (funnel order)" },
  { value: "expected_value", label: "Expected value (high → low)" },
];

const REVIEW_STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "needs_info", label: "Needs info" },
];

function statusBadgeClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "approved") return "bg-green-100 text-green-800";
  if (s === "rejected") return "bg-red-100 text-red-800";
  if (s === "needs_info") return "bg-amber-100 text-amber-900";
  return "bg-slate-100 text-slate-800";
}

function formatStatusLabel(status) {
  const s = String(status || "pending").toLowerCase();
  if (s === "needs_info") return "Needs info";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `₹${n.toLocaleString("en-IN")}`;
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function PipelineStageBadge({ row }) {
  const stage = row.pipelineStage || "new";
  return (
    <Badge className={pipelineStageBadgeClass(stage)}>
      {row.pipelineStageLabel || getPipelineStageLabel(stage)}
    </Badge>
  );
}

function PipelineSavedSummary({ row }) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-100 bg-white p-2 text-xs sm:grid-cols-4">
      <div>
        <span className="text-slate-500">Probability</span>
        <div className="font-medium">
          {row.pipelineProbability != null ? `${row.pipelineProbability}%` : "—"}
        </div>
      </div>
      <div>
        <span className="text-slate-500">Expected value</span>
        <div className="font-medium">{formatMoney(row.pipelineExpectedValue)}</div>
      </div>
      <div className="col-span-2 sm:col-span-1">
        <span className="text-slate-500">Next action</span>
        <div className="font-medium">{row.pipelineNextAction || "—"}</div>
      </div>
      {row.pipelineStage === "lost" ? (
        <div className="col-span-2">
          <span className="text-slate-500">Lost reason</span>
          <div className="font-medium">{row.pipelineLostReason || "—"}</div>
        </div>
      ) : null}
    </div>
  );
}

function PipelineEditor({ row, currentUser, onSaved }) {
  const editable = canEditPipeline(currentUser);
  const [stage, setStage] = useState(row.pipelineStage || "new");
  const [nextAction, setNextAction] = useState(row.pipelineNextAction || "");
  const [lostReason, setLostReason] = useState(row.pipelineLostReason || "");
  const [expectedValue, setExpectedValue] = useState(
    row.pipelineExpectedValue != null ? String(row.pipelineExpectedValue) : ""
  );
  const [probability, setProbability] = useState(
    row.pipelineProbability != null ? String(row.pipelineProbability) : ""
  );
  const [pipelineNotes, setPipelineNotes] = useState(row.pipelineNotes || "");
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState("");

  useEffect(() => {
    setStage(row.pipelineStage || "new");
    setNextAction(row.pipelineNextAction || "");
    setLostReason(row.pipelineLostReason || "");
    setExpectedValue(
      row.pipelineExpectedValue != null ? String(row.pipelineExpectedValue) : ""
    );
    setProbability(
      row.pipelineProbability != null ? String(row.pipelineProbability) : ""
    );
    setPipelineNotes(row.pipelineNotes || "");
  }, [row]);

  async function handleSavePipeline() {
    setRowError("");
    setSaving(true);
    try {
      const res = await updateQualificationPipelineWrite({
        tenantId: row.tenantId || currentUser?.tenantId,
        labId: row.labId,
        writerRole: currentUser?.role || "admin",
        pipelineStage: stage,
        pipelineNextAction: nextAction,
        pipelineLostReason: lostReason,
        pipelineExpectedValue: expectedValue,
        pipelineProbability: probability,
        pipelineNotes,
        updatedBy: currentUser?.id || currentUser?.userId,
      });
      if (!res?.success) {
        throw new Error(res?.error || "Failed to update pipeline");
      }
      onSaved?.(res.data);
    } catch (err) {
      setRowError(err?.message || "Pipeline update failed");
    } finally {
      setSaving(false);
    }
  }

  if (!editable) {
    return (
      <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Pipeline (read-only)
        </div>
        <PipelineSavedSummary row={row} />
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Pipeline
      </div>
      <PipelineSavedSummary row={row} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <div className="text-xs text-slate-500">Stage</div>
          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger className="h-10 rounded-xl">
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
          <div className="text-xs text-slate-500">Win probability (%)</div>
          <Input
            type="number"
            min={0}
            max={100}
            value={probability}
            onChange={(e) => setProbability(e.target.value)}
            placeholder="0–100"
            className="h-10 rounded-xl"
          />
        </div>
        <div className="space-y-1">
          <div className="text-xs text-slate-500">Expected value (₹)</div>
          <Input
            type="number"
            min={0}
            value={expectedValue}
            onChange={(e) => setExpectedValue(e.target.value)}
            placeholder="Deal value"
            className="h-10 rounded-xl"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <div className="text-xs text-slate-500">Next action</div>
          <Input
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder="Next step for this lab"
            className="h-10 rounded-xl"
          />
        </div>
        {stage === "lost" ? (
          <div className="space-y-1 sm:col-span-2">
            <div className="text-xs text-slate-500">Lost reason</div>
            <Textarea
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="Why was this lab marked lost?"
              rows={3}
              className="rounded-xl text-sm"
            />
          </div>
        ) : null}
        <div className="space-y-1 sm:col-span-2">
          <div className="text-xs text-slate-500">Pipeline notes (optional)</div>
          <Textarea
            value={pipelineNotes}
            onChange={(e) => setPipelineNotes(e.target.value)}
            rows={2}
            className="rounded-xl text-sm"
          />
        </div>
      </div>
      <Button
        type="button"
        className="h-11 w-full rounded-xl sm:w-auto"
        disabled={saving}
        onClick={handleSavePipeline}
      >
        {saving ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving pipeline…
          </>
        ) : (
          "Save pipeline"
        )}
      </Button>
      {rowError ? <p className="text-sm text-red-600">{rowError}</p> : null}
    </div>
  );
}

function ScoreBandBadge({ row }) {
  const band = String(row.qualificationBand || "").toLowerCase();
  if (!band && row.qualificationScore == null) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {band ? (
        <Badge className={qualificationBandBadgeClass(band)}>
          {formatQualificationBandLabel(band)}
        </Badge>
      ) : null}
      {row.qualificationScore != null ? (
        <span className="text-xs font-medium text-slate-600">
          {row.qualificationScore}
        </span>
      ) : null}
    </div>
  );
}

function FilterSelect({ label, value, onValueChange, options }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-10 w-full rounded-xl">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ReviewRowCard({ row, currentUser, onSaved }) {
  const [status, setStatus] = useState(row.founderReviewStatus || "pending");
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState("");

  useEffect(() => {
    setStatus(row.founderReviewStatus || "pending");
  }, [row.founderReviewStatus, row.labId]);

  async function handleSaveStatus() {
    setRowError("");
    setSaving(true);
    try {
      const res = await updateQualificationFounderReviewWrite({
        tenantId: row.tenantId || currentUser?.tenantId,
        labId: row.labId,
        founderReviewStatus: status,
        updatedBy: currentUser?.id || currentUser?.userId,
      });
      if (!res?.success) {
        throw new Error(res?.error || "Failed to update review status");
      }
      onSaved?.(res.data);
    } catch (err) {
      setRowError(err?.message || "Update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{row.labName}</CardTitle>
            <CardDescription>{row.labId}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PipelineStageBadge row={row} />
            <ScoreBandBadge row={row} />
            <Badge className={statusBadgeClass(row.founderReviewStatus)}>
              {formatStatusLabel(row.founderReviewStatus)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-slate-500">Monthly estimate</div>
            <div className="font-medium">{formatMoney(row.monthlyConsumablesEstimate)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Current supplier</div>
            <div className="font-medium">{row.currentSupplier || "—"}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Payment terms</div>
            <div className="font-medium">{row.paymentTerms || "—"}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Reagent rental</div>
            <div className="font-medium">{row.reagentRentalPotential || "—"}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Lab OS fit</div>
            <div className="font-medium">{row.labOsFit || "—"}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Next follow-up</div>
            <div className="font-medium">{row.nextFollowUpDate || "—"}</div>
          </div>
        </div>
        <div className="text-xs text-slate-500">
          Agent: {row.agentName || row.agentId || "—"} · Updated{" "}
          {formatDateTime(row.updatedAt)}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <div className="text-xs font-medium text-slate-500">Founder review status</div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REVIEW_STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            className="h-10 rounded-xl"
            disabled={saving || status === row.founderReviewStatus}
            onClick={handleSaveStatus}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save status"
            )}
          </Button>
        </div>
        {rowError ? (
          <p className="text-sm text-red-600">{rowError}</p>
        ) : null}

        <PipelineEditor row={row} currentUser={currentUser} onSaved={onSaved} />
      </CardContent>
    </Card>
  );
}

export default function QualificationReviewPage({ currentUser }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [rentalFilter, setRentalFilter] = useState("ALL");
  const [fitFilter, setFitFilter] = useState("ALL");
  const [bandFilter, setBandFilter] = useState("ALL");
  const [pipelineFilter, setPipelineFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("stage");
  const loadRows = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await getQualificationReviewRead();
      if (!res?.success) {
        throw new Error(res?.error || "Failed to load qualification reviews");
      }
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err?.message || "Failed to load qualification reviews");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const filtered = rows.filter((row) => {
      if (statusFilter !== "ALL" && row.founderReviewStatus !== statusFilter) {
        return false;
      }
      if (
        rentalFilter !== "ALL" &&
        String(row.reagentRentalPotential || "") !== rentalFilter
      ) {
        return false;
      }
      if (fitFilter !== "ALL" && String(row.labOsFit || "") !== fitFilter) {
        return false;
      }
      if (
        bandFilter !== "ALL" &&
        String(row.qualificationBand || "").toLowerCase() !== bandFilter
      ) {
        return false;
      }
      if (
        pipelineFilter !== "ALL" &&
        String(row.pipelineStage || "").toLowerCase() !== pipelineFilter
      ) {
        return false;
      }
      return true;
    });

    const sorted = [...filtered];
    if (sortBy === "score") {
      sorted.sort(
        (a, b) =>
          Number(b.qualificationScore ?? -1) - Number(a.qualificationScore ?? -1)
      );
    } else if (sortBy === "stage") {
      sorted.sort(
        (a, b) =>
          getPipelineStageOrder(a.pipelineStage) - getPipelineStageOrder(b.pipelineStage)
      );
    } else if (sortBy === "expected_value") {
      sorted.sort(
        (a, b) =>
          Number(b.pipelineExpectedValue ?? -1) -
          Number(a.pipelineExpectedValue ?? -1)
      );
    } else {
      sorted.sort(
        (a, b) =>
          new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
      );
    }
    return sorted;
  }, [rows, statusFilter, rentalFilter, fitFilter, bandFilter, pipelineFilter, sortBy]);

  function handleRowSaved(updated) {
    if (!updated?.labId) {
      loadRows();
      return;
    }
    setRows((prev) =>
      prev.map((r) => (r.labId === updated.labId ? { ...r, ...updated } : r))
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading qualification reviews…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-slate-700" />
            <h1 className="text-2xl font-semibold tracking-tight">Qualification Review</h1>
          </div>
          <p className="text-sm text-slate-500">
            Founder and executive review of agent-captured lab qualifications.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="rounded-xl"
          onClick={loadRows}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
          <Button
            type="button"
            variant="outline"
            className="mt-3 rounded-xl"
            onClick={loadRows}
          >
            Retry
          </Button>
        </div>
      ) : null}

      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <FilterSelect
            label="Pipeline stage"
            value={pipelineFilter}
            onValueChange={setPipelineFilter}
            options={PIPELINE_FILTER_OPTIONS}
          />
          <FilterSelect
            label="Qualification band"
            value={bandFilter}
            onValueChange={setBandFilter}
            options={BAND_OPTIONS}
          />
          <FilterSelect
            label="Sort by"
            value={sortBy}
            onValueChange={setSortBy}
            options={SORT_OPTIONS}
          />
          <FilterSelect
            label="Review status"
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={STATUS_OPTIONS}
          />
          <FilterSelect
            label="Reagent rental potential"
            value={rentalFilter}
            onValueChange={setRentalFilter}
            options={RENTAL_OPTIONS}
          />
          <FilterSelect
            label="Lab OS fit"
            value={fitFilter}
            onValueChange={setFitFilter}
            options={FIT_OPTIONS}
          />
        </CardContent>
      </Card>

      <div className="text-sm text-slate-500">
        Showing {filteredRows.length} of {rows.length} qualification
        {rows.length === 1 ? "" : "s"}
      </div>

      {filteredRows.length === 0 ? (
        <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
          <p className="font-medium text-slate-900">No qualifications to review</p>
          <p className="mt-2 text-sm text-slate-500">
            {rows.length === 0
              ? "Agents have not saved any lab qualification profiles yet."
              : "Try adjusting filters to see more labs."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredRows.map((row) => (
            <ReviewRowCard
              key={row.id || row.labId}
              row={row}
              currentUser={currentUser}
              onSaved={handleRowSaved}
            />
          ))}
        </div>
      )}
    </div>
  );
}

