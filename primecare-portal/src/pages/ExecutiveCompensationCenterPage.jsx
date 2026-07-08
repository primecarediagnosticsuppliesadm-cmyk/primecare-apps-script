import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  PageHeader,
  PageSkeleton,
  StatusBadge,
  ReadHealthBanner,
  EnterpriseDataTable,
  DataFetchError,
  DataFreshnessLabel,
  ListSkeleton,
  usePortalToast,
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
import EmployeeDirectoryTab from "@/components/compensation/EmployeeDirectoryTab.jsx";
import PayrollWorkflowToolbar from "@/components/compensation/PayrollWorkflowToolbar.jsx";
import PeopleOperationsModuleNav from "@/components/peopleOps/PeopleOperationsModuleNav.jsx";
import PeopleOpsDashboard from "@/components/peopleOps/PeopleOpsDashboard.jsx";
import PeopleOpsReportsPanel from "@/components/peopleOps/PeopleOpsReportsPanel.jsx";
import PeopleOpsFilterBar from "@/components/peopleOps/PeopleOpsFilterBar.jsx";
import PeopleOpsModuleFrame from "@/components/peopleOps/PeopleOpsModuleFrame.jsx";
import PeopleOpsSectionCard from "@/components/peopleOps/PeopleOpsSectionCard.jsx";
import { PEOPLE_OPS_PAYROLL_STATUS_VARIANT } from "@/components/peopleOps/peopleOpsStatusTokens.js";
import { defaultPeopleOpsRoute, resolvePeopleOpsRoute, buildPeopleOpsBreadcrumbs } from "@/peopleOps/peopleOpsNavigation.js";
import { buildPeopleOpsProductivityWorkspace } from "@/peopleOps/productivity/peopleOpsProductivityModel.js";
import { usePeopleOpsSessionState } from "@/peopleOps/productivity/usePeopleOpsSessionState.js";
import {
  enrichEmployeeDirectoryRows,
  buildPayrollRunSummary,
} from "@/peopleOps/peopleOpsEnterpriseModel.js";
import PeopleOpsGlobalSearch from "@/components/peopleOps/productivity/PeopleOpsGlobalSearch.jsx";
import PeopleOpsContextPanel from "@/components/peopleOps/productivity/PeopleOpsContextPanel.jsx";
import EmployeeCompensation360Drawer from "@/components/peopleOps/EmployeeCompensation360Drawer.jsx";
import PeopleOpsSettingsLanding from "@/components/peopleOps/PeopleOpsSettingsLanding.jsx";
import PeopleOpsPayrollSummary from "@/components/peopleOps/PeopleOpsPayrollSummary.jsx";
import PeopleOpsWorkflowProgress from "@/components/peopleOps/productivity/PeopleOpsWorkflowProgress.jsx";
import PeopleOpsBudgetingModule from "@/components/peopleOps/budgeting/PeopleOpsBudgetingModule.jsx";
import PeopleOpsOwnershipModule from "@/components/peopleOps/ownership/PeopleOpsOwnershipModule.jsx";
import LabOwnership360Drawer from "@/components/peopleOps/ownership/LabOwnership360Drawer.jsx";
import { buildWorkforceBudgetWorkspace } from "@/peopleOps/budgeting/workforceBudgetingModel.js";
import { buildPeopleOpsOwnershipWorkspace } from "@/peopleOps/ownership/businessOwnershipModel.js";
import { loadPeopleOpsOwnershipRead } from "@/peopleOps/ownership/peopleOpsOwnershipRead.js";
import { useWorkforcePlanningState } from "@/peopleOps/budgeting/useWorkforcePlanningState.js";
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
  Eye,
  History,
  RefreshCw,
  Search,
} from "lucide-react";

const STATUS_VARIANT = PEOPLE_OPS_PAYROLL_STATUS_VARIANT;

