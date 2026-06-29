import React, { useMemo } from "react";
import { cn } from "@/lib/utils";

function str(v) {
  return String(v ?? "").trim();
}

function MetricTile({ value, label, tone = "default", className }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-white p-3 text-center shadow-sm",
        tone === "warning" && "border-amber-200 bg-amber-50/40",
        tone === "danger" && "border-red-200 bg-red-50/40",
        className
      )}
    >
      <p className="text-xl font-bold tabular-nums text-slate-900">{value ?? 0}</p>
      <p className="mt-1 text-[11px] font-medium text-slate-500">{label}</p>
    </div>
  );
}

export default function OwnershipStatusCard({ metrics = {}, compact = false }) {
  const m = metrics || {};
  const enriched = m.enrichedLabs || [];

  const { primaryOwners, secondaryOwners } = useMemo(() => {
    const primary = new Set();
    const secondary = new Set();
    for (const lab of enriched) {
      const pid = str(lab.primaryAgentId).toLowerCase();
      const sid = str(lab.secondaryAgentId).toLowerCase();
      if (pid) primary.add(pid);
      if (sid) secondary.add(sid);
    }
    return { primaryOwners: primary.size, secondaryOwners: secondary.size };
  }, [enriched]);

  const items = [
    { value: m.totalLabs ?? 0, label: "Total Laboratories" },
    { value: m.ownedLabs ?? 0, label: "Assigned" },
    { value: primaryOwners, label: "Primary Owners" },
    { value: secondaryOwners, label: "Secondary Owners" },
    {
      value: m.unassignedLabs ?? 0,
      label: "Unassigned",
      tone: (m.unassignedLabs ?? 0) > 0 ? "warning" : "default",
    },
  ];

  if (compact) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <p className="text-xs font-semibold text-slate-800">Assigned Laboratories</p>
        <p className="mt-1 text-[11px] text-slate-500">
          {m.ownedLabs ?? 0}/{m.totalLabs ?? 0} assigned · {m.coveragePct ?? 0}% coverage
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Assigned Laboratories</h3>
        <span className="text-[11px] text-slate-500">{m.coveragePct ?? 0}% coverage</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((item) => (
          <MetricTile key={item.label} value={item.value} label={item.label} tone={item.tone} />
        ))}
      </div>
    </section>
  );
}
