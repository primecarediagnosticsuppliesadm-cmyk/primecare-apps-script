import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ux";
import OperationalTimelineList from "@/components/operational/OperationalTimelineList.jsx";
import {
  buildOperationalAuditReplay,
  buildCorrelatedEventChains,
} from "@/operations/operationalEventTimeline.js";
import { ChevronDown, ChevronUp, History, Link2 } from "lucide-react";

export default function OperationalAuditPanel({ tenantId, payload, onSelectLab }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("replay");

  const replay = useMemo(
    () => (tenantId ? buildOperationalAuditReplay(tenantId, payload, 36) : []),
    [tenantId, payload]
  );

  const chains = useMemo(
    () => (tenantId ? buildCorrelatedEventChains(tenantId, payload, 8) : []),
    [tenantId, payload]
  );

  if (!tenantId) return null;

  return (
    <section className="rounded-xl border border-slate-300 bg-white p-3" aria-label="Operational audit">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2"
        onClick={() => setOpen((v) => !v)}
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <History className="h-4 w-4 text-slate-600" />
          Operational audit & replay
          <StatusBadge variant="neutral" compact>
            {replay.length}
          </StatusBadge>
        </h2>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open ? (
        <>
          <div className="mt-2 flex flex-wrap gap-1">
            <Button
              type="button"
              size="sm"
              variant={view === "replay" ? "default" : "outline"}
              className="h-7 text-[10px]"
              onClick={() => setView("replay")}
            >
              Chronological replay
            </Button>
            <Button
              type="button"
              size="sm"
              variant={view === "chains" ? "default" : "outline"}
              className="h-7 text-[10px]"
              onClick={() => setView("chains")}
            >
              Correlated chains
            </Button>
          </div>

          {view === "replay" ? (
            <div className="mt-2 max-h-[min(320px,40vh)] overflow-y-auto">
              <OperationalTimelineList events={replay} emptyLabel="No ledger events in window." />
            </div>
          ) : (
            <ul className="mt-2 max-h-[min(320px,40vh)] space-y-2 overflow-y-auto">
              {chains.length ? (
                chains.map((chain) => (
                  <li key={chain.correlationId} className="rounded-lg border bg-slate-50 px-2.5 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1 text-[11px] font-semibold">
                          <Link2 className="h-3 w-3 shrink-0" />
                          {chain.summary}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {chain.events.length} events · {chain.correlationId}
                        </p>
                      </div>
                      {chain.labId ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 shrink-0 text-[10px]"
                          onClick={() => onSelectLab?.(chain.labId)}
                        >
                          Lab
                        </Button>
                      ) : null}
                    </div>
                    <OperationalTimelineList events={chain.events.slice(-5)} className="mt-2" />
                  </li>
                ))
              ) : (
                <li className="py-4 text-center text-xs text-slate-500">
                  No correlated chains detected yet.
                </li>
              )}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
