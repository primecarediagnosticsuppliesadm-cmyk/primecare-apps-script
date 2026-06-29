import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  assignPrimaryLabOwnerWrite,
  unassignPrimaryLabOwnerWrite,
} from "@/api/labOwnershipApi.js";
import {
  transferLabAssignmentWrite,
  updateDistributorAgentAssignmentWrite,
  updateOperationsPlatformUserWrite,
} from "@/api/primecareSupabaseApi.js";
import {
  deactivatePlatformUserWrite,
  provisionPlatformUserWrite,
  reactivatePlatformUserWrite,
  resetPlatformUserPasswordWrite,
  writeAccessAuditUpdatedEvent,
  insertProvisioningEventWrite,
  writeRoleChangedEvent,
  writeOwnershipReassignedEvent,
} from "@/api/userProvisioningApi.js";
import {
  EMAIL_NOT_ADDED,
  OPERATIONS_CENTER_TABS,
  PLATFORM_ROLE_OPTIONS,
  filterPlatformRoleOptionsForActor,
  formatOpsDate,
  isAgentRole,
  labAssignmentKey,
  matchesSearch,
  platformRoleLabel,
  distributorsForAgent,
  requiresDistributorScope,
} from "@/operations/operationsCenterAdminEngine.js";
import {
  DIRECTORY_AUDIENCE_FILTERS,
  DIRECTORY_DEFAULT_AUDIENCE,
  buildDirectoryAudienceFilterOptions,
  computeDirectoryAudienceCounts,
  filterDirectoryUsers,
  isLoginEnabledRole,
  resolveDirectoryRowActions,
  sortDirectoryUsers,
  suggestAgentId,
  territoryOptionsFromDistributors,
  USER_DIRECTORY_CLASS,
} from "@/operations/userProvisioningEngine.js";
import { labsForAgentPortalAligned } from "@/operations/userDirectoryIntegrityEngine.js";
import {
  buildOperationsAttentionItems,
  buildOperationsHealthItems,
  buildOperationsReadinessFooterState,
  formatLastRefreshLabel,
} from "@/operations/operationsCenterCertificationUi.js";
import { navigateToCreditRisk } from "@/operations/hqWorkflowNav.js";
import { IS_DEV, IS_QA } from "@/config/environment.js";
import { ROLES } from "@/config/roles.js";
import { cn } from "@/lib/utils";
import { Plus, Search, Copy, X, ChevronDown } from "lucide-react";
import UserDetailDrawer from "@/components/operations/UserDetailDrawer.jsx";
import LabOwnershipPanel from "@/components/operations/LabOwnershipPanel.jsx";
import PilotOnboardingImportPanel from "@/components/operations/PilotOnboardingImportPanel.jsx";
import PilotHardeningChecksPanel from "@/components/operations/PilotHardeningChecksPanel.jsx";
import { ENTERPRISE_ACTIONS } from "@/config/enterpriseCopy.js";

function str(v) {
  return String(v ?? "").trim();
}

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
  const reassigns = [];

  const mine = [user?.userId, user?.agentId, user?.id]
    .map((v) => String(v ?? "").trim().toLowerCase())
    .filter(Boolean);

  for (const lab of labAssignments) {
    const key = labAssignmentKey(lab);
    const wasMine = initialKeys.has(key);
    const nowMine = selectedKeys.has(key);
    if (wasMine === nowMine) continue;

    if (nowMine) {
      const assignedId = String(lab.assignedAgentId ?? "").trim().toLowerCase();
      const isReassign = Boolean(assignedId && !mine.includes(assignedId));
      if (isReassign) reassigns.push(lab);
      else assigns.push(lab);
    } else {
      unassigns.push(lab);
    }
  }

  return {
    assigns,
    unassigns,
    reassigns,
    reassignCount: reassigns.length,
    labChanges: assigns.length + unassigns.length + reassigns.length,
  };
}

function formatLabList(labs, limit = 5) {
  const lines = labs.slice(0, limit).map((lab) => `• ${lab.labName} (${lab.labId})`);
  if (labs.length > limit) lines.push(`• …and ${labs.length - limit} more`);
  return lines.join("\n");
}

function NotAssignedBadge() {
  return (
    <Badge variant="outline" className="text-[10px] font-normal text-slate-500">
      Not assigned
    </Badge>
  );
}

function UserClassBadge({ userClass }) {
  if (userClass === USER_DIRECTORY_CLASS.PROBE_DEBUG) {
    return (
      <Badge className="ml-1 bg-amber-100 text-[10px] font-medium text-amber-900 hover:bg-amber-100">
        Probe
      </Badge>
    );
  }
  if (userClass === USER_DIRECTORY_CLASS.QA_TEST) {
    return (
      <Badge variant="secondary" className="ml-1 text-[10px] font-normal">
        QA
      </Badge>
    );
  }
  return null;
}

function DirectoryValueCell({ value }) {
  const text = String(value ?? "").trim();
  if (!text) return <NotAssignedBadge />;
  return <span>{text}</span>;
}

function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="relative min-w-[200px] flex-1">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          placeholder ||
          "Search name, username, email, phone, agent ID, lab ID, territory, distributor, tenant…"
        }
        className="h-8 pl-8 text-xs"
      />
    </div>
  );
}

