import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  transferLabAssignmentWrite,
  updateDistributorAgentAssignmentWrite,
  updateLabAgentAssignmentWrite,
  updateOperationsPlatformUserWrite,
} from "@/api/primecareSupabaseApi.js";
import {
  deactivatePlatformUserWrite,
  provisionPlatformUserWrite,
  reactivatePlatformUserWrite,
  resetPlatformUserPasswordWrite,
} from "@/api/userProvisioningApi.js";
import {
  EMAIL_NOT_ADDED,
  OPERATIONS_CENTER_TABS,
  PLATFORM_ROLE_OPTIONS,
  formatOpsDate,
  isAgentRole,
  labAssignmentKey,
  labsForAgent,
  matchesSearch,
  platformRoleLabel,
  distributorsForAgent,
} from "@/operations/operationsCenterAdminEngine.js";
import {
  filterDirectoryUsers,
  isLoginEnabledRole,
  sortDirectoryUsers,
  suggestAgentId,
  territoryOptionsFromDistributors,
} from "@/operations/userProvisioningEngine.js";
import { ROLES } from "@/config/roles.js";
import { cn } from "@/lib/utils";
import { Plus, Search, Copy, X } from "lucide-react";

function StatusBadge({ active }) {
  return (
    <Badge variant={active ? "default" : "secondary"}>{active ? "Active" : "Inactive"}</Badge>
  );
}

