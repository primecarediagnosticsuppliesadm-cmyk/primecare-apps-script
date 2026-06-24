import React from "react";
import { KpiCard, KpiCardGrid } from "@/components/ux";
import { Building2, AlertTriangle, ClipboardList, FileCheck, Wallet } from "lucide-react";
import { resolveAgentLabTerritoryLabel } from "@/operations/labOwnershipEngine.js";

export default function AgentMyOwnershipSection({ summary = {}, onOpenLab }) {
  const s = summary || {};
  const labs = s.assignedLabs || [];

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">My Ownership</h2>
          <p className="text-[11px] text-slate-500">
            Labs you are accountable for — follow-ups, escalations, and collections.
          </p>
        </div>
        <span className="text-xs font-medium text-slate-600">{s.assignedLabCount ?? 0} labs</span>
      </div>

      <KpiCardGrid columns={5}>
        <KpiCard label="Assigned Labs" value={s.assignedLabCount ?? 0} icon={Building2} />
        <KpiCard
          label="Follow Ups Due"
          value={s.followUpsDue ?? 0}
          icon={ClipboardList}
          variant={s.followUpsDue > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Escalations"
          value={s.escalations ?? 0}
          icon={AlertTriangle}
          variant={s.escalations > 0 ? "danger" : "default"}
        />
        <KpiCard
          label="Qualification Pending"
          value={s.qualificationPending ?? 0}
          icon={FileCheck}
          variant={s.qualificationPending > 0 ? "warning" : "default"}
        />
        <KpiCard
          label="Collection Follow Ups"
          value={s.collectionFollowUps ?? 0}
          icon={Wallet}
          variant={s.collectionFollowUps > 0 ? "warning" : "default"}
        />
      </KpiCardGrid>

      {labs.length > 0 ? (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {labs.slice(0, 8).map((lab) => (
            <li key={lab.labId}>
              <button
                type="button"
                className="w-full rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-2 text-left text-xs hover:bg-slate-100"
                onClick={() => onOpenLab?.(lab)}
              >
                <span className="font-medium text-slate-900">{lab.labName || lab.labId}</span>
                {(() => {
                  const territory = resolveAgentLabTerritoryLabel(lab);
                  return territory ? (
                    <span className="ml-1 text-slate-500">· {territory}</span>
                  ) : null;
                })()}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-slate-500">
          No owned labs in the current scope. Contact HQ if assignments look incorrect.
        </p>
      )}
    </section>
  );
}
