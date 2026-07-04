import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PageHeader,
  PageSkeleton,
  StatusBadge,
  KpiCard,
  KpiCardGrid,
  ReadHealthBanner,
  EnterpriseDataTable,
} from "@/components/ux";
import { loadExecutiveCompensationCenterRead } from "@/api/compensationReadSupabaseApi.js";
import { buildExecutiveCompensationModel } from "@/compensation/executiveCompensationModel.js";
import { usePagePerformance } from "@/hooks/usePagePerformance.js";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  Eye,
  History,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";

const TABS = [
  "Overview",
  "Payroll Periods",
  "Payroll Preview",
  "Agents",
  "Commission History",
  "Audit",
  "Exports",
];

const STATUS_VARIANT = {
  draft: "neutral",
  previewed: "info",
  submitted: "warning",
  approved: "info",
  locked: "warning",
  exported: "success",
  paid: "success",
  void: "neutral",
};

function TrendBars({ points = [], valueKey = "netPayroll", labelKey = "label" }) {
  const max = Math.max(...points.map((point) => Number(point[valueKey] || 0)), 1);
  if (!points.length) {
    return <p className="text-xs text-slate-500">No trend data yet.</p>;
  }
  return (
    <div className="flex h-28 items-end gap-1">
      {points.map((point) => (
        <div key={point.periodYm || point.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div
            className="w-full rounded-t bg-indigo-500/80"
            style={{ height: `${Math.max(4, (Number(point[valueKey] || 0) / max) * 100)}%` }}
            title={`${point[labelKey]}: ${point.netPayrollLabel || point.commissionLabel || point.efficiencyLabel || point.liabilityLabel || point[valueKey]}`}
          />
          <span className="truncate text-[8px] text-slate-400">{point[labelKey]}</span>
        </div>
      ))}
    </div>
  );
}

function RankList({ rows = [], valueKey = "netPayableLabel" }) {
  if (!rows.length) return <p className="text-xs text-slate-500">No ranked agents yet.</p>;
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={row.agentId} className="flex items-center justify-between rounded-lg border bg-white px-3 py-2 text-xs">
          <div>
            <p className="font-semibold text-slate-900">
              #{index + 1} {row.agentName}
            </p>
            <p className="text-slate-500">Commission {row.commissionLabel || "—"}</p>
          </div>
          <p className="font-bold tabular-nums text-indigo-700">{row[valueKey]}</p>
        </div>
      ))}
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, className }) {
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-slate-50/80 p-4", className)}>
      <h2 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600">
        {Icon ? <Icon className="h-4 w-4 text-indigo-600" aria-hidden /> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

function PreviewToolbar({ search, onSearch, statusFilter, onStatusFilter, statuses }) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
        <Input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search agent, plan, or period"
          className="pl-8"
        />
      </div>
      <select
        value={statusFilter}
        onChange={(event) => onStatusFilter(event.target.value)}
        className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs"
      >
        <option value="">All lifecycle statuses</option>
        {statuses.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function ExecutiveCompensationCenterPage({ currentUser = null, setActivePage = null }) {
  const [activeTab, setActiveTab] = useState(TABS[0]);
  const [model, setModel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortKey, setSortKey] = useState("periodYm");
  const [sortDir, setSortDir] = useState("desc");
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");

  usePagePerformance("Executive Compensation");

  const load = useCallback(async () => {
    try {
      if (!model) setLoading(true);
      else setRefreshing(true);
      setError("");
      const payload = await loadExecutiveCompensationCenterRead({ currentUser });
      setModel(buildExecutiveCompensationModel(payload));
    } catch (err) {
      setError(err?.message || "Could not load Executive Compensation Center");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUser, model]);

  useEffect(() => {
    load();
  }, [load]);

  const previewRows = useMemo(() => {
    const rows = model?.previewRows || [];
    const scoped = rows.filter((row) => {
      if (selectedRunId && row.runId !== selectedRunId) return false;
      if (selectedPeriodId && row.periodId !== selectedPeriodId) return false;
      if (statusFilter && row.lifecycleStatus !== statusFilter) return false;
      if (!search) return true;
      const haystack = [
        row.agentName,
        row.agentId,
        row.planCode,
        row.periodYm,
        row.lifecycleStatus,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search.toLowerCase());
    });
    return [...scoped].sort((a, b) => {
      const left = a[sortKey];
      const right = b[sortKey];
      if (typeof left === "number" && typeof right === "number") {
        return sortDir === "asc" ? left - right : right - left;
      }
      return sortDir === "asc"
        ? String(left).localeCompare(String(right))
        : String(right).localeCompare(String(left));
    });
  }, [model, search, selectedPeriodId, selectedRunId, sortDir, sortKey, statusFilter]);

  const lifecycleStatuses = useMemo(
    () => [...new Set((model?.previewRows || []).map((row) => row.lifecycleStatus).filter(Boolean))].sort(),
    [model]
  );

  const selectedAgent = selectedAgentId ? model?.agentProfiles?.[selectedAgentId] : null;

  const openPreview = (periodRow) => {
    setSelectedPeriodId(periodRow.periodId);
    setSelectedRunId(periodRow.runId || "");
    setActiveTab("Payroll Preview");
  };

  const openAgent = (agentId) => {
    setSelectedAgentId(agentId);
    setActiveTab("Agents");
  };

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  if (loading && !model) {
    return <PageSkeleton kpiCount={8} listRows={8} />;
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader
        title="Executive Compensation"
        subtitle="Read-only compensation and payroll intelligence. Preview only — no approvals, locks, exports, or payout actions."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={load} disabled={refreshing}>
            <RefreshCw className={cn("mr-1 h-4 w-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      <ReadHealthBanner readHealth={model?.readHealth} />

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Button
            key={tab}
            type="button"
            size="sm"
            variant={activeTab === tab ? "default" : "outline"}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </Button>
        ))}
      </div>

      {activeTab === "Overview" && model ? (
        <div className="space-y-4">
          <KpiCardGrid>
            <KpiCard title="Current Payroll Liability" value={model.kpis.currentPayrollLiabilityLabel} icon={Wallet} />
            <KpiCard title="Commission Payable" value={model.kpis.commissionPayableLabel} icon={TrendingUp} />
            <KpiCard title="Pending Payroll Periods" value={String(model.kpis.pendingPayrollPeriods)} icon={BarChart3} />
            <KpiCard title="Locked Runs" value={String(model.kpis.lockedPayrollRuns)} icon={BarChart3} />
            <KpiCard title="Exported Runs" value={String(model.kpis.exportedPayrollRuns)} icon={BarChart3} />
            <KpiCard title="Paid Evidence Runs" value={String(model.kpis.paidEvidenceRuns)} icon={Wallet} />
            <KpiCard title="Promotion Eligible Agents" value={String(model.kpis.promotionEligibleAgents)} icon={Users} />
            <KpiCard title="Collection Efficiency" value={model.kpis.collectionEfficiencyLabel} icon={TrendingUp} />
          </KpiCardGrid>

          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="Payroll Trend" icon={BarChart3}>
              <TrendBars points={model.charts.payrollTrend} valueKey="netPayroll" />
            </SectionCard>
            <SectionCard title="Commission Trend" icon={TrendingUp}>
              <TrendBars points={model.charts.commissionTrend} valueKey="commission" />
            </SectionCard>
            <SectionCard title="Collection Trend" icon={TrendingUp}>
              <TrendBars points={model.charts.collectionTrend} valueKey="efficiency" />
            </SectionCard>
            <SectionCard title="Payroll Liability Trend" icon={Wallet}>
              <TrendBars points={model.charts.liabilityTrend} valueKey="liability" />
            </SectionCard>
            <SectionCard title="Top Performers" icon={Users}>
              <RankList rows={model.charts.topAgents} />
            </SectionCard>
            <SectionCard title="Promotion Pipeline" icon={Users}>
              <RankList
                rows={model.charts.promotionPipeline.map((row) => ({
                  ...row,
                  netPayableLabel: row.eligible ? "Eligible" : row.status,
                  commissionLabel: `${row.efficiencyPct}% efficiency`,
                }))}
                valueKey="netPayableLabel"
              />
            </SectionCard>
          </div>
        </div>
      ) : null}

      {activeTab === "Payroll Periods" && model ? (
        <EnterpriseDataTable
          hasRows={model.periodRows.length > 0}
          emptyTitle="No payroll periods"
          emptyDescription="Payroll periods will appear here after HR or Executive preview generation."
          desktop={
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="min-w-full text-left text-[11px]">
                <thead className="border-b bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    {[
                      "Period",
                      "Status",
                      "Generated",
                      "Submitted",
                      "Approved",
                      "Locked",
                      "Exported",
                      "Paid",
                      "Run Version",
                      "Employees",
                      "Net Payroll",
                      "",
                    ].map((label) => (
                      <th key={label} className="px-2 py-2">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {model.periodRows.map((row) => (
                    <tr key={row.periodId} className="border-b border-slate-100 last:border-0">
                      <td className="px-2 py-2 font-medium">{row.periodYm}</td>
                      <td className="px-2 py-2">
                        <StatusBadge variant={STATUS_VARIANT[row.status] || "neutral"} label={row.status} />
                      </td>
                      <td className="px-2 py-2">{row.generatedAt ? new Date(row.generatedAt).toLocaleDateString("en-IN") : "—"}</td>
                      <td className="px-2 py-2">{row.submittedAt ? new Date(row.submittedAt).toLocaleDateString("en-IN") : "—"}</td>
                      <td className="px-2 py-2">{row.approvedAt ? new Date(row.approvedAt).toLocaleDateString("en-IN") : "—"}</td>
                      <td className="px-2 py-2">{row.lockedAt ? new Date(row.lockedAt).toLocaleDateString("en-IN") : "—"}</td>
                      <td className="px-2 py-2">{row.exportedAt ? new Date(row.exportedAt).toLocaleDateString("en-IN") : "—"}</td>
                      <td className="px-2 py-2">{row.paidAt ? new Date(row.paidAt).toLocaleDateString("en-IN") : "—"}</td>
                      <td className="px-2 py-2">{row.runVersion ?? "—"}</td>
                      <td className="px-2 py-2">{row.employeeCount}</td>
                      <td className="px-2 py-2 tabular-nums">{row.netPayrollLabel}</td>
                      <td className="px-2 py-2">
                        <Button type="button" size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => openPreview(row)}>
                          <Eye className="mr-1 h-3 w-3" />
                          Open Preview
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        />
      ) : null}

      {activeTab === "Payroll Preview" && model ? (
        <EnterpriseDataTable
          hasRows={previewRows.length > 0}
          toolbar={
            <PreviewToolbar
              search={search}
              onSearch={setSearch}
              statusFilter={statusFilter}
              onStatusFilter={setStatusFilter}
              statuses={lifecycleStatuses}
            />
          }
          emptyTitle="No payroll preview lines"
          emptyDescription="Select a payroll period or generate a preview run to inspect agent-level results."
          desktop={
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="min-w-full text-left text-[11px]">
                <thead className="border-b bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    {[
                      ["agentName", "Agent"],
                      ["planCode", "Compensation Plan"],
                      ["salaryLabel", "Salary"],
                      ["fuelLabel", "Fuel"],
                      ["mobileLabel", "Mobile"],
                      ["collectedCashLabel", "Collected Cash"],
                      ["commissionLabel", "Commission"],
                      ["bonusesLabel", "Bonuses"],
                      ["adjustmentsLabel", "Adjustments"],
                      ["recoveriesLabel", "Recoveries"],
                      ["netPreviewLabel", "Net Preview"],
                      ["lifecycleStatus", "Lifecycle Status"],
                      ["ruleVersion", "Rule Version"],
                      ["planVersion", "Plan Version"],
                      ["calculatedAtLabel", "Calculated At"],
                      ["", ""],
                    ].map(([key, label]) => (
                      <th
                        key={label || key}
                        className="cursor-pointer px-2 py-2"
                        onClick={() => key && toggleSort(key)}
                      >
                        {label}
                        {sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.lineId} className="border-b border-slate-100 last:border-0">
                      <td className="px-2 py-2 font-medium">{row.agentName}</td>
                      <td className="px-2 py-2">{row.planCode}</td>
                      <td className="px-2 py-2 tabular-nums">{row.salaryLabel}</td>
                      <td className="px-2 py-2 tabular-nums">{row.fuelLabel}</td>
                      <td className="px-2 py-2 tabular-nums">{row.mobileLabel}</td>
                      <td className="px-2 py-2 tabular-nums">{row.collectedCashLabel}</td>
                      <td className="px-2 py-2 tabular-nums">{row.commissionLabel}</td>
                      <td className="px-2 py-2 tabular-nums">{row.bonusesLabel}</td>
                      <td className="px-2 py-2 tabular-nums">{row.adjustmentsLabel}</td>
                      <td className="px-2 py-2 tabular-nums">{row.recoveriesLabel}</td>
                      <td className="px-2 py-2 tabular-nums font-semibold text-indigo-700">{row.netPreviewLabel}</td>
                      <td className="px-2 py-2">
                        <StatusBadge variant={STATUS_VARIANT[row.lifecycleStatus] || "neutral"} label={row.lifecycleStatus} />
                      </td>
                      <td className="px-2 py-2">{row.ruleVersion}</td>
                      <td className="px-2 py-2">{row.planVersion}</td>
                      <td className="px-2 py-2">{row.calculatedAtLabel}</td>
                      <td className="px-2 py-2">
                        <Button type="button" size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => openAgent(row.agentId)}>
                          View Agent
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        />
      ) : null}

      {activeTab === "Agents" && model ? (
        selectedAgent ? (
          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="Profile" icon={Users}>
              <div className="grid gap-2 text-xs">
                <p><span className="text-slate-500">Agent:</span> {selectedAgent.agentName}</p>
                <p><span className="text-slate-500">Plan:</span> {selectedAgent.planCode} · {selectedAgent.planVersion}</p>
                <p><span className="text-slate-500">Current Salary:</span> ₹{Number(selectedAgent.currentSalary || 0).toLocaleString("en-IN")}</p>
                <p><span className="text-slate-500">Allowances:</span> Fuel ₹{Number(selectedAgent.fuelAllowance || 0).toLocaleString("en-IN")} · Mobile ₹{Number(selectedAgent.mobileAllowance || 0).toLocaleString("en-IN")}</p>
                <p><span className="text-slate-500">Commission Rate:</span> {selectedAgent.commissionRateBps} bps</p>
                <p><span className="text-slate-500">Collection Efficiency:</span> {selectedAgent.collectionEfficiency}%</p>
                <p><span className="text-slate-500">Promotion Eligibility:</span> {selectedAgent.promotionEligible ? "Eligible" : "Not eligible"}</p>
              </div>
            </SectionCard>
            <SectionCard title="Payroll History" icon={Wallet}>
              {selectedAgent.payrollHistory.map((row) => (
                <div key={`${row.periodYm}-${row.runNumber}`} className="mb-2 rounded border bg-white px-3 py-2 text-xs">
                  <p className="font-semibold">{row.periodYm} · v{row.runNumber}</p>
                  <p>{row.status} · {row.netPayableLabel}</p>
                </div>
              ))}
            </SectionCard>
            <SectionCard title="Commission History" icon={TrendingUp}>
              {selectedAgent.commissionHistory.map((row) => (
                <div key={`${row.periodId}-${row.ruleVersion}`} className="mb-2 rounded border bg-white px-3 py-2 text-xs">
                  <p className="font-semibold">{row.commissionLabel}</p>
                  <p>Cash {row.attributableCashLabel} · {row.status}</p>
                </div>
              ))}
            </SectionCard>
            <SectionCard title="Attribution Summary" icon={Eye}>
              {selectedAgent.attributionSummary.map((row, index) => (
                <div key={index} className="mb-2 rounded border bg-white px-3 py-2 text-xs">
                  <p className="font-semibold">{row.status}</p>
                  <p>{row.cashCollectedLabel} · {row.blockedReason}</p>
                </div>
              ))}
            </SectionCard>
          </div>
        ) : (
          <EnterpriseDataTable
            hasRows={Object.keys(model.agentProfiles).length > 0}
            emptyTitle="Select an agent"
            emptyDescription="Open Payroll Preview and choose View Agent, or pick an agent below."
            desktop={
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {Object.values(model.agentProfiles).map((agent) => (
                  <button
                    key={agent.agentId}
                    type="button"
                    className="rounded-lg border bg-white p-3 text-left text-xs shadow-sm hover:border-indigo-300"
                    onClick={() => openAgent(agent.agentId)}
                  >
                    <p className="font-semibold text-slate-900">{agent.agentName}</p>
                    <p className="text-slate-500">{agent.planCode} · {agent.planVersion}</p>
                    <p className="mt-1 text-indigo-700">{agent.promotionEligible ? "Promotion eligible" : "Standard track"}</p>
                  </button>
                ))}
              </div>
            }
          />
        )
      ) : null}

      {activeTab === "Commission History" && model ? (
        <EnterpriseDataTable
          hasRows={model.commissionHistoryRows.length > 0}
          emptyTitle="No commission history"
          emptyDescription="Commission entries appear after payroll preview calculation."
          desktop={
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="min-w-full text-left text-[11px]">
                <thead className="border-b bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    {["Period", "Agent", "Cash Collected", "Commission", "Status", "Eligibility", "Rule Version", "Recorded"].map((label) => (
                      <th key={label} className="px-2 py-2">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {model.commissionHistoryRows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-2 py-2">{row.periodYm}</td>
                      <td className="px-2 py-2 font-medium">{row.agentName}</td>
                      <td className="px-2 py-2 tabular-nums">{row.attributableCashLabel}</td>
                      <td className="px-2 py-2 tabular-nums">{row.commissionLabel}</td>
                      <td className="px-2 py-2"><StatusBadge variant={STATUS_VARIANT[row.status] || "neutral"} label={row.status} /></td>
                      <td className="px-2 py-2">{row.eligibilityStatus}</td>
                      <td className="px-2 py-2">{row.ruleVersion}</td>
                      <td className="px-2 py-2">{row.atLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        />
      ) : null}

      {activeTab === "Audit" && model ? (
        <SectionCard title="Audit Events" icon={History}>
          <div className="space-y-2">
            {model.auditTimeline.length ? model.auditTimeline.map((event) => (
              <div key={event.id} className="rounded-lg border bg-white px-3 py-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">{event.title}</p>
                    <p className="text-slate-600">{event.subtitle}</p>
                  </div>
                  <StatusBadge variant={STATUS_VARIANT[event.category] || "neutral"} label={event.category} />
                </div>
                <p className="mt-1 text-[10px] text-slate-500">{event.atLabel} · {event.actorRole}</p>
              </div>
            )) : <p className="text-xs text-slate-500">No audit events recorded yet.</p>}
          </div>
        </SectionCard>
      ) : null}

      {activeTab === "Exports" && model ? (
        <EnterpriseDataTable
          hasRows={model.exportRows.length > 0}
          emptyTitle="No export metadata"
          emptyDescription="Export records appear after an Executive export action in a later phase."
          desktop={
            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="min-w-full text-left text-[11px]">
                <thead className="border-b bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    {["Period", "Run Version", "Format", "Checksum", "Storage", "Exported"].map((label) => (
                      <th key={label} className="px-2 py-2">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {model.exportRows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-2 py-2">{row.periodYm}</td>
                      <td className="px-2 py-2">{row.runNumber}</td>
                      <td className="px-2 py-2">{row.exportFormat}</td>
                      <td className="px-2 py-2">{row.checksum}</td>
                      <td className="px-2 py-2">{row.storagePath}</td>
                      <td className="px-2 py-2">{row.atLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        />
      ) : null}

      {setActivePage ? (
        <p className="text-[10px] text-slate-400">
          Executive Compensation Center is read-only. Approval, lock, export, and paid evidence workflows remain backend-only until Phase 4B.
        </p>
      ) : null}
    </div>
  );
}
