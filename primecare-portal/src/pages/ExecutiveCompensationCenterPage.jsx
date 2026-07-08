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
import { generatePayrollPreview } from "@/api/compensationSupabaseApi.js";
import {
  approvePayrollRunWrite,
  generatePayrollExportWrite,
  lockPayrollRunWrite,
  previewPayrollRunWrite,
  recordPayrollPaidWrite,
  rejectPayrollRunWrite,
  submitPayrollRunWrite,
} from "@/api/payrollDomainSupabaseApi.js";
import {
  activateCompensationPlan,
  assignEmployeeToPlan,
  changeEmployeePlanAssignment,
  createCompensationPlan,
  deactivateCompensationPlan,
  duplicateCompensationPlan,
  endEmployeePlanAssignment,
  loadCompensationPlanAdminRead,
  saveCompensationPlanAdmin,
} from "@/api/compensationPlanAdminSupabaseApi.js";
import CompensationPlanAssignmentsTab from "@/components/compensation/CompensationPlanAssignmentsTab.jsx";
import CompensationPlansTab from "@/components/compensation/CompensationPlansTab.jsx";
import EmployeeCompensation360Panel from "@/components/compensation/EmployeeCompensation360Panel.jsx";
import EmployeeDirectoryTab from "@/components/compensation/EmployeeDirectoryTab.jsx";
import PayrollWorkflowToolbar from "@/components/compensation/PayrollWorkflowToolbar.jsx";
import ExecutiveCompensationIntelligencePanel from "@/components/compensation/ExecutiveCompensationIntelligencePanel.jsx";
import {
  loadEmployeeCompensation360Read,
  loadEmployeeCompensationDirectoryRead,
} from "@/api/employeeCompensation360SupabaseApi.js";
import { buildCompensationPlanAdminModel } from "@/compensation/compensationPlanAdminModel.js";
import { compensationAdminPermissions } from "@/compensation/compensationPlanAdminWorkflow.js";
import { employeeCompensation360Permissions } from "@/compensation/employeeCompensation360Workflow.js";
import { PAYROLL_UI_ACTION_IDS } from "@/payroll/payrollWorkflowUi.js";
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
  "Compensation Plans",
  "Plan Assignments",
  "Payroll Periods",
  "Payroll Preview",
  "Employees",
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
  const [selectedEmployeeProfileId, setSelectedEmployeeProfileId] = useState("");
  const [generatingPeriodId, setGeneratingPeriodId] = useState("");
  const [generationNotice, setGenerationNotice] = useState("");
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [workflowNotice, setWorkflowNotice] = useState("");
  const [adminModel, setAdminModel] = useState(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminNotice, setAdminNotice] = useState("");
  const [employee360Model, setEmployee360Model] = useState(null);
  const [employee360Loading, setEmployee360Loading] = useState(false);
  const [employee360Error, setEmployee360Error] = useState("");
  const [employeeDirectory, setEmployeeDirectory] = useState([]);
  const [employeeRoleFilter, setEmployeeRoleFilter] = useState("all");
  const [employeeSearch, setEmployeeSearch] = useState("");

  const actorRole = String(currentUser?.role || "executive").toLowerCase();
  const tenantId = currentUser?.tenantId || currentUser?.tenant_id || "";
  const actorUserId = currentUser?.id || currentUser?.userId || "";
  const adminPermissions = useMemo(() => compensationAdminPermissions(actorRole), [actorRole]);
  const employee360Permissions = useMemo(() => employeeCompensation360Permissions(actorRole), [actorRole]);

  usePagePerformance("Executive Compensation");

  const load = useCallback(async ({ refresh = false } = {}) => {
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      const payload = await loadExecutiveCompensationCenterRead({ currentUser });
      setModel(buildExecutiveCompensationModel(payload));
    } catch (err) {
      setError(err?.message || "Could not load Executive Compensation Center");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUser]);

  const loadAdmin = useCallback(async () => {
    if (!adminPermissions.canViewPlans && !adminPermissions.agentOwnPlanOnly) return;
    try {
      setAdminBusy(true);
      const result = await loadCompensationPlanAdminRead({ currentUser });
      if (!result.success) throw new Error(result.error || "Could not load compensation administration");
      setAdminModel(
        buildCompensationPlanAdminModel({
          ...result.data,
          actorRole,
          actorAgentId: currentUser?.agentId || currentUser?.agent_id,
          actorProfileUserId: currentUser?.id || currentUser?.userId,
        })
      );
    } catch (err) {
      setError(err?.message || "Could not load compensation administration");
    } finally {
      setAdminBusy(false);
    }
  }, [actorRole, adminPermissions, currentUser]);

  const loadEmployeeDirectory = useCallback(async () => {
    if (!employee360Permissions.canView360) return;
    try {
      const result = await loadEmployeeCompensationDirectoryRead({ currentUser });
      if (!result.success) throw new Error(result.error || "Could not load employee directory");
      setEmployeeDirectory(result.data?.employees || []);
    } catch (err) {
      setError(err?.message || "Could not load employee directory");
    }
  }, [employee360Permissions, currentUser]);

  const loadEmployee360 = useCallback(
    async ({ profileUserId, agentId } = {}) => {
      if (!employee360Permissions.canView360 || (!profileUserId && !agentId)) {
        setEmployee360Model(null);
        setEmployee360Error("");
        return;
      }
      try {
        setEmployee360Loading(true);
        setEmployee360Error("");
        const result = await loadEmployeeCompensation360Read({ currentUser, profileUserId, agentId });
        if (!result.success) throw new Error(result.error || "Could not load Employee Compensation 360");
        setEmployee360Model(result.data);
      } catch (err) {
        const message = err?.message || "Could not load Employee Compensation 360";
        setEmployee360Error(message);
        setEmployee360Model(null);
      } finally {
        setEmployee360Loading(false);
      }
    },
    [employee360Permissions.canView360, currentUser]
  );

  useEffect(() => {
    load();
    loadAdmin();
    loadEmployeeDirectory();
  }, [tenantId, actorUserId, actorRole]);

  useEffect(() => {
    if (selectedEmployeeProfileId && activeTab === "Employees") {
      loadEmployee360({ profileUserId: selectedEmployeeProfileId });
    } else if (!selectedEmployeeProfileId) {
      setEmployee360Model(null);
      setEmployee360Error("");
      setEmployee360Loading(false);
    }
  }, [activeTab, loadEmployee360, selectedEmployeeProfileId]);

  const refreshAll = async () => {
    await Promise.all([load({ refresh: true }), loadAdmin(), loadEmployeeDirectory()]);
    if (selectedEmployeeProfileId) await loadEmployee360({ profileUserId: selectedEmployeeProfileId });
  };

  const handleCreatePlan = async (planInput) => {
    try {
      setAdminBusy(true);
      setAdminNotice("");
      const result = await createCompensationPlan({
        currentUser,
        planInput,
      });
      if (!result.success) throw new Error(result.error || "Plan create failed");
      setAdminNotice("Compensation plan draft created.");
      await loadAdmin();
    } catch (err) {
      setError(err?.message || "Could not create compensation plan");
    } finally {
      setAdminBusy(false);
    }
  };

  const handleSavePlan = async (row, payload) => {
    try {
      setAdminBusy(true);
      setAdminNotice("");
      const result = await saveCompensationPlanAdmin({
        currentUser,
        planId: row.id,
        planInput: payload,
      });
      if (!result.success) throw new Error(result.error || "Plan save failed");
      setAdminNotice(
        row.status === "active"
          ? `Created ${result.data?.newPlan?.version || "new version"}; prior assignments preserved.`
          : "Compensation plan updated."
      );
      await loadAdmin();
    } catch (err) {
      setError(err?.message || "Could not save compensation plan");
    } finally {
      setAdminBusy(false);
    }
  };

  const handleDuplicatePlan = async (row) => {
    try {
      setAdminBusy(true);
      const result = await duplicateCompensationPlan({ currentUser, planId: row.id });
      if (!result.success) throw new Error(result.error || "Duplicate failed");
      setAdminNotice("Plan duplicated as draft.");
      await loadAdmin();
    } catch (err) {
      setError(err?.message || "Could not duplicate plan");
    } finally {
      setAdminBusy(false);
    }
  };

  const handleDeactivatePlan = async (row) => {
    try {
      setAdminBusy(true);
      const result = await deactivateCompensationPlan({ currentUser, planId: row.id });
      if (!result.success) throw new Error(result.error || "Deactivate failed");
      setAdminNotice(`Plan ${row.planCode} ${row.version} deactivated.`);
      await loadAdmin();
    } catch (err) {
      setError(err?.message || "Could not deactivate plan");
    } finally {
      setAdminBusy(false);
    }
  };

  const handleActivatePlan = async (row) => {
    try {
      setAdminBusy(true);
      const result = await activateCompensationPlan({ currentUser, planId: row.id });
      if (!result.success) throw new Error(result.error || "Activate failed");
      setAdminNotice(`Plan ${row.planCode} ${row.version} activated.`);
      await loadAdmin();
    } catch (err) {
      setError(err?.message || "Could not activate plan");
    } finally {
      setAdminBusy(false);
    }
  };

  const handleAssignEmployee = async (row, { planId, effectiveDate }) => {
    try {
      setAdminBusy(true);
      const result = await assignEmployeeToPlan({
        currentUser,
        profileUserId: row.profileUserId,
        planId,
        effectiveDate,
      });
      if (!result.success) throw new Error(result.error || "Assign failed");
      setAdminNotice("Employee plan assignment created.");
      await loadAdmin();
      await loadEmployeeDirectory();
      if (selectedEmployeeProfileId === row.profileUserId) {
        await loadEmployee360({ profileUserId: row.profileUserId });
      }
    } catch (err) {
      setError(err?.message || "Could not assign employee plan");
    } finally {
      setAdminBusy(false);
    }
  };

  const handleChangePlan = async (row, { newPlanId, effectiveDate }) => {
    try {
      setAdminBusy(true);
      const result = await changeEmployeePlanAssignment({
        currentUser,
        assignmentId: row.id,
        newPlanId,
        effectiveDate,
      });
      if (!result.success) throw new Error(result.error || "Change plan failed");
      setAdminNotice(`Plan changed for ${row.employeeName}; prior assignment preserved.`);
      await loadAdmin();
      if (selectedEmployeeProfileId) await loadEmployee360({ profileUserId: selectedEmployeeProfileId });
    } catch (err) {
      setError(err?.message || "Could not change employee plan");
    } finally {
      setAdminBusy(false);
    }
  };

  const handleEndAssignment = async (row) => {
    try {
      setAdminBusy(true);
      const result = await endEmployeePlanAssignment({ currentUser, assignmentId: row.id });
      if (!result.success) throw new Error(result.error || "End assignment failed");
      setAdminNotice(`Assignment ended for ${row.employeeName}.`);
      await loadAdmin();
    } catch (err) {
      setError(err?.message || "Could not end assignment");
    } finally {
      setAdminBusy(false);
    }
  };

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

  const employeeList = useMemo(() => {
    if (employeeDirectory.length) return employeeDirectory;
    return Object.values(model?.agentProfiles || {}).map((agent) => ({
      profileUserId: agent.profileUserId,
      agentId: agent.agentId,
      employeeName: agent.agentName,
      role: "agent",
      planCode: agent.planCode,
      assignmentStatus: agent.assignmentStatus,
    }));
  }, [employeeDirectory, model]);

  const selectedPeriodRow = useMemo(() => {
    const rows = model?.periodRows || [];
    if (!rows.length) return null;
    return rows.find((row) => row.periodId === selectedPeriodId) || rows[0];
  }, [model, selectedPeriodId]);

  const workflowActorOptions = useMemo(
    () => ({
      tenantId: currentUser?.tenantId || currentUser?.tenant_id,
      actorRole,
      actorUserId: currentUser?.id || currentUser?.userId || null,
    }),
    [actorRole, currentUser]
  );

  const handlePayrollWorkflowAction = async (periodRow, actionId, payload = {}) => {
    if (!periodRow?.runId && actionId !== PAYROLL_UI_ACTION_IDS.GENERATE_PREVIEW) {
      setError("Generate a payroll preview before running workflow actions.");
      return;
    }
    if (actionId === PAYROLL_UI_ACTION_IDS.GENERATE_PREVIEW) {
      await handleGeneratePreview(periodRow);
      return;
    }
    try {
      setWorkflowBusy(true);
      setError("");
      setWorkflowNotice("");
      const base = {
        ...workflowActorOptions,
        payrollRunId: periodRow.runId,
        reason: payload.reason,
        notes: payload.notes,
      };
      let result;
      if (actionId === PAYROLL_UI_ACTION_IDS.SUBMIT) {
        if (periodRow.status === "draft") {
          const previewResult = await previewPayrollRunWrite({
            ...base,
            reason: payload.reason || "preview_ready_for_submission",
          });
          if (!previewResult.success) throw new Error(previewResult.error || "Preview transition failed");
        }
        result = await submitPayrollRunWrite({
          ...base,
          reason: payload.reason || "submit_payroll_preview_for_review",
        });
      } else if (actionId === PAYROLL_UI_ACTION_IDS.APPROVE) {
        result = await approvePayrollRunWrite({
          ...base,
          reason: payload.reason || "executive_payroll_approval",
        });
      } else if (actionId === PAYROLL_UI_ACTION_IDS.REJECT) {
        result = await rejectPayrollRunWrite({
          ...base,
          reason: payload.reason || "executive_payroll_rejection",
        });
      } else if (actionId === PAYROLL_UI_ACTION_IDS.LOCK) {
        result = await lockPayrollRunWrite({
          ...base,
          reason: payload.reason || "executive_payroll_lock",
        });
      } else if (actionId === PAYROLL_UI_ACTION_IDS.EXPORT) {
        result = await generatePayrollExportWrite({
          ...base,
          reason: payload.reason || "generate_payroll_export_metadata",
        });
      } else if (actionId === PAYROLL_UI_ACTION_IDS.MARK_PAID) {
        result = await recordPayrollPaidWrite({
          ...base,
          at: payload.paidDate ? new Date(`${payload.paidDate}T12:00:00`).toISOString() : undefined,
          paymentReference: payload.paymentReference,
          notes: payload.notes,
          reason: payload.reason || "payroll_paid_evidence_recorded",
        });
      } else {
        throw new Error(`Unsupported payroll workflow action: ${actionId}`);
      }
      if (!result?.success) throw new Error(result?.error || "Payroll workflow action failed");
      await load({ refresh: true });
      setSelectedPeriodId(periodRow.periodId);
      setSelectedRunId(result.data?.payrollRunId || periodRow.runId || "");
      setWorkflowNotice(
        `${periodRow.periodYm}: ${result.data?.fromStatus || periodRow.status} → ${result.data?.toStatus || result.data?.status || "updated"}`
      );
    } catch (err) {
      setError(err?.message || "Payroll workflow action failed");
    } finally {
      setWorkflowBusy(false);
    }
  };

  const openPreview = (periodRow) => {
    setSelectedPeriodId(periodRow.periodId);
    setSelectedRunId(periodRow.runId || "");
    setActiveTab("Payroll Preview");
  };

  const handleGeneratePreview = async (periodRow) => {
    try {
      setGeneratingPeriodId(periodRow.periodId);
      setError("");
      setGenerationNotice("");
      const result = await generatePayrollPreview({
        currentUser,
        tenantId: currentUser?.tenantId || currentUser?.tenant_id,
        periodId: periodRow.periodId,
        actorRole,
        actorUserId: currentUser?.id || currentUser?.userId || null,
      });
      if (!result.success) {
        throw new Error(result.error || "Payroll preview generation failed");
      }
      await load({ refresh: true });
      setSelectedPeriodId(periodRow.periodId);
      setSelectedRunId(result.data?.payrollRunId || "");
      setGenerationNotice(
        `Generated draft preview for ${periodRow.periodYm}: ${result.data?.payrollRunLineCount || 0} employee lines, commission ${result.data?.totals?.commission_amount ?? 0}, net ${result.data?.totals?.net_payable ?? 0}.`
      );
      setActiveTab("Payroll Preview");
    } catch (err) {
      setError(err?.message || "Could not generate payroll preview");
    } finally {
      setGeneratingPeriodId("");
    }
  };

  const openEmployeeFromPreview = (row) => {
    if (row.profileUserId) {
      openEmployee({ profileUserId: row.profileUserId });
      return;
    }
    const match = employeeList.find((emp) => emp.agentId && emp.agentId === row.agentId);
    if (match?.profileUserId) {
      openEmployee(match);
      return;
    }
    if (row.agentId) {
      setSelectedEmployeeProfileId("");
      loadEmployee360({ agentId: row.agentId });
      setActiveTab("Employees");
    }
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
        subtitle="Compensation administration, payroll preview, and executive intelligence. Configuration changes do not mutate finance, AR, payments, or orders."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={refreshAll} disabled={refreshing || adminBusy}>
            <RefreshCw className={cn("mr-1 h-4 w-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      <ReadHealthBanner readHealth={model?.readHealth} />

      {workflowNotice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {workflowNotice}
        </div>
      ) : null}

      {generationNotice ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {generationNotice}
        </div>
      ) : null}

      {adminNotice ? (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
          {adminNotice}
        </div>
      ) : null}

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
            onClick={() => {
              if (tab === "Employees" && activeTab !== "Employees") {
                setSelectedEmployeeProfileId("");
                setEmployee360Model(null);
                setEmployee360Error("");
              }
              setActiveTab(tab);
            }}
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

          <ExecutiveCompensationIntelligencePanel
            intelligence={model.intelligence}
            compensationPlans={model.compensationPlans}
          />
        </div>
      ) : null}

      {activeTab === "Compensation Plans" ? (
        adminModel ? (
        <CompensationPlansTab
          adminModel={adminModel}
          permissions={adminPermissions}
          onRefresh={loadAdmin}
          onCreatePlan={handleCreatePlan}
          onSavePlan={handleSavePlan}
          onDuplicatePlan={handleDuplicatePlan}
          onDeactivatePlan={handleDeactivatePlan}
          onActivatePlan={handleActivatePlan}
          busy={adminBusy}
        />
        ) : (
          <p className="text-sm text-slate-500">
            {adminBusy || loading ? "Loading compensation plans…" : "Compensation plans could not be loaded."}
          </p>
        )
      ) : null}

      {activeTab === "Plan Assignments" ? (
        adminModel ? (
        <CompensationPlanAssignmentsTab
          adminModel={adminModel}
          permissions={adminPermissions}
          onChangePlan={handleChangePlan}
          onEndAssignment={handleEndAssignment}
          onAssignEmployee={handleAssignEmployee}
          onViewAssignment={(row) => openEmployee({ profileUserId: row.profileUserId, agentId: row.agentId })}
          busy={adminBusy}
        />
        ) : (
          <p className="text-sm text-slate-500">
            {adminBusy || loading ? "Loading plan assignments…" : "Plan assignments could not be loaded."}
          </p>
        )
      ) : null}

      {activeTab === "Payroll Periods" && model ? (
        <div className="space-y-4">
          {selectedPeriodRow ? (
            <PayrollWorkflowToolbar
              periodRow={selectedPeriodRow}
              actorRole={actorRole}
              busy={workflowBusy || refreshing}
              generatingPeriodId={generatingPeriodId}
              onAction={handlePayrollWorkflowAction}
            />
          ) : null}
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
                      <tr
                        key={row.periodId}
                        className={cn(
                          "border-b border-slate-100 last:border-0",
                          selectedPeriodRow?.periodId === row.periodId && "bg-indigo-50/40"
                        )}
                      >
                        <td className="px-2 py-2 font-medium">
                          <button
                            type="button"
                            className="text-left hover:text-indigo-700"
                            onClick={() => {
                              setSelectedPeriodId(row.periodId);
                              setSelectedRunId(row.runId || "");
                            }}
                          >
                            {row.periodYm}
                          </button>
                        </td>
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
        </div>
      ) : null}

      {activeTab === "Payroll Preview" && model ? (
        <div className="space-y-4">
          {selectedPeriodRow ? (
            <PayrollWorkflowToolbar
              periodRow={selectedPeriodRow}
              actorRole={actorRole}
              busy={workflowBusy || refreshing}
              generatingPeriodId={generatingPeriodId}
              onAction={handlePayrollWorkflowAction}
            />
          ) : null}
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
                        <Button type="button" size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => openEmployeeFromPreview(row)}>
                          View Employee
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        />
        </div>
      ) : null}

      {activeTab === "Employees" && model ? (
        selectedEmployeeProfileId ? (
          <EmployeeCompensation360Panel
            model={employee360Model}
            permissions={employee360Permissions}
            loading={employee360Loading}
            error={employee360Error}
            busy={adminBusy}
            selectablePlans={adminModel?.selectablePlans || employee360Model?.selectablePlans || []}
            onBack={() => {
              setSelectedEmployeeProfileId("");
              setEmployee360Model(null);
              setEmployee360Error("");
            }}
            onChangePlan={handleChangePlan}
            onAssignPlan={handleAssignEmployee}
          />
        ) : (
          <EmployeeDirectoryTab
            employees={employeeList}
            roleFilter={employeeRoleFilter}
            onRoleFilterChange={setEmployeeRoleFilter}
            search={employeeSearch}
            onSearchChange={setEmployeeSearch}
            onOpenEmployee={openEmployee}
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
          emptyDescription="Export metadata appears after Executive generates export from a locked payroll run."
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
          Compensation administration and payroll workflow actions do not mutate finance, AR, payments, orders, or accounting records.
        </p>
      ) : null}
    </div>
  );
}
