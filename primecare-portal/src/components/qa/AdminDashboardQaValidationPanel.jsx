import React, { useCallback, useState } from "react";
import { runAdminDashboardValidation } from "@/validation/adminDashboardValidation.js";
import { QA_ADMIN_DASHBOARD_SEED } from "@/validation/qaSeedExpectations.js";
import { cn } from "@/lib/utils";

const STATUS_STYLES = {
  pass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100",
  fail: "border-destructive/40 bg-destructive/10 text-destructive",
};

/**
 * Dev/QA-only panel: compares DB browser reads, API payload, and rendered KPIs.
 */
export default function AdminDashboardQaValidationPanel({ renderedSnapshot, autoRun = true }) {
  const [report, setReport] = useState(null);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const runValidation = useCallback(async () => {
    setRunning(true);
    try {
      const next = await runAdminDashboardValidation({
        rendered: renderedSnapshot,
        printReport: true,
      });
      setReport(next);
    } catch (err) {
      console.error("[PrimeCare QA Validation] run failed", err);
      setReport({
        status: "fail",
        scope: "Admin Dashboard",
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
  }, [renderedSnapshot]);

  React.useEffect(() => {
    if (!autoRun || !renderedSnapshot?.summary || !renderedSnapshot?.executive) return;
    runValidation();
  }, [autoRun, renderedSnapshot, runValidation]);

  const status = report?.status || "warn";

  return (
    <section
      className={cn(
        "rounded-2xl border px-4 py-3 text-sm shadow-[var(--pc-shadow-card)]",
        STATUS_STYLES[status] || STATUS_STYLES.warn
      )}
      aria-label="QA validation panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">QA Validation — Admin Dashboard (Phase 1)</p>
          <p className="mt-0.5 text-xs opacity-90">
            Seed: orders {QA_ADMIN_DASHBOARD_SEED.ordersCount}, receivables ₹
            {QA_ADMIN_DASHBOARD_SEED.outstandingReceivables}, visits{" "}
            {QA_ADMIN_DASHBOARD_SEED.recentVisits}, SKUs {QA_ADMIN_DASHBOARD_SEED.inventorySkus},
            sold ₹{QA_ADMIN_DASHBOARD_SEED.totalSoldValue}
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
            {running ? "Running…" : "Re-run"}
          </button>
        </div>
      </div>

      {report ? (
        <p className="mt-2 text-xs">
          Overall: <strong>{report.status.toUpperCase()}</strong> — pass {report.summary.pass}, warn{" "}
          {report.summary.warn}, fail {report.summary.fail}
          {report.ranAt ? ` · ${report.ranAt}` : ""}
        </p>
      ) : (
        <p className="mt-2 text-xs">Waiting for dashboard data…</p>
      )}

      {expanded && report?.checks?.length ? (
        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-xs">
          {report.checks.map((check) => (
            <li
              key={check.id}
              className={cn(
                "rounded-lg border px-2 py-1.5",
                check.status === "fail"
                  ? "border-destructive/50 bg-destructive/5"
                  : check.status === "warn"
                    ? "border-amber-500/40 bg-amber-500/5"
                    : "border-emerald-500/30 bg-emerald-500/5"
              )}
            >
              <span className="font-medium uppercase">{check.status}</span> — {check.label}:{" "}
              {check.message}
              {check.actual ? (
                <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-[10px] opacity-80">
                  {JSON.stringify(check.actual, null, 2)}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
