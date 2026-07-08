import React from "react";
import { StatusBadge } from "@/components/ux";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import { GitBranch } from "lucide-react";

function NodeRow({ node, depth = 0 }) {
  return (
    <>
      <tr className="border-b border-border/60">
        <td className="px-2 py-2 text-sm" style={{ paddingLeft: `${8 + depth * 16}px` }}>
          <span className="font-medium">{node.label}</span>
          <span className="ml-2 text-xs text-muted-foreground">{node.type}</span>
        </td>
        <td className="px-2 py-2 text-sm">{node.collectionsLabel}</td>
        <td className="px-2 py-2 text-sm">{node.agentCommissionLabel}</td>
        <td className="px-2 py-2 text-sm">{node.adminOverrideLabel}</td>
        <td className="px-2 py-2 text-sm">{node.executiveOverrideLabel}</td>
        <td className="px-2 py-2 text-sm">{node.potentialPayrollLabel}</td>
      </tr>
      {(node.children || []).map((child) => (
        <NodeRow key={child.id} node={child} depth={depth + 1} />
      ))}
    </>
  );
}

export default function HierarchicalCompensationPanel({ model }) {
  if (!model) return null;
  const { summary, hierarchy = [], futureOverrideNote } = model;

  return (
    <PeopleOpsSectionCard
      title="Hierarchical Compensation"
      subtitle="Executive → Admin → Agent → Lab (display only)"
      icon={GitBranch}
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <StatusBadge variant="info" label="Display only" />
        <StatusBadge variant="neutral" label={`Period ${model.period || "—"}`} />
      </div>
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Team Collections</p>
          <p className="text-lg font-semibold">{summary?.teamCollectionsLabel}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Agent Commission</p>
          <p className="text-lg font-semibold">{summary?.teamCommissionLabel}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Admin Override (display)</p>
          <p className="text-lg font-semibold">{summary?.adminOverrideLabel}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">Executive Override (display)</p>
          <p className="text-lg font-semibold">{summary?.executiveOverrideLabel}</p>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              {["Node", "Collections", "Agent Commission", "Admin Override", "Executive Override", "Potential Payroll"].map(
                (h) => (
                  <th key={h} className="px-2 py-2 font-semibold">
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {hierarchy.map((node) => (
              <NodeRow key={node.id} node={node} />
            ))}
          </tbody>
        </table>
      </div>
      {futureOverrideNote ? <p className="mt-3 text-xs text-muted-foreground">{futureOverrideNote}</p> : null}
    </PeopleOpsSectionCard>
  );
}
