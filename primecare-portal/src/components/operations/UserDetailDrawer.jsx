import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import {
  EMAIL_NOT_ADDED,
  isAgentRole,
  distributorsForAgent,
} from "@/operations/operationsCenterAdminEngine.js";
import { enrichAccessAuditEvent } from "@/operations/accessAuditEngine.js";
import {
  formatLastLogin,
  resolveDirectoryRowActions,
  USER_DIRECTORY_CLASS,
  USER_DIRECTORY_CLASS_LABELS,
} from "@/operations/userProvisioningEngine.js";
import { labsForAgentPortalAligned } from "@/operations/userDirectoryIntegrityEngine.js";
import { cn } from "@/lib/utils";

function str(v) {
  return String(v ?? "").trim();
}

function StatusBadge({ active }) {
  return (
    <Badge variant={active ? "default" : "secondary"}>{active ? "Active" : "Inactive"}</Badge>
  );
}

function ProfileSection({ title, children, className }) {
  return (
    <section className={cn("rounded-lg border border-slate-200 bg-white", className)}>
      <h4 className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h4>
      <div className="px-3 py-2.5">{children}</div>
    </section>
  );
}

function InfoRow({ label, value, mono = false }) {
  const text = str(value);
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-xs">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className={cn("text-right text-slate-900", mono && "font-mono text-[11px]")}>
        {text || "—"}
      </span>
    </div>
  );
}

function formatAuditTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return str(value);
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function formatCurrency(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * HQ operator profile — read-only context with action CTAs delegated to parent.
 */
export default function UserDetailDrawer({
  user,
  auditEvents = [],
  labAssignments = [],
  ownershipRows = [],
  distributorAssignments = [],
  allowProbeActions = false,
  onClose,
  onAssign,
  onDeactivate,
  onReactivate,
  onResetPassword,
  busyId = "",
  resettingUserId = "",
}) {
  const assignedLabs = useMemo(() => {
    if (!user) return [];
    if (isAgentRole(user.role)) {
      return labsForAgentPortalAligned(user, labAssignments, ownershipRows);
    }
    if (user.labId) {
      const lab = labAssignments.find((l) => str(l.labId) === str(user.labId));
      return lab ? [lab] : [];
    }
    return [];
  }, [user, labAssignments, ownershipRows]);

  const assignedDistributors = useMemo(() => {
    if (!user || !isAgentRole(user.role)) return [];
    return distributorsForAgent(user, distributorAssignments);
  }, [user, distributorAssignments]);

  const userAuditEvents = useMemo(() => {
    if (!user) return [];
    const userNameById = new Map([[str(user.userId), str(user.name || user.displayName)]]);
    return (auditEvents || [])
      .filter((ev) => str(ev.subjectUserId || ev.targetUserId) === str(user.userId))
      .map((ev) => (ev.actionLabel ? ev : enrichAccessAuditEvent(ev, { userNameById })))
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
      .slice(0, 20);
  }, [user, auditEvents]);

  const collectionsSummary = useMemo(() => {
    const totalOutstanding = assignedLabs.reduce(
      (sum, lab) => sum + (Number.isFinite(Number(lab.outstanding)) ? Number(lab.outstanding) : 0),
      0
    );
    const withBalance = assignedLabs.filter(
      (lab) => Number.isFinite(Number(lab.outstanding)) && Number(lab.outstanding) > 0
    );
    return { totalOutstanding, withBalance };
  }, [assignedLabs]);

  const visitsSummary = useMemo(() => {
    const withLastVisit = assignedLabs.filter((lab) => str(lab.lastVisit));
    const withNext = assignedLabs.filter((lab) => str(lab.nextFollowUp));
    return { withLastVisit, withNext };
  }, [assignedLabs]);

  const rowActions = useMemo(
    () => (user ? resolveDirectoryRowActions(user, { allowProbeActions }) : {}),
    [user, allowProbeActions]
  );

  const lastPasswordReset = useMemo(() => {
    const ev = userAuditEvents.find((e) => e.actionKey === "password_reset");
    return ev?.timestamp || null;
  }, [userAuditEvents]);

  const lastAssignment = useMemo(() => {
    const keys = new Set([
      "ownership_assigned",
      "ownership_transferred",
      "ownership_reassigned",
      "lab_transferred",
      "updated",
    ]);
    const ev = userAuditEvents.find((e) => keys.has(e.actionKey));
    return ev || null;
  }, [userAuditEvents]);

  const assignmentAuditEvents = useMemo(
    () =>
      userAuditEvents.filter((e) =>
        ["ownership_assigned", "ownership_transferred", "ownership_reassigned", "lab_transferred"].includes(
          e.actionKey
        )
      ),
    [userAuditEvents]
  );

  const lastLoginLabel = formatLastLogin(user?.lastLoginAt ?? user?.lastLogin);

  if (!user) return null;

  const userClassLabel = USER_DIRECTORY_CLASS_LABELS[user.userClass] || "User";
  const isProbe = user.userClass === USER_DIRECTORY_CLASS.PROBE_DEBUG;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="flex h-full w-full max-w-xl flex-col border-l bg-slate-50 shadow-xl">
        <div className="flex items-center justify-between border-b bg-white px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Operator Profile</h3>
            <p className="text-xs text-slate-500">{user.displayName || user.name}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {isProbe ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Probe/debug account — review only unless dev mode is enabled.
            </p>
          ) : null}

          <ProfileSection title="Identity">
            <div className="space-y-0.5">
              <InfoRow label="Display name" value={user.displayName || user.name} />
              <InfoRow label="Username" value={user.username} />
              <InfoRow label="Email" value={user.email || EMAIL_NOT_ADDED} />
              <InfoRow label="Phone" value={user.phone} />
              <InfoRow label="User ID" value={user.userIdShort || user.userId?.slice(0, 8)} mono />
              <InfoRow label="Tenant" value={user.tenantId} mono />
              <InfoRow label="Classification" value={userClassLabel} />
            </div>
          </ProfileSection>

          <ProfileSection title="Role">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{user.roleLabel || user.role}</Badge>
              {!user.loginEnabled ? (
                <Badge variant="secondary" className="text-[10px]">
                  No login
                </Badge>
              ) : null}
            </div>
            {user.agentId ? (
              <div className="mt-2">
                <InfoRow label="Agent ID" value={user.agentId} mono />
              </div>
            ) : null}
            {user.labId ? (
              <div className="mt-1">
                <InfoRow label="Lab ID" value={user.labId} mono />
              </div>
            ) : null}
          </ProfileSection>

          <ProfileSection title="Status">
            <div className="flex items-center gap-2">
              <StatusBadge active={user.active !== false} />
              <span className="text-xs text-slate-600">
                {user.active !== false ? "Account is active" : "Account is inactive"}
              </span>
            </div>
          </ProfileSection>

          <ProfileSection title="Assignments">
            <InfoRow label="Distributor" value={user.distributorName || "Not assigned"} />
            <InfoRow label="Territory" value={user.territory || "Not assigned"} />
            {assignedDistributors.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                {assignedDistributors.map((dist) => (
                  <li key={dist.distributorId} className="rounded border border-slate-100 px-2 py-1">
                    {dist.distributorName || dist.distributorId}
                  </li>
                ))}
              </ul>
            ) : null}
          </ProfileSection>

          <ProfileSection title={`Owned Laboratories (${assignedLabs.length})`}>
            {assignedLabs.length === 0 ? (
              <p className="text-xs text-slate-500">No laboratories assigned to this operator.</p>
            ) : (
              <ul className="max-h-40 space-y-1.5 overflow-y-auto text-xs">
                {assignedLabs.map((lab) => (
                  <li
                    key={`${lab.tenantId}-${lab.labId}`}
                    className="rounded border border-slate-100 bg-slate-50/80 px-2 py-1.5"
                  >
                    <div className="font-medium text-slate-900">{lab.labName || lab.labId}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-slate-500">
                      <span className="font-mono">{lab.labId}</span>
                      {lab.tenantName ? <span>· {lab.tenantName}</span> : null}
                      {Number(lab.outstanding) > 0 ? (
                        <span>· {formatCurrency(lab.outstanding)} due</span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ProfileSection>

          {collectionsSummary.withBalance.length > 0 ? (
            <ProfileSection title="Collections">
              <InfoRow
                label="Total outstanding"
                value={formatCurrency(collectionsSummary.totalOutstanding)}
              />
              <InfoRow
                label="Labs with balance"
                value={collectionsSummary.withBalance.length}
              />
            </ProfileSection>
          ) : null}

          {visitsSummary.withLastVisit.length > 0 || visitsSummary.withNext.length > 0 ? (
            <ProfileSection title="Visits">
              {visitsSummary.withLastVisit.slice(0, 5).map((lab) => (
                <InfoRow
                  key={`lv-${lab.labId}`}
                  label={lab.labName || lab.labId}
                  value={lab.lastVisit}
                />
              ))}
              {visitsSummary.withNext.slice(0, 5).map((lab) => (
                <InfoRow
                  key={`nv-${lab.labId}`}
                  label={`Next · ${lab.labName || lab.labId}`}
                  value={lab.nextFollowUp}
                />
              ))}
            </ProfileSection>
          ) : null}

          {assignmentAuditEvents.length > 0 ? (
            <ProfileSection title="Orders">
              <p className="mb-2 text-[11px] text-slate-500">
                Order-related activity is not loaded in Operations Center. Showing assignment audit
                entries only when present.
              </p>
              <ul className="max-h-32 space-y-1 overflow-y-auto text-xs">
                {assignmentAuditEvents.slice(0, 6).map((ev) => (
                  <li key={`ord-${ev.id}`} className="rounded border border-slate-100 px-2 py-1">
                    <span className="font-medium text-slate-800">{ev.actionLabel}</span>
                    <span className="ml-2 text-[10px] text-slate-400">
                      {formatAuditTime(ev.timestamp)}
                    </span>
                  </li>
                ))}
              </ul>
            </ProfileSection>
          ) : null}

          <ProfileSection title="Administrative Metadata">
            <InfoRow label="Created" value={formatAuditTime(user.createdAt)} />
            <InfoRow label="Last login" value={lastLoginLabel} />
            <InfoRow
              label="Last password reset"
              value={lastPasswordReset ? formatAuditTime(lastPasswordReset) : "Not recorded"}
            />
            <InfoRow
              label="Last assignment change"
              value={
                lastAssignment
                  ? `${lastAssignment.actionLabel} · ${formatAuditTime(lastAssignment.timestamp)}`
                  : "Not recorded"
              }
            />
            <InfoRow label="Account status" value={user.active !== false ? "Active" : "Inactive"} />
          </ProfileSection>

          <ProfileSection title="Recent Activity">
            {userAuditEvents.length === 0 ? (
              <p className="text-xs text-slate-500">
                No account activity in the loaded audit window.
              </p>
            ) : (
              <ul className="max-h-48 space-y-1.5 overflow-y-auto text-xs">
                {userAuditEvents.slice(0, 8).map((ev) => (
                  <li key={ev.id} className="rounded border border-slate-100 bg-slate-50/50 px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-800">{ev.actionLabel}</span>
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {formatAuditTime(ev.timestamp)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ProfileSection>

          <ProfileSection title="Audit Trail">
            {userAuditEvents.length === 0 ? (
              <p className="text-xs text-slate-500">No provisioning audit events on record.</p>
            ) : (
              <ul className="max-h-56 space-y-1 overflow-y-auto text-[11px]">
                {userAuditEvents.map((ev) => (
                  <li key={`audit-${ev.id}`} className="border-b border-slate-100 py-1.5 last:border-0">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium text-slate-800">{ev.actionLabel}</span>
                      <span className="text-slate-400">{formatAuditTime(ev.timestamp)}</span>
                    </div>
                    <p className="text-slate-500">{ev.status || "Success"}</p>
                  </li>
                ))}
              </ul>
            )}
          </ProfileSection>
        </div>

        <div className="flex flex-wrap gap-2 border-t bg-white px-4 py-3">
          {rowActions.assign || rowActions.assignLab ? (
            <Button type="button" size="sm" onClick={() => onAssign?.(user)}>
              {rowActions.assignLab ? "Assign Lab" : "Assign"}
            </Button>
          ) : null}
          {rowActions.deactivate ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-red-700"
              disabled={busyId === user.userId}
              onClick={() => onDeactivate?.(user)}
            >
              Deactivate
            </Button>
          ) : null}
          {rowActions.reactivate ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busyId === user.userId}
              onClick={() => onReactivate?.(user)}
            >
              Reactivate
            </Button>
          ) : null}
          {rowActions.resetPassword ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={resettingUserId === user.userId}
              onClick={() => onResetPassword?.(user)}
            >
              {resettingUserId === user.userId ? "Resetting…" : "Reset Password"}
            </Button>
          ) : null}
          {rowActions.probeRestricted ? (
            <span className="self-center text-xs text-amber-800">Review only</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
