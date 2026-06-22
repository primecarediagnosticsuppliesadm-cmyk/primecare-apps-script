import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  transferLabAssignmentWrite,
  updateDistributorAgentAssignmentWrite,
  updateLabAgentAssignmentWrite,
  updateOperationsPlatformUserWrite,
  requestPlatformUserPasswordReset,
} from "@/api/primecareSupabaseApi.js";
import {
  deactivatePlatformUserWrite,
  provisionPlatformUserWrite,
  reactivatePlatformUserWrite,
} from "@/api/userProvisioningApi.js";
import {
  EMAIL_NOT_ADDED,
  OPERATIONS_CENTER_TABS,
  PLATFORM_ROLE_OPTIONS,
  RESET_PASSWORD_EMAIL_MISSING,
  formatOpsDate,
  isAgentRole,
  labsForAgent,
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
import { Plus, Search, X } from "lucide-react";

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
        <p className="text-xs text-slate-600">
          Soft deactivate only. User cannot log in while inactive. No data is deleted.
        </p>
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
        <div className="rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
          <p>
            Lab: <span className="font-mono">{lab.labId}</span>
          </p>
          <p>
            Current owner: {lab.assignedAgentName || lab.assignedAgentId || "Unassigned"}
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
          Reason
          <Input
            className="mt-1"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Optional"
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !toAgentId}>
            {saving ? "Transferring…" : "Transfer Lab"}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

function UserAssignmentDrawer({ user, agents, labAssignments, distributors, tenantId, onClose, onSaved }) {
  const role = user?.role;
  const agentLabs = isAgentRole(role) ? labsForAgent(user, labAssignments) : [];
  const agentDists = isAgentRole(role) ? distributorsForAgent(user, distributors) : [];
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [territory, setTerritory] = useState(user?.territory === "—" ? "" : user?.territory || "");
  const [labId, setLabId] = useState(user?.labId || "");
  const [distributorId, setDistributorId] = useState(user?.distributorId || "");

  async function saveProfileScope() {
    setSaving(true);
    setError("");
    try {
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
      onSaved?.();
    } catch (err) {
      setError(err?.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="h-full w-full max-w-md overflow-y-auto border-l bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold">Assignments — {user.name}</h3>
          <Button type="button" variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}
        <p className="mb-3 text-xs text-slate-500">{platformRoleLabel(role)}</p>

        {isAgentRole(role) ? (
          <div className="space-y-3 text-xs">
            <div>
              <p className="font-medium text-slate-700">Assigned Labs ({agentLabs.length})</p>
              <ul className="mt-1 list-inside list-disc text-slate-600">
                {agentLabs.length === 0 ? (
                  <li className="list-none text-slate-400">No labs assigned</li>
                ) : (
                  agentLabs.map((lab) => (
                    <li key={`${lab.tenantId}-${lab.labId}`}>
                      {lab.labName} ({lab.labId})
                    </li>
                  ))
                )}
              </ul>
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
              <option value="">Select…</option>
              {distributors.map((d) => (
                <option key={d.distributorId} value={d.distributorId}>
                  {d.distributorName}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {(role === ROLES.LAB || role === ROLES.DISTRIBUTOR_ADMIN || isAgentRole(role)) ? (
          <Button
            type="button"
            size="sm"
            className="mt-4"
            disabled={saving}
            onClick={() => void saveProfileScope()}
          >
            {saving ? "Saving…" : "Save scope"}
          </Button>
        ) : (
          <p className="text-xs text-slate-500">HQ roles have full tenant access — no scoped assignments.</p>
        )}
      </div>
    </div>
  );
}

function LabAssignmentModal({ lab, agents, onClose, onSaved }) {
  const labTenantId = lab?.tenantId || "";
  const [agentId, setAgentId] = useState(lab?.assignedAgentId || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedAgent = agents.find((a) => a.agentId === agentId);

  async function handleAssign(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await updateLabAgentAssignmentWrite({
        tenantId: labTenantId,
        labId: lab.labId,
        agentId,
        agentName: selectedAgent?.name || "",
      });
      if (!res?.success) throw new Error(res?.error || "Failed to assign agent");
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || "Failed to assign agent");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Assign agent — ${lab.labName}`} onClose={onClose}>
      <form onSubmit={(e) => void handleAssign(e)} className="space-y-2 text-sm">
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
            {saving ? "Saving…" : "Assign"}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

function DistributorAssignmentModal({ distributor, agents, tenantId, onClose, onSaved }) {
  const profileAgents = agents.filter((a) => a.userId);
  const [agentUserId, setAgentUserId] = useState(distributor?.assignedAgentUserId || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedAgent = profileAgents.find((a) => a.userId === agentUserId);

  async function handleAssign(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await updateDistributorAgentAssignmentWrite({
        tenantId,
        distributorId: distributor.distributorId,
        agentUserId,
        agentName: selectedAgent?.name || "",
      });
      if (!res?.success) throw new Error(res?.error || "Failed to assign agent");
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || "Failed to assign agent");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Assign agent — ${distributor.distributorName}`} onClose={onClose}>
      <form onSubmit={(e) => void handleAssign(e)} className="space-y-2 text-sm">
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        <select
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          value={agentUserId}
          onChange={(e) => setAgentUserId(e.target.value)}
          required
        >
          <option value="">Select agent…</option>
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
          <Button type="submit" disabled={saving || !agentUserId}>
            {saving ? "Saving…" : "Assign"}
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
  const [resettingUserId, setResettingUserId] = useState("");

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

  async function handleReactivate(user) {
    try {
      setBusyId(user.userId);
      const res = await reactivatePlatformUserWrite(user.userId, "Reactivated by HQ Admin");
      if (!res?.success) throw new Error(res?.error);
      onStatus?.(`${user.name} reactivated`);
      await onReload?.();
    } catch (err) {
      onError?.(err?.message || "Failed to reactivate");
    } finally {
      setBusyId("");
    }
  }

  async function handleResetPassword(user) {
    const email = String(user?.storedEmail ?? user?.email ?? "").trim();
    if (!email || user?.hasStoredEmail === false) return;
    try {
      setResettingUserId(user.userId);
      const res = await requestPlatformUserPasswordReset(email);
      if (!res?.success) throw new Error(res?.error || "Failed to send reset link");
      onStatus?.("If this email exists as a Supabase Auth login, a reset link was sent.");
    } catch (err) {
      onError?.(err?.message || "Failed to send reset link");
    } finally {
      setResettingUserId("");
    }
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
                              onClick={() => void handleReactivate(user)}
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
                          {user.loginEnabled && user.hasStoredEmail !== false ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[10px]"
                              disabled={resettingUserId === user.userId}
                              title={user.hasStoredEmail ? undefined : RESET_PASSWORD_EMAIL_MISSING}
                              onClick={() => void handleResetPassword(user)}
                            >
                              Reset Pwd
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
          onSaved={async () => {
            onStatus?.("Assignments updated");
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
