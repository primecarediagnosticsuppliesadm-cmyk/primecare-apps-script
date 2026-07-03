import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, PageSkeleton, ReadHealthBanner } from "@/components/ux";
import { buildHealthSnapshot } from "@/observability/monitoring.js";
import { mergeReadHealth } from "@/observability/readHealth.js";
import { loadProjectionMetrics } from "@/projectionOps/projectionMetricsApi.js";
import {
  rebuildProjectionCascade,
  rebuildProjectionRegistry,
} from "@/projectionOps/projectionRebuildConsole.js";
import { getRebuildCascade, getCatalogProjections } from "@/projectionOps/projectionOpsConstants.js";
import { recordCertRun } from "@/projectionOps/projectionOpsStorage.js";
import { resolveOperatingTenantId } from "@/tenant/resolveOperatingTenantId.js";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertTriangle,
  Database,
  RefreshCw,
  Shield,
  Timer,
} from "lucide-react";

const STATUS_VARIANT = {
  PASS: "success",
  GO: "success",
  WARN: "warning",
  FAIL: "danger",
  "NO-GO": "danger",
  UNKNOWN: "neutral",
  SKIP: "neutral",
};

function MetricTile({ label, value, sub, className }) {
  return (
    <div className={cn("rounded-lg border bg-white p-2 text-center shadow-sm", className)}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{value}</p>
      {sub ? <p className="mt-0.5 text-[10px] text-slate-500">{sub}</p> : null}
    </div>
  );
}

