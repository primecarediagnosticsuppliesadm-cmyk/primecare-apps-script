import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import ExecutiveActionModalShell from "@/components/executive/ExecutiveActionModalShell.jsx";
import {
  approveCommissionEntry,
  rejectCommissionEntry,
} from "@/commission/commissionData.js";
import { finalizeExecutiveQueueWrite } from "@/operations/executiveActionQueueWriteService.js";
import { applyInterventionAction } from "@/operations/executiveInterventionStateStore.js";
import { invalidateOperationsCommandCenterCache } from "@/operations/operationsCommandCenterLoader.js";
import { appendOperationalEvent } from "@/operations/operationalEventBridge.js";
import { filterOpenExecutiveActionQueueItems } from "@/operations/executiveActionQueueEngine.js";
import { ACTION_QUEUE_SOURCE_MODULES } from "@/operations/executiveActionQueueTypes.js";

function str(v) {
  return String(v ?? "").trim();
}

function formatInr(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

export default function ExecutiveCommissionApproveModal({
  open,
  item,
  visibleQueueItems = [],
  currentUser,
  tenantId,
  onClose,
  onSuccess,
  onRefresh,
}) {
  const distributorId = str(item?.entityRefs?.distributorId);
  const entryId = str(item?.entityRefs?.commissionEntryId);
  const periodYmd = str(item?.entityRefs?.periodYmd);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
  }, [open, item?.id]);

  if (!open || !item) return null;

  const missingRefs = !distributorId || !entryId;

  const commissionPeers = filterOpenExecutiveActionQueueItems(visibleQueueItems).filter(
    (row) => row.sourceModule === ACTION_QUEUE_SOURCE_MODULES.COMMISSION
  );

  async function runSingle(label, fn, metadata = {}) {
    if (missingRefs) {
      setError("Commission entry reference missing — cannot approve this queue item.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await fn();
      if (!result) {
        throw new Error(`${label} failed`);
      }
      await finalizeExecutiveQueueWrite({
        tenantId,
        currentUser,
        queueItem: item,
        summary: `${label}: ${item.subtitle || entryId}`,
        eventType: "payment_received",
        metadata: {
          commissionEntryId: entryId,
          distributorId,
          periodYmd,
          commissionApproval: true,
          ...metadata,
        },
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

  async function handleApprove() {
    const approvedBy = str(currentUser?.name || currentUser?.email);
    await runSingle("Commission approved", async () => {
      const entry = await approveCommissionEntry(distributorId, entryId, approvedBy);
      if (!entry) throw new Error("Approve failed — check threshold and pending status");
      return entry;
    });
  }

  async function handleReject() {
    const rejectedBy = str(currentUser?.name || currentUser?.email);
    await runSingle("Commission rejected", async () => {
      const entry = await rejectCommissionEntry(distributorId, entryId, rejectedBy);
      if (!entry) throw new Error("Reject failed");
      return entry;
    });
  }

  async function handleBulkApproveVisible() {
    setSaving(true);
    setError("");
    const approvedBy = str(currentUser?.name || currentUser?.email);
    const actor = approvedBy || "Executive";
    const actorRole = str(currentUser?.role || "executive");
    let approved = 0;
    const failures = [];

    try {
      for (const row of commissionPeers) {
        const did = str(row.entityRefs?.distributorId);
        const eid = str(row.entityRefs?.commissionEntryId);
        if (!did || !eid) continue;
        try {
          const entry = await approveCommissionEntry(did, eid, approvedBy);
          if (entry) {
            approved += 1;
            applyInterventionAction({
              tenantId,
              issueId: row.id,
              action: "resolve",
              actor,
              actorRole,
              note: "Bulk commission approve",
            });
          } else {
            failures.push(row.subtitle || eid);
          }
        } catch {
          failures.push(row.subtitle || eid);
        }
      }

      if (approved === 0) {
        throw new Error("No visible commission items could be approved");
      }

      invalidateOperationsCommandCenterCache(tenantId);
      await appendOperationalEvent({
        tenantId,
        eventType: "payment_received",
        actor,
        actorRole,
        sourceModule: "executive_action_queue",
        metadata: {
          summary: `Bulk approved ${approved} commission entries`,
          commissionApproval: true,
          bulkCount: approved,
        },
      });

      if (onRefresh) await onRefresh(true);

      onSuccess?.(`Approved ${approved}`, {
        warning: failures.length
          ? `${failures.length} item(s) skipped — threshold or status`
          : "",
      });
      onClose?.();
    } catch (err) {
      setError(err?.message || "Bulk approve failed");
    } finally {
      setSaving(false);
    }
  }

  const amountLabel =
    item.entityRefs?.commissionAmount != null
      ? formatInr(item.entityRefs.commissionAmount)
      : item.summary;

  return (
    <ExecutiveActionModalShell
      title="Commission approval"
      subtitle={`${item.subtitle} · ${periodYmd || "Current period"}`}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleApprove()} disabled={saving || missingRefs}>
            {saving ? "Saving…" : "Approve"}
          </Button>
        </>
      }
    >
      <p className="mb-2 text-xs text-slate-600">{item.summary}</p>
      <p className="mb-3 text-sm font-semibold text-indigo-800">{amountLabel}</p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={saving}
          onClick={() => void handleReject()}
        >
          Reject
        </Button>
        {commissionPeers.length > 1 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() => void handleBulkApproveVisible()}
          >
            Approve all visible ({commissionPeers.length})
          </Button>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </ExecutiveActionModalShell>
  );
}
