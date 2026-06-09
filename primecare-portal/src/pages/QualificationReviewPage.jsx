import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import { recordQualificationRenderedSnapshot } from "@/predator/moduleUiSnapshot.js";
import { usePredatorRenderTrace } from "@/predator/renderTrace.js";
import { usePredatorUiSyncTrace } from "@/predator/usePredatorUiSyncTrace.js";
import {
  getQualificationReviewRead,
  updateQualificationPipelineWrite,
} from "@/api/primecareSupabaseApi";
import { Card } from "@/components/ui/card";
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
import {
  StatusBadge,
  PageSkeleton,
  ListSkeleton,
  EmptyState,
  usePortalToast,
} from "@/components/ux";
import {
  qualificationBandToVariant,
  pipelineStageToVariant,
  tierLevelToVariant,
} from "@/utils/statusTokens";
import {
  Loader2,
  ClipboardCheck,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Search,
  FileText,
  ExternalLink,
} from "lucide-react";
import { loadVisibleLabContracts } from "@/labContract/labContractStore.js";
import { CONTRACT_STATUSES } from "@/labContract/labContractTypes.js";
import { labIdKey } from "@/utils/labId.js";
import { formatQualificationBandLabel } from "@/utils/computeQualificationScore";
import {
  getPipelineStageLabel,
  getPipelineStageOrder,
  PIPELINE_STAGE_SELECT_OPTIONS,
} from "@/utils/qualificationPipeline";

function canEditPipeline() {
  return false;
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

function formatShortDateTime(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function hasDisplayValue(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return true;
}

function rowKey(row) {
  return row.id || row.labId;
}

function PipelineStageBadge({ row, compact = false }) {
  const stage = row.pipelineStage || "new";
  return (
    <StatusBadge variant={pipelineStageToVariant(stage)} compact={compact}>
      {row.pipelineStageLabel || getPipelineStageLabel(stage)}
    </StatusBadge>
  );
}

const TERMINAL_CONTRACT_STATUSES = new Set([
  CONTRACT_STATUSES.EXPIRED,
  CONTRACT_STATUSES.TERMINATED,
  CONTRACT_STATUSES.SUSPENDED,
]);

const CONTRACT_STATUS_RANK = {
  [CONTRACT_STATUSES.ACTIVE]: 30,
  [CONTRACT_STATUSES.UNDER_REVIEW]: 20,
  [CONTRACT_STATUSES.DRAFT]: 10,
};

function formatContractExistsLabel(status) {
  const s = String(status || "").trim();
  if (s === CONTRACT_STATUSES.UNDER_REVIEW) return "Approved";
  if (s === CONTRACT_STATUSES.ACTIVE) return "Active";
  if (s === CONTRACT_STATUSES.DRAFT) return "Draft";
  return s || "Contract";
}

function contractStatusToVariant(status) {
  const s = String(status || "").trim();
  if (s === CONTRACT_STATUSES.ACTIVE) return "success";
  if (s === CONTRACT_STATUSES.UNDER_REVIEW) return "info";
  if (s === CONTRACT_STATUSES.DRAFT) return "warning";
  return "neutral";
}

function contractLookupKey(tenantId, labId) {
  return `${String(tenantId || "").trim()}:${labIdKey(labId)}`;
}

function buildContractByLabLookup(contracts = []) {
  const map = new Map();
  for (const contract of contracts) {
    const tenantId = String(
      contract.distributorId || contract.tenantId || contract.tenant_id || ""
    ).trim();
    const labId = labIdKey(contract.labId || contract.lab_id);
    if (!tenantId || !labId) continue;
    if (TERMINAL_CONTRACT_STATUSES.has(String(contract.status || "").trim())) continue;

    const key = contractLookupKey(tenantId, labId);
    const existing = map.get(key);
    const rank = CONTRACT_STATUS_RANK[String(contract.status || "").trim()] || 0;
    const existingRank = existing
      ? CONTRACT_STATUS_RANK[String(existing.status || "").trim()] || 0
      : -1;
    if (!existing || rank >= existingRank) {
      map.set(key, contract);
    }
  }
  return map;
}

function resolveLabContract(row, contractByLab) {
  if (!row?.labId || !contractByLab?.size) return null;
  const tenantId = String(row.tenantId || "").trim();
  if (tenantId) {
    const keyed = contractByLab.get(contractLookupKey(tenantId, row.labId));
    if (keyed) return keyed;
  }
  for (const contract of contractByLab.values()) {
    if (labIdKey(contract.labId || contract.lab_id) === labIdKey(row.labId)) {
      return contract;
    }
  }
  return null;
}

function ContractExistsBadge({ contract, compact = false }) {
  if (!contract) return null;
  const label = formatContractExistsLabel(contract.status);
  return (
    <StatusBadge variant={contractStatusToVariant(contract.status)} compact={compact}>
      Contract exists · {label}
    </StatusBadge>
  );
}

function OpenDistributorContractButton({ row, contract, currentUser, setActivePage }) {
  if (!contract || typeof setActivePage !== "function") return null;
  const distributorId = String(
    contract.distributorId || contract.tenantId || contract.tenant_id || row.tenantId || ""
  ).trim();
  const homeTenantId = String(
    currentUser?.homeTenantId || currentUser?.tenantId || currentUser?.tenant_id || ""
  ).trim();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-9 rounded-lg text-xs"
      onClick={() => {
        if (!distributorId || !homeTenantId) return;
        enterDistributorOs({
          tenantId: distributorId,
          tenantName: contract.distributorName || contract.tenantName || "",
          homeTenantId,
          tab: "contracts",
        });
        setActivePage("distributorOs");
      }}
    >
      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
      Open Distributor Contract
    </Button>
  );
}

function ScoreBandBadge({ row, compact = false }) {
  const band = String(row.qualificationBand || "").toLowerCase();
  if (!band && row.qualificationScore == null) {
    return <span className="text-[11px] text-slate-400">—</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      {band ? (
        <StatusBadge variant={qualificationBandToVariant(band)} compact={compact}>
          {formatQualificationBandLabel(band)}
        </StatusBadge>
      ) : null}
      {row.qualificationScore != null ? (
        <span className="text-[11px] font-semibold text-slate-600">
          {row.qualificationScore}
        </span>
      ) : null}
    </div>
  );
}

function SummaryMetric({ label, children }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="truncate text-xs font-medium text-slate-800">{children}</div>
    </div>
  );
}