export default function PeopleOperationsPage({ currentUser = null, setActivePage = null }) {
  const [peopleOpsRoute, setPeopleOpsRoute] = useState(() => defaultPeopleOpsRoute());
  const { moduleId: activeModuleId, screenId: activeScreenId } = useMemo(
    () => resolvePeopleOpsRoute(peopleOpsRoute.moduleId, peopleOpsRoute.screenId),
    [peopleOpsRoute]
  );
  const [rawPayload, setRawPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dataLoadedAt, setDataLoadedAt] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortKey, setSortKey] = useState("periodYm");
  const [sortDir, setSortDir] = useState("desc");
  const [selectedPeriodId, setSelectedPeriodId] = useState("");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [selectedEmployeeProfileId, setSelectedEmployeeProfileId] = useState("");
  const [generatingPeriodId, setGeneratingPeriodId] = useState("");
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [adminModel, setAdminModel] = useState(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const [employee360Model, setEmployee360Model] = useState(null);
  const [employee360Loading, setEmployee360Loading] = useState(false);
  const [employee360Error, setEmployee360Error] = useState("");
  const [employeeDirectory, setEmployeeDirectory] = useState([]);
  const [employeeRoleFilter, setEmployeeRoleFilter] = useState("all");
  const [employeePlanFilter, setEmployeePlanFilter] = useState("all");
  const [employeeAssignmentFilter, setEmployeeAssignmentFilter] = useState("all");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [ownershipPayload, setOwnershipPayload] = useState(null);
  const [selectedLabId, setSelectedLabId] = useState("");

  const { recentlyViewed, favorites, trackView, toggleFavorite, isFavorite } = usePeopleOpsSessionState();
  const {
    planningState,
    addHeadcountPosition,
    duplicateHeadcountPosition,
    archiveHeadcountPosition,
    addCustomScenario,
    saveScenarioToHistory,
  } = useWorkforcePlanningState();

  const navigatePeopleOps = useCallback((next) => {
    setPeopleOpsRoute(resolvePeopleOpsRoute(next.moduleId, next.screenId));
  }, []);

  const actorRole = String(currentUser?.role || "executive").toLowerCase();
  const tenantId = currentUser?.tenantId || currentUser?.tenant_id || "";
  const actorUserId = currentUser?.id || currentUser?.userId || "";
  const actorAgentId = currentUser?.agentId || currentUser?.agent_id || "";
  const adminPermissions = useMemo(() => compensationAdminPermissions(actorRole), [actorRole]);
  const employee360Permissions = useMemo(() => employeeCompensation360Permissions(actorRole), [actorRole]);

  const { showToast } = usePortalToast();

  usePagePerformance("People Operations");

  const model = useMemo(() => {
    if (!rawPayload) return null;
    return buildExecutiveCompensationModel({
      ...rawPayload,
      reportingSelection: {
        periodId: selectedPeriodId || null,
        payrollRunId: selectedRunId || null,
      },
    });
  }, [rawPayload, selectedPeriodId, selectedRunId]);

  const reportingRunOptions = useMemo(() => {
    if (!rawPayload || !selectedPeriodId) return [];
    return (rawPayload.payrollRuns || [])
      .filter((run) => run.period_id === selectedPeriodId)
      .sort((a, b) => Number(b.run_number) - Number(a.run_number))
      .map((run) => ({
        runId: run.id,
        label: `${String(run.status || "draft").charAt(0).toUpperCase()}${String(run.status || "draft").slice(1)} V${run.run_number}`,
      }));
  }, [rawPayload, selectedPeriodId]);

  const load = useCallback(async ({ refresh = false } = {}) => {
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      const payload = await loadExecutiveCompensationCenterRead({ currentUser });
      const initialModel = buildExecutiveCompensationModel(payload);
      setRawPayload(payload);
      setDataLoadedAt(Date.now());
      setSelectedPeriodId((prev) => prev || initialModel.reportingContext?.periodId || "");
      setSelectedRunId((prev) => prev || initialModel.reportingContext?.payrollRunId || "");
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

  const loadOwnership = useCallback(async () => {
    try {
      const result = await loadPeopleOpsOwnershipRead({ currentUser });
      setOwnershipPayload(result);
    } catch {
      setOwnershipPayload({ success: false, ownershipRows: [], error: "Could not load ownership reads" });
    }
  }, [currentUser]);

  useEffect(() => {
    load();
    loadAdmin();
    loadEmployeeDirectory();
    loadOwnership();
  }, [tenantId, actorUserId, actorRole]);

  useEffect(() => {
    if (selectedEmployeeProfileId) {
      loadEmployee360({ profileUserId: selectedEmployeeProfileId });
    } else if (!selectedEmployeeProfileId) {
      setEmployee360Model(null);
      setEmployee360Error("");
      setEmployee360Loading(false);
    }
  }, [loadEmployee360, selectedEmployeeProfileId]);

  const refreshAll = async () => {
    await Promise.all([load({ refresh: true }), loadAdmin(), loadEmployeeDirectory(), loadOwnership()]);
    if (selectedEmployeeProfileId) await loadEmployee360({ profileUserId: selectedEmployeeProfileId });
  };

  const handleCreatePlan = async (planInput) => {
    try {
      setAdminBusy(true);
      const result = await createCompensationPlan({
        currentUser,
        planInput,
      });
      if (!result.success) throw new Error(result.error || "Plan create failed");
      showToast("success", "Compensation plan draft created.");
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
      const result = await saveCompensationPlanAdmin({
        currentUser,
        planId: row.id,
        planInput: payload,
      });
      if (!result.success) throw new Error(result.error || "Plan save failed");
      showToast(
        "success",
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
      showToast("success", "Plan duplicated as draft.");
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
      showToast("success", `Plan ${row.planCode} ${row.version} deactivated.`);
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
      showToast("success", `Plan ${row.planCode} ${row.version} activated.`);
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
      showToast("success", "Employee plan assignment created.");
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
      showToast("success", `Plan changed for ${row.employeeName}; prior assignment preserved.`);
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
      showToast("success", `Assignment ended for ${row.employeeName}.`);
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
    const base = employeeDirectory.length
      ? employeeDirectory
      : Object.values(model?.agentProfiles || {}).map((agent) => ({
          profileUserId: agent.profileUserId,
          agentId: agent.agentId,
          employeeName: agent.agentName,
          role: "agent",
          planCode: agent.planCode,
          assignmentStatus: agent.assignmentStatus,
        }));
    if (!model) return base;
    return enrichEmployeeDirectoryRows(base, {
      previewRows: model.previewRows,
      assignmentRows: adminModel?.assignmentRows || [],
    });
  }, [adminModel, employeeDirectory, model]);

  const breadcrumbs = useMemo(
    () => buildPeopleOpsBreadcrumbs({ moduleId: activeModuleId, screenId: activeScreenId }),
    [activeModuleId, activeScreenId]
  );

  const payrollRunSummary = useMemo(
    () => (model ? buildPayrollRunSummary(model.previewRows, model.reportingContext) : null),
    [model]
  );

  const lastRefreshLabel = useMemo(() => {
    if (!dataLoadedAt) return "—";
    return new Date(dataLoadedAt).toLocaleString("en-IN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [dataLoadedAt]);

  const closeEmployeeDrawer = useCallback(() => {
    setSelectedEmployeeProfileId("");
    setEmployee360Model(null);
    setEmployee360Error("");
  }, []);

  const selectedPeriodRow = useMemo(() => {
    const rows = model?.periodRows || [];
    if (!rows.length) return null;
    return rows.find((row) => row.periodId === selectedPeriodId) || rows[0];
  }, [model, selectedPeriodId]);

  const productivity = useMemo(
    () =>
      model
        ? buildPeopleOpsProductivityWorkspace({
            model,
            adminModel,
            employeeList,
            actorRole,
            selectedPeriodRow,
          })
        : null,
    [actorRole, adminModel, employeeList, model, selectedPeriodRow]
  );

  const workforceBudget = useMemo(
    () =>
      model
        ? buildWorkforceBudgetWorkspace({
            model,
            employeeList,
            planningState,
          })
        : null,
    [employeeList, model, planningState]
  );

  const ownershipWorkspace = useMemo(
    () =>
      model
        ? buildPeopleOpsOwnershipWorkspace({
            model,
            employeeList,
            ownershipRows: ownershipPayload?.ownershipRows || [],
            actorRole,
            actorUserId,
            actorAgentId,
            profiles: rawPayload?.profiles || [],
            tenantId,
            payments: rawPayload?.payments || [],
            labs: rawPayload?.labs || [],
            arRows: rawPayload?.arRows || [],
          })
        : null,
    [actorAgentId, actorRole, actorUserId, employeeList, model, ownershipPayload, rawPayload, tenantId]
  );

  const selectedLabModel = useMemo(() => {
    if (!selectedLabId || !ownershipWorkspace) return null;
    return ownershipWorkspace.resolveLab360(selectedLabId);
  }, [ownershipWorkspace, selectedLabId]);

  const employeeOwnershipContext = useMemo(() => {
    if (!ownershipWorkspace || !selectedEmployeeProfileId) return null;
    const employee = employeeList.find((row) => row.profileUserId === selectedEmployeeProfileId);
    return ownershipWorkspace.buildEmployeeOwnershipContext({
      profileUserId: selectedEmployeeProfileId,
      agentId: employee?.agentId || employee360Model?.overview?.agentId,
    });
  }, [employee360Model, employeeList, ownershipWorkspace, selectedEmployeeProfileId]);

  const selectedEmployeeSummary = useMemo(() => {
    if (!selectedEmployeeProfileId) return null;
    return (
      employeeList.find((row) => row.profileUserId === selectedEmployeeProfileId) ||
      (employee360Model
        ? {
            employeeName: employee360Model.employeeName,
            role: employee360Model.role,
          }
        : null)
    );
  }, [employee360Model, employeeList, selectedEmployeeProfileId]);

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
      showToast(
        "success",
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
    trackView({
      id: `period-${periodRow.periodId}`,
      label: periodRow.periodYm,
      meta: periodRow.status,
      route: { moduleId: "payroll", screenId: "run-review", periodId: periodRow.periodId, runId: periodRow.runId },
      favoriteKey: `period:${periodRow.periodId}`,
    });
    navigatePeopleOps({ moduleId: "payroll", screenId: "run-review" });
  };

  const handleGeneratePreview = async (periodRow) => {
    try {
      setGeneratingPeriodId(periodRow.periodId);
      setError("");
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
      showToast(
        "success",
        `Generated draft preview for ${periodRow.periodYm}: ${result.data?.payrollRunLineCount || 0} employee lines, commission ${result.data?.totals?.commission_amount ?? 0}, net ${result.data?.totals?.net_payable ?? 0}.`
      );
      navigatePeopleOps({ moduleId: "payroll", screenId: "run-review" });
    } catch (err) {
      setError(err?.message || "Could not generate payroll preview");
    } finally {
      setGeneratingPeriodId("");
    }
  };

  const openEmployee = useCallback(
    (employee = {}) => {
      const profileUserId = String(employee.profileUserId || employee.profile_user_id || "").trim();
      const agentId = String(employee.agentId || employee.agent_id || "").trim();
      navigatePeopleOps({ moduleId: "employees", screenId: "directory" });
      if (profileUserId) {
        setSelectedEmployeeProfileId(profileUserId);
        const row = employeeList.find((item) => item.profileUserId === profileUserId) || employee;
        trackView({
          id: profileUserId,
          label: row.employeeName || "Employee",
          meta: row.role || "employee",
          route: { moduleId: "employees", screenId: "directory", profileUserId },
          favoriteKey: `employee:${profileUserId}`,
        });
        return;
      }
      if (agentId) {
        setSelectedEmployeeProfileId("");
        loadEmployee360({ agentId });
      }
    },
    [employeeList, loadEmployee360, navigatePeopleOps, trackView]
  );

  const handleOpenProductivityRoute = useCallback(
    (route, trackItem) => {
      if (!route) return;
      if (route.periodId) {
        setSelectedPeriodId(route.periodId);
        if (route.runId) setSelectedRunId(route.runId);
      }
      if (route.profileUserId) {
        openEmployee({ profileUserId: route.profileUserId });
        return;
      }
      navigatePeopleOps({ moduleId: route.moduleId, screenId: route.screenId });
      if (trackItem) {
        trackView({
          id: trackItem.id || trackItem.favoriteKey || `${route.moduleId}-${route.screenId}`,
          label: trackItem.label || trackItem.title,
          meta: trackItem.meta || trackItem.detail,
          route,
          favoriteKey: trackItem.favoriteKey,
        });
      }
    },
    [navigatePeopleOps, openEmployee, trackView]
  );

  const handleQuickAction = useCallback(
    async (action) => {
      if (!action) return;
      if (action.kind === "navigate") {
        handleOpenProductivityRoute(action.route, {
          id: action.id,
          label: action.label,
          favoriteKey: `nav:${action.id}`,
        });
        return;
      }
      const periodRow =
        model?.periodRows?.find((row) => row.periodId === action.periodId) || selectedPeriodRow;
      if (!periodRow) return;
      setSelectedPeriodId(periodRow.periodId);
      setSelectedRunId(periodRow.runId || "");
      navigatePeopleOps(action.route);
      trackView({
        id: `period-${periodRow.periodId}`,
        label: periodRow.periodYm,
        meta: periodRow.status,
        route: action.route,
        favoriteKey: `period:${periodRow.periodId}`,
      });
      if (action.id === PAYROLL_UI_ACTION_IDS.GENERATE_PREVIEW) {
        await handleGeneratePreview(periodRow);
      }
    },
    [handleGeneratePreview, handleOpenProductivityRoute, model, navigatePeopleOps, selectedPeriodRow, trackView]
  );

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
      openEmployee({ agentId: row.agentId });
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
        title="People Operations"
        subtitle="Workforce directory, compensation, payroll, and operational reporting for PrimeCare HQ. Configuration changes do not mutate finance, AR, payments, or orders."
        freshness={
          <DataFreshnessLabel
            loadedAt={dataLoadedAt}
            refreshing={refreshing || adminBusy || workflowBusy}
            className="mt-1 block"
          />
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setGlobalSearchOpen(true)} aria-label="Search People Operations">
              <Search className="mr-1 h-4 w-4" />
              Search
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={refreshAll} disabled={refreshing || adminBusy}>
              <RefreshCw className={cn("mr-1 h-4 w-4", refreshing && "animate-spin")} />
              Refresh
            </Button>
          </div>
        }
      />

      <PeopleOpsGlobalSearch
        open={globalSearchOpen}
        query={globalSearchQuery}
        onQueryChange={setGlobalSearchQuery}
        onClose={() => setGlobalSearchOpen(false)}
        onToggle={() => setGlobalSearchOpen((open) => !open)}
        searchIndex={productivity?.searchIndex}
        onSelectResult={(row) => {
          setGlobalSearchOpen(false);
          setGlobalSearchQuery("");
          handleOpenProductivityRoute(row.route, row);
        }}
        onToggleFavorite={toggleFavorite}
        isFavorite={isFavorite}
      />

      {model?.readHealth ? (
        <ReadHealthBanner health={model.readHealth} title="People Operations read status" />
      ) : null}

      {error ? (
        <DataFetchError
          message={error}
          onRetry={() => void refreshAll()}
          retrying={refreshing || adminBusy}
          staleDataNote={model ? "Showing the last People Operations data loaded successfully." : ""}
        />
      ) : null}

      <PeopleOperationsModuleNav
        moduleId={activeModuleId}
        screenId={activeScreenId}
        onNavigate={navigatePeopleOps}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">

      {activeModuleId === "dashboard" && activeScreenId === "home" && model ? (
        <PeopleOpsDashboard
          model={model}
          breadcrumbs={breadcrumbs}
          employeeCount={employeeList.length}
          periodOptions={model.periodRows}
          runOptions={reportingRunOptions}
          selectedPeriodId={selectedPeriodId}
          selectedRunId={selectedRunId}
          lastRefreshLabel={lastRefreshLabel}
          onPeriodChange={(periodId) => {
            setSelectedPeriodId(periodId);
            const runs = (rawPayload?.payrollRuns || [])
              .filter((run) => run.period_id === periodId)
              .sort((a, b) => Number(b.run_number) - Number(a.run_number));
            setSelectedRunId(runs[0]?.id || "");
          }}
          onRunChange={setSelectedRunId}
          onNavigatePayroll={() => navigatePeopleOps({ moduleId: "payroll", screenId: "periods" })}
          onNavigateEmployees={() => navigatePeopleOps({ moduleId: "employees", screenId: "directory" })}
          productivity={productivity}
          onQuickAction={handleQuickAction}
          onOpenRoute={handleOpenProductivityRoute}
          recentlyViewed={recentlyViewed}
          favorites={favorites}
          workflowBusy={workflowBusy || refreshing}
        />
      ) : null}

      {activeModuleId === "reports" && activeScreenId === "analytics" && model ? (
        <PeopleOpsReportsPanel
          model={model}
          intelligence={model.intelligence}
          compensationPlans={model.compensationPlans}
          breadcrumbs={breadcrumbs}
        />
      ) : null}

      {activeModuleId === "settings" && activeScreenId === "configuration" ? (
        <PeopleOpsSettingsLanding breadcrumbs={breadcrumbs} />
      ) : null}

      {activeModuleId === "budgeting" && model && workforceBudget ? (
        <PeopleOpsBudgetingModule
          screenId={activeScreenId}
          workspace={workforceBudget}
          breadcrumbs={breadcrumbs}
          actorLabel={actorRole}
          planningActions={{
            addHeadcountPosition,
            duplicateHeadcountPosition,
            archiveHeadcountPosition,
            addCustomScenario,
            saveScenarioToHistory,
          }}
        />
      ) : null}

      {activeModuleId === "ownership" && model && ownershipWorkspace ? (
        <PeopleOpsOwnershipModule
          screenId={activeScreenId}
          workspace={ownershipWorkspace}
          breadcrumbs={breadcrumbs}
          onOpenLab={(labId) => setSelectedLabId(labId)}
          onOpenEmployee={(profileUserId) => {
            setSelectedEmployeeProfileId(profileUserId);
            navigatePeopleOps({ moduleId: "employees", screenId: "directory" });
          }}
        />
      ) : null}

      {activeModuleId === "compensation" && activeScreenId === "plans" ? (
        adminModel ? (
        <PeopleOpsModuleFrame
          title="Compensation Plans"
          description="Create and manage compensation plan versions."
          breadcrumbs={breadcrumbs}
        >
        <CompensationPlansTab
          adminModel={adminModel}
          permissions={adminPermissions}
          onRefresh={loadAdmin}
          onCreatePlan={handleCreatePlan}
          onSavePlan={handleSavePlan}
          onDuplicatePlan={handleDuplicatePlan}
          onDeactivatePlan={handleDeactivatePlan}
          onActivatePlan={handleActivatePlan}
          onViewAssignments={(row) => {
            navigatePeopleOps({ moduleId: "compensation", screenId: "assignments" });
            setEmployeeSearch(row.planCode || "");
          }}
          busy={adminBusy}
        />
        </PeopleOpsModuleFrame>
        ) : (
          <PeopleOpsModuleFrame title="Compensation Plans" description="Create and manage compensation plan versions." breadcrumbs={breadcrumbs}>
            {adminBusy || loading ? <ListSkeleton rows={6} /> : (
              <DataFetchError message="Compensation plans could not be loaded." onRetry={() => void loadAdmin()} retrying={adminBusy} />
            )}
          </PeopleOpsModuleFrame>
        )
      ) : null}

      {activeModuleId === "compensation" && activeScreenId === "assignments" ? (
        adminModel ? (
        <PeopleOpsModuleFrame
          title="Plan Assignments"
          description="Assign employees to compensation plans and manage assignment history."
          breadcrumbs={breadcrumbs}
        >
        <CompensationPlanAssignmentsTab
          adminModel={adminModel}
          permissions={adminPermissions}
          onChangePlan={handleChangePlan}
          onEndAssignment={handleEndAssignment}
          onAssignEmployee={handleAssignEmployee}
          onViewAssignment={(row) => openEmployee({ profileUserId: row.profileUserId, agentId: row.agentId })}
          busy={adminBusy}
        />
        </PeopleOpsModuleFrame>
        ) : (
          <PeopleOpsModuleFrame title="Plan Assignments" description="Assign employees to compensation plans and manage assignment history." breadcrumbs={breadcrumbs}>
            {adminBusy || loading ? <ListSkeleton rows={6} /> : (
              <DataFetchError message="Plan assignments could not be loaded." onRetry={() => void loadAdmin()} retrying={adminBusy} />
            )}
          </PeopleOpsModuleFrame>
        )
      ) : null}

      {activeModuleId === "payroll" && activeScreenId === "periods" && model ? (
        <PeopleOpsModuleFrame
          title="Payroll Periods"
          description="Review payroll cycles, generate previews, and run approval workflow."
          breadcrumbs={breadcrumbs}
        >
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
            loading={refreshing && !model.periodRows.length}
            emptyTitle="No Payroll Generated Yet"
            emptyDescription="Generate your first payroll preview from a payroll period to begin the approval cycle."
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
                          <Button type="button" size="sm" variant="default" className="h-7 text-[10px]" onClick={() => openPreview(row)}>
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
        </PeopleOpsModuleFrame>
      ) : null}

      {activeModuleId === "payroll" && activeScreenId === "run-review" && model ? (
        <PeopleOpsModuleFrame
          title="Run Review"
          description="Inspect employee-level payroll preview lines for the selected period and run version."
          breadcrumbs={breadcrumbs}
          summary={<PeopleOpsPayrollSummary summary={payrollRunSummary} />}
          filters={
            <PeopleOpsFilterBar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search agent, plan, or period"
              filters={[
                {
                  id: "status",
                  label: "Lifecycle status",
                  value: statusFilter,
                  clearValue: "",
                  onChange: setStatusFilter,
                  options: [
                    { value: "", label: "All lifecycle statuses" },
                    ...lifecycleStatuses.map((status) => ({ value: status, label: status })),
                  ],
                },
              ]}
              resultCount={previewRows.length}
              totalCount={(model?.previewRows || []).length}
              onClear={() => {
                setSearch("");
                setStatusFilter("");
              }}
            />
          }
        >
          <PeopleOpsWorkflowProgress stages={productivity?.workflowProgress || []} />
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
          loading={refreshing && !previewRows.length}
          emptyTitle="No Payroll Preview Lines"
          emptyDescription="Select a payroll period or generate a preview run to inspect employee-level results."
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
        </PeopleOpsModuleFrame>
      ) : null}

      {activeModuleId === "employees" && model ? (
        <PeopleOpsModuleFrame
          title="Employees"
          description="Enterprise employee directory and Employee Compensation 360."
          breadcrumbs={breadcrumbs}
        >
          <EmployeeDirectoryTab
            employees={employeeList}
            roleFilter={employeeRoleFilter}
            onRoleFilterChange={setEmployeeRoleFilter}
            planFilter={employeePlanFilter}
            onPlanFilterChange={setEmployeePlanFilter}
            assignmentFilter={employeeAssignmentFilter}
            onAssignmentFilterChange={setEmployeeAssignmentFilter}
            search={employeeSearch}
            onSearchChange={setEmployeeSearch}
            onOpenEmployee={openEmployee}
            permissions={employee360Permissions}
            onBulkAssignPlan={(rows) => {
              if (rows?.[0]) openEmployee(rows[0]);
              navigatePeopleOps({ moduleId: "compensation", screenId: "assignments" });
            }}
            onBulkChangePlan={(rows) => {
              if (rows?.[0]) openEmployee(rows[0]);
              navigatePeopleOps({ moduleId: "compensation", screenId: "assignments" });
            }}
          />
        </PeopleOpsModuleFrame>
      ) : null}

      <EmployeeCompensation360Drawer
        open={Boolean(selectedEmployeeProfileId)}
        onClose={closeEmployeeDrawer}
        employeeName={selectedEmployeeSummary?.employeeName || employee360Model?.overview?.name}
        model={employee360Model}
        ownershipContext={employeeOwnershipContext}
        permissions={employee360Permissions}
        loading={employee360Loading}
        error={employee360Error}
        busy={adminBusy}
        selectablePlans={adminModel?.selectablePlans || employee360Model?.selectablePlans || []}
        onChangePlan={handleChangePlan}
        onAssignPlan={handleAssignEmployee}
      />

      <LabOwnership360Drawer
        open={Boolean(selectedLabId)}
        onClose={() => setSelectedLabId("")}
        labModel={selectedLabModel}
      />

      {activeModuleId === "payroll" && activeScreenId === "commission-ledger" && model ? (
        <PeopleOpsModuleFrame title="Commission Ledger" description="Cash-only commission entries from payroll preview calculations." breadcrumbs={breadcrumbs}>
        <EnterpriseDataTable
          hasRows={model.commissionHistoryRows.length > 0}
          emptyTitle="No Commission History Yet"
          emptyDescription="Commission entries appear after payroll preview calculation for a period."
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
        </PeopleOpsModuleFrame>
      ) : null}

      {activeModuleId === "payroll" && activeScreenId === "activity" && model ? (
        <PeopleOpsModuleFrame title="Payroll Activity" description="Audit trail for payroll workflow and compensation administration events." breadcrumbs={breadcrumbs}>
        <PeopleOpsSectionCard title="Audit Events" icon={History}>
          <div className="space-y-2">
            {model.auditTimeline.length ? model.auditTimeline.map((event) => (
              <div key={event.id} className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground">{event.title}</p>
                    <p className="text-muted-foreground">{event.subtitle}</p>
                  </div>
                  <StatusBadge variant={STATUS_VARIANT[event.category] || "neutral"} label={event.category} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{event.atLabel} · {event.actorRole}</p>
              </div>
            )) : (
              <p className="text-sm text-muted-foreground">No payroll activity recorded yet. Workflow actions will appear here.</p>
            )}
          </div>
        </PeopleOpsSectionCard>
        </PeopleOpsModuleFrame>
      ) : null}

      {activeModuleId === "payroll" && activeScreenId === "exports" && model ? (
        <PeopleOpsModuleFrame title="Payroll Exports" description="Export metadata generated from locked payroll runs." breadcrumbs={breadcrumbs}>
        <EnterpriseDataTable
          hasRows={model.exportRows.length > 0}
          emptyTitle="No Exports Yet"
          emptyDescription="Generate your first payroll export from a locked payroll run."
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
        </PeopleOpsModuleFrame>
      ) : null}

      {setActivePage ? (
        <p className="text-[10px] text-muted-foreground">
          Compensation administration and payroll workflow actions do not mutate finance, AR, payments, orders, or accounting records.
        </p>
      ) : null}

        </div>

        {model && productivity ? (
          <aside className="hidden min-w-0 xl:block">
            <PeopleOpsContextPanel
              contextSummary={productivity.contextSummary}
              workflowProgress={productivity.workflowProgress}
              selectedEmployee={selectedEmployeeSummary}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

/** @deprecated Phase 8.1 alias — route key `compensationPayroll` unchanged */
export { PeopleOperationsPage as ExecutiveCompensationCenterPage };
