import React, { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, ExternalLink } from "lucide-react";
import { runPilotHardeningChecks } from "@/readiness/pilotHardeningChecks.js";
import { hqNavigate } from "@/operations/hqWorkflowNav.js";
import { cn } from "@/lib/utils";

function statusVariant(status) {
  if (status === "PASS") return "default";
  if (status === "WARN") return "secondary";
  return "destructive";
}

function statusClass(status) {
  if (status === "PASS") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (status === "WARN") return "bg-amber-100 text-amber-900 border-amber-200";
  return "bg-red-100 text-red-800 border-red-200";
}

function SummaryTile({ value, label, tone = "default" }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-white p-3 text-center",
        tone === "pass" && "border-emerald-200 bg-emerald-50/50",
        tone === "warn" && "border-amber-200 bg-amber-50/50",
        tone === "fail" && "border-red-200 bg-red-50/50"
      )}
    >
      <p className="text-xl font-bold tabular-nums text-slate-900">{value ?? 0}</p>
      <p className="mt-1 text-[11px] font-medium text-slate-500">{label}</p>
    </div>
  );
}

export default function PilotHardeningChecksPanel({
  tenantId,
  setActivePage,
  onStatus,
  onError,
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [lastRunAt, setLastRunAt] = useState(null);

  const runChecks = useCallback(async () => {
    setRunning(true);
    onError?.("");
    try {
      const data = await runPilotHardeningChecks({
        tenantId,
        hqTenantId: tenantId,
      });
      setResult(data);
      setLastRunAt(new Date());
      onStatus?.(
        `Certification: ${data.status} · ${data.checks.filter((c) => c.status === "FAIL").length} failure(s)`
      );
    } catch (err) {
      onError?.(err?.message || "Failed to run pilot certification");
    } finally {
      setRunning(false);
    }
  }, [tenantId, onError, onStatus]);

  const summaryCounts = useMemo(() => {
    if (!result?.checks?.length) {
      return { passed: 0, warnings: 0, failures: 0 };
    }
    return {
      passed: result.checks.filter((c) => c.status === "PASS").length,
      warnings: result.checks.filter((c) => c.status === "WARN").length,
      failures: result.checks.filter((c) => c.status === "FAIL").length,
    };
  }, [result]);

  function handleFix(check) {
    const action = check.fixAction;
    if (!action?.page || !setActivePage) return;
    hqNavigate(setActivePage, {
      page: action.page,
      tab: action.tab || "",
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white p-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Deployment Readiness</p>
          <p className="text-[11px] text-slate-600">
            Certification gates before go-live — HQ, distributor, regional, and pilot scopes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {result ? (
            <Badge className={cn("border", statusClass(result.status))}>{result.status}</Badge>
          ) : null}
          <Button type="button" size="sm" onClick={() => void runChecks()} disabled={running}>
            <RefreshCw className={cn("mr-1 h-3.5 w-3.5", running && "animate-spin")} />
            {running ? "Running…" : "Run Certification"}
          </Button>
        </div>
      </div>

      {result ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryTile value={summaryCounts.passed} label="Passed" tone="pass" />
          <SummaryTile value={summaryCounts.warnings} label="Warnings" tone="warn" />
          <SummaryTile value={summaryCounts.failures} label="Failures" tone="fail" />
          <SummaryTile
            value={lastRunAt ? lastRunAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—"}
            label="Last Run"
          />
        </div>
      ) : null}

      {!result && !running ? (
        <p className="text-xs text-slate-500">
          Run deployment readiness certification against current HQ data.
        </p>
      ) : null}

      {result ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr className="border-b bg-slate-50 text-left text-slate-500">
                <th className="px-3 py-2">Check</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Detail</th>
                <th className="px-3 py-2">Missing / action</th>
              </tr>
            </thead>
            <tbody>
              {result.checks.map((check) => (
                <tr key={check.id} className="border-b border-slate-100 align-top">
                  <td className="px-3 py-2 font-medium text-slate-900">{check.label}</td>
                  <td className="px-3 py-2">
                    <Badge variant={statusVariant(check.status)} className="text-[10px]">
                      {check.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{check.detail}</td>
                  <td className="px-3 py-2">
                    {check.missingItems?.length ? (
                      <ul className="mb-1 list-inside list-disc text-[11px] text-slate-600">
                        {check.missingItems.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : check.status === "PASS" ? (
                      <span className="text-[11px] text-emerald-700">OK</span>
                    ) : null}
                    {check.fixAction?.label ? (
                      check.fixAction.page && setActivePage ? (
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-[11px]"
                          onClick={() => handleFix(check)}
                        >
                          {check.fixAction.label}
                          <ExternalLink className="ml-1 h-3 w-3" />
                        </Button>
                      ) : (
                        <span className="text-[11px] text-slate-500">{check.fixAction.label}</span>
                      )
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {result?.summary ? (
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Labs", result.summary.labCount],
            ["Unassigned", result.summary.unassignedLabs],
            ["Agents", result.summary.agentCount],
            ["Contracts", result.summary.activeContractCount],
            ["Qualified", result.summary.qualifiedLabCount],
            ["SKUs in stock", result.summary.skusInStock],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border bg-slate-50 p-2 text-center">
              <p className="text-lg font-bold tabular-nums text-slate-900">{value ?? 0}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">{label}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
