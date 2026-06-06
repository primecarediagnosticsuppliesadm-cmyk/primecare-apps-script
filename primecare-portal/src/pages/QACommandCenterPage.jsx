import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge, PageSkeleton } from "@/components/ux";
import { buildQAReadinessModel, RELEASE_STATUS } from "@/qa/qaReadinessEngine.js";
import {
  closeQaDefect,
  createQaDefect,
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  loadQaDefects,
  recordLastSuccessfulValidation,
  updateQaDefect,
} from "@/qa/qaDefectRegistry.js";
import { runAllPredatorValidations } from "@/predator/runPredatorValidation.js";
import { predatorStore } from "@/predator/predatorStore.js";
import { usePredatorModuleValidation } from "@/predator/usePredatorModuleValidation.js";
import { cn } from "@/lib/utils";
import { ClipboardCheck, RefreshCw, ShieldAlert } from "lucide-react";

const STATUS_VARIANT = {
  [RELEASE_STATUS.READY]: "success",
  [RELEASE_STATUS.PILOT_READY]: "info",
  [RELEASE_STATUS.RISKY]: "warning",
  [RELEASE_STATUS.NOT_READY]: "danger",
  PASS: "success",
  WARN: "warning",
  FAIL: "danger",
  MISSING: "neutral",
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
 * Executive-only QA Command Center — release readiness visibility.
 */
export default function QACommandCenterPage({ currentUser = null }) {
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [runningPredator, setRunningPredator] = useState(false);
  const [msg, setMsg] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    module: "General",
    severity: "Medium",
    owner: "",
    notes: "",
    failedTestCase: false,
    title: "",
  });

  const refresh = useCallback(() => {
    setLoading(true);
    const next = buildQAReadinessModel({
      predatorReports: predatorStore.getModuleReportsForActiveTenant(),
      defects: loadQaDefects(),
    });
    setModel(next);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const predatorSnapshot = useMemo(() => {
    if (!model) return null;
    return {
      qaCommandCenter: true,
      qaReadiness: model,
      readinessScore: model.readinessScore,
      releaseStatus: model.releaseStatus,
      openDefects: model.defects?.open ?? 0,
      criticalDefects: model.defects?.critical ?? 0,
    };
  }, [model]);

  usePredatorModuleValidation(
    "QA Readiness",
    currentUser,
    predatorSnapshot ?? {},
    Boolean(predatorSnapshot)
  );

  async function handleRunPredator() {
    try {
      setRunningPredator(true);
      setMsg("");
      const report = await runAllPredatorValidations(currentUser, {});
      if (report?.summary?.status === "PASS" && num(report.summary.fail) === 0) {
        recordLastSuccessfulValidation(report.ranAt);
      }
      refresh();
      setMsg(`Predator run complete — ${report?.summary?.status || "done"}`);
    } catch (err) {
      setMsg(err?.message || "Predator run failed");
    } finally {
      setRunningPredator(false);
    }
  }

  function handleCreateDefect(e) {
    e.preventDefault();
    createQaDefect(form);
    setShowCreate(false);
    setForm({
      module: "General",
      severity: "Medium",
      owner: "",
      notes: "",
      failedTestCase: false,
      title: "",
    });
    refresh();
    setMsg("Defect created");
  }

  function handleCloseDefect(id) {
    closeQaDefect(id);
    refresh();
  }

  function handleUpdateStatus(id, status) {
    updateQaDefect(id, { status });
    refresh();
  }

  if (loading && !model) return <PageSkeleton rows={10} />;
  if (!model) return null;

  const { readinessScore, releaseStatus, predatorHealth, coverage, defects, regression } = model;

  return (
    <div className="mx-auto max-w-5xl space-y-3 p-3 pb-8">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <ClipboardCheck className="h-5 w-5 text-indigo-600" aria-hidden />
            QA Command Center
          </h1>
          <p className="mt-0.5 text-xs text-slate-600">
            Release readiness for distributor, lab, and agent pilot onboarding.
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={runningPredator}
            onClick={() => void handleRunPredator()}
          >
            <RefreshCw className={cn("h-4 w-4", runningPredator && "animate-spin")} />
            Run Predator
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={refresh} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {msg ? <p className="text-xs text-slate-600">{msg}</p> : null}

      <Section title="Release readiness" icon={ShieldAlert}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="text-3xl font-bold tabular-nums text-slate-900">{readinessScore}</p>
          <StatusBadge variant={STATUS_VARIANT[releaseStatus] || "neutral"} label={releaseStatus} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <MetricTile label="Predator health" value={predatorHealth.status} />
          <MetricTile label="Open defects" value={String(defects.open)} />
          <MetricTile label="Critical defects" value={String(defects.critical)} />
          <MetricTile label="Failed test cases" value={String(defects.failedTestCases)} />
          <MetricTile label="Recent regressions" value={String(regression.failureCount)} />
          <MetricTile
            label="Last successful validation"
            value={
              model.lastSuccessfulValidation?.at
                ? new Date(model.lastSuccessfulValidation.at).toLocaleString("en-IN")
                : "—"
            }
          />
        </div>
      </Section>

      <Section title="Module coverage">
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="min-w-full text-left text-[10px]">
            <thead className="border-b bg-slate-50 text-slate-600">
              <tr>
                <th className="px-2 py-1.5 font-semibold">Area</th>
                <th className="px-2 py-1.5 font-semibold">Status</th>
                <th className="px-2 py-1.5 font-semibold">PASS %</th>
                <th className="px-2 py-1.5 font-semibold">WARN %</th>
                <th className="px-2 py-1.5 font-semibold">FAIL %</th>
                <th className="px-2 py-1.5 font-semibold">Modules</th>
              </tr>
            </thead>
            <tbody>
              {coverage.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-2 py-1.5 font-medium">{row.label}</td>
                  <td className="px-2 py-1.5">
                    <StatusBadge variant={STATUS_VARIANT[row.status] || "neutral"} label={row.status} />
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{row.passPct}%</td>
                  <td className="px-2 py-1.5 tabular-nums">{row.warnPct}%</td>
                  <td className="px-2 py-1.5 tabular-nums">{row.failPct}%</td>
                  <td className="px-2 py-1.5 tabular-nums">
                    {row.moduleCount}/{row.expectedModules}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Defect registry">
        <div className="mb-2 flex justify-between gap-2">
          <p className="text-xs text-slate-600">Local QA registry — no external integrations.</p>
          <Button type="button" size="sm" variant="outline" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Cancel" : "Create defect"}
          </Button>
        </div>
        {showCreate ? (
          <form onSubmit={handleCreateDefect} className="mb-3 grid gap-2 rounded-lg border bg-white p-3 text-xs sm:grid-cols-2">
            <Input
              placeholder="Title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
            <Input
              placeholder="Module"
              value={form.module}
              onChange={(e) => setForm((f) => ({ ...f, module: e.target.value }))}
            />
            <select
              className="rounded-md border border-slate-200 px-2 py-1.5"
              value={form.severity}
              onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
            >
              {DEFECT_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <Input
              placeholder="Owner"
              value={form.owner}
              onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
            />
            <Input
              className="sm:col-span-2"
              placeholder="Notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
            <label className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={form.failedTestCase}
                onChange={(e) => setForm((f) => ({ ...f, failedTestCase: e.target.checked }))}
              />
              Failed test case
            </label>
            <Button type="submit" size="sm" className="sm:col-span-2">
              Save defect
            </Button>
          </form>
        ) : null}
        {defects.items.length === 0 ? (
          <p className="text-xs text-slate-500">No defects logged.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="min-w-full text-left text-[10px]">
              <thead className="border-b bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-2 py-1.5 font-semibold">ID</th>
                  <th className="px-2 py-1.5 font-semibold">Module</th>
                  <th className="px-2 py-1.5 font-semibold">Severity</th>
                  <th className="px-2 py-1.5 font-semibold">Status</th>
                  <th className="px-2 py-1.5 font-semibold">Owner</th>
                  <th className="px-2 py-1.5 font-semibold">Notes</th>
                  <th className="px-2 py-1.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {defects.items.map((d) => (
                  <tr key={d.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-2 py-1.5 font-medium">{d.id}</td>
                    <td className="px-2 py-1.5">{d.module}</td>
                    <td className="px-2 py-1.5">{d.severity}</td>
                    <td className="px-2 py-1.5">
                      <select
                        className="rounded border border-slate-200 px-1 py-0.5"
                        value={d.status}
                        onChange={(e) => handleUpdateStatus(d.id, e.target.value)}
                      >
                        {DEFECT_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">{d.owner}</td>
                    <td className="max-w-[200px] truncate px-2 py-1.5">{d.title || d.notes}</td>
                    <td className="px-2 py-1.5">
                      {d.status !== "Closed" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => handleCloseDefect(d.id)}
                        >
                          Close
                        </Button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Regression center">
        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase text-slate-600">Recent Predator failures</p>
            {regression.recentFailures.length === 0 ? (
              <p className="text-xs text-slate-500">No recent failures.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {regression.recentFailures.map((f, i) => (
                  <li key={`${f.module}-${f.step}-${i}`} className="rounded border bg-white px-2 py-1">
                    <span className="font-medium">{f.module}</span> · {f.step} · {f.status}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase text-slate-600">Recently fixed validations</p>
            {regression.recentlyFixed.length === 0 ? (
              <p className="text-xs text-slate-500">No fixed validations recorded yet.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {regression.recentlyFixed.map((f, i) => (
                  <li key={`fixed-${f.module}-${i}`} className="rounded border bg-white px-2 py-1">
                    {f.module} · {f.step}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {regression.volatileModules.length > 0 ? (
          <p className="mt-2 text-[10px] text-slate-600">
            Active modules: {regression.volatileModules.map((m) => m.module).join(", ")}
          </p>
        ) : null}
      </Section>
    </div>
  );
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
