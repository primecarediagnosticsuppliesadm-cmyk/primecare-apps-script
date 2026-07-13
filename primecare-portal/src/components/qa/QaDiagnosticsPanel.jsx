import React, { useEffect, useMemo, useState } from "react";
import { QA_DIAGNOSTICS_ENABLED } from "@/config/environment.js";
import { qaDiagnosticsStore } from "@/qa/qaDiagnosticsStore.js";
import { cn } from "@/lib/utils";
import { Activity, ChevronDown, ChevronUp, X } from "lucide-react";

function TimingTable({ title, rows }) {
  if (!rows?.length) {
    return (
      <div>
        <p className="text-[10px] font-semibold uppercase text-slate-500">{title}</p>
        <p className="text-[10px] text-slate-400">—</p>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase text-slate-500">{title}</p>
      <div className="max-h-28 overflow-y-auto rounded border bg-white text-[10px]">
        <table className="min-w-full">
          <tbody>
            {rows.map((row, idx) => (
              <tr key={`${row.label}-${idx}`} className="border-b border-slate-100 last:border-0">
                <td className="px-1.5 py-0.5 text-slate-700">{row.label}</td>
                <td className="px-1.5 py-0.5 text-right tabular-nums text-slate-900">{row.ms}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function QaDiagnosticsPanel({ currentUser = null }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!QA_DIAGNOSTICS_ENABLED) return undefined;
    return qaDiagnosticsStore.subscribe(() => tick((n) => n + 1));
  }, []);

  const snapshot = useMemo(
    () =>
      qaDiagnosticsStore.getSnapshot({
        tenant: String(currentUser?.tenantId || currentUser?.tenant_id || "—"),
        user: String(currentUser?.email || currentUser?.name || "—"),
        role: String(currentUser?.role || "—"),
      }),
    [currentUser, open]
  );

  if (!QA_DIAGNOSTICS_ENABLED) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-3 right-3 z-[100] flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-600 px-3 py-1.5 text-[10px] font-semibold text-white shadow-lg"
        aria-label="Open QA diagnostics"
      >
        <Activity className="h-3 w-3" aria-hidden />
        QA
      </button>
    );
  }

  const vitals = snapshot.webVitals || {};

  return (
    <div
      className={cn(
        "fixed bottom-3 right-3 z-[100] w-[min(100vw-1.5rem,22rem)] rounded-xl border border-slate-200 bg-slate-50/95 shadow-xl backdrop-blur",
        !expanded && "w-auto"
      )}
      role="complementary"
      aria-label="QA diagnostics"
    >
      <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-bold text-slate-900">QA Diagnostics</p>
          <p className="truncate text-[9px] text-slate-500">
            {snapshot.stamp} · {snapshot.branch} · {snapshot.environment}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            className="rounded p-1 text-slate-500 hover:bg-slate-200"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? "Collapse panel" : "Expand panel"}
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            className="rounded p-1 text-slate-500 hover:bg-slate-200"
            onClick={() => setOpen(false)}
            aria-label="Close QA diagnostics"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="space-y-2 p-2 text-[10px]">
          <div className="grid grid-cols-2 gap-1 rounded border bg-white p-1.5">
            <div>
              <span className="text-slate-500">Commit</span>
              <p className="truncate font-mono text-slate-800">{snapshot.commit}</p>
            </div>
            <div>
              <span className="text-slate-500">Tenant</span>
              <p className="truncate font-mono text-slate-800">{snapshot.tenant}</p>
            </div>
            <div className="col-span-2">
              <span className="text-slate-500">User</span>
              <p className="truncate text-slate-800">{snapshot.user}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1">
            <div className="rounded border bg-white p-1.5 text-center">
              <p className="text-slate-500">FCP</p>
              <p className="font-bold tabular-nums">{vitals.fcp?.value ?? "—"}ms</p>
            </div>
            <div className="rounded border bg-white p-1.5 text-center">
              <p className="text-slate-500">LCP</p>
              <p className="font-bold tabular-nums">{vitals.lcp?.value ?? "—"}ms</p>
            </div>
          </div>

          <TimingTable title="Slowest (top 10)" rows={snapshot.slowestOperations} />
          <TimingTable title="API reads" rows={snapshot.apiTimings} />
          <TimingTable title="RPC" rows={snapshot.rpcTimings} />
          <TimingTable title="Render" rows={snapshot.renderTimings} />

          <button
            type="button"
            className="w-full rounded border bg-white py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
            onClick={() => qaDiagnosticsStore.clear()}
          >
            Clear timings
          </button>
        </div>
      ) : null}
    </div>
  );
}
