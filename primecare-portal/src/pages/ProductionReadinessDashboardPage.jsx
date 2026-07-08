import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge, PageHeader } from "@/components/ux";
import {
  buildProductionReadinessModel,
  READINESS_GATE_STATUS,
} from "@/platform/productionReadinessModel.js";
import {
  DASHBOARD_KPI_OWNERSHIP,
  REPORT_OWNERSHIP,
  PLATFORM_WORKSPACE_HOMES,
} from "@/platform/platformConsolidationModel.js";
import { Shield, RefreshCw, Activity, Database, ClipboardCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const STATUS_VARIANT = {
  [READINESS_GATE_STATUS.PASS]: "success",
  [READINESS_GATE_STATUS.WARN]: "warning",
  [READINESS_GATE_STATUS.FAIL]: "danger",
  [READINESS_GATE_STATUS.PENDING]: "info",
};

const BAND_VARIANT = {
  READY: "success",
  CONDITIONAL: "info",
  NOT_READY: "warning",
};

function GateRow({ gate }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 py-2 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">{gate.label}</p>
        <p className="mt-0.5 text-xs text-slate-600">{gate.detail}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {gate.tier ? (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
            Tier {gate.tier}
          </span>
        ) : null}
        <StatusBadge variant={STATUS_VARIANT[gate.status] || "neutral"}>{gate.status}</StatusBadge>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600">
        {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Architecture / production readiness — developers and HQ admins only.
 * Not Founder Command Center.
 */
export default function ProductionReadinessDashboardPage({ setActivePage }) {
  const model = useMemo(() => buildProductionReadinessModel(), []);
  const { sections, overallBand, gateSummary, openRiskCount, updatedAt } = model;

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-8">
      <PageHeader
        title="Architecture Readiness"
        subtitle="Production gates, verification coverage, projection status, and open risks — for developers and HQ admins."
        icon={Shield}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => window.location.reload()}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        }
      />

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        This is not Founder Command Center. Founder OS is deferred. Run{" "}
        <code className="rounded bg-amber-100 px-1">node scripts/audit-phase-9-1-certification.mjs</code>{" "}
        for live gate results.
      </div>

      <Section title="Overall status" icon={Activity}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["Band", overallBand],
            ["Open risks", openRiskCount],
            ["Pass", gateSummary.pass],
            ["Warn", gateSummary.warn],
            ["Fail", gateSummary.fail],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border bg-slate-50 p-2 text-center">
              <p className="text-[10px] font-medium uppercase text-slate-500">{label}</p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge variant={BAND_VARIANT[overallBand] || "neutral"}>{overallBand}</StatusBadge>
          <span className="text-xs text-slate-500">Updated {new Date(updatedAt).toLocaleString()}</span>
        </div>
      </Section>

      <div className="grid gap-4 lg:grid-cols-2">
        {sections.map((section) => (
          <Section
            key={section.id}
            title={section.title}
            icon={
              section.id === "projection"
                ? Database
                : section.id === "manual_uat"
                  ? ClipboardCheck
                  : Shield
            }
          >
            {section.gates.map((gate) => (
              <GateRow key={gate.id} gate={gate} />
            ))}
          </Section>
        ))}
      </div>

      <Section title="Workspace homes (Phase 9.1)" icon={ClipboardCheck}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(PLATFORM_WORKSPACE_HOMES).map(([domain, pageKey]) => (
            <button
              key={domain}
              type="button"
              className={cn(
                "rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm transition-colors hover:bg-slate-100",
                setActivePage ? "cursor-pointer" : "cursor-default"
              )}
              onClick={() => setActivePage?.(pageKey)}
              disabled={!setActivePage}
            >
              <span className="font-medium capitalize text-slate-900">{domain}</span>
              <span className="mt-0.5 block text-xs text-slate-600">{pageKey}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="KPI ownership sample" icon={Activity}>
        <div className="max-h-48 overflow-y-auto text-xs">
          {Object.entries(DASHBOARD_KPI_OWNERSHIP)
            .slice(0, 8)
            .map(([kpi, meta]) => (
              <div key={kpi} className="border-b border-slate-100 py-1.5 last:border-0">
                <span className="font-medium text-slate-800">{kpi}</span>
                <span className="text-slate-500"> → {meta.primaryDashboard}</span>
              </div>
            ))}
        </div>
      </Section>

      <Section title="Report ownership sample" icon={ClipboardCheck}>
        <div className="grid gap-1 text-xs sm:grid-cols-2">
          {Object.entries(REPORT_OWNERSHIP).map(([id, meta]) => (
            <div key={id} className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5">
              <span className="font-medium text-slate-800">{id}</span>
              <span className="text-slate-500"> — {meta.module}/{meta.screen}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