function ModalShell({ title, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className={cn(
          "max-h-[90vh] w-full overflow-y-auto rounded-xl border bg-white p-4 shadow-lg",
          wide ? "max-w-2xl" : "max-w-lg"
        )}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ConfirmActionModal({
  title,
  consequence,
  details = null,
  requireReason = false,
  reasonLabel = "Reason",
  reasonPlaceholder = "Required for audit trail",
  confirmLabel = "Confirm",
  destructive = false,
  onConfirm,
  onClose,
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (requireReason && !reason.trim()) {
      setError(`${reasonLabel} is required`);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onConfirm(requireReason ? reason.trim() : reason.trim() || undefined);
      onClose?.();
    } catch (err) {
      setError(err?.message || "Action failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={title} onClose={onClose}>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3 text-sm">
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {consequence}
        </p>
        {details ? (
          <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700 whitespace-pre-wrap">
            {details}
          </div>
        ) : null}
        {requireReason ? (
          <label className="block text-xs text-slate-600">
            {reasonLabel} *
            <Input
              className="mt-1"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              required
            />
          </label>
        ) : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={destructive ? "destructive" : "default"}
            disabled={saving || (requireReason && !reason.trim())}
          >
            {saving ? "Working…" : confirmLabel}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

function computeAgentLabAssignmentDiff(labAssignments, initialKeys, selectedKeys, user) {
  const assigns = [];
  const unassigns = [];
  let reassignCount = 0;

  const mine = [user?.userId, user?.agentId, user?.id]
    .map((v) => String(v ?? "").trim().toLowerCase())
    .filter(Boolean);

  for (const lab of labAssignments) {
    const key = labAssignmentKey(lab);
    const wasMine = initialKeys.has(key);
    const nowMine = selectedKeys.has(key);
    if (wasMine === nowMine) continue;

    if (nowMine) {
      assigns.push(lab);
      const assignedId = String(lab.assignedAgentId ?? "").trim().toLowerCase();
      if (assignedId && !mine.includes(assignedId)) reassignCount += 1;
    } else {
      unassigns.push(lab);
    }
  }

  return {
    assigns,
    unassigns,
    reassignCount,
    labChanges: assigns.length + unassigns.length,
  };
}

function formatLabList(labs, limit = 5) {
  const lines = labs.slice(0, limit).map((lab) => `• ${lab.labName} (${lab.labId})`);
  if (labs.length > limit) lines.push(`• …and ${labs.length - limit} more`);
  return lines.join("\n");
}

function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="relative min-w-[200px] flex-1">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 pl-8 text-xs"
      />
    </div>
  );
}

function CreateUserDrawer({ tenantId, distributors, labAssignments, onClose, onSaved }) {
  const territories = territoryOptionsFromDistributors(distributors);
  const [form, setForm] = useState({
    displayName: "",
    email: "",
    username: "",
    phone: "",
    role: "agent",
    active: true,
    agentId: "",
    labId: "",
    distributorId: "",
    territory: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [provisionResult, setProvisionResult] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setProvisionResult(null);
    try {
      const agentId =
        form.role === "agent"
          ? form.agentId || suggestAgentId(form.displayName)
          : undefined;
      const res = await provisionPlatformUserWrite({
        tenantId,
        ...form,
        agentId,
      });
      if (!res?.success) throw new Error(res?.error || "Failed to provision user");
      setProvisionResult(res.data);
      onSaved?.(res.data);
    } catch (err) {
      setError(err?.message || "Failed to provision user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title="Create User" onClose={onClose} wide>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-2 text-sm">
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        {provisionResult ? (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-900">
            <p className="font-medium">User provisioned successfully.</p>
            {provisionResult.loginEnabled && provisionResult.temporaryPassword ? (
              <p className="mt-1">
                Temporary password (share securely):{" "}
                <span className="font-mono">{provisionResult.temporaryPassword}</span>
              </p>
            ) : null}
            {provisionResult.loginEnabled === false ? (
              <p className="mt-1 text-amber-800">
                Distributor Admin — directory only. Login is blocked by design.
              </p>
            ) : null}
            <Button type="button" size="sm" className="mt-2" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <label className="block text-xs text-slate-600">
              Full name *
              <Input
                className="mt-1"
                value={form.displayName}
                onChange={(e) => setForm((p) => ({ ...p, displayName: e.target.value }))}
                required
              />
            </label>
            <label className="block text-xs text-slate-600">
              Email *
              <Input
                className="mt-1"
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    email: e.target.value,
                    username: p.username || e.target.value.split("@")[0],
                  }))
                }
                required
              />
            </label>
            <label className="block text-xs text-slate-600">
              Username *
              <Input
                className="mt-1 font-mono text-xs"
                value={form.username}
                onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                required
              />
            </label>
            <label className="block text-xs text-slate-600">
              Phone
              <Input
                className="mt-1"
                value={form.phone}
                onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
              />
            </label>
            <label className="block text-xs text-slate-600">
              Role *
              <select
                className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                value={form.role}
                onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
              >
                {PLATFORM_ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            {form.role === "agent" ? (
              <>
                <label className="block text-xs text-slate-600">
                  Agent ID
                  <Input
                    className="mt-1 font-mono text-xs"
                    value={form.agentId}
                    onChange={(e) => setForm((p) => ({ ...p, agentId: e.target.value }))}
                    placeholder={suggestAgentId(form.displayName || "agent")}
                  />
                </label>
                <label className="block text-xs text-slate-600">
                  Territory
                  <select
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    value={form.territory}
                    onChange={(e) => setForm((p) => ({ ...p, territory: e.target.value }))}
                  >
                    <option value="">Select territory…</option>
                    {territories.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            {form.role === "lab" ? (
              <label className="block text-xs text-slate-600">
                Lab ID *
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={form.labId}
                  onChange={(e) => setForm((p) => ({ ...p, labId: e.target.value }))}
                  required
                >
                  <option value="">Select lab…</option>
                  {labAssignments.map((lab) => (
                    <option key={`${lab.tenantId}-${lab.labId}`} value={lab.labId}>
                      {lab.labName} ({lab.labId})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {form.role === ROLES.DISTRIBUTOR_ADMIN ? (
              <label className="block text-xs text-slate-600">
                Assigned distributor *
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  value={form.distributorId}
                  onChange={(e) => setForm((p) => ({ ...p, distributorId: e.target.value }))}
                  required
                >
                  <option value="">Select distributor…</option>
                  {distributors.map((d) => (
                    <option key={d.distributorId} value={d.distributorId}>
                      {d.distributorName}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px] text-amber-700">
                  Directory-only role — login blocked until Phase 2.
                </span>
              </label>
            ) : null}
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={form.active}
                onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
              />
              Active
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Provisioning…" : "Provision User"}
              </Button>
            </div>
          </>
        )}
      </form>
    </ModalShell>
  );
}

function ResetPasswordResultModal({ result, onClose }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(result.temporaryPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <ModalShell title={`Password reset — ${result.displayName || result.email}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Shown once. Copy now. This password will not be shown again after you close this dialog.
        </p>
        {result.email ? (
          <p className="text-xs text-slate-600">
            Login email: <span className="font-medium text-slate-900">{result.email}</span>
          </p>
        ) : null}
        <div className="rounded-md border bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Temporary password</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 break-all font-mono text-sm text-slate-900">
              {result.temporaryPassword}
            </code>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleCopy()}>
              <Copy className="mr-1 h-3.5 w-3.5" />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
        <div className="flex justify-end pt-1">
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

function DeactivateUserModal({ user, onClose, onSaved }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await deactivatePlatformUserWrite(user.userId, reason);
      if (!res?.success) throw new Error(res?.error || "Failed to deactivate");
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || "Failed to deactivate");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Deactivate — ${user.name}`} onClose={onClose}>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-2 text-sm">
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          This user will lose login access immediately. They cannot sign in until reactivated. No
          data is deleted.
        </p>
        <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <p>
            User: <span className="font-medium">{user.name}</span>
          </p>
          <p>Role: {platformRoleLabel(user.role)}</p>
          {user.email ? <p>Email: {user.email}</p> : null}
        </div>
        <label className="block text-xs text-slate-600">
          Reason *
          <Input
            className="mt-1"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Left organization"
            required
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" disabled={saving || !reason.trim()}>
            {saving ? "Deactivating…" : "Deactivate"}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

function TransferLabModal({ lab, agents, hqTenantId, onClose, onSaved }) {
  const [toAgentId, setToAgentId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedAgent = agents.find((a) => a.agentId === toAgentId);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await transferLabAssignmentWrite({
        hqTenantId,
        labTenantId: lab.tenantId,
        labId: lab.labId,
        fromAgentId: lab.assignedAgentId,
        fromAgentName: lab.assignedAgentName,
        toAgentId,
        toAgentName: selectedAgent?.name || "",
        reason,
        subjectUserId: selectedAgent?.userId,
      });
      if (!res?.success) throw new Error(res?.error || "Transfer failed");
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || "Transfer failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Transfer Lab — ${lab.labName}`} onClose={onClose}>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-2 text-sm">
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Ownership will move immediately. The previous agent loses access to this lab. Transfer is
          recorded in lab assignment history.
        </p>
        <div className="rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
          <p>
            Lab: <span className="font-mono">{lab.labId}</span> — {lab.labName}
          </p>
          <p>
            From agent:{" "}
            <span className="font-medium">
              {lab.assignedAgentName || lab.assignedAgentId || "Unassigned"}
            </span>
          </p>
          <p>
            To agent:{" "}
            <span className="font-medium">
              {selectedAgent
                ? `${selectedAgent.name} (${selectedAgent.agentId})`
                : "Select below"}
            </span>
          </p>
        </div>
        <label className="block text-xs text-slate-600">
          New owner *
          <select
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            value={toAgentId}
            onChange={(e) => setToAgentId(e.target.value)}
            required
          >
            <option value="">Select agent…</option>
            {agents
              .filter((a) => a.active && a.agentId !== lab.assignedAgentId)
              .map((a) => (
                <option key={a.id} value={a.agentId}>
                  {a.name} ({a.agentId})
                </option>
              ))}
          </select>
        </label>
        <label className="block text-xs text-slate-600">
          Reason *
          <Input
            className="mt-1"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Territory realignment"
            required
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !toAgentId || !reason.trim()}>
            {saving ? "Transferring…" : "Transfer Lab"}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

function UserAssignmentDrawer({
  user,
  agents,
  labAssignments,
  distributors,
  tenantId,
  onClose,
  onSaved,
  onRequestConfirm,
}) {
  const [role, setRole] = useState(user?.role || "agent");
  const agentLabs = isAgentRole(role) ? labsForAgent(user, labAssignments) : [];
  const agentDists = isAgentRole(role) ? distributorsForAgent(user, distributors) : [];
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [labSearch, setLabSearch] = useState("");
  const [selectedLabKeys, setSelectedLabKeys] = useState(() => new Set());
  const [territory, setTerritory] = useState(user?.territory === "—" ? "" : user?.territory || "");
  const [labId, setLabId] = useState(user?.labId || "");
  const [distributorId, setDistributorId] = useState(user?.distributorId || "");

  const agentBusinessId = String(user?.agentId ?? "").trim();
  const agentDisplayName = String(user?.displayName ?? user?.name ?? "").trim();
  const initialTerritory = user?.territory === "—" ? "" : user?.territory || "";
  const initialRole = user?.role || "agent";
  const initialDistributorId = String(user?.distributorId ?? "").trim();
  const initialAssignedKeysRef = useRef(new Set());

  useEffect(() => {
    const keys = agentLabs.map((lab) => labAssignmentKey(lab));
    initialAssignedKeysRef.current = new Set(keys);
    setSelectedLabKeys(new Set(keys));
    setLabSearch("");
    setError("");
    setRole(user?.role || "agent");
    setTerritory(user?.territory === "—" ? "" : user?.territory || "");
    setLabId(user?.labId || "");
    setDistributorId(user?.distributorId || "");
  }, [user?.userId, user?.agentId, labAssignments, user?.role, user?.territory, user?.labId, user?.distributorId]);

  const filteredLabs = useMemo(() => {
    const q = labSearch.trim().toLowerCase();
    if (!q) return labAssignments;
    return labAssignments.filter((lab) =>
      matchesSearch(q, [lab.labName, lab.labId, lab.tenantName, lab.assignedAgentName])
    );
  }, [labAssignments, labSearch]);

  function labOwnedByOtherAgent(lab) {
    const assignedId = String(lab?.assignedAgentId ?? "").trim().toLowerCase();
    if (!assignedId) return false;
    const mine = [user?.userId, user?.agentId, user?.id]
      .map((v) => String(v ?? "").trim().toLowerCase())
      .filter(Boolean);
    return !mine.includes(assignedId);
  }

  function toggleLabSelection(lab) {
    const key = labAssignmentKey(lab);
    const isChecked = selectedLabKeys.has(key);
    if (isChecked && initialAssignedKeysRef.current.has(key)) {
      onRequestConfirm?.({
        title: `Unassign lab — ${lab.labName}`,
        consequence: `${user.name} will lose access to this lab. Field operations for this lab may be affected until it is reassigned.`,
        details: `Lab: ${lab.labName} (${lab.labId})\nAgent: ${user.name}`,
        requireReason: true,
        reasonLabel: "Reason for unassign",
        confirmLabel: "Unassign lab",
        destructive: true,
        onCancel: () => {},
        onExecute: async () => {
          setSelectedLabKeys((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        },
      });
      return;
    }
    setSelectedLabKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function executeAgentAssignments() {
    if (!agentBusinessId) {
      throw new Error("Agent ID is required on the profile before assigning labs");
    }

    let labChanges = 0;
    const initialAssignedKeys = initialAssignedKeysRef.current;
    for (const lab of labAssignments) {
      const key = labAssignmentKey(lab);
      const wasMine = initialAssignedKeys.has(key);
      const nowMine = selectedLabKeys.has(key);
      if (wasMine === nowMine) continue;

      if (nowMine) {
        const res = await updateLabAgentAssignmentWrite({
          tenantId: lab.tenantId,
          labId: lab.labId,
          agentId: agentBusinessId,
          agentName: agentDisplayName,
        });
        if (!res?.success) {
          throw new Error(res?.error || `Failed to assign ${lab.labId}`);
        }
      } else {
        const res = await updateLabAgentAssignmentWrite({
          tenantId: lab.tenantId,
          labId: lab.labId,
          remove: true,
        });
        if (!res?.success) {
          throw new Error(res?.error || `Failed to unassign ${lab.labId}`);
        }
      }
      labChanges += 1;
    }

    const territoryChanged = territory !== initialTerritory;
    const roleChanged = role !== initialRole;
    if (territoryChanged || roleChanged) {
      const res = await updateOperationsPlatformUserWrite(user.userId, {
        tenantId,
        displayName: user.displayName || user.name,
        role,
        territory,
        agentId: user.agentId,
      });
      if (!res?.success) throw new Error(res?.error || "Failed to update profile");
    }

    return {
      assignedCount: selectedLabKeys.size,
      labChanges,
      territoryChanged,
      roleChanged,
    };
  }

  function requestSaveAgentAssignments() {
    setError("");
    const diff = computeAgentLabAssignmentDiff(
      labAssignments,
      initialAssignedKeysRef.current,
      selectedLabKeys,
      user
    );
    const territoryChanged = territory !== initialTerritory;
    const roleChanged = role !== initialRole;

    if (diff.labChanges === 0 && !territoryChanged && !roleChanged) {
      setError("No assignment changes to save");
      return;
    }

    const detailParts = [];
    if (diff.assigns.length) {
      detailParts.push(`Assign ${diff.assigns.length} lab(s):\n${formatLabList(diff.assigns)}`);
    }
    if (diff.unassigns.length) {
      detailParts.push(`Unassign ${diff.unassigns.length} lab(s):\n${formatLabList(diff.unassigns)}`);
    }
    if (roleChanged) {
      detailParts.push(
        `Role: ${platformRoleLabel(initialRole)} → ${platformRoleLabel(role)}`
      );
    }
    if (territoryChanged) {
      detailParts.push(`Territory: ${initialTerritory || "—"} → ${territory || "—"}`);
    }

    const requireReason =
      diff.unassigns.length > 0 ||
      diff.assigns.length > 1 ||
      diff.reassignCount > 0;

    onRequestConfirm?.({
      title: `Save assignments — ${user.name}`,
      consequence:
        diff.labChanges > 0
          ? `${diff.labChanges} lab assignment change(s) will apply immediately. Agents and field operations may be affected.`
          : "Profile scope changes will apply immediately.",
      details: detailParts.join("\n\n"),
      requireReason,
      reasonLabel: "Reason for assignment change",
      confirmLabel: "Save assignments",
      onCancel: () => {
        setSelectedLabKeys(new Set(initialAssignedKeysRef.current));
        setRole(initialRole);
        setTerritory(initialTerritory);
      },
      onExecute: async () => {
        setSaving(true);
        try {
          const result = await executeAgentAssignments();
          onSaved?.(result);
        } finally {
          setSaving(false);
        }
      },
    });
  }

  async function executeProfileScope() {
    const distributorChanged = distributorId !== initialDistributorId;
    const roleChanged = role !== initialRole;
    const labIdChanged = labId !== String(user?.labId ?? "").trim();

    const res = await updateOperationsPlatformUserWrite(user.userId, {
      tenantId,
      displayName: user.displayName || user.name,
      role,
      territory,
      labId,
      distributorId,
      agentId: user.agentId,
    });
    if (!res?.success) throw new Error(res?.error || "Failed to update");

    return { assignedCount: 0, labChanges: 0, territoryChanged: false, roleChanged, distributorChanged, labIdChanged };
  }

  function requestSaveProfileScope() {
    setError("");
    const distributorChanged = distributorId !== initialDistributorId;
    const roleChanged = role !== initialRole;
    const labIdChanged = labId !== String(user?.labId ?? "").trim();
    const removingDistributor = Boolean(initialDistributorId) && !distributorId;

    if (!distributorChanged && !roleChanged && !labIdChanged) {
      setError("No scope changes to save");
      return;
    }

    const distributorName =
      distributors.find((d) => d.distributorId === distributorId)?.distributorName || distributorId;
    const initialDistributorName =
      distributors.find((d) => d.distributorId === initialDistributorId)?.distributorName ||
      initialDistributorId ||
      "—";

    let title = `Save scope — ${user.name}`;
    let consequence = "Profile scope will update immediately.";
    let confirmLabel = "Save scope";
    const detailParts = [];

    if (roleChanged) {
      detailParts.push(`Role: ${platformRoleLabel(initialRole)} → ${platformRoleLabel(role)}`);
      consequence = "Role change may affect login permissions and menu access immediately.";
      title = `Change role — ${user.name}`;
      confirmLabel = "Change role";
    }
    if (removingDistributor) {
      detailParts.push(`Remove distributor: ${initialDistributorName}`);
      consequence =
        "Distributor Admin will lose scoped distributor access in the directory until reassigned.";
      title = `Remove distributor — ${user.name}`;
      confirmLabel = "Remove distributor";
    } else if (distributorChanged && role === ROLES.DISTRIBUTOR_ADMIN) {
      detailParts.push(
        `Distributor: ${initialDistributorName} → ${distributorName || "—"}`
      );
      consequence = "Distributor Admin scope will change immediately.";
      title = `Change distributor — ${user.name}`;
      confirmLabel = "Change distributor";
    }
    if (labIdChanged) {
      detailParts.push(`Lab ID: ${user.labId || "—"} → ${labId || "—"}`);
    }

    onRequestConfirm?.({
      title,
      consequence,
      details: detailParts.join("\n") || undefined,
      requireReason: false,
      confirmLabel,
      destructive: removingDistributor,
      onExecute: async () => {
        setSaving(true);
        try {
          const result = await executeProfileScope();
          onSaved?.(result);
        } finally {
          setSaving(false);
        }
      },
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="h-full w-full max-w-lg overflow-y-auto border-l bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold">Assignments — {user.name}</h3>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}

        <label className="mb-3 block text-xs text-slate-600">
          Role
          <select
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {PLATFORM_ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {isAgentRole(role) ? (
          <div className="space-y-4 text-xs">
            <div>
              <p className="font-medium text-slate-700">
                Assigned Labs ({selectedLabKeys.size} selected)
              </p>
              <ul className="mt-1 list-inside list-disc text-slate-600">
                {selectedLabKeys.size === 0 ? (
                  <li className="list-none text-slate-400">No labs assigned</li>
                ) : (
                  labAssignments
                    .filter((lab) => selectedLabKeys.has(labAssignmentKey(lab)))
                    .map((lab) => (
                      <li key={labAssignmentKey(lab)}>
                        {lab.labName} ({lab.labId})
                      </li>
                    ))
                )}
              </ul>
            </div>

            <div>
              <p className="font-medium text-slate-700">Assign labs to this agent</p>
              {!agentBusinessId ? (
                <p className="mt-1 text-amber-700">
                  Agent ID is missing on this profile. Set Agent ID before assigning labs.
                </p>
              ) : null}
              {labAssignments.length === 0 ? (
                <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                  No labs visible to assign. Check HQ tenant/RLS or use Executive.
                </p>
              ) : (
                <>
                  <div className="mt-2">
                    <SearchInput
                      value={labSearch}
                      onChange={setLabSearch}
                      placeholder="Search labs…"
                    />
                  </div>
                  <div className="mt-2 max-h-56 overflow-y-auto rounded-md border border-slate-200">
                    {filteredLabs.length === 0 ? (
                      <p className="px-3 py-4 text-center text-slate-500">No labs match your search.</p>
                    ) : (
                      <ul className="divide-y divide-slate-100">
                        {filteredLabs.map((lab) => {
                          const key = labAssignmentKey(lab);
                          const checked = selectedLabKeys.has(key);
                          const otherOwner = checked ? false : labOwnedByOtherAgent(lab);
                          return (
                            <li key={key} className="px-3 py-2">
                              <label className="flex cursor-pointer items-start gap-2">
                                <input
                                  type="checkbox"
                                  className="mt-0.5"
                                  checked={checked}
                                  disabled={!agentBusinessId || saving}
                                  onChange={() => toggleLabSelection(lab)}
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="font-medium text-slate-900">{lab.labName}</span>{" "}
                                  <span className="font-mono text-[10px] text-slate-500">{lab.labId}</span>
                                  <span className="mt-0.5 block text-[10px] text-slate-500">
                                    {lab.tenantName || lab.tenantId}
                                    {otherOwner && lab.assignedAgentName
                                      ? ` · assigned to ${lab.assignedAgentName}`
                                      : otherOwner && lab.assignedAgentId
                                        ? ` · assigned to ${lab.assignedAgentId}`
                                        : ""}
                                  </span>
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>

            <div>
              <p className="font-medium text-slate-700">Assigned Distributor</p>
              <p className="text-slate-600">
                {agentDists[0]?.distributorName || user.distributorName || "—"}
              </p>
            </div>
            <label className="block text-slate-600">
              Territory
              <Input className="mt-1" value={territory} onChange={(e) => setTerritory(e.target.value)} />
            </label>

            <Button
              type="button"
              size="sm"
              className="w-full"
              disabled={saving || !agentBusinessId}
              onClick={() => requestSaveAgentAssignments()}
            >
              {saving ? "Saving…" : "Save assignments"}
            </Button>
          </div>
        ) : null}

        {role === ROLES.LAB ? (
          <label className="block text-xs text-slate-600">
            Assigned Lab
            <Input className="mt-1 font-mono" value={labId} onChange={(e) => setLabId(e.target.value)} />
          </label>
        ) : null}

        {role === ROLES.DISTRIBUTOR_ADMIN ? (
          <label className="block text-xs text-slate-600">
            Assigned Distributor
            <select
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={distributorId}
              onChange={(e) => setDistributorId(e.target.value)}
            >
              <option value="">None (remove assignment)</option>
              {distributors.map((d) => (
                <option key={d.distributorId} value={d.distributorId}>
                  {d.distributorName}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {role === ROLES.LAB || role === ROLES.DISTRIBUTOR_ADMIN ? (
          <Button
            type="button"
            size="sm"
            className="mt-4"
            disabled={saving}
            onClick={() => requestSaveProfileScope()}
          >
            {saving ? "Saving…" : "Save scope"}
          </Button>
        ) : null}

        {!isAgentRole(role) && role !== ROLES.LAB && role !== ROLES.DISTRIBUTOR_ADMIN ? (
          <div className="space-y-3 text-xs">
            <p className="text-slate-500">HQ roles have full tenant access — no lab assignments.</p>
            {role !== initialRole ? (
              <Button
                type="button"
                size="sm"
                disabled={saving}
                onClick={() => requestSaveProfileScope()}
              >
                {saving ? "Saving…" : "Save role"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LabAssignmentModal({ lab, agents, onClose, onSaved, onRequestConfirm }) {
  const labTenantId = lab?.tenantId || "";
  const [agentId, setAgentId] = useState(lab?.assignedAgentId || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedAgent = agents.find((a) => a.agentId === agentId);
  const previousAgentName = lab?.assignedAgentName || lab?.assignedAgentId || "Unassigned";

  async function executeAssign() {
    const res = await updateLabAgentAssignmentWrite({
      tenantId: labTenantId,
      labId: lab.labId,
      agentId,
      agentName: selectedAgent?.name || "",
    });
    if (!res?.success) throw new Error(res?.error || "Failed to assign agent");
    onSaved?.();
    onClose?.();
  }

  function handleAssign(e) {
    e.preventDefault();
    setError("");
    if (!agentId) return;

    const isReassignment = Boolean(lab?.assignedAgentId) && lab.assignedAgentId !== agentId;
    onRequestConfirm?.({
      title: isReassignment ? `Reassign lab — ${lab.labName}` : `Assign lab — ${lab.labName}`,
      consequence: isReassignment
        ? "Lab ownership will change immediately. The previous agent loses access to this lab."
        : "This lab will be assigned to the selected agent immediately.",
      details: `Lab: ${lab.labName} (${lab.labId})\n${
        isReassignment
          ? `From: ${previousAgentName}\nTo: ${selectedAgent?.name} (${selectedAgent?.agentId})`
          : `Agent: ${selectedAgent?.name} (${selectedAgent?.agentId})`
      }`,
      requireReason: isReassignment,
      reasonLabel: "Reason for reassignment",
      confirmLabel: isReassignment ? "Reassign lab" : "Assign lab",
      onExecute: async () => {
        setSaving(true);
        try {
          await executeAssign();
        } finally {
          setSaving(false);
        }
      },
    });
  }

  return (
    <ModalShell title={`Assign agent — ${lab.labName}`} onClose={onClose}>
      <form onSubmit={handleAssign} className="space-y-2 text-sm">
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        <select
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          required
        >
          <option value="">Select agent…</option>
          {agents
            .filter((a) => a.active)
            .map((a) => (
              <option key={a.id} value={a.agentId}>
                {a.name} ({a.agentId})
              </option>
            ))}
        </select>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !agentId}>
            {saving ? "Saving…" : "Continue"}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

function DistributorAssignmentModal({ distributor, agents, tenantId, onClose, onSaved, onRequestConfirm }) {
  const profileAgents = agents.filter((a) => a.userId);
  const [agentUserId, setAgentUserId] = useState(distributor?.assignedAgentUserId || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedAgent = profileAgents.find((a) => a.userId === agentUserId);
  const initialAgentUserId = distributor?.assignedAgentUserId || "";
  const initialAgentName = distributor?.assignedAgentName || "—";

  async function executeAssign(remove = false) {
    const res = await updateDistributorAgentAssignmentWrite({
      tenantId,
      distributorId: distributor.distributorId,
      agentUserId: remove ? "" : agentUserId,
      agentName: remove ? "" : selectedAgent?.name || "",
      remove,
    });
    if (!res?.success) throw new Error(res?.error || "Failed to update distributor assignment");
    onSaved?.();
    onClose?.();
  }

  function handleAssign(e) {
    e.preventDefault();
    setError("");

    const removing = Boolean(initialAgentUserId) && !agentUserId;
    const changing = Boolean(agentUserId) && agentUserId !== initialAgentUserId;

    if (!removing && !changing) {
      setError("No assignment change selected");
      return;
    }

    if (removing) {
      onRequestConfirm?.({
        title: `Remove distributor agent — ${distributor.distributorName}`,
        consequence:
          "The agent will lose distributor scope in HQ directory. This does not delete the agent account.",
        details: `Distributor: ${distributor.distributorName}\nCurrent agent: ${initialAgentName}`,
        confirmLabel: "Remove assignment",
        destructive: true,
        onExecute: async () => {
          setSaving(true);
          try {
            await executeAssign(true);
          } finally {
            setSaving(false);
          }
        },
      });
      return;
    }

    onRequestConfirm?.({
      title: `Assign distributor — ${distributor.distributorName}`,
      consequence: "Distributor agent assignment will update immediately for HQ operations.",
      details: `Distributor: ${distributor.distributorName}\n${
        initialAgentUserId
          ? `From: ${initialAgentName}\nTo: ${selectedAgent?.name} (${selectedAgent?.agentId})`
          : `Agent: ${selectedAgent?.name} (${selectedAgent?.agentId})`
      }`,
      confirmLabel: initialAgentUserId ? "Change assignment" : "Assign agent",
      onExecute: async () => {
        setSaving(true);
        try {
          await executeAssign(false);
        } finally {
          setSaving(false);
        }
      },
    });
  }

  return (
    <ModalShell title={`Assign agent — ${distributor.distributorName}`} onClose={onClose}>
      <form onSubmit={handleAssign} className="space-y-2 text-sm">
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        <select
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          value={agentUserId}
          onChange={(e) => setAgentUserId(e.target.value)}
        >
          <option value="">None (remove assignment)</option>
          {profileAgents
            .filter((a) => a.active)
            .map((a) => (
              <option key={a.userId} value={a.userId}>
                {a.name} ({a.agentId})
              </option>
            ))}
        </select>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Continue"}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

export default function UserProvisioningPanel({
  tenantId,
  bundle,
  loading,
  error,
  statusMessage,
  onReload,
  onError,
  onStatus,
}) {
  const [tab, setTab] = useState("directory");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [busyId, setBusyId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [deactivateUser, setDeactivateUser] = useState(null);
  const [assignmentUser, setAssignmentUser] = useState(null);
  const [transferLab, setTransferLab] = useState(null);
  const [labModal, setLabModal] = useState(null);
  const [distributorModal, setDistributorModal] = useState(null);
  const [resetPasswordResult, setResetPasswordResult] = useState(null);
  const [resettingUserId, setResettingUserId] = useState("");
  const [confirmDialog, setConfirmDialog] = useState(null);

  const agents = bundle?.agents || [];
  const directoryUsers = bundle?.directoryUsers || [];
  const labAssignments = bundle?.labAssignments || [];
  const distributorAssignments = bundle?.distributorAssignments || [];
  const auditEvents = bundle?.auditEvents || [];
  const kpis = bundle?.kpis || {};

  const filteredUsers = useMemo(() => {
    const filtered = filterDirectoryUsers(directoryUsers, {
      search,
      role: roleFilter,
      status: statusFilter,
    });
    return sortDirectoryUsers(filtered, sortKey, sortDir);
  }, [directoryUsers, search, roleFilter, statusFilter, sortKey, sortDir]);

  const filteredLabs = labAssignments;
  const filteredDistributors = distributorAssignments;

  function requestConfirm(config) {
    setConfirmDialog({
      ...config,
      onClose: () => {
        config.onCancel?.();
        setConfirmDialog(null);
      },
    });
  }

  async function executeReactivate(user) {
    setBusyId(user.userId);
    try {
      const res = await reactivatePlatformUserWrite(user.userId, "Reactivated by HQ Admin");
      if (!res?.success) throw new Error(res?.error);
      onStatus?.(`${user.name} reactivated`);
      await onReload?.();
    } catch (err) {
      onError?.(err?.message || "Failed to reactivate");
      throw err;
    } finally {
      setBusyId("");
    }
  }

  function promptReactivate(user) {
    requestConfirm({
      title: `Reactivate — ${user.name}`,
      consequence: "This user will regain login access immediately.",
      details: `User: ${user.name}\nRole: ${user.roleLabel || platformRoleLabel(user.role)}${
        user.email ? `\nEmail: ${user.email}` : ""
      }`,
      confirmLabel: "Reactivate",
      onExecute: async () => executeReactivate(user),
    });
  }

  async function executeResetPassword(user) {
    setResettingUserId(user.userId);
    try {
      const res = await resetPlatformUserPasswordWrite({
        tenantId,
        subjectUserId: user.userId,
        email: String(user?.storedEmail ?? user?.email ?? "").trim() || undefined,
      });
      if (!res?.success) throw new Error(res?.error || "Failed to reset password");

      const temporaryPassword = String(res.data?.temporaryPassword ?? "").trim();
      if (!temporaryPassword) {
        throw new Error("Password reset succeeded but no temporary password was returned");
      }

      setResetPasswordResult({
        displayName: res.data?.displayName || user.name,
        email: res.data?.email || user.storedEmail || user.email,
        temporaryPassword,
      });
      onStatus?.(`Temporary password set for ${user.name}`);
    } catch (err) {
      onError?.(err?.message || "Failed to reset password");
      throw err;
    } finally {
      setResettingUserId("");
    }
  }

  function promptResetPassword(user) {
    requestConfirm({
      title: `Reset password — ${user.name}`,
      consequence:
        "A new temporary password will be generated and shown once. The user's current password will stop working immediately.",
      details: `User: ${user.name}${user.email ? `\nEmail: ${user.email}` : ""}`,
      confirmLabel: "Reset password",
      destructive: true,
      onExecute: async () => executeResetPassword(user),
    });
  }

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  if (loading) return null;

  return (
    <>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Users", kpis.totalUsers],
          ["Active Users", kpis.activeUsers],
          ["Agents", kpis.agents],
          ["Labs Assigned", kpis.labsAssigned],
          ["Inactive Users", kpis.inactiveUsers],
          ["Unassigned Labs", kpis.unassignedLabs],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border bg-white p-2">
            <p className="text-slate-500">{label}</p>
            <p className="text-lg font-bold tabular-nums">{value ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-1">
        {OPERATIONS_CENTER_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === t.id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? <p className="text-xs text-amber-700">{error}</p> : null}
      {statusMessage ? <p className="text-xs text-green-700">{statusMessage}</p> : null}

      {tab === "directory" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Search users…" />
            <select
              className="h-8 rounded-md border border-slate-200 px-2 text-xs"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
            >
              <option value="">All roles</option>
              {PLATFORM_ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              className="h-8 rounded-md border border-slate-200 px-2 text-xs"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <Button type="button" size="sm" className="gap-1" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create User
            </Button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[1000px] text-xs">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-slate-500">
                  {[
                    ["name", "Name"],
                    ["email", "Email"],
                    ["role", "Role"],
                    ["distributor", "Distributor"],
                    ["territory", "Territory"],
                    ["labs", "Assigned Labs"],
                    ["status", "Status"],
                    ["lastLogin", "Last Login"],
                    ["created", "Created"],
                    ["actions", "Actions"],
                  ].map(([key, label]) => (
                    <th key={key} className="px-2 py-2">
                      {["name", "role", "status", "labs", "created"].includes(key) ? (
                        <button
                          type="button"
                          className="font-medium hover:text-slate-800"
                          onClick={() => toggleSort(key === "email" ? "name" : key)}
                        >
                          {label}
                          {sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </button>
                      ) : (
                        label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-2 py-6 text-center text-slate-500">
                      No users match your filters.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.userId} className="border-b border-slate-100">
                      <td className="px-2 py-2 font-medium text-slate-900">
                        {user.displayName || user.name}
                        {!user.loginEnabled ? (
                          <span className="ml-1 text-[10px] text-amber-700">(no login)</span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2">{user.email || EMAIL_NOT_ADDED}</td>
                      <td className="px-2 py-2">{user.roleLabel}</td>
                      <td className="px-2 py-2">{user.distributorName}</td>
                      <td className="px-2 py-2">{user.territory}</td>
                      <td className="px-2 py-2 tabular-nums">{user.assignedLabsCount ?? 0}</td>
                      <td className="px-2 py-2">
                        <StatusBadge active={user.active} />
                      </td>
                      <td className="px-2 py-2 text-slate-400">{user.lastLogin}</td>
                      <td className="px-2 py-2">{formatOpsDate(user.createdAt)}</td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-[10px]"
                            onClick={() => setAssignmentUser(user)}
                          >
                            Assign
                          </Button>
                          {user.active ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[10px] text-red-700"
                              disabled={busyId === user.userId}
                              onClick={() => setDeactivateUser(user)}
                            >
                              Deactivate
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[10px]"
                              disabled={busyId === user.userId}
                              onClick={() => promptReactivate(user)}
                            >
                              Reactivate
                            </Button>
                          )}
                          {isAgentRole(user.role) ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[10px]"
                              onClick={() => {
                                const firstLab = labsForAgent(user, labAssignments)[0];
                                if (firstLab) setTransferLab(firstLab);
                                else onError?.("Assign a lab first before transfer");
                              }}
                            >
                              Transfer Lab
                            </Button>
                          ) : null}
                          {user.loginEnabled ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[10px]"
                              disabled={resettingUserId === user.userId}
                              onClick={() => promptResetPassword(user)}
                            >
                              {resettingUserId === user.userId ? "Resetting…" : "Reset Pwd"}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {tab === "audit" ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-xs">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-slate-500">
                <th className="px-2 py-2">User</th>
                <th className="px-2 py-2">Event</th>
                <th className="px-2 py-2">Details</th>
                <th className="px-2 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {auditEvents.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-2 py-6 text-center text-slate-500">
                    No audit events yet. Apply user_provisioning_v1_migration.sql if missing.
                  </td>
                </tr>
              ) : (
                auditEvents.map((ev) => (
                  <tr key={ev.id} className="border-b border-slate-100">
                    <td className="px-2 py-2">{ev.subjectName}</td>
                    <td className="px-2 py-2 capitalize">{ev.eventType.replace(/_/g, " ")}</td>
                    <td className="px-2 py-2 font-mono text-[10px] text-slate-600">
                      {JSON.stringify(ev.payload)}
                    </td>
                    <td className="px-2 py-2">{formatOpsDate(ev.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "labAssignment" ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[760px] text-xs">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-slate-500">
                <th className="px-2 py-2">Lab</th>
                <th className="px-2 py-2">Distributor</th>
                <th className="px-2 py-2">Agent</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLabs.map((lab) => (
                <tr key={`${lab.tenantId}-${lab.labId}`} className="border-b border-slate-100">
                  <td className="px-2 py-2">
                    {lab.labName}{" "}
                    <span className="font-mono text-[10px] text-slate-500">{lab.labId}</span>
                  </td>
                  <td className="px-2 py-2">{lab.tenantName}</td>
                  <td className="px-2 py-2">{lab.assignedAgentName || "—"}</td>
                  <td className="px-2 py-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[10px]"
                      onClick={() => setLabModal({ lab })}
                    >
                      Assign
                    </Button>
                    {lab.assignedAgentId ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[10px] ml-1"
                        onClick={() => setTransferLab(lab)}
                      >
                        Transfer
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "distributorAssignment" ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-slate-500">
                <th className="px-2 py-2">Distributor</th>
                <th className="px-2 py-2">Agent</th>
                <th className="px-2 py-2">Labs</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDistributors.map((dist) => (
                <tr key={dist.distributorId} className="border-b border-slate-100">
                  <td className="px-2 py-2 font-medium">{dist.distributorName}</td>
                  <td className="px-2 py-2">{dist.assignedAgentName || "—"}</td>
                  <td className="px-2 py-2 tabular-nums">{dist.labCount}</td>
                  <td className="px-2 py-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-[10px]"
                      onClick={() => setDistributorModal({ distributor: dist })}
                    >
                      Assign
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {confirmDialog ? (
        <ConfirmActionModal
          title={confirmDialog.title}
          consequence={confirmDialog.consequence}
          details={confirmDialog.details}
          requireReason={confirmDialog.requireReason}
          reasonLabel={confirmDialog.reasonLabel}
          reasonPlaceholder={confirmDialog.reasonPlaceholder}
          confirmLabel={confirmDialog.confirmLabel}
          destructive={confirmDialog.destructive}
          onConfirm={confirmDialog.onExecute}
          onClose={confirmDialog.onClose}
        />
      ) : null}

      {createOpen ? (
        <CreateUserDrawer
          tenantId={tenantId}
          distributors={distributorAssignments}
          labAssignments={labAssignments}
          onClose={() => setCreateOpen(false)}
          onSaved={async () => {
            onStatus?.("User provisioned");
            setCreateOpen(false);
            await onReload?.();
          }}
        />
      ) : null}

      {resetPasswordResult ? (
        <ResetPasswordResultModal
          result={resetPasswordResult}
          onClose={() => {
            setResetPasswordResult(null);
            void onReload?.();
          }}
        />
      ) : null}

      {deactivateUser ? (
        <DeactivateUserModal
          user={deactivateUser}
          onClose={() => setDeactivateUser(null)}
          onSaved={async () => {
            onStatus?.(`${deactivateUser.name} deactivated`);
            setDeactivateUser(null);
            await onReload?.();
          }}
        />
      ) : null}

      {assignmentUser ? (
        <UserAssignmentDrawer
          user={assignmentUser}
          agents={agents}
          labAssignments={labAssignments}
          distributors={distributorAssignments}
          tenantId={tenantId}
          onClose={() => setAssignmentUser(null)}
          onRequestConfirm={requestConfirm}
          onSaved={async (result) => {
            const assignedCount = result?.assignedCount ?? 0;
            const labChanges = result?.labChanges ?? 0;
            if (labChanges > 0) {
              onStatus?.(
                `Saved ${labChanges} lab assignment change(s). Agent now has ${assignedCount} lab(s) assigned.`
              );
            } else if (result?.territoryChanged) {
              onStatus?.(`Territory updated. Agent has ${assignedCount} lab(s) assigned.`);
            } else {
              onStatus?.("Assignments updated");
            }
            setAssignmentUser(null);
            await onReload?.();
          }}
        />
      ) : null}

      {transferLab ? (
        <TransferLabModal
          lab={transferLab}
          agents={agents}
          hqTenantId={tenantId}
          onClose={() => setTransferLab(null)}
          onSaved={async () => {
            onStatus?.("Lab transferred");
            setTransferLab(null);
            await onReload?.();
          }}
        />
      ) : null}

      {labModal ? (
        <LabAssignmentModal
          lab={labModal.lab}
          agents={agents}
          onClose={() => setLabModal(null)}
          onRequestConfirm={requestConfirm}
          onSaved={async () => {
            onStatus?.("Lab assignment updated");
            setLabModal(null);
            await onReload?.();
          }}
        />
      ) : null}

      {distributorModal ? (
        <DistributorAssignmentModal
          distributor={distributorModal.distributor}
          agents={agents}
          tenantId={tenantId}
          onClose={() => setDistributorModal(null)}
          onRequestConfirm={requestConfirm}
          onSaved={async () => {
            onStatus?.("Distributor assignment updated");
            setDistributorModal(null);
            await onReload?.();
          }}
        />
      ) : null}
    </>
  );
}
