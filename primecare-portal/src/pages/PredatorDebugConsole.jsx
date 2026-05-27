import React, { useCallback, useMemo, useState } from "react";
import { predatorStore } from "@/predator/predatorStore.js";
import { runAllPredatorValidations } from "@/predator/runPredatorValidation.js";
import { isPredatorEnabled } from "@/predator/predatorGuards.js";
import { PREDATOR_TIMING_THRESHOLDS_MS } from "@/predator/predatorSchema.js";
import PredatorTimeline from "@/components/qa/PredatorTimeline.jsx";
import TenantRoleIsolationQaPanel from "@/components/qa/TenantRoleIsolationQaPanel.jsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import KpiCardGrid from "@/components/ux/KpiCardGrid";
import KpiCard from "@/components/ux/KpiCard";
import { typography } from "@/styles/designTokens";
import { cn } from "@/lib/utils";
import {
  RefreshCw,
  ShieldAlert,
  Activity,
  Database,
  TriangleAlert,
  CircleCheckBig,
  Gauge,
  Clock3,
  Layers3,
  Building2,
  ListFilter,
  Monitor,
} from "lucide-react";

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

function formatRelativeTime(raw) {
  if (!raw) return "—";
  const ms = Date.now() - Date.parse(raw);
  if (!Number.isFinite(ms) || ms < 0) return String(raw);
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function SeveritySection({ title, entries, emptyLabel }) {
  return (
    <section className="rounded-xl border border-border bg-card p-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {entries.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {entries.map((e, i) => (
            <li
              key={`${e.module}-${e.step}-${i}`}
              className={cn(
                "rounded-lg border px-2.5 py-2 text-xs",
                e.status === "FAIL"
                  ? "border-red-500/40 bg-red-500/5"
                  : "border-amber-500/40 bg-amber-500/5"
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={e.status} />
                <span className="font-medium">{e.module}</span>
                <span className="text-muted-foreground">{e.step}</span>
              </div>
              <p className="mt-1">{e.rootCauseGuess}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ModuleAccordion({ reports }) {
  const initial = useMemo(() => {
    const state = {};
    for (const r of reports) state[r.module] = r.summary.status !== "PASS";
    return state;
  }, [reports]);
  const [openByModule, setOpenByModule] = useState(initial);

  return (
    <div className="space-y-2">
      {reports.map((m) => {
        const isOpen = Boolean(openByModule[m.module]);
        return (
          <div key={m.module} className="rounded-xl border border-border bg-card">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
              onClick={() =>
                setOpenByModule((prev) => ({
                  ...prev,
                  [m.module]: !prev[m.module],
                }))
              }
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold">{isOpen ? "▼" : "▶"}</span>
                <span className="text-sm font-medium">{m.module}</span>
                <StatusPill status={m.summary.status} />
              </div>
              <span className="text-xs text-muted-foreground">
                P{m.summary.pass} W{m.summary.warn} F{m.summary.fail}
              </span>
            </button>
            {isOpen ? (
              <ul className="space-y-1 border-t border-border px-3 py-2">
                {m.entries.map((e, i) => (
                  <li
                    key={`${e.step}-${i}`}
                    className="rounded border border-border/70 bg-muted/20 px-2 py-1.5 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <StatusPill status={e.status} />
                      <span className="font-medium">{e.step}</span>
                    </div>
                    {e.rootCauseGuess ? <p className="mt-1 text-muted-foreground">{e.rootCauseGuess}</p> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default function PredatorDebugConsole({ currentUser }) {
  const [running, setRunning] = useState(false);
  const [lastReport, setLastReport] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [tick, setTick] = useState(0);
  const [timelineFilter, setTimelineFilter] = useState({
    severity: "all",
    module: "all",
    tenant: "all",
  });

  const snapshot = useMemo(() => {
    return {
      tenant: predatorStore.getActiveTenantContext(),
      moduleReports: predatorStore.getModuleReportsForActiveTenant(),
      slowest: predatorStore.getSlowestProcesses(12),
      errors: predatorStore.getOperationalErrors(),
      failedChecks: predatorStore.getFailedValidations(),
      diagnoses: lastReport?.diagnoses || predatorStore.getAllModuleDiagnosesForActiveTenant(),
      cacheEvents: predatorStore.getCacheEvents(),
      tenantOps: predatorStore.getTenantOperationalSummaries(),
      moduleReliability: predatorStore.getAllModuleReliabilityForActiveTenant(),
    };
  }, [tick, lastReport]);
  const {
    tenant,
    moduleReports,
    slowest,
    errors,
    failedChecks,
    diagnoses,
    cacheEvents,
    tenantOps,
    moduleReliability,
  } = snapshot;
  const selectedDiagnosis = diagnoses[0] || null;
  const adminDiagnosis =
    diagnoses.find((d) => d.module === "Admin Dashboard") || null;
  const isolationDiagnosis = diagnoses.find((d) => d.module === "Tenant + Role Isolation") || null;
  const uiSyncFailures = failedChecks.filter(
    (e) => e.issueClass === "ui_sync" || String(e.step || "").startsWith("ui_sync.")
  );
  const failCount = failedChecks.filter((c) => c.status === "FAIL").length;
  const warnCount = failedChecks.filter((c) => c.status === "WARN").length;
  const avgValidationMs =
    slowest.length > 0
      ? Math.round(
          slowest.reduce((sum, item) => sum + Number(item.durationMs || 0), 0) / slowest.length
        )
      : null;
  const systemHealth = failCount > 0 ? "At Risk" : warnCount > 0 ? "Needs Attention" : "Healthy";

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
    <div className="mx-auto max-w-7xl space-y-4 p-3 sm:p-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className={typography.pageTitle}>Predator Operations Console</h1>
          <p className={cn(typography.pageSubtitle, "mt-1")}>
            Operational QA cockpit — prioritize failures first, then drill into diagnostics.
          </p>
        </div>
        <button
          type="button"
          onClick={rerun}
          disabled={running}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium shadow-[var(--pc-shadow-card)] hover:bg-muted/50 disabled:opacity-50"
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", running && "animate-spin")} />
          {running ? "Running validations…" : "Re-run validations"}
        </button>
      </header>

      <KpiCardGrid columns={4}>
        <KpiCard title="System Health" value={systemHealth} icon={systemHealth === "Healthy" ? CircleCheckBig : TriangleAlert} subtitle={`${failCount} fail · ${warnCount} warn`} />
        <KpiCard title="Tenant Isolation" value={isolationDiagnosis?.status || "PENDING"} icon={ShieldAlert} subtitle={isolationDiagnosis ? formatRelativeTime(isolationDiagnosis.ranAt) : "Run validations"} />
        <KpiCard title="Critical Errors" value={errors.length} icon={TriangleAlert} subtitle={errors.length ? "Investigate immediately" : "No active errors"} />
        <KpiCard title="Slow Modules" value={slowest.filter((s) => Number(s.durationMs) > 2000).length} icon={Gauge} subtitle={slowest[0] ? `${slowest[0].module} ${slowest[0].durationMs}ms` : "No timings"} />
        <KpiCard title="UI Sync" value={uiSyncFailures.length} icon={Monitor} subtitle={uiSyncFailures.length ? "state/render divergence" : "layers aligned"} />
        <KpiCard title="Cache Drift" value={cacheEvents.filter((c) => c.staleZeroRisk).length} icon={Layers3} subtitle="stale-zero risk events" />
        <KpiCard title="Avg Validation Time" value={avgValidationMs != null ? `${avgValidationMs}ms` : "—"} icon={Clock3} subtitle="from slowest process set" />
      </KpiCardGrid>

      <section className="rounded-xl border border-border bg-card px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1"><Database className="h-3.5 w-3.5" /> tenant {tenant?.tenantId ?? "—"}</span>
          <span className="inline-flex items-center gap-1"><Activity className="h-3.5 w-3.5" /> role {tenant?.role ?? "—"}</span>
          <span className="inline-flex items-center gap-1"><ShieldAlert className="h-3.5 w-3.5" /> user {tenant?.userId ?? "—"}</span>
          <span className="text-muted-foreground">Last run: {lastReport?.ranAt ? formatRelativeTime(lastReport.ranAt) : "not run in this session"}</span>
        </div>
      </section>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList
          variant="line"
          className="sticky top-0 z-10 w-full justify-start overflow-x-auto border-b border-border bg-background/95 p-1 backdrop-blur"
        >
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="isolation">Isolation</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="errors">Errors</TabsTrigger>
          <TabsTrigger value="ui">UI Reliability</TabsTrigger>
          <TabsTrigger value="modules">Modules</TabsTrigger>
          <TabsTrigger value="tenants">Tenants</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-3 pt-2">
          <SeveritySection
            title="Critical failures"
            entries={failedChecks.filter((x) => x.status === "FAIL").slice(0, 8)}
            emptyLabel="No critical failures."
          />
          <SeveritySection
            title="Warnings / risk"
            entries={failedChecks.filter((x) => x.status === "WARN").slice(0, 8)}
            emptyLabel="No warnings."
          />
          <div className="rounded-xl border border-border bg-card p-3">
            <h3 className="text-sm font-semibold">Top risks</h3>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {slowest[0] ? <li>Slow validation trend: {slowest[0].module} at {slowest[0].durationMs}ms</li> : null}
              {cacheEvents.some((c) => c.staleZeroRisk) ? <li>Frequent cache invalidation risk detected</li> : null}
              {errors.length > 0 ? <li>Operational error volume elevated ({errors.length} recent)</li> : null}
              {failedChecks.length === 0 ? <li>No active operational risk signals.</li> : null}
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            Telemetry foundation: step abandonment, repeated failures, slow-device detection, and degradation trends are wired for future analytics. Telemetry not yet enabled.
          </div>
        </TabsContent>

        <TabsContent value="isolation" className="space-y-3 pt-2">
          {activeTab === "isolation" ? <TenantRoleIsolationQaPanel currentUser={currentUser} autoRun /> : null}
          {isolationDiagnosis ? (
            <section className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
              <h3 className="text-sm font-semibold">Tenant isolation timeline</h3>
              <PredatorTimeline title="Isolation pipeline" steps={isolationDiagnosis.timeline || []} />
            </section>
          ) : null}
        </TabsContent>

        <TabsContent value="performance" className="space-y-3 pt-2">
          {activeTab === "performance" ? (
            <>
              <section className="rounded-xl border border-border bg-card p-3">
                <h3 className="text-sm font-semibold">Slow systems</h3>
                <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto text-xs">
                  {slowest.length === 0 ? (
                    <li className="text-muted-foreground">No timings recorded.</li>
                  ) : (
                    slowest.map((t, i) => (
                      <li key={`${t.step}-${i}`} className="flex justify-between gap-2 border-b border-border/40 py-1">
                        <span><span className="font-medium">{t.module}</span> · {t.step}</span>
                        <span className="font-mono">{t.durationMs}ms</span>
                      </li>
                    ))
                  )}
                </ul>
              </section>
              <section className="rounded-xl border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                <h3 className="text-sm font-semibold text-foreground">Timing thresholds</h3>
                <pre className="mt-2 overflow-x-auto font-mono">
                  {JSON.stringify(PREDATOR_TIMING_THRESHOLDS_MS, null, 2)}
                </pre>
              </section>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="errors" className="space-y-3 pt-2">
          {activeTab === "errors" ? (
            <section className="rounded-xl border border-border bg-card p-3">
              <h3 className="text-sm font-semibold">Recent operational errors</h3>
              <ul className="mt-2 max-h-[26rem] space-y-2 overflow-y-auto text-xs">
                {errors.length === 0 ? (
                  <li className="text-muted-foreground">No recent errors.</li>
                ) : (
                  errors.map((e, i) => (
                    <li key={`${e.timestamp}-${i}`} className="rounded border border-red-500/25 bg-red-500/5 p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill status={e.status || "FAIL"} />
                        <span className="font-medium">{e.module}</span>
                        <span className="text-muted-foreground">{e.step}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">{formatRelativeTime(e.timestamp)}</span>
                      </div>
                      <p className="mt-1">{e.rootCauseGuess || "No root cause text."}</p>
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[11px] text-muted-foreground">Details</summary>
                        <pre className="mt-1 max-h-36 overflow-auto rounded bg-muted/40 p-2 font-mono text-[10px]">
                          {JSON.stringify({ expected: e.expected, actual: e.actual }, null, 2)}
                        </pre>
                      </details>
                    </li>
                  ))
                )}
              </ul>
            </section>
          ) : null}
        </TabsContent>

        <TabsContent value="ui" className="space-y-3 pt-2">
          {activeTab === "ui" ? (
            <>
              <section className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
                <h3 className="text-sm font-semibold">UI synchronization diagnostics</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Auth → DB/RLS → API → Normalize → Compute → Cache → React State → UI Render.
                  Lightweight capped traces only (QA/dev).
                </p>
                {adminDiagnosis?.healthHeadline ? (
                  <p className="mt-2 text-sm font-medium">{adminDiagnosis.healthHeadline}</p>
                ) : null}
              </section>

              <section className="rounded-xl border border-border bg-card p-3">
                <h3 className="text-sm font-semibold">Module reliability scores</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {moduleReliability.length === 0 ? (
                    <p className="text-xs text-muted-foreground col-span-full">
                      Run validations on Admin Dashboard, Collections, or Qualification Review to populate scores.
                    </p>
                  ) : (
                    moduleReliability.map((r) => (
                      <div key={r.module} className="rounded-lg border border-border/70 bg-muted/20 p-2 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{r.module}</span>
                          <StatusPill status={r.summary} />
                        </div>
                        <ul className="mt-2 space-y-0.5 text-muted-foreground">
                          <li>Data: {r.dataReliability}%</li>
                          <li>State sync: {r.stateSynchronization}%</li>
                          <li>Cache: {r.cacheHealth}%</li>
                          <li>Render: {r.renderStability}%</li>
                        </ul>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <SeveritySection
                title="UI sync failures / warnings"
                entries={uiSyncFailures.slice(0, 12)}
                emptyLabel="No UI synchronization issues detected."
              />

              {adminDiagnosis ? (
                <section className="rounded-xl border border-border bg-card p-3">
                  <h3 className="text-sm font-semibold">Admin Dashboard — first divergence</h3>
                  <ul className="mt-2 space-y-2 text-xs">
                    {(adminDiagnosis.metrics || [])
                      .filter((m) => m.status !== "PASS")
                      .map((m) => (
                        <li key={m.metricId} className="rounded border border-border/70 bg-muted/20 p-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusPill status={m.status} />
                            <span className="font-medium">{m.metricLabel}</span>
                            <span className="text-muted-foreground">→ {m.firstDivergenceLayer}</span>
                          </div>
                          <p className="mt-1">{m.probableRootCause}</p>
                          <div className="mt-1 flex flex-wrap gap-2 font-mono text-[10px] text-muted-foreground">
                            {(m.layerTrace || []).map((l) => (
                              <span key={l.layerId}>
                                {l.layerId}={String(l.value ?? "—")}
                              </span>
                            ))}
                          </div>
                        </li>
                      ))}
                  </ul>
                  <PredatorTimeline title="Admin Dashboard pipeline" steps={adminDiagnosis.timeline || []} />
                </section>
              ) : null}

              <section className="rounded-xl border border-border bg-card p-3">
                <h3 className="text-sm font-semibold">State transitions (capped)</h3>
                <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs">
                  {predatorStore
                    .getStateTransitionsForModule("Admin Dashboard")
                    .concat(predatorStore.getStateTransitionsForModule("Collections"))
                    .slice(0, 20)
                    .map((t, i) => (
                      <li key={`${t.kind}-${i}`} className="rounded border border-border/60 px-2 py-1">
                        <span className="font-medium">{t.module}</span> · {t.metricId} · {t.kind}
                        <span className="text-muted-foreground">
                          {" "}
                          {String(t.from)} → {String(t.to)}
                        </span>
                      </li>
                    ))}
                </ul>
              </section>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="modules" className="space-y-3 pt-2">
          {activeTab === "modules" ? (
            <>
              <section className="rounded-xl border border-border bg-card p-3">
                <h3 className="text-sm font-semibold">Module health</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {moduleReports.map((m) => (
                    <div key={m.module} className="rounded-lg border border-border/70 bg-muted/20 p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{m.module}</span>
                        <StatusPill status={m.summary.status} />
                      </div>
                      <p className="mt-1 text-muted-foreground">P{m.summary.pass} W{m.summary.warn} F{m.summary.fail}</p>
                    </div>
                  ))}
                </div>
              </section>
              <section className="rounded-xl border border-border bg-card p-3">
                <h3 className="text-sm font-semibold">Module drill-down</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  PASS modules collapse by default. WARN/FAIL modules auto-expand.
                </p>
                <div className="mt-2">
                  <ModuleAccordion reports={moduleReports} />
                </div>
              </section>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="tenants" className="space-y-3 pt-2">
          {activeTab === "tenants" ? (
            <section className="rounded-xl border border-border bg-card p-3">
              <h3 className="text-sm font-semibold">Tenant operations center</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Operational metadata only (status counts, latency, timestamps). No business records.
              </p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[680px] text-xs">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="px-2 py-1">Tenant</th>
                      <th className="px-2 py-1">User</th>
                      <th className="px-2 py-1">Modules</th>
                      <th className="px-2 py-1">FAIL</th>
                      <th className="px-2 py-1">WARN</th>
                      <th className="px-2 py-1">Avg ms</th>
                      <th className="px-2 py-1">Slow</th>
                      <th className="px-2 py-1">Errors</th>
                      <th className="px-2 py-1">Last validation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantOps.map((t) => (
                      <tr key={t.tenantKey} className="border-b border-border/40">
                        <td className="px-2 py-1 font-medium">{t.tenantId}</td>
                        <td className="px-2 py-1">{t.userId}</td>
                        <td className="px-2 py-1">{t.moduleCount}</td>
                        <td className="px-2 py-1">{t.fail}</td>
                        <td className="px-2 py-1">{t.warn}</td>
                        <td className="px-2 py-1">{t.avgValidationMs ?? "—"}</td>
                        <td className="px-2 py-1">{t.slowTimingCount}</td>
                        <td className="px-2 py-1">{t.errorCount}</td>
                        <td className="px-2 py-1 text-muted-foreground">{formatRelativeTime(t.latestValidationAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </TabsContent>

        <TabsContent value="timeline" className="space-y-3 pt-2">
          {activeTab === "timeline" ? (
            <section className="rounded-xl border border-border bg-card p-3">
              <h3 className="text-sm font-semibold">Operational event timeline</h3>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  className={cn("rounded border px-2 py-1", timelineFilter.severity === "all" ? "bg-muted" : "bg-card")}
                  onClick={() => setTimelineFilter((p) => ({ ...p, severity: "all" }))}
                >
                  <ListFilter className="mr-1 inline h-3 w-3" />All severities
                </button>
                <button
                  type="button"
                  className={cn("rounded border px-2 py-1", timelineFilter.severity === "fail" ? "bg-red-500/10 border-red-500/30" : "bg-card")}
                  onClick={() => setTimelineFilter((p) => ({ ...p, severity: "fail" }))}
                >
                  FAIL
                </button>
                <button
                  type="button"
                  className={cn("rounded border px-2 py-1", timelineFilter.severity === "warn" ? "bg-amber-500/10 border-amber-500/30" : "bg-card")}
                  onClick={() => setTimelineFilter((p) => ({ ...p, severity: "warn" }))}
                >
                  WARN
                </button>
              </div>
              <ul className="mt-2 max-h-[30rem] space-y-2 overflow-y-auto text-xs">
                {[...failedChecks, ...errors, ...cacheEvents]
                  .sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")))
                  .filter((e) => {
                    if (timelineFilter.severity === "fail") return e.status === "FAIL";
                    if (timelineFilter.severity === "warn") return e.status === "WARN";
                    return true;
                  })
                  .slice(0, 80)
                  .map((e, i) => (
                    <li key={`${e.module || "event"}-${e.step || i}-${i}`} className="rounded border border-border/70 p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill status={e.status || "PASS"} />
                        <span className="font-medium">{e.module || "Event"}</span>
                        <span className="text-muted-foreground">{e.step || "timeline"}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">{formatRelativeTime(e.timestamp)}</span>
                      </div>
                      {e.rootCauseGuess ? <p className="mt-1">{e.rootCauseGuess}</p> : null}
                    </li>
                  ))}
              </ul>
            </section>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
