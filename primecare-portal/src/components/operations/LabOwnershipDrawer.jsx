import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { assignLabOwnership, transferLabOwnership, removeLabOwnership } from "@/api/labOwnershipApi.js";

function str(v) {
  return String(v ?? "").trim();
}

export default function LabOwnershipDrawer({
  lab,
  tenantId,
  agents = [],
  directoryUsers = [],
  onClose,
  onSaved,
  onError,
}) {
  const ownership = lab?.ownership || null;
  const [primaryAgentId, setPrimaryAgentId] = useState(
    ownership?.primaryAgentId || lab?.primaryAgentId || lab?.assignedAgentId || ""
  );
  const [secondaryAgentId, setSecondaryAgentId] = useState(ownership?.secondaryAgentId || "");
  const [managerId, setManagerId] = useState(ownership?.managerId || "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const managerOptions = useMemo(
    () =>
      (directoryUsers || []).filter((u) =>
        ["distributor_manager", "distributor_admin", "admin"].includes(str(u.role).toLowerCase())
      ),
    [directoryUsers]
  );

  const subjectUser = useMemo(() => {
    const agent = agents.find((a) => str(a.agentId) === str(primaryAgentId));
    return str(agent?.userId || agent?.id);
  }, [agents, primaryAgentId]);

  async function handleSave(e) {
    e.preventDefault();
    setError("");
    if (!primaryAgentId) {
      setError("Primary agent is required");
      return;
    }
    setSaving(true);
    try {
      const labTenantId = str(lab.labTenantId ?? lab.tenantId);
      const labId = str(lab.labId);
      const payload = {
        tenantId,
        labTenantId,
        labId,
        labName: str(lab.labName),
        primaryAgentId,
        secondaryAgentId,
        managerId: managerId || undefined,
        subjectUserId: subjectUser,
        agentName: agents.find((a) => str(a.agentId) === primaryAgentId)?.name,
        reason,
      };

      const isTransfer =
        ownership?.primaryAgentId &&
        str(ownership.primaryAgentId).toLowerCase() !== primaryAgentId.toLowerCase();

      const res = isTransfer
        ? await transferLabOwnership({
            ...payload,
            fromAgentId: ownership.primaryAgentId,
            toAgentId: primaryAgentId,
          })
        : await assignLabOwnership(payload);

      if (!res?.success) throw new Error(res?.error || "Failed to save ownership");
      onSaved?.();
    } catch (err) {
      const msg = err?.message || "Save failed";
      setError(msg);
      onError?.(msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!window.confirm("Remove ownership for this lab?")) return;
    setSaving(true);
    setError("");
    try {
      const res = await removeLabOwnership({
        tenantId,
        labTenantId: str(lab.labTenantId ?? lab.tenantId),
        labId: str(lab.labId),
        subjectUserId: subjectUser,
        reason: reason || "ownership_removed",
      });
      if (!res?.success) throw new Error(res?.error || "Failed to remove ownership");
      onSaved?.();
    } catch (err) {
      const msg = err?.message || "Remove failed";
      setError(msg);
      onError?.(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="flex h-full w-full max-w-md flex-col border-l bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Lab Ownership</h3>
            <p className="text-xs text-slate-500">{lab?.labName || lab?.labId}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={(e) => void handleSave(e)} className="flex flex-1 flex-col overflow-y-auto px-4 py-3">
          {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}

          <label className="mb-3 block text-xs text-slate-600">
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
                  {a.name} ({a.agentId})
                </option>
              ))}
            </select>
          </label>

          <label className="mb-3 block text-xs text-slate-600">
            Secondary agent
            <select
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={secondaryAgentId}
              onChange={(e) => setSecondaryAgentId(e.target.value)}
            >
              <option value="">None</option>
              {agents.map((a) => (
                <option key={`sec-${a.agentId}`} value={a.agentId}>
                  {a.name} ({a.agentId})
                </option>
              ))}
            </select>
          </label>

          <label className="mb-3 block text-xs text-slate-600">
            Distributor manager
            <select
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
            >
              <option value="">None</option>
              {managerOptions.map((u) => (
                <option key={u.userId} value={u.userId}>
                  {u.name || u.displayName} ({u.roleLabel || u.role})
                </option>
              ))}
            </select>
          </label>

          <label className="mb-3 block text-xs text-slate-600">
            Reason (audit)
            <Input className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>

          <div className="mt-auto flex flex-wrap gap-2 border-t pt-3">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save ownership"}
            </Button>
            {lab?.hasOwnership ? (
              <Button type="button" variant="outline" className="text-red-700" disabled={saving} onClick={() => void handleRemove()}>
                Remove
              </Button>
            ) : null}
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
