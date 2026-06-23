import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import {
  EMAIL_NOT_ADDED,
  labsForAgent,
  isAgentRole,
} from "@/operations/operationsCenterAdminEngine.js";
import { enrichAccessAuditEvent } from "@/operations/accessAuditEngine.js";

function str(v) {
  return String(v ?? "").trim();
}

function StatusBadge({ active }) {
  return (
    <Badge variant={active ? "default" : "secondary"}>{active ? "Active" : "Inactive"}</Badge>
  );
}

function formatAuditTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return str(value);
  return d.toLocaleString();
}

/**
 * HQ Review User drawer — read-only context + action CTAs (writes delegated to parent).
 */
export default function UserDetailDrawer({
  user,
  auditEvents = [],
  labAssignments = [],
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
    if (isAgentRole(user.role)) return labsForAgent(user, labAssignments);
    if (user.labId) {
      const lab = labAssignments.find((l) => str(l.labId) === str(user.labId));
      return lab ? [lab] : [];
    }
    return [];
  }, [user, labAssignments]);

  const userAuditEvents = useMemo(() => {
    if (!user) return [];
    const userNameById = new Map([[str(user.userId), str(user.name || user.displayName)]]);
    return (auditEvents || [])
      .filter((ev) => str(ev.subjectUserId) === str(user.userId))
      .map((ev) => enrichAccessAuditEvent(ev, { userNameById }))
      .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
      .slice(0, 12);
  }, [user, auditEvents]);

  const lastPasswordReset = useMemo(() => {
    const resets = userAuditEvents.filter((ev) => ev.actionKey === "password_reset");
    return resets[0]?.timestamp || null;
  }, [userAuditEvents]);

  if (!user) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="flex h-full w-full max-w-md flex-col border-l bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Review User</h3>
            <p className="text-xs text-slate-500">{user.displayName || user.name}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          <section className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg border bg-slate-50/80 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Role</p>
              <p className="mt-0.5 font-medium text-slate-900">{user.roleLabel || user.role}</p>
            </div>
            <div className="rounded-lg border bg-slate-50/80 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Status</p>
              <div className="mt-1">
                <StatusBadge active={user.active !== false} />
              </div>
            </div>
            <div className="rounded-lg border px-3 py-2 col-span-2">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Email</p>
              <p className="mt-0.5 text-slate-800">{user.email || EMAIL_NOT_ADDED}</p>
            </div>
            <div className="rounded-lg border px-3 py-2">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Distributor</p>
              <p className="mt-0.5 text-slate-800">{user.distributorName || "—"}</p>
            </div>
            <div className="rounded-lg border px-3 py-2">
              <p className="text-[10px] font-semibold uppercase text-slate-500">Territory</p>
              <p className="mt-0.5 text-slate-800">{user.territory || "—"}</p>
            </div>
          </section>

          <section>
            <p className="mb-2 text-xs font-semibold text-slate-700">
              Assigned labs ({assignedLabs.length})
            </p>
            {assignedLabs.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-slate-500">
                No labs assigned to this user.
              </p>
            ) : (
              <ul className="max-h-36 space-y-1 overflow-y-auto text-xs">
                {assignedLabs.map((lab) => (
                  <li
                    key={`${lab.tenantId}-${lab.labId}`}
                    className="rounded border border-slate-100 bg-white px-2 py-1.5"
                  >
                    <span className="font-medium text-slate-900">{lab.labName || lab.labId}</span>
                    {lab.tenantName ? (
                      <span className="ml-1 text-slate-500">· {lab.tenantName}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <p className="mb-2 text-xs font-semibold text-slate-700">Last password reset</p>
            <p className="text-xs text-slate-600">
              {lastPasswordReset
                ? formatAuditTime(lastPasswordReset)
                : "Not recorded in loaded audit window"}
            </p>
          </section>

          <section>
            <p className="mb-2 text-xs font-semibold text-slate-700">Recent audit events</p>
            {userAuditEvents.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-slate-500">
                No provisioning audit events for this user in the loaded window.
              </p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {userAuditEvents.map((ev) => (
                  <li
                    key={ev.id}
                    className="rounded border border-slate-100 bg-slate-50/50 px-2 py-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-800">{ev.actionLabel}</span>
                      <span className="shrink-0 text-[10px] text-slate-400">
                        {formatAuditTime(ev.timestamp)}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500">{ev.status || "Success"}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="flex flex-wrap gap-2 border-t px-4 py-3">
          <Button type="button" size="sm" onClick={() => onAssign?.(user)}>
            Assign
          </Button>
          {user.active !== false ? (
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
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busyId === user.userId}
              onClick={() => onReactivate?.(user)}
            >
              Reactivate
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={resettingUserId === user.userId}
            onClick={() => onResetPassword?.(user)}
          >
            {resettingUserId === user.userId ? "Resetting…" : "Reset Pwd"}
          </Button>
        </div>
      </div>
    </div>
  );
}