function OperationsKpiCard({ value, label, hint, onClick, className }) {
  const clickable = typeof onClick === "function";
  const Comp = clickable ? "button" : "div";
  return (
    <Comp
      type={clickable ? "button" : undefined}
      onClick={onClick}
      aria-label={clickable ? `${label}: ${value ?? 0}. Click to navigate.` : undefined}
      className={cn(
        "rounded-lg border bg-white p-2.5 text-left shadow-sm transition-all duration-200",
        clickable &&
          "cursor-pointer hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1",
        className
      )}
    >
      <p className="text-lg font-bold tabular-nums text-slate-900">{value ?? 0}</p>
      <p className="text-[11px] font-medium text-slate-600">{label}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-slate-400">{hint}</p> : null}
      {clickable ? (
        <p className="mt-1 text-[10px] font-medium text-indigo-600/80">View →</p>
      ) : null}
    </Comp>
  );
}

function EnvironmentSummaryBanner({ counts = {} }) {
  const items = [
    { label: "Total Users", value: counts.total },
    { label: "Production Users", value: counts.production },
    { label: "QA Users", value: counts.qa },
    { label: "Probe Users", value: counts.probe },
    { label: "Inactive Users", value: counts.inactive },
  ];
  return (
    <section
      className="rounded-lg border border-indigo-100 bg-indigo-50/40 px-4 py-3"
      aria-label="Environment summary"
    >
      <h3 className="text-xs font-semibold text-slate-900">Environment Summary</h3>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3 lg:grid-cols-5">
        {items.map((item) => (
          <div key={item.label} className="flex justify-between gap-2 sm:block">
            <dt className="text-slate-600">{item.label}</dt>
            <dd className="font-semibold tabular-nums text-slate-900 sm:mt-0.5">{item.value ?? 0}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function OperationalAttentionStrip({ items = [], onNavigateItem }) {
  if (!items.length) return null;
  return (
    <section
      className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-sm"
      aria-label="Operational attention"
    >
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Requires Action
      </h3>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigateItem?.(item)}
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-left text-xs font-medium text-slate-900",
              "cursor-pointer transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50/60 hover:shadow-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1"
            )}
            aria-label={`${item.label}: ${item.count}. Click to review.`}
          >
            <span aria-hidden="true">{item.emoji}</span>
            <span>{item.label}</span>
            <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-indigo-700 ring-1 ring-indigo-100">
              {item.count}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function OperationsHealthPanel({ items = [], onNavigateItem }) {
  if (!items.length) return null;
  const allPass = items.every((item) => item.status === "pass");
  return (
    <section
      className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
      aria-label="Operations health"
    >
      <h3 className="mb-2 text-xs font-semibold text-slate-900">Operations Health</h3>
      <ul className="space-y-1">
        {items.map((item) => {
          const icon = item.status === "pass" ? "✓" : "⚠";
          const clickable = typeof onNavigateItem === "function" && item.status === "warn";
          const Comp = clickable ? "button" : "div";
          return (
            <li key={item.id}>
              <Comp
                type={clickable ? "button" : undefined}
                onClick={clickable ? () => onNavigateItem(item) : undefined}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs",
                  clickable &&
                    "cursor-pointer transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
                  item.status === "warn" ? "text-amber-900" : "text-slate-800"
                )}
                aria-label={`${item.label}: ${item.status === "pass" ? "pass" : "warning"}${item.detail ? `, ${item.detail}` : ""}`}
              >
                <span>
                  <span className="mr-1.5" aria-hidden="true">
                    {icon}
                  </span>
                  {item.label}
                  {item.detail ? (
                    <span className="ml-1 text-slate-500">{item.detail}</span>
                  ) : null}
                </span>
                {clickable ? (
                  <span className="text-[10px] font-medium text-indigo-600">View →</span>
                ) : null}
              </Comp>
            </li>
          );
        })}
      </ul>
      {allPass ? (
        <p className="mt-2 rounded-md border border-dashed border-emerald-200 bg-emerald-50/50 px-2 py-1.5 text-[11px] text-emerald-900">
          No integrity issues detected. All ownership relationships are synchronized.
        </p>
      ) : null}
    </section>
  );
}

function OperationsReadinessFooter({ footer = {}, loadedAt = null }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!loadedAt) return undefined;
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, [loadedAt]);
  void tick;

  const rows = [
    ["Environment", footer.environmentLabel],
    ["Users", footer.usersCount],
    ["Ownership", footer.ownershipLabel],
    ["Assignments", footer.assignmentsLabel],
    ["Integrity", footer.integrityLabel],
    ["Last Refresh", formatLastRefreshLabel(loadedAt)],
    ["Overall", footer.overallLabel],
  ];
  return (
    <footer
      className="mt-6 rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3"
      aria-label="Operations Center status"
    >
      <p className="text-xs font-semibold text-slate-900">Operations Center Status</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3 lg:grid-cols-7">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-slate-500">{label}</dt>
            <dd
              className={cn(
                "mt-0.5 font-medium tabular-nums text-slate-900",
                label === "Overall" &&
                  (footer.ready ? "text-emerald-700" : "text-amber-800"),
                (label === "Ownership" || label === "Assignments" || label === "Integrity") &&
                  value === "Attention" &&
                  "text-amber-800"
              )}
            >
              {value ?? "—"}
            </dd>
          </div>
        ))}
      </dl>
      {footer.buildMetadata ? (
        <p className="mt-2 text-[10px] text-slate-400">{footer.buildMetadata}</p>
      ) : null}
    </footer>
  );
}

