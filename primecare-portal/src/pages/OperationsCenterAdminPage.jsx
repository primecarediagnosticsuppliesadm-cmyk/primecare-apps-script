import React, { useCallback, useEffect, useMemo, useState } from "react";
import { PageSkeleton } from "@/components/ux";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  createOperationsAgentWrite,
  createOperationsPlatformUserWrite,
  setOperationsAgentActiveWrite,
  setOperationsPlatformUserActiveWrite,
  updateLabAgentAssignmentWrite,
  updateOperationsAgentWrite,
  updateOperationsPlatformUserWrite,
  requestPlatformUserPasswordReset,
} from "@/api/primecareSupabaseApi.js";
import { loadOperationsCenterAdminBundle } from "@/operations/operationsCenterAdminData.js";
import {
  OPERATIONS_CENTER_TABS,
  PLATFORM_ROLE_OPTIONS,
  EMAIL_UNAVAILABLE_HINT,
  RESET_PASSWORD_EMAIL_MISSING,
  countActiveAgents,
  formatOpsDate,
  matchesSearch,
  platformRoleLabel,
} from "@/operations/operationsCenterAdminEngine.js";
import { cn } from "@/lib/utils";
import { Plus, Radio, Search, X } from "lucide-react";

function resolveTenantId(currentUser) {
  return String(currentUser?.tenantId || currentUser?.tenant_id || "").trim() || null;
}

function StatusBadge({ active }) {
  return (
    <Badge variant={active ? "default" : "secondary"}>{active ? "Active" : "Inactive"}</Badge>
  );
}

function ModalShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border bg-white p-4 shadow-lg">
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