function Section({ title, icon: Icon, children, action }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600">
          {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden /> : null}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Executive-only Projection Operations Center.
 */
export default function ProjectionOperationsCenterPage({ currentUser = null }) {
  const tenantId = resolveOperatingTenantId(currentUser);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(
    async (probeAdapters = false) => {
      if (!tenantId) {
        setMetrics(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setMsg("");
      try {
        const data = await loadProjectionMetrics({ tenantId, probeAdapters });
        setMetrics(data);
      } catch (err) {
        setMsg(err?.message || "Failed to load projection metrics");
      } finally {
        setLoading(false);
      }
    },
    [tenantId]
  );

  useEffect(() => {
    refresh(false);
  }, [refresh]);

  const catalog = useMemo(() => getCatalogProjections(), []);

  const health = metrics?.healthRegistry || [];
  const cert = metrics?.certificationReport;
  const drift = metrics?.driftAlerts;
  const shadow = metrics?.shadowMonitoring;

  const projectionReadHealth = useMemo(() => {
    const staleRows = (health || []).filter(
      (row) => row.freshnessStatus === "FAIL" || row.freshnessStatus === "WARN"
    );
    if (!staleRows.length && cert?.overall !== "NO-GO") return null;
    return mergeReadHealth({
      success: staleRows.length === 0 && cert?.overall !== "NO-GO",
      readFailed: cert?.overall === "NO-GO",
      degraded: staleRows.length > 0 || cert?.overall === "WARN",
      error:
        staleRows.length > 0
          ? `${staleRows.length} projection(s) stale or failing freshness SLA`
          : cert?.overall === "NO-GO"
            ? "Projection certification NO-GO"
            : null,
      projection: true,
    });
  }, [health, cert]);

  const monitoringSnapshot = useMemo(
    () =>
      buildHealthSnapshot({
        overall: cert?.overall || "UNKNOWN",
        staleProjections: (health || []).filter((r) => r.freshnessStatus !== "PASS").length,
        driftAlertCount: drift?.alerts?.length ?? 0,
      }),
    [cert, health, drift]
  );

  async function handleRebuildCascade() {
    if (!tenantId) return;
    setRebuilding(true);
    setMsg("");
    try {
      const res = await rebuildProjectionCascade(tenantId);
      recordCertRun({ type: "rebuild_cascade", success: res.success, cascade: res.cascade });
      setMsg(res.success ? "Cascade rebuild complete" : "Cascade rebuild had errors");
      await refresh(false);
    } catch (err) {
      setMsg(err?.message || "Rebuild failed");
    } finally {
      setRebuilding(false);
    }
  }

  async function handleRebuildOne(registryId) {
    if (!tenantId) return;
    setRebuilding(true);
    setMsg("");
    try {
      const res = await rebuildProjectionRegistry(tenantId, registryId);
      setMsg(res.success ? `Rebuilt ${registryId} (${res.durationMs}ms)` : res.error || "Rebuild failed");
      await refresh(false);
    } catch (err) {
      setMsg(err?.message || "Rebuild failed");
    } finally {
      setRebuilding(false);
    }
  }

  async function handleProbeAdapters() {
    setRebuilding(true);
    try {
      await refresh(true);
      recordCertRun({ type: "adapter_probe", success: true });
      setMsg("Adapter deploy probes complete");
    } finally {
      setRebuilding(false);
    }
  }

  if (loading && !metrics) {
    return <PageSkeleton rows={8} />;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-3 p-3 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Projection Operations Center</h1>
          <p className="text-xs text-slate-600">
            Read-only monitoring — flags OFF, adapters unchanged. Tenant {tenantId || "—"}
            {monitoringSnapshot?.projectionOps?.overall
              ? ` · health ${monitoringSnapshot.projectionOps.overall}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={rebuilding} onClick={() => refresh(false)}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button size="sm" variant="outline" disabled={rebuilding} onClick={handleProbeAdapters}>
            Probe adapters
          </Button>
          <Button size="sm" disabled={rebuilding || !tenantId} onClick={handleRebuildCascade}>
            Rebuild cascade
          </Button>
        </div>
      </header>

      <ReadHealthBanner health={projectionReadHealth} title="Projection platform status" />

      {msg ? (
        <p className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
          {msg}
        </p>
      ) : null}

      {metrics?.metaError ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
          Meta: {metrics.metaError}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <MetricTile label="Overall" value={cert?.overall || "—"} />
        <MetricTile label="Projections" value={metrics?.healthSummary?.total ?? 0} />
        <MetricTile
          label="Fresh PASS"
          value={metrics?.healthSummary?.freshPass ?? 0}
          sub={`fail ${metrics?.healthSummary?.freshFail ?? 0}`}
        />
        <MetricTile label="Active errors" value={metrics?.healthSummary?.activeFailures ?? 0} />
        <MetricTile label="Drift alerts" value={drift?.summary?.total ?? 0} />
        <MetricTile
          label="Shadow mode"
          value={shadow?.summary?.shadowMode ? "ON" : "OFF"}
          sub={shadow?.summary?.flagsOnCount ? `${shadow.summary.flagsOnCount} flag(s) ON` : "all flags OFF"}
        />
      </div>

      <Section title="Health Registry" icon={Database}>
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="min-w-full text-left text-[11px]">
            <thead className="border-b bg-slate-50 text-[10px] uppercase text-slate-500">
              <tr>
                <th className="px-2 py-1.5">Registry</th>
                <th className="px-2 py-1.5">Status</th>
                <th className="px-2 py-1.5">Rows</th>
                <th className="px-2 py-1.5">Freshness</th>
                <th className="px-2 py-1.5">Last rebuild</th>
                <th className="px-2 py-1.5">Duration</th>
                <th className="px-2 py-1.5">Parity</th>
                <th className="px-2 py-1.5">Failures</th>
                <th className="px-2 py-1.5">Shadow</th>
                <th className="px-2 py-1.5">Flag</th>
              </tr>
            </thead>
            <tbody>
              {health.map((row) => (
                <tr key={row.registryId} className="border-b last:border-0">
                  <td className="px-2 py-1.5 font-mono text-[10px]">{row.registryId}</td>
                  <td className="px-2 py-1.5">{row.status}</td>
                  <td className="px-2 py-1.5 tabular-nums">{row.rowCount}</td>
                  <td className="px-2 py-1.5">
                    <StatusBadge variant={STATUS_VARIANT[row.freshnessStatus] || "neutral"}>
                      {row.freshnessHuman}
                    </StatusBadge>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[10px]">
                    {row.lastRebuild ? String(row.lastRebuild).slice(0, 19) : "—"}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">
                    {row.refreshDurationMs != null ? `${row.refreshDurationMs}ms` : "—"}
                  </td>
                  <td className="px-2 py-1.5">
                    <StatusBadge variant={STATUS_VARIANT[row.parityStatus] || "neutral"}>
                      {row.parityStatus}
                    </StatusBadge>
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{row.failureCount}</td>
                  <td className="px-2 py-1.5">{row.shadowStatus}</td>
                  <td className="px-2 py-1.5">
                    {row.featureFlag ? `${row.featureFlagStatus}` : "N/A"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-3 lg:grid-cols-2">
        <Section title="Freshness Dashboard" icon={Timer}>
          <ul className="space-y-1">
            {(metrics?.freshnessDashboard?.tiles || []).map((t) => (
              <li
                key={t.registryId}
                className="flex items-center justify-between rounded border bg-white px-2 py-1 text-xs"
              >
                <span className="font-mono text-[10px]">{t.registryId}</span>
                <StatusBadge variant={STATUS_VARIANT[t.freshnessStatus] || "neutral"}>
                  {t.freshnessHuman}
                </StatusBadge>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Parity Dashboard" icon={Shield}>
          <ul className="space-y-1">
            {(metrics?.parityDashboard?.items || []).map((t) => (
              <li
                key={t.registryId}
                className="flex items-center justify-between rounded border bg-white px-2 py-1 text-xs"
              >
                <span className="font-mono text-[10px]">{t.registryId}</span>
                <StatusBadge variant={STATUS_VARIANT[t.parityStatus] || "neutral"}>
                  {t.parityStatus}
                </StatusBadge>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section title="Failure Dashboard" icon={AlertTriangle}>
        {(metrics?.failureDashboard?.failures || []).length === 0 ? (
          <p className="text-xs text-slate-600">No active projection errors.</p>
        ) : (
          <ul className="space-y-1">
            {metrics.failureDashboard.failures.map((f) => (
              <li key={f.registryId} className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs">
                <span className="font-mono font-semibold">{f.registryId}</span>: {f.lastError}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Refresh Timeline" icon={Activity}>
        <ul className="max-h-48 space-y-1 overflow-y-auto">
          {(metrics?.refreshTimeline || []).slice(0, 15).map((ev, idx) => (
            <li key={`${ev.registryId}-${ev.at}-${idx}`} className="rounded border bg-white px-2 py-1 text-[10px]">
              <span className="font-mono text-slate-500">{String(ev.at).slice(0, 19)}</span>{" "}
              <span className="font-semibold">{ev.registryId}</span> · {ev.type}
              {ev.durationMs != null ? ` · ${ev.durationMs}ms` : ""}
            </li>
          ))}
        </ul>
      </Section>

      <div className="grid gap-3 lg:grid-cols-2">
        <Section title="Shadow Monitoring" icon={Shield}>
          <p className="mb-2 text-xs text-slate-700">{shadow?.summary?.message}</p>
          <ul className="space-y-1">
            {(shadow?.items || []).map((i) => (
              <li key={i.registryId} className="flex justify-between rounded border bg-white px-2 py-1 text-xs">
                <span className="font-mono text-[10px]">{i.registryId}</span>
                <span>{i.shadowStatus}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Drift Alerts" icon={AlertTriangle}>
          {(drift?.alerts || []).length === 0 ? (
            <p className="text-xs text-slate-600">No drift alerts.</p>
          ) : (
            <ul className="space-y-1">
              {drift.alerts.map((a) => (
                <li key={a.id} className="rounded border bg-white px-2 py-1 text-xs">
                  <span className="font-semibold uppercase text-amber-700">{a.severity}</span> — {a.message}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Rebuild Console" icon={RefreshCw}>
        <p className="mb-2 text-xs text-slate-600">
          Cascade order: {getRebuildCascade().join(" → ")}
        </p>
        <div className="flex flex-wrap gap-2">
          {catalog
            .filter((c) => c.rebuildable)
            .map((c) => (
              <Button
                key={c.registryId}
                size="sm"
                variant="outline"
                disabled={rebuilding || !tenantId}
                onClick={() => handleRebuildOne(c.registryId)}
              >
                {c.registryId.replace("PRJ-", "").replace("-v1", "")}
              </Button>
            ))}
        </div>
      </Section>

      <Section title="Certification Report" icon={Shield}>
        <div className="mb-2 flex flex-wrap gap-2">
          {cert?.gates &&
            Object.entries(cert.gates).map(([key, gate]) => (
              <StatusBadge key={key} variant={STATUS_VARIANT[gate.status] || "neutral"}>
                {gate.label}: {gate.status}
              </StatusBadge>
            ))}
        </div>
        <p className="text-xs text-slate-600">
          CLI cert: {cert?.cliScripts?.join(", ")}
        </p>
      </Section>
    </div>
  );
}