function FilterSelect({ label, value, onValueChange, options }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-9 w-full rounded-lg text-xs">
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

function StickyReviewFilters({
  searchQuery,
  onSearchChange,
  pipelineFilter,
  setPipelineFilter,
  bandFilter,
  setBandFilter,
  statusFilter,
  setStatusFilter,
  rentalFilter,
  setRentalFilter,
  fitFilter,
  setFitFilter,
  sortBy,
  setSortBy,
  resultCount,
  totalCount,
}) {
  return (
    <div className="sticky top-0 z-20 -mx-1 border-b border-slate-200 bg-slate-50/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-slate-50/90">
      <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-slate-700">Find labs</div>
          <div className="text-[11px] text-slate-500">
            {resultCount} of {totalCount} shown
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search lab name or ID…"
            className="h-9 rounded-lg pl-8 text-sm"
            aria-label="Search by lab name or lab ID"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <FilterSelect
            label="Pipeline"
            value={pipelineFilter}
            onValueChange={setPipelineFilter}
            options={PIPELINE_FILTER_OPTIONS}
          />
          <FilterSelect
            label="Band"
            value={bandFilter}
            onValueChange={setBandFilter}
            options={BAND_OPTIONS}
          />
          <FilterSelect
            label="Legacy founder review"
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={STATUS_OPTIONS}
          />
          <FilterSelect
            label="Rental"
            value={rentalFilter}
            onValueChange={setRentalFilter}
            options={RENTAL_OPTIONS}
          />
          <FilterSelect
            label="Lab OS"
            value={fitFilter}
            onValueChange={setFitFilter}
            options={FIT_OPTIONS}
          />
          <FilterSelect
            label="Sort"
            value={sortBy}
            onValueChange={setSortBy}
            options={SORT_OPTIONS}
          />
        </div>
      </div>
    </div>
  );
}

function QualificationDetailsGrid({ row }) {
  const items = [
    hasDisplayValue(row.labSize) && {
      label: "Lab size",
      value: row.labSize,
      badge: null,
    },
    hasDisplayValue(row.monthlyConsumablesEstimate) && {
      label: "Monthly estimate",
      value: formatMoney(row.monthlyConsumablesEstimate),
      badge: null,
    },
    hasDisplayValue(row.currentSupplier) && {
      label: "Current supplier",
      value: row.currentSupplier,
      badge: null,
    },
    hasDisplayValue(row.paymentTerms) && {
      label: "Payment terms",
      value: row.paymentTerms,
      badge: null,
    },
    hasDisplayValue(row.decisionMaker) && {
      label: "Decision maker",
      value: row.decisionMaker,
      badge: null,
    },
    hasDisplayValue(row.reagentRentalPotential) && {
      label: "Reagent rental",
      value: row.reagentRentalPotential,
      badge: tierLevelToVariant(row.reagentRentalPotential),
    },
    hasDisplayValue(row.labOsFit) && {
      label: "Lab OS fit",
      value: row.labOsFit,
      badge: tierLevelToVariant(row.labOsFit),
    },
    hasDisplayValue(row.agentName || row.agentId) && {
      label: "Agent",
      value: row.agentName || row.agentId,
      badge: null,
    },
  ].filter(Boolean);

  const reasons = Array.isArray(row.qualificationReasons)
    ? row.qualificationReasons.filter(Boolean)
    : [];

  if (items.length === 0 && reasons.length === 0) {
    return (
      <p className="text-xs text-slate-500">No extra qualification details recorded.</p>
    );
  }

  return (
    <div className="space-y-2">
      {items.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
          {items.map((item) => (
            <div key={item.label}>
              <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                {item.label}
              </div>
              {item.badge ? (
                <div className="mt-0.5">
                  <StatusBadge variant={item.badge} compact>
                    {item.value}
                  </StatusBadge>
                </div>
              ) : (
                <div className="text-sm text-slate-800">{item.value}</div>
              )}
            </div>
          ))}
        </div>
      ) : null}
      {reasons.length > 0 ? (
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Score reasons
          </div>
          <ul className="mt-1 list-inside list-disc text-xs text-slate-600">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function NotesSection({ row }) {
  const agentNotes = hasDisplayValue(row.notes) ? row.notes : null;
  const pipelineNotes = hasDisplayValue(row.pipelineNotes) ? row.pipelineNotes : null;
  if (!agentNotes && !pipelineNotes) return null;
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="text-xs font-semibold text-slate-700">Notes</div>
      {agentNotes ? (
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Agent notes
          </div>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{agentNotes}</p>
        </div>
      ) : null}
      {pipelineNotes ? (
        <div>
          <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Pipeline notes
          </div>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{pipelineNotes}</p>
        </div>
      ) : null}
    </div>
  );
}

function SavedHint({ label, at }) {
  if (!at) return null;
  return (
    <p className="text-[11px] text-[var(--pc-success)]" role="status">
      {label} · saved {formatShortDateTime(at)}
    </p>
  );
}

function PipelineEditor({ row, currentUser, onSaved, onError, savedAt }) {
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
      const msg = err?.message || "Pipeline update failed";
      setRowError(msg);
      onError?.(msg);
    } finally {
      setSaving(false);
    }
  }

  if (!editable) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-sm">
        <div className="text-xs font-semibold text-slate-600">Pipeline (read-only)</div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div>
            <span className="text-slate-500">Stage</span>
            <div className="mt-0.5">
              <PipelineStageBadge row={row} compact />
            </div>
          </div>
          <div>
            <span className="text-slate-500">Probability</span>
            <div className="font-medium">
              {row.pipelineProbability != null ? `${row.pipelineProbability}%` : "—"}
            </div>
          </div>
          <div>
            <span className="text-slate-500">Expected</span>
            <div className="font-medium">{formatMoney(row.pipelineExpectedValue)}</div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <span className="text-slate-500">Next action</span>
            <div className="font-medium">{row.pipelineNextAction || "—"}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <div className="text-xs font-semibold text-slate-700">Pipeline</div>
        <SavedHint label="Pipeline updated successfully" at={savedAt} />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Stage
          </label>
          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger className="h-10 rounded-lg">
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
          <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Win probability (%)
          </label>
          <Input
            type="number"
            min={0}
            max={100}
            value={probability}
            onChange={(e) => setProbability(e.target.value)}
            placeholder="0–100"
            className="h-10 rounded-lg"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Expected value (₹)
          </label>
          <Input
            type="number"
            min={0}
            value={expectedValue}
            onChange={(e) => setExpectedValue(e.target.value)}
            placeholder="Deal value"
            className="h-10 rounded-lg"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Next action
          </label>
          <Input
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder="Next step for this lab"
            className="h-10 rounded-lg"
          />
        </div>
        {stage === "lost" ? (
          <div className="space-y-1 sm:col-span-2">
            <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              Lost reason
            </label>
            <Textarea
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="Why was this lab marked lost?"
              rows={2}
              className="rounded-lg text-sm"
            />
          </div>
        ) : null}
        <div className="space-y-1 sm:col-span-2">
          <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
            Pipeline notes (optional)
          </label>
          <Textarea
            value={pipelineNotes}
            onChange={(e) => setPipelineNotes(e.target.value)}
            rows={2}
            className="rounded-lg text-sm"
          />
        </div>
      </div>
      <Button
        type="button"
        className="h-11 w-full rounded-lg sm:w-auto"
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

function ReviewExpandedPanel({
  row,
  currentUser,
  onRowSaved,
  onSaveError,
  saveMeta,
  contract = null,
  setActivePage = null,
}) {
  const key = row.labId;
  const meta = saveMeta[key] || {};

  function handlePipelineSaved(data) {
    onRowSaved(data, "pipeline");
  }

  return (
    <div
      id={`review-detail-${key}`}
      className="border-t border-slate-200 bg-slate-50/80 px-2.5 py-3 sm:px-3"
    >
      <div className="space-y-3">
        {contract ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
            <FileText className="h-4 w-4 text-slate-500" aria-hidden />
            <span className="text-xs font-semibold text-slate-800">Distributor contract</span>
            <ContractExistsBadge contract={contract} />
          </div>
        ) : null}
        <section aria-labelledby={`qual-heading-${key}`}>
          <h3
            id={`qual-heading-${key}`}
            className="mb-1.5 text-xs font-semibold text-slate-700"
          >
            Qualification details
          </h3>
          <QualificationDetailsGrid row={row} />
        </section>
        <PipelineEditor
          row={row}
          currentUser={currentUser}
          onSaved={handlePipelineSaved}
          onError={onSaveError}
          savedAt={meta.pipelineAt}
        />
        {row.founderReviewStatus ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white p-2.5 text-xs text-slate-600">
            <span className="font-semibold text-slate-700">Legacy founder review (deprecated):</span>{" "}
            {formatStatusLabel(row.founderReviewStatus)} — not required for contract activation.
            Manage qualification pipeline in Distributor OS → Labs → Qualification.
          </div>
        ) : null}
        <NotesSection row={row} />
      </div>
    </div>
  );
}

