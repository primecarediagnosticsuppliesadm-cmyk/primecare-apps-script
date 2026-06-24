import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { assignPrimaryLabOwnerWrite } from "@/api/labOwnershipApi.js";

function str(v) {
  return String(v ?? "").trim();
}

export default function AssignLabOwnerPromptModal({
  lab,
  hqTenantId,
  agents = [],
  onClose,
  onAssigned,
  onSkip,
}) {
  const [primaryAgentId, setPrimaryAgentId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");

  const selected = agents.find((a) => str(a.agentId) === str(primaryAgentId));

  async function handleAssign(e) {
    e.preventDefault();
    if (!primaryAgentId) {
      setError("Select a primary agent");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await assignPrimaryLabOwnerWrite({
        hqTenantId,
        labTenantId: lab.tenantId,
        labId: lab.labId,
        primaryAgentId,
        agentName: selected?.name || selected?.agentName || primaryAgentId,
        labName: lab.labName,
        reason: "post_create_lab_ownership",
      });
      if (!res?.success) {
        throw new Error(res?.error || "Failed to assign owner");
      }
      setSuccess(`Primary owner assigned · ${selected?.name || primaryAgentId}`);
      onAssigned?.({ lab, primaryAgentId, agentName: selected?.name });
      window.setTimeout(() => onClose?.(), 800);
    } catch (err) {
      setError(err.message || "Ownership assignment failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={(e) => void handleAssign(e)}
        className="w-full max-w-md rounded-xl border bg-white p-4 shadow-lg"
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Assign primary owner</h3>
            <p className="text-[11px] text-slate-500">
              {lab?.labName || lab?.labId} · Pilot accountability
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onSkip} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
          Lab created successfully. Assign a primary agent now so ownership, executive queue, and
          agent workspace stay in sync.
        </p>

        <label className="block text-xs font-medium text-slate-700">
          Primary agent *
          <select
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            value={primaryAgentId}
            onChange={(e) => setPrimaryAgentId(e.target.value)}
            required
          >
            <option value="">Select agent…</option>
            {agents.map((a) => (
              <option key={a.agentId || a.id} value={a.agentId}>
                {a.name || a.agentName || a.agentId}
              </option>
            ))}
          </select>
        </label>

        {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
        {success ? <p className="mt-2 text-xs text-emerald-700">{success}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onSkip} disabled={saving}>
            Skip for now
          </Button>
          <Button type="submit" size="sm" disabled={saving || !primaryAgentId}>
            {saving ? "Assigning…" : "Assign owner"}
          </Button>
        </div>
      </form>
    </div>
  );
}
