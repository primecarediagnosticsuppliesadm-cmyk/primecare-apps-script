import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import ExecutiveActionModalShell from "@/components/executive/ExecutiveActionModalShell.jsx";
import { CONTRACT_STATUSES } from "@/labContract/labContractTypes.js";
import {
  renewLabContract as renewLabContractDomain,
  transitionLabContract,
} from "@/labContract/labContractData.js";
import { renewLabContract as renewLabContractSupabase } from "@/api/labContractsSupabaseApi.js";
import { invalidateLabContractCache } from "@/labContract/labContractData.js";
import { finalizeExecutiveQueueWrite } from "@/operations/executiveActionQueueWriteService.js";

function str(v) {
  return String(v ?? "").trim();
}

function addMonthsYmd(iso, months = 12) {
  const base = str(iso).slice(0, 10);
  const d = base ? new Date(`${base}T12:00:00`) : new Date();
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    now.setMonth(now.getMonth() + months);
    return now.toISOString().slice(0, 10);
  }
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export default function ExecutiveContractRenewalModal({
  open,
  item,
  currentUser,
  tenantId,
  onClose,
  onSuccess,
  onRefresh,
}) {
  const contractId = str(item?.entityRefs?.contractId);
  const distributorId = str(item?.entityRefs?.distributorId);
  const scopeTenantId = distributorId || tenantId;

  const defaultEnd = useMemo(() => addMonthsYmd(new Date().toISOString(), 12), [item?.id]);

  const [endDate, setEndDate] = useState(defaultEnd);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setEndDate(defaultEnd);
    setError("");
  }, [open, defaultEnd, item?.id]);

  if (!open || !item) return null;

  const missingContract = !contractId;

  async function runAction(label, actionFn, metadata = {}) {
    if (missingContract) {
      setError("Contract reference missing — cannot renew this queue item.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await actionFn();
      if (!saved) {
        throw new Error(`${label} failed — contract may be ineligible`);
      }
      invalidateLabContractCache();
      await finalizeExecutiveQueueWrite({
        tenantId,
        currentUser,
        queueItem: item,
        summary: `${label}: ${item.subtitle || contractId}`,
        eventType: "ops",
        metadata: { contractId, distributorId, ...metadata },
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

  async function handleRenew12Months() {
    await runAction("Contract renewed (+12 months)", () =>
      renewLabContractDomain(scopeTenantId, contractId, currentUser)
    );
  }

  async function handleExtendToDate() {
    const target = str(endDate).slice(0, 10);
    await runAction(`Contract extended to ${target}`, async () => {
      const res = await renewLabContractSupabase(contractId, {
        endDate: target,
        status: CONTRACT_STATUSES.ACTIVE,
      });
      if (!res.ok || !res.contract) {
        throw new Error(res.error || "Extend failed");
      }
      return res.contract;
    }, { endDate: target });
  }

  async function handleMarkUnderReview() {
    await runAction("Contract marked under review", () =>
      transitionLabContract(
        scopeTenantId,
        contractId,
        CONTRACT_STATUSES.UNDER_REVIEW,
        currentUser,
        "Executive renewal review"
      )
    );
  }

  return (
    <ExecutiveActionModalShell
      title="Contract renewal"
      subtitle={`${item.subtitle} · ${item.ageLabel || ""}`}
      onClose={onClose}
      wide
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleRenew12Months()}
            disabled={saving || missingContract}
          >
            {saving ? "Saving…" : "Renew +12 months"}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-slate-600">{item.summary}</p>
      <p className="mb-3 text-[11px] text-slate-500">{item.recommendedAction}</p>

      <label className="mb-3 block text-xs">
        <span className="font-medium text-slate-700">Extend end date</span>
        <input
          type="date"
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          disabled={saving}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={() => void handleExtendToDate()}
        >
          Extend to date
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={saving}
          onClick={() => void handleMarkUnderReview()}
        >
          Mark under review
        </Button>
      </div>

      {missingContract ? (
        <p className="mt-2 text-xs text-red-700">Contract reference missing — item stays open until data is fixed.</p>
      ) : null}

      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </ExecutiveActionModalShell>
  );
}
