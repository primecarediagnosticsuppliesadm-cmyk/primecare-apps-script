import React, { useState } from "react";
import { StatusBadge } from "@/components/ux";
import { Button } from "@/components/ui/button";
import InterventionQueueCard from "@/components/executive/InterventionQueueCard.jsx";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Layers } from "lucide-react";

const SEVERITY_BADGE = { CRITICAL: "danger", ATTENTION: "warning", MONITORING: "neutral" };

export default function InterventionClusterCard({ cluster, onOpen, onAction }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <article
      className={cn(
        "rounded-lg border border-slate-300 bg-white shadow-sm",
        cluster.severity === "CRITICAL" && "border-red-300"
      )}
    >
      <div className="flex items-start gap-2 px-2.5 py-2">
        <Layers className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-800">
              {cluster.title}
            </span>
            <StatusBadge variant={SEVERITY_BADGE[cluster.severity] || "neutral"} compact>
              {cluster.severity}
            </StatusBadge>
            <span className="text-[10px] text-slate-500">Oldest · {cluster.oldestAgeLabel}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-600">{cluster.summary}</p>
          {cluster.labPreview?.length ? (
            <p className="mt-0.5 truncate text-[10px] text-slate-500">
              Labs · {cluster.labPreview.join(", ")}
              {cluster.count > cluster.labPreview.length ? "…" : ""}
            </p>
          ) : null}
          {cluster.agentPreview?.length ? (
            <p className="truncate text-[10px] text-slate-500">
              Agents · {cluster.agentPreview.join(", ")}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <Button
            type="button"
            size="sm"
            className="h-7 px-2 text-[10px]"
            onClick={() => onOpen?.(cluster.members[0], cluster)}
          >
            Open
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-1"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      {expanded ? (
        <ul className="space-y-1 border-t bg-slate-50/50 p-2">
          {cluster.members.map((item) => (
            <li key={item.id}>
              <InterventionQueueCard item={item} onOpen={onOpen} onAction={onAction} />
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
