import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  getQualificationReviewRead,
  updateQualificationFounderReviewWrite,
} from "@/api/primecareSupabaseApi";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const SORT_OPTIONS = [
  { value: "updated", label: "Recently updated" },
  { value: "score", label: "Score (high → low)" },
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
  const [sortBy, setSortBy] = useState("updated");
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
      return true;
    });

    const sorted = [...filtered];
    if (sortBy === "score") {
      sorted.sort(
        (a, b) =>
          Number(b.qualificationScore ?? -1) - Number(a.qualificationScore ?? -1)
      );
    } else {
      sorted.sort(
        (a, b) =>
          new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
      );
    }
    return sorted;
  }, [rows, statusFilter, rentalFilter, fitFilter, bandFilter, sortBy]);

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
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
        <>
          <div className="grid gap-4 md:hidden">
            {filteredRows.map((row) => (
              <ReviewRowCard
                key={row.id || row.labId}
                row={row}
                currentUser={currentUser}
                onSaved={handleRowSaved}
              />
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-2xl border bg-white shadow-sm md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Lab</th>
                  <th className="px-4 py-3">Band / Score</th>
                  <th className="px-4 py-3">Monthly est.</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Terms</th>
                  <th className="px-4 py-3">Rental</th>
                  <th className="px-4 py-3">Lab OS</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Follow-up</th>
                  <th className="px-4 py-3">Agent</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3">Review</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <TableReviewRow
                    key={row.id || row.labId}
                    row={row}
                    currentUser={currentUser}
                    onSaved={handleRowSaved}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function TableReviewRow({ row, currentUser, onSaved }) {
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
    <tr className="border-b last:border-0">
      <td className="px-4 py-3">
        <div className="font-medium text-slate-900">{row.labName}</div>
        <div className="text-xs text-slate-500">{row.labId}</div>
      </td>
      <td className="px-4 py-3">
        <ScoreBandBadge row={row} />
      </td>
      <td className="px-4 py-3">{formatMoney(row.monthlyConsumablesEstimate)}</td>
      <td className="px-4 py-3">{row.currentSupplier || "—"}</td>
      <td className="px-4 py-3">{row.paymentTerms || "—"}</td>
      <td className="px-4 py-3">{row.reagentRentalPotential || "—"}</td>
      <td className="px-4 py-3">{row.labOsFit || "—"}</td>
      <td className="px-4 py-3">
        <Badge className={statusBadgeClass(row.founderReviewStatus)}>
          {formatStatusLabel(row.founderReviewStatus)}
        </Badge>
      </td>
      <td className="px-4 py-3">{row.nextFollowUpDate || "—"}</td>
      <td className="px-4 py-3">{row.agentName || row.agentId || "—"}</td>
      <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">
        {formatDateTime(row.updatedAt)}
      </td>
      <td className="px-4 py-3">
        <div className="flex min-w-[200px] flex-col gap-1">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 rounded-lg text-xs">
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
          <Button
            type="button"
            size="sm"
            className="h-8 rounded-lg text-xs"
            disabled={saving || status === row.founderReviewStatus}
            onClick={handleSaveStatus}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          {rowError ? <span className="text-xs text-red-600">{rowError}</span> : null}
        </div>
      </td>
    </tr>
  );
}
