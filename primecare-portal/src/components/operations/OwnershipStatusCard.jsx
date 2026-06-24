import React from "react";
import { KpiCard, KpiCardGrid } from "@/components/ux";
import { Building2, UserCheck, UserX, AlertTriangle, Users } from "lucide-react";

export default function OwnershipStatusCard({ metrics = {}, compact = false }) {
  const m = metrics || {};
  const items = [
    { label: "Total Labs", value: m.totalLabs ?? 0, icon: Building2 },
    { label: "Owned Labs", value: m.ownedLabs ?? 0, icon: UserCheck },
    { label: "Unassigned Labs", value: m.unassignedLabs ?? 0, icon: UserX, tone: m.unassignedLabs > 0 ? "warning" : "default" },
    { label: "Agents With No Labs", value: m.agentsWithNoLabs ?? 0, icon: Users },
    { label: "Overloaded Agents", value: m.overloadedAgents ?? 0, icon: AlertTriangle, tone: m.overloadedAgents > 0 ? "danger" : "default" },
  ];

  if (compact) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <p className="text-xs font-semibold text-slate-800">Assigned Laboratories</p>
        <p className="mt-1 text-[11px] text-slate-500">
          {m.ownedLabs ?? 0}/{m.totalLabs ?? 0} owned · {m.coveragePct ?? 0}% coverage
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Laboratory Assignment Status</h3>
        <span className="text-[11px] text-slate-500">{m.coveragePct ?? 0}% coverage</span>
      </div>
      <KpiCardGrid columns={5}>
        {items.map((item) => (
          <KpiCard
            key={item.label}
            label={item.label}
            value={item.value}
            icon={item.icon}
            variant={item.tone === "danger" ? "danger" : item.tone === "warning" ? "warning" : "default"}
          />
        ))}
      </KpiCardGrid>
    </section>
  );
}
