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
import CompensationActionDrawer from "@/components/compensation/CompensationActionDrawer.jsx";
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
import PeopleOpsContextWidget from "@/components/peopleOps/productivity/PeopleOpsContextWidget.jsx";
import PeopleOpsDataQualityBanner from "@/components/peopleOps/PeopleOpsDataQualityBanner.jsx";
import PeopleOpsModuleDependencyNotice from "@/components/peopleOps/PeopleOpsModuleDependencyNotice.jsx";
import CompensationExecutiveSummary from "@/components/peopleOps/CompensationExecutiveSummary.jsx";
import PeopleOpsPayrollStickyTotals from "@/components/peopleOps/PeopleOpsPayrollStickyTotals.jsx";
import {
  buildPeopleOpsDataQualityWarnings,
  buildPeopleOpsModuleDependencyNotices,
  filterPeopleOpsDataQualityWarningsForModule,
} from "@/peopleOps/peopleOpsDataQualityModel.js";
import EmployeeCompensation360Drawer from "@/components/peopleOps/EmployeeCompensation360Drawer.jsx";
import Employee360Workspace from "@/components/peopleOps/employee360/Employee360Workspace.jsx";
import PeopleOpsSettingsLanding from "@/components/peopleOps/PeopleOpsSettingsLanding.jsx";
import PeopleOpsPayrollSummary from "@/components/peopleOps/PeopleOpsPayrollSummary.jsx";
import PeopleOpsPayrollLineBreakdown from "@/components/peopleOps/PeopleOpsPayrollLineBreakdown.jsx";
import PeopleOpsPayrollEmptyState from "@/components/peopleOps/PeopleOpsPayrollEmptyState.jsx";
import PeopleOpsWorkflowProgress from "@/components/peopleOps/productivity/PeopleOpsWorkflowProgress.jsx";
import PeopleOpsBudgetingModule from "@/components/peopleOps/budgeting/PeopleOpsBudgetingModule.jsx";
import PeopleOpsOwnershipModule from "@/components/peopleOps/ownership/PeopleOpsOwnershipModule.jsx";
import LabOwnership360Drawer from "@/components/peopleOps/ownership/LabOwnership360Drawer.jsx";
import { buildWorkforceBudgetWorkspace } from "@/peopleOps/budgeting/workforceBudgetingModel.js";
import { buildPeopleOpsOwnershipWorkspace } from "@/peopleOps/ownership/businessOwnershipModel.js";
import { buildHierarchicalCompensation } from "@/compensation/hierarchicalCompensationModel.js";
import { buildEmployee360BusinessProfile } from "@/compensation/employee360BusinessProfileModel.js";
import CollectionCompensationDashboard from "@/components/peopleOps/CollectionCompensationDashboard.jsx";
import { loadPeopleOpsOwnershipRead } from "@/peopleOps/ownership/peopleOpsOwnershipRead.js";
import { useWorkforcePlanningState } from "@/peopleOps/budgeting/useWorkforcePlanningState.js";
import {
  loadEmployeeCompensation360Read,
  loadEmployeeCompensationDirectoryRead,
} from "@/api/employeeCompensation360SupabaseApi.js";
import { buildCompensationPlanAdminModel } from "@/compensation/compensationPlanAdminModel.js";
import {
  listUnassignedEmployees,
  resolveActiveAssignmentRow,
  resolveCompensationActionEmployee,
} from "@/compensation/compensationActionDrawerModel.js";
import { compensationAdminPermissions } from "@/compensation/compensationPlanAdminWorkflow.js";
import {
  assertNoDuplicatePlanCodeVersion,
  findPlanByCodeVersion,
  mapCompensationPlanMutationError,
} from "@/compensation/mapCompensationPlanMutationError.js";
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
  /** @type {'workspace' | 'quick' | null} */
  const [employee360ViewMode, setEmployee360ViewMode] = useState(null);
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
  /** Directory-driven assign/change workflow — opens CompensationActionDrawer. */
  const [assignmentIntent, setAssignmentIntent] = useState(null);
  const [compensationAction, setCompensationAction] = useState(null);

  const { recentlyViewed, favorites, trackView, toggleFavorite, isFavorite } = usePeopleOpsSessionState();
  const {
    planningState,
    addHeadcountPosition,
    duplicateHeadcountPosition,
    archiveHeadcountPosition,
    addCustomScenario,
    saveScenarioToHistory,
  } = useWorkforcePlanningState();

  const closeEmployeeQuickView = useCallback(() => {
    setEmployee360ViewMode(null);
    setSelectedEmployeeProfileId("");
    setEmployee360Model(null);
    setEmployee360Error("");
  }, []);

  const closeEmployeeWorkspace = useCallback(() => {
    setSelectedEmployeeProfileId("");
    setEmployee360ViewMode(null);
    setEmployee360Model(null);
    setEmployee360Error("");
  }, []);

  /** @deprecated alias — closes quick view only */
  const closeEmployeeDrawer = closeEmployeeQuickView;

  const navigatePeopleOps = useCallback(
    (next) => {
      const resolved = resolvePeopleOpsRoute(next.moduleId, next.screenId);
      if (resolved.moduleId === "compensation") {
        closeEmployeeDrawer();
        if (resolved.screenId === "assignments") {
          closeEmployeeWorkspace();
        }
      }
      if (resolved.moduleId === "employees" && resolved.screenId === "directory") {
        closeEmployeeWorkspace();
      }
      setPeopleOpsRoute(resolved);
    },
    [closeEmployeeDrawer, closeEmployeeWorkspace]
  );

  const clearAssignmentIntent = useCallback(() => {
    setAssignmentIntent(null);
  }, []);

  const closeCompensationAction = useCallback(() => {
    setCompensationAction(null);
  }, []);

  useEffect(() => {
    if (activeModuleId !== "compensation" || activeScreenId !== "assignments") {
      setAssignmentIntent(null);
      setCompensationAction(null);
    }
  }, [activeModuleId, activeScreenId]);

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
    if (activeModuleId === "employees" && activeScreenId === "workspace" && !selectedEmployeeProfileId) {
      navigatePeopleOps({ moduleId: "employees", screenId: "directory" });
    }
  }, [activeModuleId, activeScreenId, navigatePeopleOps, selectedEmployeeProfileId]);

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

  const mapPlanMutationFailure = useCallback(
    (result, planInput = {}) => {
      const existing = findPlanByCodeVersion(
        adminModel?.planRows,
        planInput.plan_code || planInput.planCode,
        planInput.version || "v1"
      );
      return {
        success: false,
        error: mapCompensationPlanMutationError(
          { message: result?.error, errorCode: result?.errorCode },
          planInput,
          { existingPlanId: existing?.id || null }
        ),
      };
    },
    [adminModel]
  );

  const handleCreatePlan = async (planInput) => {
    const duplicateError = assertNoDuplicatePlanCodeVersion(
      adminModel?.planRows,
      planInput?.plan_code,
      planInput?.version || "v1"
    );
    if (duplicateError) {
      return { success: false, error: duplicateError };
    }
    try {
      setAdminBusy(true);
      const result = await createCompensationPlan({
        currentUser,
        planInput,
      });
      if (!result.success) return mapPlanMutationFailure(result, planInput);
      showToast("success", "Compensation Plan created successfully.");
      await loadAdmin();
      return { success: true };
    } catch (err) {
      return mapPlanMutationFailure({ error: err?.message, errorCode: err?.code }, planInput);
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
      if (!result.success) return mapPlanMutationFailure(result, payload);
      showToast(
        "success",
        row.status === "active"
          ? `Created ${result.data?.newPlan?.version || "new version"}; prior assignments preserved.`
          : "Compensation plan updated."
      );
      await loadAdmin();
      return { success: true };
    } catch (err) {
      return mapPlanMutationFailure({ error: err?.message, errorCode: err?.code }, payload);
    } finally {
      setAdminBusy(false);
    }
  };

  const handleDuplicatePlan = async (row) => {
    try {
      setAdminBusy(true);
      const result = await duplicateCompensationPlan({ currentUser, planId: row.id });
      if (!result.success) {
        return {
          success: false,
          error: mapCompensationPlanMutationError(
            { message: result.error, errorCode: result.errorCode },
            { plan_code: row.planCode, version: "v1" }
          ),
        };
      }
      showToast("success", "Plan duplicated as draft.");
      await loadAdmin();
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: mapCompensationPlanMutationError({ message: err?.message, errorCode: err?.code }),
      };
    } finally {
      setAdminBusy(false);
    }
  };

  const handleDeactivatePlan = async (row) => {
    try {
      setAdminBusy(true);
      const result = await deactivateCompensationPlan({ currentUser, planId: row.id });
      if (!result.success) {
        return {
          success: false,
          error: mapCompensationPlanMutationError({ message: result.error, errorCode: result.errorCode }),
        };
      }
      showToast("success", `Plan ${row.planCode} ${row.version} deactivated.`);
      await loadAdmin();
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: mapCompensationPlanMutationError({ message: err?.message, errorCode: err?.code }),
      };
    } finally {
      setAdminBusy(false);
    }
  };

  const handleActivatePlan = async (row) => {
    try {
      setAdminBusy(true);
      const result = await activateCompensationPlan({ currentUser, planId: row.id });
      if (!result.success) {
        return {
          success: false,
          error: mapCompensationPlanMutationError({ message: result.error, errorCode: result.errorCode }),
        };
      }
      showToast("success", `Plan ${row.planCode} ${row.version} activated.`);
      await loadAdmin();
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: mapCompensationPlanMutationError({ message: err?.message, errorCode: err?.code }),
      };
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
      showToast("success", "Compensation plan assigned successfully.");
      await loadAdmin();
      await loadEmployeeDirectory();
      if (selectedEmployeeProfileId === row.profileUserId) {
        await loadEmployee360({ profileUserId: row.profileUserId });
      }
      return true;
    } catch (err) {
      setError(err?.message || "Could not assign employee plan");
      return false;
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
      await loadEmployeeDirectory();
      if (selectedEmployeeProfileId) await loadEmployee360({ profileUserId: selectedEmployeeProfileId });
      return true;
    } catch (err) {
      setError(err?.message || "Could not change employee plan");
      return false;
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
      await loadEmployeeDirectory();
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

  const openDirectoryAssignmentWorkflow = useCallback(
    (rows, mode) => {
      if (!rows?.length) return;
      if (rows.length > 1) {
        showToast(
          "info",
          mode === "change"
            ? "Select one employee at a time to change a compensation plan."
            : "Select one employee at a time to assign a compensation plan."
        );
        return;
      }

      const employee = rows[0];
      const profileUserId = String(employee.profileUserId || employee.profile_user_id || "").trim();
      if (!profileUserId) {
        showToast("warning", "This employee cannot be assigned a plan yet.");
        return;
      }

      closeEmployeeWorkspace();

      if (mode === "change") {
        const activeAssignment = (adminModel?.assignmentRows || []).find(
          (row) => row.profileUserId === profileUserId && row.status === "active"
        );
        setAssignmentIntent({
          mode: "change",
          profileUserId,
          employeeName: employee.employeeName,
          assignmentId: activeAssignment?.id || "",
        });
      } else {
        setAssignmentIntent({
          mode: "assign",
          profileUserId,
          employeeName: employee.employeeName,
        });
      }

      navigatePeopleOps({ moduleId: "compensation", screenId: "assignments" });
    },
    [adminModel, closeEmployeeWorkspace, navigatePeopleOps, showToast]
  );

  const openCompensationAssign = useCallback(
    ({ lockEmployee = false, profileUserId = "" } = {}) => {
      const resolvedId = String(profileUserId || "").trim();
      const employee = resolvedId
        ? resolveCompensationActionEmployee(resolvedId, { employeeList, adminModel })
        : null;
      setCompensationAction({
        mode: "assign",
        lockEmployee: Boolean(lockEmployee && resolvedId),
        employee,
        currentAssignment: resolvedId ? resolveActiveAssignmentRow(resolvedId, adminModel) : null,
      });
    },
    [adminModel, employeeList]
  );

  const openCompensationChange = useCallback(
    (assignmentRow) => {
      if (!assignmentRow?.profileUserId) return;
      setCompensationAction({
        mode: "change",
        lockEmployee: true,
        employee: resolveCompensationActionEmployee(assignmentRow.profileUserId, {
          employeeList,
          adminModel,
        }),
        currentAssignment: assignmentRow,
      });
    },
    [adminModel, employeeList]
  );

  useEffect(() => {
    if (!assignmentIntent?.profileUserId) return;
    if (activeModuleId !== "compensation" || activeScreenId !== "assignments") return;

    const { profileUserId, mode, assignmentId } = assignmentIntent;

    if (mode === "change") {
      const row = resolveActiveAssignmentRow(profileUserId, adminModel, assignmentId);
      if (!row) return;
      openCompensationChange(row);
      clearAssignmentIntent();
      return;
    }

    openCompensationAssign({ lockEmployee: true, profileUserId });
    clearAssignmentIntent();
  }, [
    activeModuleId,
    activeScreenId,
    adminModel,
    assignmentIntent,
    clearAssignmentIntent,
    openCompensationAssign,
    openCompensationChange,
  ]);

  const handleCompensationActionSubmit = useCallback(
    async ({ mode, profileUserId, planId, effectiveDate, assignmentRow }) => {
      if (mode === "change") {
        const ok = await handleChangePlan(assignmentRow, { newPlanId: planId, effectiveDate });
        if (ok) closeCompensationAction();
        return;
      }
      const ok = await handleAssignEmployee({ profileUserId }, { planId, effectiveDate });
      if (ok) closeCompensationAction();
    },
    [closeCompensationAction, handleAssignEmployee, handleChangePlan]
  );

  const selectedPeriodRow = useMemo(() => {
    const rows = model?.periodRows || [];
    if (!rows.length) return null;
    return rows.find((row) => row.periodId === selectedPeriodId) || rows[0];
  }, [model, selectedPeriodId]);

  const compensationPayrollCycleLabel = useMemo(() => {
    return (
      selectedPeriodRow?.periodYm ||
      model?.reportingContext?.periodLabel ||
      model?.reportingContext?.periodYm ||
      "Current reporting period"
    );
  }, [model, selectedPeriodRow]);

  const compensationSelectableEmployees = useMemo(
    () => listUnassignedEmployees(adminModel),
    [adminModel]
  );

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

  const showWorkflowProgress =
    activeModuleId === "dashboard" ||
    activeModuleId === "payroll" ||
    (activeModuleId === "compensation" && activeScreenId === "assignments");

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

  const dataQualityWarnings = useMemo(
    () =>
      buildPeopleOpsDataQualityWarnings({
        model,
        employeeList,
        adminModel,
        ownershipWorkspace,
        workforceBudget,
      }),
    [adminModel, employeeList, model, ownershipWorkspace, workforceBudget]
  );

  const moduleDataQualityWarnings = useMemo(
    () => filterPeopleOpsDataQualityWarningsForModule(dataQualityWarnings, activeModuleId),
    [activeModuleId, dataQualityWarnings]
  );

  const moduleDependencyNotices = useMemo(
    () => buildPeopleOpsModuleDependencyNotices({ moduleId: activeModuleId, employeeList }),
    [activeModuleId, employeeList]
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

  const hierarchicalCompensation = useMemo(
    () =>
      ownershipWorkspace
        ? buildHierarchicalCompensation({
            orgTree: ownershipWorkspace.orgTree,
            reportingContext: model?.reportingContext,
          })
        : null,
    [model?.reportingContext, ownershipWorkspace]
  );

  const employeeBusinessProfile = useMemo(() => {
    if (!employee360Model) return null;
    const metrics =
      (model?.intelligence?.employeeRows || []).find(
        (row) =>
          row.profileUserId === selectedEmployeeProfileId ||
          (employee360Model?.overview?.agentId && row.agentId === employee360Model.overview.agentId)
      ) || null;
    return buildEmployee360BusinessProfile({
      employee360: employee360Model,
      ownershipContext: employeeOwnershipContext,
      employeeMetrics: metrics,
      reportingContext: model?.reportingContext,
    });
  }, [
    employee360Model,
    employeeOwnershipContext,
    model?.intelligence?.employeeRows,
    model?.reportingContext,
    selectedEmployeeProfileId,
  ]);

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

  const selectedEmployeeDirectoryRow = useMemo(() => {
    if (!selectedEmployeeProfileId) return null;
    return employeeList.find((row) => row.profileUserId === selectedEmployeeProfileId) || null;
  }, [employeeList, selectedEmployeeProfileId]);

  const handleEmployee360Action = useCallback(
    (actionKey, payload = {}) => {
      const profileUserId = selectedEmployeeProfileId;
      if (!profileUserId) return;

      if (actionKey === "assign_plan") {
        openCompensationAssign({ lockEmployee: true, profileUserId });
        return;
      }
      if (actionKey === "change_plan") {
        const row =
          resolveActiveAssignmentRow(profileUserId, adminModel) ||
          (employee360Model?.activeAssignment
            ? {
                id: employee360Model.activeAssignment.id,
                profileUserId,
                employeeName: employee360Model?.overview?.name,
                planId: employee360Model.activeAssignment.plan_id,
              }
            : null);
        if (row) openCompensationChange(row);
        return;
      }
      if (actionKey === "view_payroll") {
        navigatePeopleOps({ moduleId: "payroll", screenId: "run-review" });
        return;
      }
      if (actionKey === "open_ownership") {
        navigatePeopleOps({ moduleId: "ownership", screenId: "explorer" });
        return;
      }
      if (actionKey === "open_lab") {
        const labId = payload?.labId || employeeOwnershipContext?.managedLabs?.[0]?.labId;
        if (labId) setSelectedLabId(labId);
        return;
      }
      if (actionKey === "deactivate" || actionKey === "provision") {
        showToast("info", "Employee provisioning and deactivation live in Operations Center.");
        if (setActivePage) setActivePage("operationsCenter");
        return;
      }
      if (actionKey === "view_history") {
        navigatePeopleOps({ moduleId: "employees", screenId: "workspace" });
        setEmployee360ViewMode("workspace");
        return;
      }
    },
    [
      adminModel,
      employee360Model,
      employeeOwnershipContext,
      navigatePeopleOps,
      openCompensationAssign,
      openCompensationChange,
      selectedEmployeeProfileId,
      setActivePage,
      showToast,
    ]
  );

  const openEmployee = useCallback(
    (employee = {}) => {
      const profileUserId = String(employee.profileUserId || employee.profile_user_id || "").trim();
      const agentId = String(employee.agentId || employee.agent_id || "").trim();
      setEmployee360ViewMode("workspace");
      navigatePeopleOps({ moduleId: "employees", screenId: "workspace" });
      if (profileUserId) {
        setSelectedEmployeeProfileId(profileUserId);
        const row = employeeList.find((item) => item.profileUserId === profileUserId) || employee;
        trackView({
          id: profileUserId,
          label: row.employeeName || "Employee",
          meta: row.role || "employee",
          route: { moduleId: "employees", screenId: "workspace", profileUserId },
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

  const openEmployeeQuickView = useCallback(
    (employee = {}) => {
      const profileUserId = String(employee.profileUserId || employee.profile_user_id || "").trim();
      if (!profileUserId) return;
      setSelectedEmployeeProfileId(profileUserId);
      setEmployee360ViewMode("quick");
      const row = employeeList.find((item) => item.profileUserId === profileUserId) || employee;
      trackView({
        id: profileUserId,
        label: row.employeeName || "Employee",
        meta: row.role || "employee",
        route: { moduleId: "employees", screenId: "directory", profileUserId },
        favoriteKey: `employee:${profileUserId}`,
      });
    },
    [employeeList, trackView]
  );

  const openEmployeeWorkspaceFromQuickView = useCallback(() => {
    if (!selectedEmployeeProfileId) return;
    setEmployee360ViewMode("workspace");
    navigatePeopleOps({ moduleId: "employees", screenId: "workspace" });
  }, [navigatePeopleOps, selectedEmployeeProfileId]);

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
    <div className="space-y-3 p-3 md:p-4">
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

      {activeModuleId !== "dashboard" ? (
        <>
          <PeopleOpsModuleDependencyNotice notices={moduleDependencyNotices} onNavigate={handleOpenProductivityRoute} />
          <PeopleOpsDataQualityBanner warnings={moduleDataQualityWarnings} onNavigate={handleOpenProductivityRoute} />
        </>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0 space-y-3">

      {activeModuleId === "dashboard" && activeScreenId === "home" && model ? (
        <PeopleOpsDashboard
          model={model}
          breadcrumbs={breadcrumbs}
          employeeCount={employeeList.length}
          employeeList={employeeList}
          ownershipWorkspace={ownershipWorkspace}
          selectedPeriodRow={selectedPeriodRow}
          onNavigatePayroll={() => navigatePeopleOps({ moduleId: "payroll", screenId: "periods" })}
          onNavigateEmployees={() => navigatePeopleOps({ moduleId: "employees", screenId: "directory" })}
          productivity={productivity}
          onQuickAction={handleQuickAction}
          onOpenRoute={handleOpenProductivityRoute}
          dataQualityWarnings={dataQualityWarnings}
          workflowBusy={workflowBusy || refreshing}
          refreshing={refreshing}
        />
      ) : null}

      {activeModuleId === "reports" && activeScreenId === "analytics" && model ? (
        <PeopleOpsReportsPanel
          model={model}
          intelligence={model.intelligence}
          executivePerformance={model.executivePerformance}
          compensationPlans={model.compensationPlans}
          breadcrumbs={breadcrumbs}
          onNavigatePayroll={() => navigatePeopleOps({ moduleId: "payroll", screenId: "periods" })}
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
          hierarchicalCompensation={hierarchicalCompensation}
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
          description="Pay templates for salary, allowances, and commission. Assign employees after creating a plan."
          breadcrumbs={breadcrumbs}
          helpModuleId="compensation"
        >
        <CompensationPlansTab
          adminModel={adminModel}
          permissions={adminPermissions}
          onCreatePlan={handleCreatePlan}
          onSavePlan={handleSavePlan}
          onDuplicatePlan={handleDuplicatePlan}
          onDeactivatePlan={handleDeactivatePlan}
          onActivatePlan={handleActivatePlan}
          onAssignEmployees={() => navigatePeopleOps({ moduleId: "compensation", screenId: "assignments" })}
          onViewAssignments={(row) => {
            navigatePeopleOps({ moduleId: "compensation", screenId: "assignments" });
            setEmployeeSearch(row.planCode || "");
          }}
          busy={adminBusy}
        />
        </PeopleOpsModuleFrame>
        ) : (
          <PeopleOpsModuleFrame title="Compensation Plans" description="Pay templates for salary, allowances, and commission." breadcrumbs={breadcrumbs} helpModuleId="compensation">
            {adminBusy || loading ? <ListSkeleton rows={6} /> : (
              <DataFetchError message="Compensation plans could not be loaded." onRetry={() => void loadAdmin()} retrying={adminBusy} />
            )}
          </PeopleOpsModuleFrame>
        )
      ) : null}

      {activeModuleId === "compensation" && activeScreenId === "assignments" ? (
        adminModel ? (
        <PeopleOpsModuleFrame
          title="Compensation Assignments"
          description="Link each employee to a Compensation Plan so they can be included in payroll."
          breadcrumbs={breadcrumbs}
          helpModuleId="compensation"
        >
        {showWorkflowProgress ? <PeopleOpsWorkflowProgress stages={productivity?.workflowProgress || []} compact /> : null}
        <CompensationExecutiveSummary
          adminModel={adminModel}
          model={model}
          onAssignEmployees={() => openCompensationAssign()}
        />
        <CompensationPlanAssignmentsTab
          adminModel={adminModel}
          permissions={adminPermissions}
          onEndAssignment={handleEndAssignment}
          onViewAssignment={(row) => openEmployee({ profileUserId: row.profileUserId, agentId: row.agentId })}
          onOpenAssign={(options) => openCompensationAssign(options || {})}
          onOpenChangePlan={openCompensationChange}
          busy={adminBusy}
        />
        </PeopleOpsModuleFrame>
        ) : (
          <PeopleOpsModuleFrame title="Compensation Assignments" description="Link each employee to a Compensation Plan so they can be included in payroll." breadcrumbs={breadcrumbs} helpModuleId="compensation">
            {adminBusy || loading ? <ListSkeleton rows={6} /> : (
              <DataFetchError message="Plan assignments could not be loaded." onRetry={() => void loadAdmin()} retrying={adminBusy} />
            )}
          </PeopleOpsModuleFrame>
        )
      ) : null}

      {activeModuleId === "payroll" && activeScreenId === "periods" && model ? (
        <PeopleOpsModuleFrame
          title="Pay Periods"
          description="Review pay cycles, generate a Payroll Preview, and run the approval workflow."
          breadcrumbs={breadcrumbs}
          helpModuleId="payroll"
          dense
          summary={
            <PeopleOpsPayrollSummary
              summary={{
                employeesLabel: String(model.periodRows.length ? model.kpis.employeeCount : "No periods"),
                grossPayrollLabel: model.kpis.currentPayrollLiabilityLabel,
                commissionLabel: model.kpis.commissionPayableLabel,
                adjustmentsLabel: "—",
                recoveriesLabel: "—",
                netPayrollLabel: model.kpis.currentPayrollLiabilityLabel,
              }}
            />
          }
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
            emptyTitle="No payroll generated yet."
            emptyDescription="Generate a Payroll Preview for a pay period to begin the approval cycle."
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
          title="Payroll Preview"
          description="Review each employee’s salary, allowances, and commission before approval."
          breadcrumbs={breadcrumbs}
          helpModuleId="payroll"
          dense
          filters={
            <PeopleOpsFilterBar
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder="Search employee, plan, or period"
              filters={[
                {
                  id: "status",
                  label: "Payroll status",
                  value: statusFilter,
                  clearValue: "",
                  onChange: setStatusFilter,
                  options: [
                    { value: "", label: "All statuses" },
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
          <PeopleOpsWorkflowProgress stages={productivity?.workflowProgress || []} compact />
          <PeopleOpsPayrollStickyTotals summary={payrollRunSummary} />
          <PeopleOpsPayrollSummary summary={payrollRunSummary} />
          {selectedPeriodRow ? (
            <PayrollWorkflowToolbar
              periodRow={selectedPeriodRow}
              actorRole={actorRole}
              busy={workflowBusy || refreshing}
              generatingPeriodId={generatingPeriodId}
              onAction={handlePayrollWorkflowAction}
            />
          ) : null}
          {previewRows.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                Employee payroll breakdown — expand a row for Salary, Fuel, Mobile, Commission, Adjustments, Recoveries, Bonuses, and Net Payroll
              </p>
              {previewRows.map((row) => (
                <PeopleOpsPayrollLineBreakdown
                  key={row.lineId}
                  row={row}
                  onViewEmployee={openEmployeeFromPreview}
                />
              ))}
            </div>
          ) : (
            <PeopleOpsPayrollEmptyState
              hasEmployees={employeeList.length > 0}
              hasAssignments={employeeList.some((row) => row.assignmentStatus === "active")}
              hasRun={Boolean(model?.reportingContext?.payrollRunId)}
              onGeneratePreview={() => navigatePeopleOps({ moduleId: "payroll", screenId: "periods" })}
              onOpenEmployees={() => navigatePeopleOps({ moduleId: "employees", screenId: "directory" })}
              onOpenCompensation={() => navigatePeopleOps({ moduleId: "compensation", screenId: "plans" })}
              onOpenOwnership={() => navigatePeopleOps({ moduleId: "ownership", screenId: "explorer" })}
            />
          )}
          <CollectionCompensationDashboard
            rows={model.collectionCompensation || []}
            reportingContext={model.reportingContext}
          />
        </PeopleOpsModuleFrame>
      ) : null}

      {activeModuleId === "employees" && activeScreenId === "directory" && model ? (
        <PeopleOpsModuleFrame
          title="Employees"
          description="Who is on the HQ team — open anyone in the Employee Workspace or use Quick View from the row menu."
          breadcrumbs={breadcrumbs}
          helpModuleId="employees"
          dense
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
            onQuickViewEmployee={openEmployeeQuickView}
            permissions={employee360Permissions}
            onBulkAssignPlan={(rows) => openDirectoryAssignmentWorkflow(rows, "assign")}
            onBulkChangePlan={(rows) => openDirectoryAssignmentWorkflow(rows, "change")}
          />
        </PeopleOpsModuleFrame>
      ) : null}

      {activeModuleId === "employees" && activeScreenId === "workspace" && model ? (
        <PeopleOpsModuleFrame
          title="Employee Workspace"
          description="Canonical workspace for managing one employee — act first, drill down when needed."
          breadcrumbs={[
            ...buildPeopleOpsBreadcrumbs({ moduleId: "employees", screenId: "directory" }).slice(0, -1),
            { label: "Directory" },
            { label: selectedEmployeeSummary?.employeeName || "Employee" },
          ]}
          helpModuleId="employees"
          dense
        >
          <Employee360Workspace
            mode="full"
            model={employee360Model}
            directoryRow={selectedEmployeeDirectoryRow}
            ownershipContext={employeeOwnershipContext}
            permissions={employee360Permissions}
            reportingContext={model.reportingContext}
            loading={employee360Loading}
            error={employee360Error}
            onBack={() => {
              closeEmployeeWorkspace();
              navigatePeopleOps({ moduleId: "employees", screenId: "directory" });
            }}
            onAction={handleEmployee360Action}
          />
        </PeopleOpsModuleFrame>
      ) : null}

      <CompensationActionDrawer
        open={Boolean(compensationAction)}
        mode={compensationAction?.mode || "assign"}
        busy={adminBusy}
        lockEmployee={compensationAction?.lockEmployee === true}
        employee={compensationAction?.employee || null}
        currentAssignment={compensationAction?.currentAssignment || null}
        availablePlans={adminModel?.selectablePlans || []}
        selectableEmployees={compensationSelectableEmployees}
        promotionEligibilityRows={adminModel?.promotionEligibilityRows || []}
        payrollCycleLabel={compensationPayrollCycleLabel}
        onSubmit={handleCompensationActionSubmit}
        onCancel={closeCompensationAction}
      />

      <EmployeeCompensation360Drawer
        open={employee360ViewMode === "quick" && Boolean(selectedEmployeeProfileId)}
        onClose={closeEmployeeQuickView}
        onOpenFullWorkspace={openEmployeeWorkspaceFromQuickView}
        employeeName={selectedEmployeeSummary?.employeeName || employee360Model?.overview?.name}
        model={employee360Model}
        directoryRow={selectedEmployeeDirectoryRow}
        ownershipContext={employeeOwnershipContext}
        permissions={employee360Permissions}
        reportingContext={model?.reportingContext}
        loading={employee360Loading}
        error={employee360Error}
        onAction={handleEmployee360Action}
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
            <PeopleOpsContextWidget
              contextSummary={productivity.contextSummary}
              selectedEmployee={selectedEmployeeSummary}
              periodOptions={model.periodRows}
              runOptions={reportingRunOptions}
              selectedPeriodId={selectedPeriodId}
              selectedRunId={selectedRunId}
              onPeriodChange={(periodId) => {
                setSelectedPeriodId(periodId);
                const runs = (rawPayload?.payrollRuns || [])
                  .filter((run) => run.period_id === periodId)
                  .sort((a, b) => Number(b.run_number) - Number(a.run_number));
                setSelectedRunId(runs[0]?.id || "");
              }}
              onRunChange={setSelectedRunId}
              lastRefreshLabel={lastRefreshLabel}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

/** @deprecated Phase 8.1 alias — route key `compensationPayroll` unchanged */
export { PeopleOperationsPage as ExecutiveCompensationCenterPage };