function ReviewSummaryRow({ row, expanded, onToggleExpand, contract = null }) {
  const followUp = row.nextFollowUpDate || "—";
  const prob =
    row.pipelineProbability != null ? `${row.pipelineProbability}%` : "—";
  const agent = row.agentName || row.agentId || "—";

  return (
    <div
      className={`flex flex-col gap-2 p-2.5 sm:p-3 ${
        expanded ? "bg-slate-50" : "bg-white"
      }`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={onToggleExpand}
          className="mt-0.5 shrink-0 rounded-md p-1 text-slate-500 hover:bg-slate-100"
          aria-expanded={expanded}
          aria-controls={`review-detail-${row.labId}`}
          aria-label={expanded ? "Collapse lab details" : "Expand lab details"}
        >
          {expanded ? (
            <ChevronUp className="h-5 w-5" />
          ) : (
            <ChevronDown className="h-5 w-5" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-slate-900">
              {row.labName}
            </span>
            <span className="text-[11px] text-slate-400">{row.labId}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <ScoreBandBadge row={row} compact />
            <PipelineStageBadge row={row} compact />
            {hasDisplayValue(row.reagentRentalPotential) ? (
              <StatusBadge variant={tierLevelToVariant(row.reagentRentalPotential)} compact>
                Rental {row.reagentRentalPotential}
              </StatusBadge>
            ) : null}
            {hasDisplayValue(row.labOsFit) ? (
              <StatusBadge variant={tierLevelToVariant(row.labOsFit)} compact>
                Lab OS {row.labOsFit}
              </StatusBadge>
            ) : null}
            <ContractExistsBadge contract={contract} compact />
          </div>
        </div>
        <Button
          type="button"
          variant={expanded ? "secondary" : "outline"}
          size="sm"
          className="h-10 shrink-0 rounded-lg px-3 text-xs font-semibold"
          onClick={onToggleExpand}
        >
          {expanded ? "Close" : "View"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4 lg:grid-cols-8">
        <SummaryMetric label="Expected">{formatMoney(row.pipelineExpectedValue)}</SummaryMetric>
        <SummaryMetric label="Probability">{prob}</SummaryMetric>
        <SummaryMetric label="Follow-up">{followUp}</SummaryMetric>
        <SummaryMetric label="Agent">{agent}</SummaryMetric>
        <div className="min-w-0 col-span-2 sm:col-span-2 lg:col-span-4">
          <SummaryMetric label="Updated">
            <span className="text-[11px]">{formatDateTime(row.updatedAt)}</span>
          </SummaryMetric>
        </div>
      </div>
    </div>
  );
}

function QualificationReviewListItem({
  row,
  expanded,
  onToggleExpand,
  currentUser,
  onRowSaved,
  onSaveError,
  saveMeta,
  contract = null,
  setActivePage = null,
}) {
  return (
    <Card className="overflow-hidden rounded-lg border-slate-200 shadow-sm">
      <ReviewSummaryRow
        row={row}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
        contract={contract}
      />
      {expanded ? (
        <ReviewExpandedPanel
          row={row}
          currentUser={currentUser}
          onRowSaved={onRowSaved}
          onSaveError={onSaveError}
          saveMeta={saveMeta}
          contract={contract}
          setActivePage={setActivePage}
        />
      ) : null}
    </Card>
  );
}

function useFilteredQualificationRows(rows, filters) {
  const {
    searchQuery,
    statusFilter,
    rentalFilter,
    fitFilter,
    bandFilter,
    pipelineFilter,
    sortBy,
  } = filters;

  return useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (q) {
        const name = String(row.labName || "").toLowerCase();
        const id = String(row.labId || "").toLowerCase();
        if (!name.includes(q) && !id.includes(q)) return false;
      }
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
  }, [
    rows,
    searchQuery,
    statusFilter,
    rentalFilter,
    fitFilter,
    bandFilter,
    pipelineFilter,
    sortBy,
  ]);
}

function QualificationReviewLoading() {
  return (
    <div className="space-y-3 pb-6">
      <PageSkeleton kpiCount={0} kpiColumns={4} showList={false} />
      <div className="animate-pulse rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
        <div className="mb-2 h-4 w-24 rounded bg-muted" />
        <div className="mb-2 h-9 w-full rounded-lg bg-muted" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-muted/80" />
          ))}
        </div>
      </div>
      <ListSkeleton rows={8} />
    </div>
  );
}

