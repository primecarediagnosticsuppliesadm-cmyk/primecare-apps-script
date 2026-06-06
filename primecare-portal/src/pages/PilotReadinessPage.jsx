import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, PageSkeleton } from "@/components/ux";
import {
  buildPilotReadinessModel,
  loadPilotReadinessData,
  READINESS_BAND,
} from "@/readiness/pilotReadinessEngine.js";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import { cn } from "@/lib/utils";
import { ClipboardCheck, RefreshCw, Rocket, AlertTriangle } from "lucide-react";

const BAND_VARIANT = {
  [READINESS_BAND.READY]: "success",
  [READINESS_BAND.CONDITIONAL]: "info",
  [READINESS_BAND.NOT_READY]: "warning",
  [READINESS_BAND.BLOCKED]: "danger",
};

const GATE_VARIANT = {
  PASS: "success",
  WARN: "warning",
  FAIL: "danger",
};

function MetricTile({ label, value, className }) {
  return (
    <div className={cn("rounded-lg border bg-white p-2 text-center shadow-sm", className)}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
        {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Executive Pilot Readiness Center — read-only launch readiness orchestration.
 */
export default function PilotReadinessPage({ currentUser = null }) {
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const data = await loadPilotReadinessData(currentUser);
      setModel(buildPilotReadinessModel(data));
    } catch (err) {
      setError(err?.message || "Failed to load pilot readiness");
      setModel(null);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const predatorSnapshot = useMemo(() => {
    if (!model) return null;
    return {
      pilotReadinessCenter: true,
      pilotReadiness: model,
      readinessScore: model.readinessScore,
      readinessBand: model.readinessBand,
      distributorCount: model.distributorCount,
      gateCount: model.gateBreakdown?.length ?? 0,
      blockerCount: model.blockers?.length ?? 0,
    };
  }, [model]);

  usePredatorModuleValidation(
    "Pilot Readiness",
    currentUser,
    predatorSnapshot ?? {},
    Boolean(predatorSnapshot)
  );

  if (loading) return <PageSkeleton rows={10} />;
  if (error) {
    return (
      <div className="p-4 text-sm text-red-700">
        <p>{error}</p>
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  }
  if (!model) return null;

  const {
    overallScore,
    overallBand,
    gateBreakdown,
    distributors,
    blockers,
    nextActions,
    trendPlaceholder,
    qaReadinessScore,
    qaReleaseStatus,
  } = model;

  return (
    <div className="mx-auto max-w-6xl space-y-3 p-3 pb-8">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Rocket className="h-5 w-5 text-indigo-600" aria-hidden />
            Pilot Readiness
          </h1>
          <p className="mt-0.5 text-xs text-slate-600">
            Founder + executive launch readiness across distributors — orchestration only, no writes.
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={() => void load()} aria-label="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </header>

      <Section title="Overall readiness score" icon={ClipboardCheck}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricTile label="Readiness score" value={`${overallScore}%`} />
          <MetricTile label="Readiness band" value={overallBand} />
          <MetricTile label="Distributors" value={distributors.length} />
          <MetricTile label="QA release status" value={`${qaReadinessScore}% · ${qaReleaseStatus}`} />
        </div>
        <div className="mt-2">
          <StatusBadge variant={BAND_VARIANT[overallBand] || "neutral"}>
            {overallBand}
          </StatusBadge>
        </div>
      </Section>

      <Section title="Distributor readiness table" icon={Rocket}>
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-2">Distributor</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Score</th>
                <th className="px-2 py-2">Band</th>
                <th className="px-2 py-2">Blocking</th>
                <th className="px-2 py-2">Catalog</th>
                <th className="px-2 py-2">Labs</th>
                <th className="px-2 py-2">Contracts</th>
                <th className="px-2 py-2">Billing</th>
                <th className="px-2 py-2">Collections</th>
                <th className="px-2 py-2">Financial</th>
                <th className="px-2 py-2">Operations</th>
                <th className="px-2 py-2">QA</th>
              </tr>
            </thead>
            <tbody>
              {distributors.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-2 py-4 text-center text-slate-500">
                    No distributors in portfolio.
                  </td>
                </tr>
              ) : (
                distributors.map((row) => (
                  <tr key={row.distributorId} className="border-b last:border-0">
                    <td className="px-2 py-2 font-medium text-slate-900">{row.name}</td>
                    <td className="px-2 py-2">{row.status}</td>
                    <td className="px-2 py-2 tabular-nums">{row.readinessScore}%</td>
                    <td className="px-2 py-2">
                      <StatusBadge variant={BAND_VARIANT[row.readinessBand] || "neutral"} compact>
                        {row.readinessBand}
                      </StatusBadge>
                    </td>
                    <td className="max-w-[10rem] truncate px-2 py-2 text-slate-600" title={row.blockingIssues.join(", ")}>
                      {row.blockingIssues.length ? row.blockingIssues.join(", ") : "—"}
                    </td>
                    {["catalog", "labs", "contracts", "billing", "collections", "financial", "operations", "qa"].map(
                      (key) => (
                        <td key={key} className="px-2 py-2">
                          <StatusBadge variant={GATE_VARIANT[row.gates[key]] || "neutral"} compact>
                            {row.gates[key]}
                          </StatusBadge>
                        </td>
                      )
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Gate breakdown" icon={ClipboardCheck}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {gateBreakdown.map((gate) => (
            <div key={gate.id} className="rounded-lg border bg-white p-2 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-800">{gate.label}</p>
                <StatusBadge variant={GATE_VARIANT[gate.status] || "neutral"} compact>
                  {gate.status}
                </StatusBadge>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                PASS {gate.passCount} · WARN {gate.warnCount} · FAIL {gate.failCount}
              </p>
              <ul className="mt-1 space-y-0.5 text-[10px] text-slate-600">
                {(gate.checks || []).slice(0, 3).map((check) => (
                  <li key={check.id}>
                    {check.label}: {check.detail || check.status}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Blocking issues" icon={AlertTriangle}>
        {blockers.length === 0 ? (
          <p className="text-xs text-slate-600">No blocking issues detected.</p>
        ) : (
          <ul className="space-y-1 text-xs text-slate-700">
            {blockers.slice(0, 20).map((item, idx) => (
              <li key={`${item.gateId}-${item.checkId}-${idx}`} className="flex gap-2">
                <span className="font-medium text-red-700">FAIL</span>
                <span>
                  {item.distributorName ? `${item.distributorName}: ` : ""}
                  {item.gateLabel} — {item.label}
                  {item.detail ? ` (${item.detail})` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Recommended next actions">
        {nextActions.length === 0 ? (
          <p className="text-xs text-slate-600">All gates passing — monitor before launch.</p>
        ) : (
          <ol className="list-decimal space-y-1 pl-4 text-xs text-slate-700">
            {nextActions.map((action, idx) => (
              <li key={`${action.gateId}-${idx}`}>{action.action}</li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Readiness trend placeholder">
        <p className="text-xs text-slate-600">{trendPlaceholder.message}</p>
      </Section>
    </div>
  );
}
