import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import OwnershipStatusCard from "@/components/operations/OwnershipStatusCard.jsx";
import LabOwnershipDrawer from "@/components/operations/LabOwnershipDrawer.jsx";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

function str(v) {
  return String(v ?? "").trim();
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
  onReload,
  onError,
  onStatus,
}) {
  const [search, setSearch] = useState("");
  const [selectedLab, setSelectedLab] = useState(null);

  const metrics = bundle?.ownershipMetrics || {};
  const agents = bundle?.agents || [];
  const directoryUsers = bundle?.directoryUsers || [];

  const filteredUnassigned = useMemo(() => {
    const q = search.toLowerCase();
    return (metrics.unassignedAttention || []).filter((lab) => {
      if (!q) return true;
      return `${lab.labName} ${lab.labId} ${lab.tenantName}`.toLowerCase().includes(q);
    });
  }, [metrics.unassignedAttention, search]);

  const enrichedLabs = metrics.enrichedLabs || [];

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

  return (
    <div className="space-y-4">
      <OwnershipStatusCard metrics={metrics} />

      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Unassigned Labs</h3>
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
            />
          </div>
        </div>

        {filteredUnassigned.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-slate-500">
            All labs in scope have an assigned owner.
          </p>
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
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Owned Labs</h3>
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-slate-500">
                <th className="px-2 py-2">Lab</th>
                <th className="px-2 py-2">Primary</th>
                <th className="px-2 py-2">Secondary</th>
                <th className="px-2 py-2">Manager</th>
              </tr>
            </thead>
            <tbody>
              {enrichedLabs
                .filter((l) => l.hasOwnership)
                .slice(0, 50)
                .map((lab) => (
                  <tr
                    key={`${lab.tenantId}-${lab.labId}`}
                    className={cn("border-b border-slate-100 cursor-pointer hover:bg-slate-50")}
                    onClick={() => setSelectedLab(lab)}
                  >
                    <td className="px-2 py-2">{lab.labName || lab.labId}</td>
                    <td className="px-2 py-2">{lab.primaryAgentId || "—"}</td>
                    <td className="px-2 py-2">{lab.secondaryAgentId || "—"}</td>
                    <td className="px-2 py-2">{lab.managerId ? lab.managerId.slice(0, 8) : "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
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
