import React, { useCallback, useMemo, useState } from "react";
import { predatorStore } from "@/predator/predatorStore.js";
import { runAllPredatorValidations } from "@/predator/runPredatorValidation.js";
import { isPredatorEnabled } from "@/predator/predatorGuards.js";
import { PREDATOR_TIMING_THRESHOLDS_MS } from "@/predator/predatorSchema.js";
import { typography } from "@/styles/designTokens";
import { cn } from "@/lib/utils";
import { RefreshCw, ShieldAlert, Activity, Database } from "lucide-react";

const STATUS_CLASS = {
  PASS: "text-emerald-700 bg-emerald-500/10 border-emerald-500/30",
  WARN: "text-amber-800 bg-amber-500/10 border-amber-500/30",
  FAIL: "text-red-700 bg-red-500/10 border-red-500/30",
};

function StatusPill({ status }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold uppercase",
        STATUS_CLASS[status] || STATUS_CLASS.WARN
      )}
    >
      {status}
    </span>
  );
}

export default function PredatorDebugConsole({ currentUser }) {
  const [running, setRunning] = useState(false);
  const [lastReport, setLastReport] = useState(null);
  const [tick, setTick] = useState(0);

  const tenant = predatorStore.getActiveTenantContext();
  const moduleReports = useMemo(() => predatorStore.getModuleReportsForActiveTenant(), [tick, lastReport]);
  const slowest = useMemo(() => predatorStore.getSlowestProcesses(12), [tick, lastReport]);
  const errors = useMemo(() => predatorStore.getErrors(), [tick, lastReport]);
  const failedChecks = useMemo(() => predatorStore.getFailedValidations(), [tick, lastReport]);

  const rerun = useCallback(async () => {
    setRunning(true);
    try {
      const report = await runAllPredatorValidations(currentUser, {});
      setLastReport(report);
      setTick((t) => t + 1);
    } catch (err) {
      console.error("[Predator Debug Console] rerun failed", err);
    } finally {
      setRunning(false);
    }
  }, [currentUser]);

  if (!isPredatorEnabled()) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">
          Predator Debug Layer is disabled. Set VITE_PREDATOR_DEBUG=true (required in production).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className={typography.pageTitle}>Predator Debug Console</h1>
          <p className={cn(typography.pageSubtitle, "mt-1")}>
            Multi-tenant QA observability — read-only, no auto-fix, no data mutation.
          </p>
        </div>
        <button
          type="button"
          onClick={rerun}
          disabled={running}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium shadow-[var(--pc-shadow-card)] hover:bg-muted/50 disabled:opacity-50"
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", running && "animate-spin")} />
          {running ? "Running validations…" : "Re-run all validations"}
        </button>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--pc-shadow-card)]">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Database className="h-4 w-4" />
            Active tenant context
          </div>
          <dl className="mt-3 space-y-1 text-xs font-mono">
            <div>
              <dt className="text-muted-foreground">tenant_id</dt>
              <dd>{tenant?.tenantId ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">role</dt>
              <dd>{tenant?.role ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">user_id</dt>
              <dd className="break-all">{tenant?.userId ?? "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--pc-shadow-card)]">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Activity className="h-4 w-4" />
            Last full run
          </div>
          <p className="mt-3 text-sm">
            {lastReport ? (
              <>
                <StatusPill status={lastReport.status} />
                <span className="ml-2 text-xs text-muted-foreground">{lastReport.ranAt}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Click Re-run to validate all modules</span>
            )}
          </p>
          {lastReport?.summary ? (
            <p className="mt-2 text-xs">
              pass {lastReport.summary.pass} · warn {lastReport.summary.warn} · fail{" "}
              {lastReport.summary.fail}
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--pc-shadow-card)]">
          <div className="flex items-center gap-2 text-sm font-medium">
            <ShieldAlert className="h-4 w-4" />
            Guardrails
          </div>
          <ul className="mt-3 list-inside list-disc text-xs text-muted-foreground">
            <li>No service role in browser</li>
            <li>No RLS changes</li>
            <li>No business data writes</li>
            <li>Per-tenant isolation in reports</li>
          </ul>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold">Module health</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {moduleReports.length === 0 ? (
            <p className="text-sm text-muted-foreground">No module reports yet.</p>
          ) : (
            moduleReports.map((m) => (
              <div
                key={m.module}
                className="rounded-xl border border-border bg-card px-3 py-2 text-sm"
              >
                <div className="font-medium">{m.module}</div>
                <div className="mt-1">
                  <StatusPill status={m.summary.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  P{m.summary.pass} W{m.summary.warn} F{m.summary.fail}
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Slowest processes</h2>
          <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto text-xs">
            {slowest.length === 0 ? (
              <li className="text-muted-foreground">No timings recorded yet.</li>
            ) : (
              slowest.map((t, i) => (
                <li key={`${t.step}-${i}`} className="flex justify-between gap-2 border-b border-border/50 py-1">
                  <span>
                    <span className="font-medium">{t.module}</span> · {t.step}
                  </span>
                  <span className="font-mono">{t.durationMs}ms</span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Last 20 errors</h2>
          <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto text-xs">
            {errors.length === 0 ? (
              <li className="text-muted-foreground">No errors recorded.</li>
            ) : (
              errors.map((e, i) => (
                <li key={`${e.timestamp}-${i}`} className="rounded border border-destructive/20 bg-destructive/5 p-2">
                  <span className="font-medium">{e.module}</span> · {e.step}
                  <pre className="mt-1 whitespace-pre-wrap font-mono text-[10px]">
                    {JSON.stringify(e.actual, null, 2)}
                  </pre>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Failed / warned validations</h2>
        <ul className="mt-2 max-h-96 space-y-2 overflow-y-auto text-xs">
          {failedChecks.length === 0 ? (
            <li className="text-muted-foreground">No failures or warnings.</li>
          ) : (
            failedChecks.map((c, i) => (
              <li
                key={`${c.module}-${c.step}-${i}`}
                className={cn(
                  "rounded-lg border p-2",
                  c.status === "FAIL" ? "border-destructive/40" : "border-amber-500/40"
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={c.status} />
                  <span className="font-medium">{c.module}</span>
                  <span className="text-muted-foreground">{c.step}</span>
                </div>
                <p className="mt-1">{c.rootCauseGuess}</p>
                <p className="text-muted-foreground">{c.suggestedFix}</p>
                <pre className="mt-1 overflow-x-auto font-mono text-[10px] opacity-80">
                  {JSON.stringify({ expected: c.expected, actual: c.actual }, null, 2)}
                </pre>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-2xl border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        <h2 className="text-sm font-semibold text-foreground">Timing thresholds (ms)</h2>
        <pre className="mt-2 overflow-x-auto font-mono">
          {JSON.stringify(PREDATOR_TIMING_THRESHOLDS_MS, null, 2)}
        </pre>
      </section>
    </div>
  );
}
