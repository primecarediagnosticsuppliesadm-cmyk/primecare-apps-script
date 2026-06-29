import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import OwnershipStatusCard from "@/components/operations/OwnershipStatusCard.jsx";
import LabOwnershipDrawer from "@/components/operations/LabOwnershipDrawer.jsx";
import { USER_DIRECTORY_CLASS } from "@/operations/userDirectoryClassification.js";
import { isAgentRole } from "@/operations/operationsCenterAdminEngine.js";
import { labsForAgentPortalAligned } from "@/operations/userDirectoryIntegrityEngine.js";
import { summarizeAgentWorkloadRow } from "@/operations/operationsCenterCertificationUi.js";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

function str(v) {
  return String(v ?? "").trim();
}

function formatCurrency(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

function WorkloadStatusBadge({ label, tone }) {
  return (
    <Badge
      variant={tone === "warn" ? "secondary" : "default"}
      className={cn(
        "text-[10px] font-normal",
        tone === "warn" && "bg-amber-100 text-amber-900 hover:bg-amber-100",
        tone === "ok" && "bg-emerald-100 text-emerald-900 hover:bg-emerald-100",
        tone === "inactive" && "bg-slate-100 text-slate-700 hover:bg-slate-100"
      )}
    >
      {label}
    </Badge>
  );
}

function SeverityBadge({ severity }) {
  const variant =
    severity === "CRITICAL" ? "destructive" : severity === "ATTENTION" ? "default" : "secondary";
  return <Badge variant={variant}>{severity}</Badge>;
}

export default function LabOwnershipPanel({
  tenantId,
  bundle,
  loading = false,
  focusLabId = "",
  openAssignDrawer = false,
  scrollToUnassigned = false,
  onReload,
  onError,
  onStatus,
}) {
  const [search, setSearch] = useState("");
  const [selectedLab, setSelectedLab] = useState(null);
  const unassignedRef = useRef(null);

  const metrics = bundle?.ownershipMetrics || {};
  const agents = bundle?.agents || [];
  const directoryUsers = bundle?.directoryUsers || [];
  const labAssignments = bundle?.labAssignments || [];
  const ownershipRows = bundle?.ownershipRows || [];

  const filteredUnassigned = useMemo(() => {
    const q = search.toLowerCase();
    return (metrics.unassignedAttention || []).filter((lab) => {
      if (!q) return true;
      return `${lab.labName} ${lab.labId} ${lab.tenantName}`.toLowerCase().includes(q);
    });
  }, [metrics.unassignedAttention, search]);

  const enrichedLabs = metrics.enrichedLabs || [];
  const ownedLabs = useMemo(
    () => enrichedLabs.filter((l) => l.hasOwnership),
    [enrichedLabs]
  );

  const showTerritory = useMemo(
    () => ownedLabs.some((lab) => str(lab.territory || lab.area)),
    [ownedLabs]
  );
  const showOutstanding = useMemo(
    () => ownedLabs.some((lab) => Number.isFinite(Number(lab.outstanding)) && Number(lab.outstanding) > 0),
    [ownedLabs]
  );
  const showLastVisit = useMemo(
    () => ownedLabs.some((lab) => str(lab.lastVisit)),
    [ownedLabs]
  );
  const showNextVisit = useMemo(
    () => ownedLabs.some((lab) => str(lab.nextFollowUp)),
    [ownedLabs]
  );
  const showStatus = useMemo(
    () => ownedLabs.some((lab) => str(lab.status) && str(lab.status) !== "—"),
    [ownedLabs]
  );

  const agentWorkload = useMemo(() => {
    const rows = [];
    let probeAgg = { labs: 0, outstandingTotal: 0, lastVisits: [] };

    for (const user of directoryUsers) {
      const assignedLabs = isAgentRole(user.role)
        ? labsForAgentPortalAligned(user, labAssignments, ownershipRows)
        : [];
      const labs = assignedLabs.length || Number(user.assignedLabsCount) || 0;
      if (!labs) continue;

      const summary = summarizeAgentWorkloadRow(user, assignedLabs, {
        inactive: user.active === false,
      });
      const cls = user.userClass;

      if (cls === USER_DIRECTORY_CLASS.PROBE_DEBUG) {
        probeAgg.labs += summary.labs;
        probeAgg.outstandingTotal += summary.outstandingTotal;
        if (summary.lastVisit) probeAgg.lastVisits.push(summary.lastVisit);
        continue;
      }

      if (isAgentRole(user.role)) {
        rows.push({
          name: user.displayName || user.name || user.agentId,
          userId: user.userId,
          aggregate: false,
          muted: user.active === false,
          ...summary,
        });
      }
    }

    rows.sort((a, b) => b.labs - a.labs || a.name.localeCompare(b.name));

    if (probeAgg.labs > 0) {
      rows.push({
        name: "Probe Users",
        aggregate: true,
        muted: true,
        labs: probeAgg.labs,
        outstandingTotal: probeAgg.outstandingTotal,
        lastVisit: probeAgg.lastVisits.sort((a, b) => b.localeCompare(a))[0] || "",
        statusLabel: "Attention",
        statusTone: "warn",
        showOutstanding: probeAgg.outstandingTotal > 0,
        showLastVisit: probeAgg.lastVisits.length > 0,
      });
    }

    return rows;
  }, [directoryUsers, labAssignments, ownershipRows]);

  const workloadShowOutstanding = agentWorkload.some((r) => r.showOutstanding);
  const workloadShowLastVisit = agentWorkload.some((r) => r.showLastVisit);

  useEffect(() => {
    const lid = str(focusLabId);
    if (!lid || loading) return;
    const lab =
      (metrics.unassignedAttention || []).find(
        (row) => str(row.labId).toLowerCase() === lid.toLowerCase()
      ) ||
      enrichedLabs.find((row) => str(row.labId).toLowerCase() === lid.toLowerCase());
    if (lab && openAssignDrawer) setSelectedLab(lab);
  }, [focusLabId, openAssignDrawer, loading, metrics.unassignedAttention, enrichedLabs]);

  useEffect(() => {
    if (!scrollToUnassigned || loading) return;
    window.setTimeout(() => {
      unassignedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
  }, [scrollToUnassigned, loading]);

  return (
    <div className="space-y-4">
      <OwnershipStatusCard metrics={metrics} />

      {agentWorkload.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <h3 className="mb-1 text-sm font-semibold text-slate-900">Agent Workload Health</h3>
          <p className="mb-3 text-[11px] text-slate-500">
            Read-only summary from directory assignments and laboratory credit data.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-slate-500">
                  <th className="px-2 py-2">Agent Name</th>
                  <th className="px-2 py-2">Assigned Laboratories</th>
                  {workloadShowOutstanding ? (
                    <th className="px-2 py-2">Outstanding Receivables</th>
                  ) : null}
                  {workloadShowLastVisit ? <th className="px-2 py-2">Last Visit</th> : null}
                  <th className="px-2 py-2">Operational Status</th>
                </tr>
              </thead>
              <tbody>
                {agentWorkload.map((row) => (
                  <tr
                    key={row.userId || row.name}
                    className={cn(
                      "border-b border-slate-100",
                      row.aggregate && "bg-amber-50/40",
                      row.muted && "bg-slate-50/80 text-slate-600"
                    )}
                  >
                    <td className="px-2 py-2 font-medium text-slate-900">{row.name}</td>
                    <td className="px-2 py-2 tabular-nums">
                      {row.labs} {row.labs === 1 ? "Lab" : "Labs"}
                    </td>
                    {workloadShowOutstanding ? (
                      <td className="px-2 py-2 tabular-nums">
                        {row.showOutstanding ? formatCurrency(row.outstandingTotal) : "—"}
                      </td>
                    ) : null}
                    {workloadShowLastVisit ? (
                      <td className="px-2 py-2">{row.showLastVisit ? row.lastVisit : "—"}</td>
                    ) : null}
                    <td className="px-2 py-2">
                      <WorkloadStatusBadge label={row.statusLabel} tone={row.statusTone} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-slate-200 bg-white p-3 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Agent Workload Health</h3>
          <p className="mt-2 text-xs text-slate-500">
            No field agents with assigned laboratories in the current scope.
          </p>
        </section>
      )}

      <section
        ref={unassignedRef}
        className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
      >
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Unassigned Laboratories</h3>
            <p className="text-[11px] text-slate-500">
              CRITICAL if unassigned &gt; 7 days · ATTENTION otherwise
            </p>
          </div>
          <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-slate-400" />
            <Input
              className="pl-8"
              placeholder="Search labs…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search unassigned laboratories"
            />
          </div>
        </div>

        {filteredUnassigned.length === 0 ? (
          <div className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-slate-500">
            <p className="font-medium text-slate-700">No unassigned laboratories.</p>
            <p className="mt-1">All laboratories currently have an assigned owner.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-xs">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-slate-500">
                  <th className="px-2 py-2">Lab</th>
                  <th className="px-2 py-2">Distributor</th>
                  <th className="px-2 py-2">Severity</th>
                  <th className="px-2 py-2">Days</th>
                  <th className="px-2 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredUnassigned.map((lab) => (
                  <tr key={`${lab.tenantId}-${lab.labId}`} className="border-b border-slate-100">
                    <td className="px-2 py-2 font-medium text-slate-900">
                      {lab.labName || lab.labId}
                      <span className="ml-1 font-mono text-[10px] text-slate-400">{lab.labId}</span>
                    </td>
                    <td className="px-2 py-2">{lab.tenantName || "—"}</td>
                    <td className="px-2 py-2">
                      <SeverityBadge severity={lab.severity} />
                    </td>
                    <td className="px-2 py-2 tabular-nums">{lab.daysUnassigned ?? "—"}</td>
                    <td className="px-2 py-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[10px]"
                        onClick={() => setSelectedLab(lab)}
                      >
                        Assign owner
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Owned Laboratories</h3>
        {ownedLabs.length === 0 ? (
          <div className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-slate-500">
            <p className="font-medium text-slate-700">No owned laboratories in scope.</p>
            <p className="mt-1">Assign primary owners from the unassigned list above.</p>
          </div>
        ) : (
          <div className="max-h-80 overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[900px] text-xs">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-slate-500">
                  <th className="px-2 py-2">Lab</th>
                  <th className="px-2 py-2">Primary Owner</th>
                  <th className="px-2 py-2">Secondary Owner</th>
                  <th className="px-2 py-2">Regional Manager</th>
                  {showStatus ? <th className="px-2 py-2">Status</th> : null}
                  {showTerritory ? <th className="px-2 py-2">Territory</th> : null}
                  {showOutstanding ? <th className="px-2 py-2">Outstanding</th> : null}
                  {showLastVisit ? <th className="px-2 py-2">Last Visit</th> : null}
                  {showNextVisit ? <th className="px-2 py-2">Next Visit</th> : null}
                </tr>
              </thead>
              <tbody>
                {ownedLabs.slice(0, 100).map((lab) => (
                  <tr
                    key={`${lab.tenantId}-${lab.labId}`}
                    className={cn("border-b border-slate-100 cursor-pointer hover:bg-slate-50")}
                    onClick={() => setSelectedLab(lab)}
                  >
                    <td className="px-2 py-2">
                      <span className="font-medium text-slate-900">{lab.labName || lab.labId}</span>
                      <span className="ml-1 font-mono text-[10px] text-slate-400">{lab.labId}</span>
                    </td>
                    <td className="px-2 py-2">{lab.primaryAgentId || "—"}</td>
                    <td className="px-2 py-2">{lab.secondaryAgentId || "—"}</td>
                    <td className="px-2 py-2">
                      {lab.managerId ? str(lab.managerId).slice(0, 8) : "—"}
                    </td>
                    {showStatus ? <td className="px-2 py-2">{lab.status || "—"}</td> : null}
                    {showTerritory ? (
                      <td className="px-2 py-2">{lab.territory || lab.area || "—"}</td>
                    ) : null}
                    {showOutstanding ? (
                      <td className="px-2 py-2 tabular-nums">
                        {formatCurrency(lab.outstanding) || "—"}
                      </td>
                    ) : null}
                    {showLastVisit ? <td className="px-2 py-2">{lab.lastVisit || "—"}</td> : null}
                    {showNextVisit ? (
                      <td className="px-2 py-2">{lab.nextFollowUp || "—"}</td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedLab ? (
        <LabOwnershipDrawer
          lab={selectedLab}
          tenantId={tenantId}
          agents={agents}
          directoryUsers={directoryUsers}
          onClose={() => setSelectedLab(null)}
          onSaved={() => {
            setSelectedLab(null);
            onStatus?.("Ownership updated");
            onReload?.();
          }}
          onError={onError}
        />
      ) : null}

      {loading ? <p className="text-xs text-slate-500">Refreshing ownership…</p> : null}
    </div>
  );
}
