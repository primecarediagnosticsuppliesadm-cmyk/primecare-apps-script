import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import ExecutiveActionModalShell from "@/components/executive/ExecutiveActionModalShell.jsx";
import {
  updateQualificationFounderReviewWrite,
  updateQualificationPipelineWrite,
} from "@/api/primecareSupabaseApi.js";
import { finalizeExecutiveQueueWrite } from "@/operations/executiveActionQueueWriteService.js";
import {
  PIPELINE_STAGE_SELECT_OPTIONS,
  normalizeQualificationPipelineStage,
} from "@/utils/qualificationPipeline.js";
import { labIdKey } from "@/utils/labId.js";

function str(v) {
  return String(v ?? "").trim();
}

export default function ExecutiveQualActionModal({
  open,
  item,
  qualificationRow = null,
  currentUser,
  tenantId,
  onClose,
  onSuccess,
  onRefresh,
}) {
  const labId = str(item?.entityRefs?.labId);
  const rowTenantId = str(
    qualificationRow?.tenantId ??
      qualificationRow?.tenant_id ??
      item?.entityRefs?.tenantId ??
      tenantId
  );

  const initialStage = useMemo(
    () =>
      normalizeQualificationPipelineStage(
        qualificationRow?.pipelineStage ?? qualificationRow?.pipeline_stage
      ) || "new",
    [qualificationRow]
  );

  const [stage, setStage] = useState(initialStage);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setStage(initialStage);
    setError("");
  }, [open, initialStage, item?.id]);

  if (!open || !item) return null;

  const missingLab = !labId;

  async function runWrite(label, writeFn) {
    if (missingLab) {
      setError("Lab reference missing — cannot update qualification.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await writeFn();
      if (!res?.success) {
        throw new Error(res?.error || `${label} failed`);
      }
      await finalizeExecutiveQueueWrite({
        tenantId,
        currentUser,
        queueItem: item,
        summary: `${label}: ${item.subtitle || labId}`,
        eventType: "qualification_updated",
        metadata: { labId, action: label },
        onRefresh,
      });
      onSuccess?.(label);
      onClose?.();
    } catch (err) {
      setError(err?.message || `${label} failed`);
    } finally {
      setSaving(false);
    }
  }

  async function handleAdvanceStage() {
    await runWrite("Pipeline advanced", () =>
      updateQualificationPipelineWrite({
        tenantId: rowTenantId,
        labId,
        writerRole: currentUser?.role || "executive",
        pipelineStage: stage,
        updatedBy: currentUser?.id || currentUser?.userId,
      })
    );
  }

  async function handleFounderReview(status, label) {
    await runWrite(label, () =>
      updateQualificationFounderReviewWrite({
        tenantId: rowTenantId,
        labId,
        founderReviewStatus: status,
        updatedBy: currentUser?.id || currentUser?.userId,
      })
    );
  }

  return (
    <ExecutiveActionModalShell
      title="Qualification action"
      subtitle={`${item.subtitle || labId} · Impact ${item.impactScore ?? "—"}`}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleAdvanceStage()}
            disabled={saving || !stage || missingLab}
          >
            {saving ? "Saving…" : "Advance stage"}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-slate-600">{item.summary}</p>

      <label className="mb-3 block text-xs">
        <span className="font-medium text-slate-700">Pipeline stage</span>
        <select
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          disabled={saving}
        >
          {PIPELINE_STAGE_SELECT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={saving}
          onClick={() => void handleFounderReview("approved", "Qualification approved")}
        >
          Approve
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={() => void handleFounderReview("needs_info", "Needs info requested")}
        >
          Needs info
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={saving}
          onClick={() => void handleFounderReview("rejected", "Qualification rejected")}
        >
          Reject
        </Button>
      </div>

      {!qualificationRow && labId ? (
        <p className="mt-2 text-[10px] text-amber-700">
          Qualification row not in cache — writes use lab {labIdKey(labId)} and tenant {rowTenantId || "HQ"}.
        </p>
      ) : null}

      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </ExecutiveActionModalShell>
  );
}