function AgentFormModal({ mode, initial, tenantId, onClose, onSaved }) {
  const isEdit = mode === "edit";
  const [form, setForm] = useState({
    agentId: initial?.agentId || "",
    name: initial?.name || "",
    email: initial?.email || "",
    phone: initial?.phone || "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        tenantId,
        ...form,
        source: initial?.source,
        userId: initial?.userId,
      };
      const res = isEdit
        ? await updateOperationsAgentWrite(initial.id, payload)
        : await createOperationsAgentWrite(payload);
      if (!res?.success) throw new Error(res?.error || "Failed to save agent");
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || "Failed to save agent");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={isEdit ? "Edit agent" : "Add agent"} onClose={onClose}>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-2 text-sm">
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        <label className="block text-xs text-slate-600">
          Agent ID *
          <Input
            className="mt-1 font-mono text-xs"
            value={form.agentId}
            onChange={(e) => setForm((p) => ({ ...p, agentId: e.target.value }))}
            readOnly={isEdit}
            required
          />
        </label>
        <label className="block text-xs text-slate-600">
          Name *
          <Input
            className="mt-1"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            required
          />
        </label>
        <label className="block text-xs text-slate-600">
          Email
          <Input
            className="mt-1"
            type="email"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
          />
        </label>
        <label className="block text-xs text-slate-600">
          Phone
          <Input
            className="mt-1"
            value={form.phone}
            onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
            placeholder="+91…"
          />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create agent"}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

function UserEmailCell({ email, emailUnavailable }) {
  if (email) return <span>{email}</span>;
  if (emailUnavailable) {
    return <span className="text-[11px] text-slate-400">{EMAIL_UNAVAILABLE_HINT}</span>;
  }
  return <span className="text-slate-400">—</span>;
}

function UserFormModal({ mode, initial, tenantId, onClose, onSaved }) {
  const isEdit = mode === "edit";
  const [form, setForm] = useState({
    userId: initial?.userId || "",
    name: initial?.name || "",
    email: initial?.email || "",
    role: initial?.role || "admin",
    agentId: initial?.agentId || "",
    labId: initial?.labId || "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = { tenantId, ...form, agentName: form.name };
      const res = isEdit
        ? await updateOperationsPlatformUserWrite(form.userId, payload)
        : await createOperationsPlatformUserWrite(payload);
      if (!res?.success) throw new Error(res?.error || "Failed to save user");
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || "Failed to save user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={isEdit ? "Edit user" : "Add user"} onClose={onClose}>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-2 text-sm">
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        {!isEdit ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-900">
            Create the login in Supabase Auth first, then link the profile with the same email used
            in Auth.
          </p>
        ) : null}
        <label className="block text-xs text-slate-600">
          Supabase user ID *
          <Input
            className="mt-1 font-mono text-[11px]"
            value={form.userId}
            onChange={(e) => setForm((p) => ({ ...p, userId: e.target.value }))}
            readOnly={isEdit}
            required
          />
        </label>
        <label className="block text-xs text-slate-600">
          Display name
          <Input
            className="mt-1"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g. QA Admin"
          />
        </label>
        <label className="block text-xs text-slate-600">
          Email *
          <Input
            className="mt-1"
            type="email"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            placeholder="qa.admin@primecare.test"
            required
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
          <label className="block text-xs text-slate-600">
            Linked agent ID
            <Input
              className="mt-1 font-mono text-xs"
              value={form.agentId}
              onChange={(e) => setForm((p) => ({ ...p, agentId: e.target.value }))}
            />
          </label>
        ) : null}
        {form.role === "lab" ? (
          <label className="block text-xs text-slate-600">
            Lab ID
            <Input
              className="mt-1 font-mono text-xs"
              value={form.labId}
              onChange={(e) => setForm((p) => ({ ...p, labId: e.target.value }))}
            />
          </label>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Link profile"}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

function LabAssignmentModal({ lab, agents, tenantId, onClose, onSaved }) {
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
        tenantId,
        labId: lab.labId,
        agentId,
        agentName: selectedAgent?.name || lab.assignedAgentName || "",
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

  async function handleRemove() {
    if (typeof window !== "undefined" && !window.confirm(`Remove agent assignment from ${lab.labName}?`)) {
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await updateLabAgentAssignmentWrite({
        tenantId,
        labId: lab.labId,
        remove: true,
      });
      if (!res?.success) throw new Error(res?.error || "Failed to remove assignment");
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err?.message || "Failed to remove assignment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell title={`Assign agent — ${lab.labName}`} onClose={onClose}>
      <form onSubmit={(e) => void handleAssign(e)} className="space-y-2 text-sm">
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        <p className="text-xs text-slate-500">
          Lab ID: <span className="font-mono">{lab.labId}</span>
        </p>
        <label className="block text-xs text-slate-600">
          Assigned agent *
          <select
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
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
        </label>
        <div className="flex flex-wrap justify-between gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            className="text-red-700"
            onClick={() => void handleRemove()}
            disabled={saving || !lab.assignedAgentId}
          >
            Remove assignment
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !agentId}>
              {saving ? "Saving…" : lab.assignedAgentId ? "Reassign" : "Assign"}
            </Button>
          </div>
        </div>
      </form>
    </ModalShell>
  );
}

function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
        aria-hidden
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 pl-8 text-xs"
      />
    </div>
  );
}

export default function OperationsCenterAdminPage({ currentUser = null }) {
  const tenantId = resolveTenantId(currentUser);
  const [tab, setTab] = useState("agents");
  const [loading, setLoading] = useState(true);
  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [search, setSearch] = useState("");
  const [agentModal, setAgentModal] = useState(null);
  const [userModal, setUserModal] = useState(null);
  const [labModal, setLabModal] = useState(null);
  const [busyId, setBusyId] = useState("");
  const [resettingUserId, setResettingUserId] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await loadOperationsCenterAdminBundle(tenantId);
      setBundle(data);
      if (!data.ok && data.error) setError(data.error);
    } catch (err) {
      setError(err?.message || "Failed to load operations center");
      setBundle(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const agents = bundle?.agents || [];
  const users = bundle?.users || [];
  const labAssignments = bundle?.labAssignments || [];
  const activeAgentCount = useMemo(() => countActiveAgents(agents), [agents]);

  const filteredAgents = useMemo(
    () =>
      agents.filter((a) =>
        matchesSearch(search, [a.name, a.agentId, a.email, a.phone])
      ),
    [agents, search]
  );

  const filteredUsers = useMemo(
    () =>
      users.filter((u) =>
        matchesSearch(search, [u.name, u.email, u.roleLabel, u.userId, u.agentId, u.labId])
      ),
    [users, search]
  );

  const filteredLabs = useMemo(
    () =>
      labAssignments.filter((l) =>
        matchesSearch(search, [l.labName, l.labId, l.assignedAgentName, l.assignedAgentId])
      ),
    [labAssignments, search]
  );

  async function toggleAgentActive(agent) {
    const next = !agent.active;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`${next ? "Enable" : "Disable"} ${agent.name}?`)
    ) {
      return;
    }
    try {
      setBusyId(agent.id);
      setStatusMessage("");
      const res = await setOperationsAgentActiveWrite(agent.id, next, {
        tenantId,
        source: agent.source,
      });
      if (!res?.success) throw new Error(res?.error);
      setStatusMessage(`${agent.name} ${next ? "enabled" : "disabled"}`);
      await load();
    } catch (err) {
      setError(err?.message || "Failed to update agent");
    } finally {
      setBusyId("");
    }
  }

  async function toggleUserActive(user) {
    const next = !user.active;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`${next ? "Enable" : "Disable"} ${user.name}?`)
    ) {
      return;
    }
    try {
      setBusyId(user.userId);
      setStatusMessage("");
      const res = await setOperationsPlatformUserActiveWrite(user.userId, next, { tenantId });
      if (!res?.success) throw new Error(res?.error);
      setStatusMessage(`${user.name} ${next ? "enabled" : "disabled"}`);
      await load();
    } catch (err) {
      setError(err?.message || "Failed to update user");
    } finally {
      setBusyId("");
    }
  }

  async function handleResetPassword(user) {
    const email = String(user?.email || "").trim();
    if (!email) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Send password reset email to ${email}?`)
    ) {
      return;
    }
    try {
      setResettingUserId(user.userId);
      setStatusMessage("");
      setError("");
      const res = await requestPlatformUserPasswordReset(email);
      if (!res?.success) throw new Error(res?.error || "Failed to send password reset email");
      setStatusMessage("Password reset email sent");
    } catch (err) {
      setError(err?.message || "Failed to send password reset email");
    } finally {
      setResettingUserId("");
    }
  }

  if (loading) return <PageSkeleton rows={8} />;

  return (
    <div className="mx-auto max-w-5xl space-y-3 p-3 pb-8">
      <header>
        <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <Radio className="h-5 w-5 text-indigo-600" />
          Operations Center
        </h1>
        <p className="text-[11px] text-slate-600">
          Onboard agents, manage platform users, and assign labs — no SQL required.
        </p>
      </header>

      {error ? <p className="text-xs text-amber-700">{error}</p> : null}
      {statusMessage ? <p className="text-xs text-green-700">{statusMessage}</p> : null}

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg border bg-white p-2">
          <p className="text-slate-500">Agents</p>
          <p className="text-lg font-bold tabular-nums">{activeAgentCount}</p>
        </div>
        <div className="rounded-lg border bg-white p-2">
          <p className="text-slate-500">Platform users</p>
          <p className="text-lg font-bold tabular-nums">{users.length}</p>
        </div>
        <div className="rounded-lg border bg-white p-2">
          <p className="text-slate-500">Labs</p>
          <p className="text-lg font-bold tabular-nums">{labAssignments.length}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-1">
        {OPERATIONS_CENTER_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setSearch("");
            }}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === t.id
                ? "bg-indigo-600 text-white"
                : "text-slate-600 hover:bg-slate-100"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={
            tab === "agents"
              ? "Search agents…"
              : tab === "users"
                ? "Search users…"
                : "Search labs…"
          }
        />
        {tab === "agents" ? (
          <Button type="button" size="sm" className="gap-1" onClick={() => setAgentModal({ mode: "add" })}>
            <Plus className="h-4 w-4" />
            Add Agent
          </Button>
        ) : null}
        {tab === "users" ? (
          <Button type="button" size="sm" className="gap-1" onClick={() => setUserModal({ mode: "add" })}>
            <Plus className="h-4 w-4" />
            Add User
          </Button>
        ) : null}
      </div>

      {tab === "agents" ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-slate-500">
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Email</th>
                <th className="px-2 py-2">Phone</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Created Date</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAgents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-2 py-6 text-center text-slate-500">
                    {agents.length === 0
                      ? "No field agents yet. Add your first agent to start lab assignments."
                      : "No agents match your search."}
                  </td>
                </tr>
              ) : (
                filteredAgents.map((agent) => (
                  <tr key={agent.id} className="border-b border-slate-100">
                    <td className="px-2 py-2">
                      <div className="font-medium text-slate-900">{agent.name}</div>
                      <div className="font-mono text-[10px] text-slate-500">{agent.agentId}</div>
                    </td>
                    <td className="px-2 py-2">{agent.email || "—"}</td>
                    <td className="px-2 py-2">{agent.phone || "—"}</td>
                    <td className="px-2 py-2">
                      <StatusBadge active={agent.active} />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{formatOpsDate(agent.createdAt)}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[10px]"
                          onClick={() => setAgentModal({ mode: "edit", agent })}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[10px]"
                          disabled={busyId === agent.id}
                          onClick={() => void toggleAgentActive(agent)}
                        >
                          {agent.active ? "Disable" : "Enable"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "users" ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[560px] text-xs">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-slate-500">
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Email</th>
                <th className="px-2 py-2">Role</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-slate-500">
                    {users.length === 0
                      ? "No platform users linked yet. Add a profile after creating the login in Supabase Auth."
                      : "No users match your search."}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.userId} className="border-b border-slate-100">
                    <td className="px-2 py-2 font-medium text-slate-900">{user.name}</td>
                    <td className="px-2 py-2">
                      <UserEmailCell email={user.email} emailUnavailable={user.emailUnavailable} />
                    </td>
                    <td className="px-2 py-2">{platformRoleLabel(user.role)}</td>
                    <td className="px-2 py-2">
                      <StatusBadge active={user.active} />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[10px]"
                          onClick={() => setUserModal({ mode: "edit", user })}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[10px]"
                          disabled={busyId === user.userId}
                          onClick={() => void toggleUserActive(user)}
                        >
                          {user.active ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-[10px]"
                          disabled={!user.email || resettingUserId === user.userId}
                          title={user.email ? undefined : RESET_PASSWORD_EMAIL_MISSING}
                          onClick={() => void handleResetPassword(user)}
                        >
                          {resettingUserId === user.userId ? "Sending…" : "Reset Password"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "labAssignment" ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[560px] text-xs">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-slate-500">
                <th className="px-2 py-2">Lab Name</th>
                <th className="px-2 py-2">Lab ID</th>
                <th className="px-2 py-2">Assigned Agent</th>
                <th className="px-2 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLabs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-2 py-6 text-center text-slate-500">
                    {labAssignments.length === 0
                      ? "No labs found for this tenant."
                      : "No labs match your search."}
                  </td>
                </tr>
              ) : (
                filteredLabs.map((lab) => (
                  <tr key={lab.labId} className="border-b border-slate-100">
                    <td className="px-2 py-2 font-medium text-slate-900">{lab.labName}</td>
                    <td className="px-2 py-2 font-mono text-[11px] text-slate-700">{lab.labId}</td>
                    <td className="px-2 py-2">
                      {lab.assignedAgentName || lab.assignedAgentId ? (
                        <div>
                          <div>{lab.assignedAgentName || "—"}</div>
                          {lab.assignedAgentId ? (
                            <div className="font-mono text-[10px] text-slate-500">
                              {lab.assignedAgentId}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-slate-400">Unassigned</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-[10px]"
                        onClick={() => setLabModal({ lab })}
                      >
                        {lab.assignedAgentId ? "Reassign" : "Assign Agent"}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : null}

      {agentModal ? (
        <AgentFormModal
          mode={agentModal.mode}
          initial={agentModal.agent}
          tenantId={tenantId}
          onClose={() => setAgentModal(null)}
          onSaved={async () => {
            setStatusMessage(agentModal.mode === "edit" ? "Agent updated" : "Agent created");
            await load();
          }}
        />
      ) : null}

      {userModal ? (
        <UserFormModal
          mode={userModal.mode}
          initial={userModal.user}
          tenantId={tenantId}
          onClose={() => setUserModal(null)}
          onSaved={async () => {
            setStatusMessage(userModal.mode === "edit" ? "User updated" : "User linked");
            await load();
          }}
        />
      ) : null}

      {labModal ? (
        <LabAssignmentModal
          lab={labModal.lab}
          agents={agents}
          tenantId={tenantId}
          onClose={() => setLabModal(null)}
          onSaved={async () => {
            setStatusMessage("Lab assignment updated");
            await load();
          }}
        />
      ) : null}
    </div>
  );
}