export default function QualificationReviewPage({ currentUser, setActivePage = null }) {
  const [rows, setRows] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [rentalFilter, setRentalFilter] = useState("ALL");
  const [fitFilter, setFitFilter] = useState("ALL");
  const [bandFilter, setBandFilter] = useState("ALL");
  const [pipelineFilter, setPipelineFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState("stage");
  const [expandedLabId, setExpandedLabId] = useState(null);
  const [saveMeta, setSaveMeta] = useState({});
  const { showToast } = usePortalToast();

  const loadRows = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [res, contractRows] = await Promise.all([
        getQualificationReviewRead(),
        loadVisibleLabContracts().catch(() => []),
      ]);
      if (!res?.success) {
        throw new Error(res?.error || "Failed to load qualification reviews");
      }
      setRows(Array.isArray(res.data) ? res.data : []);
      setContracts(Array.isArray(contractRows) ? contractRows : []);
    } catch (err) {
      setError(err?.message || "Failed to load qualification reviews");
      setRows([]);
      setContracts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const predatorSnapshot = useMemo(
    () => ({
      rows,
      rowCount: rows.length,
      qualificationRowsCount: rows.length,
    }),
    [rows]
  );

  usePredatorModuleValidation("Qualification Analytics", currentUser, predatorSnapshot, !loading);

  useEffect(() => {
    if (loading) return;
    recordQualificationRenderedSnapshot(predatorSnapshot, {
      source: "QualificationReviewPage.render",
    });
  }, [loading, predatorSnapshot]);

  usePredatorRenderTrace("Qualification Review", {
    ready: !loading,
    hasData: rows.length > 0,
  });

  usePredatorUiSyncTrace("Qualification Analytics", {
    loading,
    apiReady: !loading,
    metrics: {
      qualification_rows: {
        state: rows.length,
        render: rows.length,
      },
    },
  });

  const contractByLab = useMemo(() => buildContractByLabLookup(contracts), [contracts]);

  const filteredRows = useFilteredQualificationRows(rows, {
    searchQuery,
    statusFilter,
    rentalFilter,
    fitFilter,
    bandFilter,
    pipelineFilter,
    sortBy,
  });

  useEffect(() => {
    if (expandedLabId && !filteredRows.some((r) => r.labId === expandedLabId)) {
      setExpandedLabId(null);
    }
  }, [filteredRows, expandedLabId]);

  function toggleExpand(labId) {
    setExpandedLabId((prev) => (prev === labId ? null : labId));
  }

  function handleRowSaved(updated, saveType) {
    if (!updated?.labId) {
      loadRows();
      return;
    }
    const now = new Date();
    setRows((prev) =>
      prev.map((r) => (r.labId === updated.labId ? { ...r, ...updated } : r))
    );
    setSaveMeta((prev) => ({
      ...prev,
      [updated.labId]: {
        ...prev[updated.labId],
        ...(saveType === "pipeline" ? { pipelineAt: now } : {}),
      },
    }));
    if (saveType === "pipeline") {
      showToast("success", "Pipeline updated successfully");
    }
  }

  if (loading) {
    return <QualificationReviewLoading />;
  }

  return (
    <div className="space-y-3 pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-[var(--pc-brand-primary)]" />
            <h1 className="text-xl font-semibold tracking-tight">Qualification Analytics</h1>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Read-only portfolio view across distributors. Manage qualifications in Distributor OS →
            Labs → Qualification.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-10 rounded-lg"
          onClick={loadRows}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 h-9 rounded-lg"
            onClick={loadRows}
          >
            Retry
          </Button>
        </div>
      ) : null}

      <StickyReviewFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        pipelineFilter={pipelineFilter}
        setPipelineFilter={setPipelineFilter}
        bandFilter={bandFilter}
        setBandFilter={setBandFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        rentalFilter={rentalFilter}
        setRentalFilter={setRentalFilter}
        fitFilter={fitFilter}
        setFitFilter={setFitFilter}
        sortBy={sortBy}
        setSortBy={setSortBy}
        resultCount={filteredRows.length}
        totalCount={rows.length}
      />

      {filteredRows.length === 0 ? (
        <EmptyState
          title="No qualifications to display"
          description={
            rows.length === 0
              ? "Agents have not saved any lab qualification profiles yet."
              : "Try a different search or filter."
          }
        />
      ) : (
        <div className="space-y-2" role="list">
          {filteredRows.map((row) => {
            const key = rowKey(row);
            const isExpanded = expandedLabId === row.labId;
            return (
              <QualificationReviewListItem
                key={key}
                row={row}
                expanded={isExpanded}
                onToggleExpand={() => toggleExpand(row.labId)}
                currentUser={currentUser}
                onRowSaved={handleRowSaved}
                onSaveError={(msg) => showToast("error", msg)}
                saveMeta={saveMeta}
                contract={resolveLabContract(row, contractByLab)}
                setActivePage={setActivePage}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
