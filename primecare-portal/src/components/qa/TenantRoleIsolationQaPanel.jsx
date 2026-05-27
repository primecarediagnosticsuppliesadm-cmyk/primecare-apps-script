import React, { useCallback, useMemo, useState } from "react";
import {
  isTenantRoleIsolationValidationEnabled,
  runTenantRoleIsolationValidation,
} from "@/validation/tenantRoleIsolationValidation.js";
import PredatorTimeline from "@/components/qa/PredatorTimeline.jsx";
import { predatorStore } from "@/predator/predatorStore.js";
import { cn } from "@/lib/utils";

const STATUS_STYLES = {
  pass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100",
  fail: "border-destructive/40 bg-destructive/10 text-destructive",
};

const CARD_FILTER = {
  tenant: (c) => c.id.startsWith("tenant."),
  role: (c) => c.id.startsWith("role."),
  drift: (c) => c.id.startsWith("layers."),
  schema: (c) => c.id.startsWith("schema."),
};

function IsolationCardGroup({ title, checks, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!checks.length) return null;

  const worst =
    checks.some((c) => c.status === "fail")
      ? "fail"
      : checks.some((c) => c.status === "warn")
        ? "warn"
        : "pass";

  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2",
        STATUS_STYLES[worst] || STATUS_STYLES.warn
      )}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold"
        onClick={() => setOpen((v) => !v)}
      >
        {title}
        <span className="text-xs font-normal uppercase opacity-80">
          {open ? "Hide" : "Show"} ({checks.length})
        </span>
      </button>
      {open ? (
        <ul className="mt-2 max-h-48 space-y-1.5 overflow-y-auto text-xs">
          {checks.map((check) => (
            <li
              key={check.id}
              className={cn(
                "rounded-lg border px-2 py-1.5",
                STATUS_STYLES[check.status] || STATUS_STYLES.warn
              )}
            >
              <div className="font-medium">{check.label}</div>
              <p className="mt-0.5 opacity-90">{check.message}</p>
              {check.status !== "pass" && check.actual ? (
                <pre className="mt-1 max-h-20 overflow-auto font-mono text-[10px] opacity-80">
                  {JSON.stringify(check.actual, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Phase 2 QA panel — tenant + role isolation (read-only).
 */
export default function TenantRoleIsolationQaPanel({
  currentUser,
  layerSnapshots = {},
  autoRun = true,
}) {
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const enabled = isTenantRoleIsolationValidationEnabled();

  const runValidation = useCallback(async () => {
    if (!enabled) return;
    setRunning(true);
    try {
      const ctx = {
        tenantId: currentUser?.tenantId ?? currentUser?.tenant_id ?? null,
        role: currentUser?.role ?? null,
        userId: currentUser?.id ?? null,
      };
      const next = await runTenantRoleIsolationValidation({
        currentUser,
        ctx,
        layerSnapshots,
        printReport: true,
      });
      setReport(next);
    } catch (err) {
      console.error("[Phase 2 Isolation] run failed", err);
      setReport({
        status: "fail",
        scope: "Tenant + Role Isolation (Phase 2)",
        ranAt: new Date().toISOString(),
        checks: [
          {
            id: "validation_runtime",
            label: "Validation runtime",
            status: "fail",
            message: err?.message || String(err),
          },
        ],
        summary: { pass: 0, warn: 0, fail: 1 },
      });
    } finally {
      setRunning(false);
    }
  }, [currentUser, enabled, layerSnapshots]);

  React.useEffect(() => {
    if (!autoRun || !enabled || !currentUser) return;
    runValidation();
  }, [autoRun, enabled, currentUser, runValidation]);

  const grouped = useMemo(() => {
    const checks = report?.checks || [];
    return {
      tenant: checks.filter(CARD_FILTER.tenant),
      role: checks.filter(CARD_FILTER.role),
      drift: checks.filter(CARD_FILTER.drift),
      schema: checks.filter(CARD_FILTER.schema),
      other: checks.filter(
        (c) =>
          !CARD_FILTER.tenant(c) &&
          !CARD_FILTER.role(c) &&
          !CARD_FILTER.drift(c) &&
          !CARD_FILTER.schema(c)
      ),
    };
  }, [report]);

  const timelineSteps = useMemo(() => {
    const diagnosis = predatorStore.getModuleDiagnosis("Tenant + Role Isolation");
    return diagnosis?.timeline || [];
  }, [report]);

  if (!enabled) {
    return (
      <section className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        Phase 2 tenant/role isolation validation is disabled. Enable QA environment or set
        VITE_QA_ISOLATION_VALIDATION=true (not recommended on production).
      </section>
    );
  }

  const status = report?.status || "warn";

  return (
    <section
      className={cn(
        "rounded-2xl border px-4 py-3 text-sm shadow-[var(--pc-shadow-card)]",
        STATUS_STYLES[status] || STATUS_STYLES.warn
      )}
      aria-label="Tenant and role isolation validation"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">QA Phase 2 — Tenant + Role Isolation</p>
          <p className="mt-0.5 text-xs opacity-90">
            Read-only RLS probes · FAIL only on confirmed leakage or cross-layer security drift ·
            schema gaps are WARN
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="min-h-9 rounded-lg border border-current/30 px-3 py-1 text-xs font-medium"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
          <button
            type="button"
            onClick={runValidation}
            disabled={running}
            className="min-h-9 rounded-lg border border-current/30 bg-card/50 px-3 py-1 text-xs font-medium disabled:opacity-50"
          >
            {running ? "Running…" : "Re-run isolation"}
          </button>
        </div>
      </div>

      {report ? (
        <p className="mt-2 text-xs">
          Overall: <strong>{report.status.toUpperCase()}</strong> — pass {report.summary.pass},
          warn {report.summary.warn}, fail {report.summary.fail}
          {report.ranAt ? ` · ${report.ranAt}` : ""}
        </p>
      ) : (
        <p className="mt-2 text-xs">Running isolation probes…</p>
      )}

      {expanded && report ? (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <IsolationCardGroup title="Tenant isolation" checks={grouped.tenant} />
          <IsolationCardGroup title="Role isolation" checks={grouped.role} />
          <IsolationCardGroup title="Cross-layer drift" checks={grouped.drift} defaultOpen={false} />
          <IsolationCardGroup title="Schema / RLS awareness" checks={grouped.schema} defaultOpen={false} />
          <IsolationCardGroup title="Environment & timing" checks={grouped.other} defaultOpen={false} />
        </div>
      ) : null}

      {expanded && timelineSteps.length > 0 ? (
        <div className="mt-4">
          <PredatorTimeline title="Isolation validation timeline" steps={timelineSteps} />
        </div>
      ) : null}
    </section>
  );
}