function IntegrityWarningsBanner({
  warnings = [],
  ignoredKeys = new Set(),
  onReviewUser,
  onTransferUser,
  onIgnore,
}) {
  const visible = (warnings || []).filter((w) => !ignoredKeys.has(w.id));
  if (!visible.length) return null;

  return (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-950" id="ops-integrity-warnings">
      <p className="font-semibold">Directory integrity — action required</p>
      {visible.map((warning) => (
        <div key={warning.id} className="rounded-md border border-amber-200/80 bg-white/60 p-2">
          <p className="font-medium">{warning.title}</p>
          <p className="text-amber-900/90">{warning.detail}</p>
          {(warning.items || []).slice(0, 5).map((item) => {
            const itemKey = `${warning.id}::${item.userId || item.labId || item.key}`;
            if (ignoredKeys.has(itemKey)) return null;
            const label =
              item.name && item.assignedLabsCount != null
                ? `${item.name} — ${item.assignedLabsCount} lab(s)`
                : item.labId || item.key || "Issue";
            return (
              <div
                key={itemKey}
                className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-amber-100 pt-2"
              >
                <span className="text-amber-950">{label}</span>
                <div className="flex flex-wrap gap-1">
                  {item.userId && onReviewUser ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[10px]"
                      onClick={() => onReviewUser(item.userId)}
                    >
                      Review
                    </Button>
                  ) : null}
                  {item.userId && onTransferUser ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[10px]"
                      onClick={() => onTransferUser(item.userId)}
                    >
                      Transfer
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[10px] text-slate-600"
                    onClick={() => onIgnore(itemKey)}
                  >
                    Ignore
                  </Button>
                </div>
              </div>
            );
          })}
          <div className="mt-2 flex justify-end">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[10px] text-slate-600"
              onClick={() => onIgnore(warning.id)}
            >
              Dismiss banner
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function DirectoryRowActionsMenu({
  user,
  rowActions,
  busyId,
  resettingUserId,
  onReview,
  onAssign,
  onDeactivate,
  onReactivate,
  onTransferLab,
  onResetPassword,
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const firstItemRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    window.setTimeout(() => firstItemRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const secondaryItems = [];
  if (rowActions.assign) {
    secondaryItems.push({ key: "assign", label: "Assign Labs", onClick: () => onAssign(user) });
  }
  if (rowActions.assignLab) {
    secondaryItems.push({ key: "assignLab", label: "Assign Lab", onClick: () => onAssign(user) });
  }
  if (rowActions.transferLab) {
    secondaryItems.push({
      key: "transfer",
      label: "Transfer Labs",
      onClick: () => onTransferLab(user),
    });
  }
  if (rowActions.resetPassword) {
    secondaryItems.push({
      key: "reset",
      label: "Reset Password",
      onClick: () => onResetPassword(user),
      disabled: resettingUserId === user.userId,
    });
  }
  if (rowActions.reactivate) {
    secondaryItems.push({
      key: "reactivate",
      label: "Activate",
      onClick: () => onReactivate(user),
      disabled: busyId === user.userId,
    });
  }
  if (rowActions.deactivate) {
    secondaryItems.push({
      key: "deactivate",
      label: "Deactivate",
      onClick: () => onDeactivate(user),
      destructive: true,
      disabled: busyId === user.userId,
    });
  }

  return (
    <div className="relative flex items-center gap-1" ref={menuRef}>
      {rowActions.review ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2 text-[10px]"
          onClick={() => onReview(user)}
        >
          Review
        </Button>
      ) : null}
      {secondaryItems.length > 0 ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-0.5 px-2 text-[10px]"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label={`More actions for ${user.displayName || user.name}`}
          >
            More
            <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
          </Button>
          {open ? (
            <div
              role="menu"
              className="absolute right-0 top-full z-20 mt-1 min-w-[9rem] rounded-md border border-slate-200 bg-white py-1 shadow-lg"
            >
              {secondaryItems.map((item, index) => (
                <button
                  key={item.key}
                  ref={index === 0 ? firstItemRef : undefined}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  className={cn(
                    "block w-full px-3 py-1.5 text-left text-[11px] hover:bg-slate-50 disabled:opacity-50",
                    item.destructive ? "text-red-700" : "text-slate-800"
                  )}
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
      {rowActions.probeRestricted ? (
        <span className="text-[10px] text-amber-800">Review only</span>
      ) : null}
    </div>
  );
}

function CreateUserDrawer({ tenantId, distributors, labAssignments, roleOptions, onClose, onSaved }) {
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
      if (!res?.success) throw new Error(res?.error || ENTERPRISE_ACTIONS.userCreateFailed);
      setProvisionResult(res.data);
      onSaved?.(res.data);
    } catch (err) {
      setError(err?.message || ENTERPRISE_ACTIONS.userCreateFailed);
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
            <p className="font-medium">{ENTERPRISE_ACTIONS.userCreated}</p>
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
                {(roleOptions || PLATFORM_ROLE_OPTIONS).map((opt) => (
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
            {requiresDistributorScope(form.role) ? (
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
                {saving ? ENTERPRISE_ACTIONS.creatingUser : ENTERPRISE_ACTIONS.createUser}
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
  ownershipRows = [],
  distributors,
  tenantId,
  actorRole = "",
  focusLabId = "",
  onClose,
  onSaved,
  onRequestConfirm,
  roleOptions,
}) {
  const [role, setRole] = useState(user?.role || "agent");
  const agentLabs = isAgentRole(role)
    ? labsForAgentPortalAligned(user, labAssignments, ownershipRows)
    : [];
  const agentDists = isAgentRole(role) ? distributorsForAgent(user, distributors) : [];
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
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
    setInfo("");
    setRole(user?.role || "agent");
    setTerritory(user?.territory === "—" ? "" : user?.territory || "");
    setLabId(user?.labId || "");
    setDistributorId(user?.distributorId || "");
  }, [user?.userId, user?.agentId, labAssignments, user?.role, user?.territory, user?.labId, user?.distributorId]);

  useEffect(() => {
    if (!focusLabId) return;
    window.setTimeout(() => {
      document.getElementById(`hq-assign-lab-${focusLabId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 200);
  }, [focusLabId, user?.userId]);

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
    setError("");
    setInfo("");
    setSelectedLabKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function executeAgentAssignments(reason) {
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
        const res = await assignPrimaryLabOwnerWrite({
          hqTenantId: tenantId,
          labTenantId: lab.tenantId,
          labId: lab.labId,
          primaryAgentId: agentBusinessId,
          agentName: agentDisplayName,
          subjectUserId: user.userId,
          labName: lab.labName,
          reason,
        });
        if (!res?.success) {
          throw new Error(res?.error || `Failed to assign ${lab.labId}`);
        }
        await writeAccessAuditUpdatedEvent({
          tenantId,
          subjectUserId: user.userId,
          action: "ownership_assigned",
          reason,
          previous: lab.assignedAgentId
            ? { agentId: lab.assignedAgentId, agentName: lab.assignedAgentName }
            : {},
          next: { agentId: agentBusinessId, agentName: agentDisplayName },
          related: {
            labTenantId: lab.tenantId,
            labId: lab.labId,
            labName: lab.labName,
            agentId: agentBusinessId,
            agentName: agentDisplayName,
          },
        });
      } else {
        const res = await unassignPrimaryLabOwnerWrite({
          hqTenantId: tenantId,
          labTenantId: lab.tenantId,
          labId: lab.labId,
          subjectUserId: user.userId,
          reason,
        });
        if (!res?.success) {
          throw new Error(res?.error || `Failed to unassign ${lab.labId}`);
        }
        await writeAccessAuditUpdatedEvent({
          tenantId,
          subjectUserId: user.userId,
          action: "ownership_removed",
          reason,
          previous: lab.assignedAgentId
            ? { agentId: lab.assignedAgentId, agentName: lab.assignedAgentName }
            : {},
          next: {},
          related: {
            labTenantId: lab.tenantId,
            labId: lab.labId,
            labName: lab.labName,
          },
        });
      }
      labChanges += 1;
    }

    const territoryChanged = territory !== initialTerritory;
    const roleChanged = role !== initialRole;
    if (territoryChanged || roleChanged) {
      const res = await updateOperationsPlatformUserWrite(
        user.userId,
        {
          tenantId,
          displayName: user.displayName || user.name,
          role,
          territory,
          agentId: user.agentId,
        },
        { actorRole }
      );
      if (!res?.success) throw new Error(res?.error || "Failed to update profile");
      if (roleChanged) {
        await writeRoleChangedEvent({
          tenantId,
          subjectUserId: user.userId,
          previousRole: initialRole,
          nextRole: role,
          reason,
        });
      }
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
    setInfo("");
    const diff = computeAgentLabAssignmentDiff(
      labAssignments,
      initialAssignedKeysRef.current,
      selectedLabKeys,
      user
    );
    const territoryChanged = territory !== initialTerritory;
    const roleChanged = role !== initialRole;

    if (diff.labChanges === 0 && !territoryChanged && !roleChanged) {
      setInfo("No changes to save — assignments are already up to date.");
      return;
    }

    const detailParts = [];
    if (diff.assigns.length) {
      detailParts.push(`Assign ${diff.assigns.length} lab(s):\n${formatLabList(diff.assigns)}`);
    }
    if (diff.reassigns.length) {
      detailParts.push(`Reassign ${diff.reassigns.length} lab(s):\n${formatLabList(diff.reassigns)}`);
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

    const requireReason = diff.unassigns.length > 0 || diff.reassigns.length > 0;

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
      onExecute: async (reason) => {
        setSaving(true);
        try {
          const result = await executeAgentAssignments(reason);
          onSaved?.(result);
        } finally {
          setSaving(false);
        }
      },
    });
  }

  async function executeProfileScope(reason) {
    const distributorChanged = distributorId !== initialDistributorId;
    const roleChanged = role !== initialRole;
    const labIdChanged = labId !== String(user?.labId ?? "").trim();

    const res = await updateOperationsPlatformUserWrite(
      user.userId,
      {
        tenantId,
        displayName: user.displayName || user.name,
        role,
        territory,
        labId,
        distributorId,
        agentId: user.agentId,
      },
      { actorRole }
    );
    if (!res?.success) throw new Error(res?.error || "Failed to update");

    if (roleChanged) {
      await writeRoleChangedEvent({
        tenantId,
        subjectUserId: user.userId,
        previousRole: initialRole,
        nextRole: role,
        reason,
      });
    }
    if (distributorChanged) {
      const initialDistributorName =
        distributors.find((d) => d.distributorId === initialDistributorId)?.distributorName || "";
      const nextDistributorName =
        distributors.find((d) => d.distributorId === distributorId)?.distributorName || "";
      await writeAccessAuditUpdatedEvent({
        tenantId,
        subjectUserId: user.userId,
        action: "distributor_changed",
        reason,
        previous: {
          distributorId: initialDistributorId,
          distributorName: initialDistributorName,
        },
        next: {
          distributorId,
          distributorName: nextDistributorName,
        },
      });
    }

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
    } else if (distributorChanged && requiresDistributorScope(role)) {
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
      onExecute: async (reason) => {
        setSaving(true);
        try {
          const result = await executeProfileScope(reason);
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
        {info ? (
          <p className="mb-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-600">
            {info}
          </p>
        ) : null}

        <label className="mb-3 block text-xs text-slate-600">
          Role
          <select
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            {(roleOptions || PLATFORM_ROLE_OPTIONS).map((opt) => (
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
                          const ownedByMe = !labOwnedByOtherAgent(lab) && str(lab.assignedAgentId);
                          const otherOwner = checked ? false : labOwnedByOtherAgent(lab);
                          const highlightLab =
                            focusLabId &&
                            str(lab.labId).toLowerCase() === str(focusLabId).toLowerCase();
                          return (
                            <li
                              key={key}
                              id={lab.labId ? `hq-assign-lab-${lab.labId}` : undefined}
                              className={cn(
                                "px-3 py-2",
                                highlightLab && "bg-indigo-50/60 ring-1 ring-inset ring-indigo-200"
                              )}
                            >
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
                                        : ownedByMe && checked
                                          ? " · assigned to this agent"
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

        {requiresDistributorScope(role) ? (
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

        {role === ROLES.LAB || requiresDistributorScope(role) ? (
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

        {!isAgentRole(role) && role !== ROLES.LAB && !requiresDistributorScope(role) ? (
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

function LabAssignmentModal({ lab, agents, tenantId, onClose, onSaved, onRequestConfirm }) {
  const labTenantId = lab?.tenantId || "";
  const hqTenantId = tenantId;
  const [agentId, setAgentId] = useState(lab?.assignedAgentId || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedAgent = agents.find((a) => a.agentId === agentId);
  const previousAgentName = lab?.assignedAgentName || lab?.assignedAgentId || "Unassigned";

  async function executeAssign(reason) {
    const res = await assignPrimaryLabOwnerWrite({
      hqTenantId,
      labTenantId,
      labId: lab.labId,
      primaryAgentId: agentId,
      agentName: selectedAgent?.name || "",
      subjectUserId: selectedAgent?.userId || selectedAgent?.id,
      labName: lab.labName,
      reason,
    });
    if (!res?.success) throw new Error(res?.error || "Failed to assign agent");

    const subjectUserId = String(selectedAgent?.userId || selectedAgent?.id || "").trim();
    const isReassignment = Boolean(lab?.assignedAgentId) && lab.assignedAgentId !== agentId;
    if (hqTenantId && subjectUserId) {
      if (isReassignment) {
        await writeOwnershipReassignedEvent({
          tenantId: hqTenantId,
          subjectUserId,
          labId: lab.labId,
          labName: lab.labName,
          labTenantId,
          fromAgentId: lab.assignedAgentId,
          fromAgentName: previousAgentName,
          toAgentId: agentId,
          toAgentName: selectedAgent?.name || "",
          reason,
          slot: "primary",
        });
      } else {
        await writeAccessAuditUpdatedEvent({
          tenantId: hqTenantId,
          subjectUserId,
          action: "ownership_assigned",
          reason,
          next: { agentId, agentName: selectedAgent?.name || "" },
          related: {
            labTenantId,
            labId: lab.labId,
            labName: lab.labName,
            agentId,
            agentName: selectedAgent?.name || "",
          },
        });
      }
    }

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
      onExecute: async (reason) => {
        setSaving(true);
        try {
          await executeAssign(reason);
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
  const initialAgent = profileAgents.find((a) => a.userId === initialAgentUserId);

  async function writeBulkDistributorAssignAudit(subject, { previousDistributorId, previousDistributorName, newDistributorId, newDistributorName, reason }) {
    if (!tenantId || !subject?.userId) return;

    await writeAccessAuditUpdatedEvent({
      tenantId,
      subjectUserId: subject.userId,
      action: "distributor_changed",
      reason,
      previous: {
        distributorId: previousDistributorId || undefined,
        distributorName: previousDistributorName || undefined,
      },
      next: {
        distributorId: newDistributorId || undefined,
        distributorName: newDistributorName || undefined,
      },
      related: {
        subjectUserId: subject.userId,
        subjectEmail: subject.email || undefined,
        subjectName: subject.name || undefined,
        role: ROLES.AGENT,
        previousDistributorId: previousDistributorId || null,
        previousDistributorName: previousDistributorName || null,
        newDistributorId: newDistributorId || null,
        newDistributorName: newDistributorName || null,
        source: "bulk_distributor_assign",
      },
    });
  }

  async function executeAssign(remove = false, reason) {
    const res = await updateDistributorAgentAssignmentWrite({
      tenantId,
      distributorId: distributor.distributorId,
      agentUserId: remove ? "" : agentUserId,
      agentName: remove ? "" : selectedAgent?.name || "",
      remove,
    });
    if (!res?.success) throw new Error(res?.error || "Failed to update distributor assignment");

    const distributorId = distributor.distributorId;
    const distributorName = distributor.distributorName;

    if (remove) {
      await writeBulkDistributorAssignAudit(initialAgent || { userId: initialAgentUserId, name: initialAgentName }, {
        previousDistributorId: distributorId,
        previousDistributorName: distributorName,
        newDistributorId: "",
        newDistributorName: "",
        reason,
      });
    } else if (selectedAgent) {
      await writeBulkDistributorAssignAudit(selectedAgent, {
        previousDistributorId: "",
        previousDistributorName: "",
        newDistributorId: distributorId,
        newDistributorName: distributorName,
        reason,
      });
    }

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
        onExecute: async (reason) => {
          setSaving(true);
          try {
            await executeAssign(true, reason);
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
      onExecute: async (reason) => {
        setSaving(true);
        try {
          await executeAssign(false, reason);
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
  actorRole = "",
  focusUserId = "",
  openAssignDrawer = false,
  focusLabId = "",
  initialTab = "",
  loadedAt = null,
  onNavIntentHandled,
  onReload,
  onError,
  onStatus,
  setActivePage = null,
}) {
  const [tab, setTab] = useState("directory");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [audienceFilter, setAudienceFilter] = useState(DIRECTORY_DEFAULT_AUDIENCE);
  const [ownershipScrollUnassigned, setOwnershipScrollUnassigned] = useState(false);
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
  const [reviewUser, setReviewUser] = useState(null);
  const [ignoredIntegrityKeys, setIgnoredIntegrityKeys] = useState(() => new Set());
  const integrityBannerRef = useRef(null);

  const roleOptions = useMemo(
    () => filterPlatformRoleOptionsForActor(actorRole || bundle?.actorRole || ROLES.ADMIN),
    [actorRole, bundle?.actorRole]
  );
  const agents = bundle?.agents || [];
  const directoryUsers = bundle?.directoryUsers || [];
  const labAssignments = bundle?.labAssignments || [];
  const ownershipRows = bundle?.ownershipRows || [];
  const distributorAssignments = bundle?.distributorAssignments || [];
  const auditEvents = bundle?.auditEvents || [];
  const kpis = bundle?.kpis || {};
  const directoryIntegrity = bundle?.directoryIntegrity || { warnings: [], summary: {} };
  const allowProbeActions = IS_DEV || IS_QA;

  const audienceCounts = useMemo(
    () => computeDirectoryAudienceCounts(directoryUsers),
    [directoryUsers]
  );
  const audienceFilterOptions = useMemo(
    () => buildDirectoryAudienceFilterOptions(directoryUsers),
    [directoryUsers]
  );

  const operationsHealthItems = useMemo(
    () =>
      buildOperationsHealthItems({
        directoryIntegrity,
        kpis,
        ownershipMetrics: bundle?.ownershipMetrics,
      }),
    [directoryIntegrity, kpis, bundle?.ownershipMetrics]
  );

  const readinessFooter = useMemo(
    () =>
      buildOperationsReadinessFooterState({
        directoryIntegrity,
        kpis,
        ownershipMetrics: bundle?.ownershipMetrics,
        loadedAt,
      }),
    [directoryIntegrity, kpis, bundle?.ownershipMetrics, loadedAt]
  );

  const attentionItems = useMemo(
    () =>
      buildOperationsAttentionItems({
        labAssignments,
        kpis,
        directoryUsers,
        directoryIntegrity,
      }),
    [labAssignments, kpis, directoryUsers, directoryIntegrity]
  );

  const filteredUsers = useMemo(() => {
    const filtered = filterDirectoryUsers(directoryUsers, {
      search,
      role: roleFilter,
      status: statusFilter,
      audience: audienceFilter,
    });
    return sortDirectoryUsers(filtered, sortKey, sortDir);
  }, [directoryUsers, search, roleFilter, statusFilter, audienceFilter, sortKey, sortDir]);

  useEffect(() => {
    if (!focusUserId || loading) return;
    setTab("directory");
    setSearch("");
    setRoleFilter("");
    setStatusFilter("");
    const user = directoryUsers.find((u) => u.userId === focusUserId);
    if (openAssignDrawer && user) {
      setAssignmentUser(user);
      onNavIntentHandled?.();
    }
    window.setTimeout(() => {
      document.getElementById(`hq-user-row-${focusUserId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 150);
  }, [focusUserId, openAssignDrawer, loading, directoryUsers, onNavIntentHandled]);

  useEffect(() => {
    if (!initialTab || loading) return;
    setTab(initialTab);
    onNavIntentHandled?.();
  }, [initialTab, loading, onNavIntentHandled]);

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

  function handleIntegrityReview(userId) {
    const user = directoryUsers.find((u) => str(u.userId) === str(userId));
    if (user) {
      setTab("directory");
      setReviewUser(user);
    }
  }

  function handleIntegrityTransfer(userId) {
    const user = directoryUsers.find((u) => str(u.userId) === str(userId));
    if (!user) return;
    const firstLab = labsForAgentPortalAligned(user, labAssignments, ownershipRows)[0];
    if (firstLab) setTransferLab(firstLab);
    else onError?.("No laboratories available to transfer for this user");
  }

  function handleIgnoreIntegrity(key) {
    setIgnoredIntegrityKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }

  function handleHealthNavigate(item) {
    if (!item) return;
    if (item.navigate === "labOwnership") {
      navigateToLabOwnership({ scrollToUnassigned: Boolean(item.scrollUnassigned) });
      return;
    }
    if (item.navigate === "directory") {
      navigateToDirectory({
        audience: item.audience ?? "",
        role: "",
        status: "",
      });
    }
  }

  function handleAttentionNavigate(item) {
    if (!item) return;
    if (item.navigate === "creditRisk") {
      navigateToCreditRisk(setActivePage, { attentionFilter: item.filter || "" });
      return;
    }
    if (item.navigate === "labOwnership") {
      navigateToLabOwnership({ scrollToUnassigned: Boolean(item.scrollUnassigned) });
      return;
    }
    if (item.navigate === "directory") {
      navigateToDirectory({
        audience: item.audience ?? "",
        role: "",
        status: "",
      });
      return;
    }
    if (item.navigate === "integrity") {
      setTab("directory");
      window.setTimeout(() => {
        integrityBannerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
    }
  }

  function navigateToDirectory(filters = {}) {
    setTab("directory");
    if (filters.audience !== undefined) setAudienceFilter(filters.audience);
    if (filters.role !== undefined) setRoleFilter(filters.role);
    if (filters.status !== undefined) setStatusFilter(filters.status);
  }

  function navigateToLabOwnership(options = {}) {
    setTab("labOwnership");
    setOwnershipScrollUnassigned(Boolean(options.scrollToUnassigned));
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
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:grid-cols-8">
        <OperationsKpiCard
          value={kpis.totalUsers}
          label="Total Users"
          hint="All profiles"
          onClick={() => navigateToDirectory({ audience: "", role: "", status: "" })}
        />
        <OperationsKpiCard
          value={kpis.productionUsers ?? kpis.realUsers}
          label="Production Users"
          hint="Non-QA, non-probe"
          onClick={() => navigateToDirectory({ audience: "real", role: "", status: "" })}
        />
        <OperationsKpiCard
          value={kpis.qaUsers ?? kpis.qaTestUsers}
          label="QA Users"
          onClick={() => navigateToDirectory({ audience: "qa_test", role: "", status: "" })}
        />
        <OperationsKpiCard
          value={kpis.probeUsers ?? kpis.probeDebugUsers}
          label="Probe Users"
          onClick={() => navigateToDirectory({ audience: "probe_debug", role: "", status: "" })}
        />
        <OperationsKpiCard
          value={kpis.fieldAgents ?? kpis.agents}
          label="Field Agents"
          onClick={() => navigateToDirectory({ audience: "", role: "agent", status: "" })}
        />
        <OperationsKpiCard
          value={kpis.labUsers}
          label="Lab Users"
          onClick={() => navigateToDirectory({ audience: "", role: "lab", status: "" })}
        />
        <OperationsKpiCard
          value={kpis.hqAdmins}
          label="HQ Admins"
          onClick={() => navigateToDirectory({ audience: "", role: "admin", status: "" })}
        />
        <OperationsKpiCard
          value={kpis.inactiveAccounts ?? kpis.inactiveUsers}
          label="Inactive Accounts"
          onClick={() => navigateToDirectory({ audience: "inactive", role: "", status: "" })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-2">
        <OperationsKpiCard
          value={kpis.labsAssigned}
          label="Assigned Laboratories"
          hint="Labs with an owner"
          onClick={() => navigateToLabOwnership({ scrollToUnassigned: false })}
        />
        <OperationsKpiCard
          value={kpis.unassignedLabs}
          label="Unassigned Laboratories"
          hint="Scroll to unassigned list"
          onClick={() => navigateToLabOwnership({ scrollToUnassigned: true })}
        />
      </div>

      <EnvironmentSummaryBanner counts={audienceCounts} />

      <OperationalAttentionStrip items={attentionItems} onNavigateItem={handleAttentionNavigate} />

      <OperationsHealthPanel items={operationsHealthItems} onNavigateItem={handleHealthNavigate} />

      <div ref={integrityBannerRef}>
        <IntegrityWarningsBanner
        warnings={directoryIntegrity.warnings}
        ignoredKeys={ignoredIntegrityKeys}
        onReviewUser={handleIntegrityReview}
        onTransferUser={handleIntegrityTransfer}
        onIgnore={handleIgnoreIntegrity}
      />
      </div>

      <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-1">
        {OPERATIONS_CENTER_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-offset-1",
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
            <SearchInput value={search} onChange={setSearch} />
            <select
              className="h-8 rounded-md border border-slate-200 px-2 text-xs"
              value={audienceFilter}
              onChange={(e) => setAudienceFilter(e.target.value)}
              aria-label="Filter users by audience"
            >
              {audienceFilterOptions.map((opt) => (
                <option key={opt.id || "all"} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
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
                      {["name", "role", "status", "labs", "created", "lastLogin"].includes(key) ? (
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
                    <td colSpan={10} className="px-4 py-10 text-center text-xs text-slate-500">
                      <p className="font-medium text-slate-700">No operators match your filters.</p>
                      <p className="mt-1">
                        Try clearing search, switching audience to All, or adjusting role/status filters.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
                    const rowActions = resolveDirectoryRowActions(user, { allowProbeActions });
                    const isProbeRow = user.userClass === USER_DIRECTORY_CLASS.PROBE_DEBUG;
                    return (
                    <tr
                      key={user.userId}
                      id={`hq-user-row-${user.userId}`}
                      className={cn(
                        "border-b border-slate-100",
                        isProbeRow && "bg-slate-50/90 text-slate-600",
                        focusUserId && user.userId === focusUserId &&
                          "bg-indigo-50/70 ring-1 ring-inset ring-indigo-300"
                      )}
                    >
                      <td className="px-2 py-2 font-medium text-slate-900">
                        <span className={cn(isProbeRow && "text-slate-700")}>
                          {user.displayName || user.name}
                        </span>
                        <UserClassBadge userClass={user.userClass} />
                        {!user.loginEnabled ? (
                          <span className="ml-1 text-[10px] text-amber-700">(no login)</span>
                        ) : null}
                        {user.labCountMismatch ? (
                          <span
                            className="mt-0.5 block text-[10px] text-amber-700"
                            title="Lab count differs between assignment sources"
                          >
                            Lab count mismatch
                          </span>
                        ) : null}
                        {isProbeRow && Number(user.assignedLabsCount) > 0 ? (
                          <span className="mt-0.5 block text-[10px] font-medium text-amber-800">
                            Probe user has {user.assignedLabsCount} assigned lab(s)
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2">{user.email || EMAIL_NOT_ADDED}</td>
                      <td className="px-2 py-2">{user.roleLabel}</td>
                      <td className="px-2 py-2">
                        <DirectoryValueCell value={user.distributorName} />
                      </td>
                      <td className="px-2 py-2">
                        <DirectoryValueCell value={user.territory} />
                      </td>
                      <td className="px-2 py-2 tabular-nums">
                        {user.assignedLabsCount ?? 0}
                        {user.labCountMismatch ? (
                          <span className="block text-[10px] text-amber-700">
                            {user.assignedLabsFromAssignments !== user.assignedLabsCount
                              ? `labs: ${user.assignedLabsFromAssignments}`
                              : null}
                            {user.assignedLabsFromOwnership !== user.assignedLabsCount
                              ? `${user.assignedLabsFromAssignments !== user.assignedLabsCount ? " · " : ""}ownership: ${user.assignedLabsFromOwnership}`
                              : null}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2">
                        <StatusBadge active={user.active} />
                      </td>
                      <td
                        className={cn(
                          "px-2 py-2",
                          user.lastLogin === "Never" ? "text-slate-400" : "text-slate-700"
                        )}
                      >
                        {user.lastLogin}
                      </td>
                      <td className="px-2 py-2">{formatOpsDate(user.createdAt)}</td>
                      <td className="px-2 py-2">
                        <DirectoryRowActionsMenu
                          user={user}
                          rowActions={rowActions}
                          busyId={busyId}
                          resettingUserId={resettingUserId}
                          onReview={(u) => setReviewUser(u)}
                          onAssign={(u) => setAssignmentUser(u)}
                          onDeactivate={(u) => setDeactivateUser(u)}
                          onReactivate={(u) => promptReactivate(u)}
                          onResetPassword={(u) => promptResetPassword(u)}
                          onTransferLab={(u) => {
                            const firstLab = labsForAgentPortalAligned(
                              u,
                              labAssignments,
                              ownershipRows
                            )[0];
                            if (firstLab) setTransferLab(firstLab);
                            else onError?.("Assign a lab first before transfer");
                          }}
                        />
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {tab === "labOwnership" ? (
        <LabOwnershipPanel
          tenantId={tenantId}
          bundle={bundle}
          loading={loading}
          focusLabId={focusLabId}
          openAssignDrawer={openAssignDrawer}
          scrollToUnassigned={ownershipScrollUnassigned}
          onReload={onReload}
          onError={onError}
          onStatus={onStatus}
        />
      ) : null}

      {tab === "pilotOnboarding" ? (
        <div className="space-y-4">
          <PilotHardeningChecksPanel
            tenantId={tenantId}
            setActivePage={setActivePage}
            onStatus={onStatus}
            onError={onError}
          />
          <PilotOnboardingImportPanel
            tenantId={tenantId}
            bundle={bundle}
            defaultDistributorTenantId={
              distributorAssignments[0]?.distributorId || tenantId
            }
            agents={agents}
            onReload={onReload}
            onStatus={onStatus}
            onError={onError}
          />
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

      <OperationsReadinessFooter footer={readinessFooter} loadedAt={loadedAt} />

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
          roleOptions={roleOptions}
          onClose={() => setCreateOpen(false)}
          onSaved={async () => {
            onStatus?.("User account created");
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

      {reviewUser ? (
        <UserDetailDrawer
          user={reviewUser}
          auditEvents={auditEvents}
          labAssignments={labAssignments}
          ownershipRows={ownershipRows}
          distributorAssignments={distributorAssignments}
          allowProbeActions={allowProbeActions}
          busyId={busyId}
          resettingUserId={resettingUserId}
          onClose={() => setReviewUser(null)}
          onAssign={(user) => {
            setReviewUser(null);
            setAssignmentUser(user);
          }}
          onDeactivate={(user) => {
            setReviewUser(null);
            setDeactivateUser(user);
          }}
          onReactivate={(user) => promptReactivate(user)}
          onResetPassword={(user) => promptResetPassword(user)}
        />
      ) : null}

      {assignmentUser ? (
        <UserAssignmentDrawer
          user={assignmentUser}
          agents={agents}
          labAssignments={labAssignments}
          ownershipRows={ownershipRows}
          distributors={distributorAssignments}
          tenantId={tenantId}
          actorRole={actorRole}
          roleOptions={roleOptions}
          focusLabId={focusLabId}
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
          tenantId={tenantId}
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
