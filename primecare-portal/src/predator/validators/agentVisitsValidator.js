import { supabase } from "@/api/supabaseClient.js";
import { getAgentWorkspaceRead } from "@/api/primecareSupabaseApi.js";
import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import {
  checkEmptyApiWhenDbHasRows,
  checkTenantConsistency,
  checkRoleAccess,
  checkMutableLayersAgreement,
} from "@/predator/predatorChecks.js";
import { filterVisitsForUser } from "@/utils/accessFilters.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { labIdKey } from "@/utils/labId.js";
import { enrichVisitForDisplay } from "@/utils/agentVisitDisplay.js";

const RECENT_VISITS_LIMIT = 10;

function str(v) {
  return String(v ?? "").trim();
}

function localDateYmd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * @param {object} row
 */
function mapVisitRowForValidation(row) {
  return {
    visitDate: String(row.visit_date ?? row.visitDate ?? row.Visit_Date ?? "").slice(0, 10),
    agentId: row.agent_id ?? row.agentId ?? "",
    agent: row.agent_name ?? row.agentName ?? row.Agent_Name ?? "",
    agentName: row.agent_name ?? row.agentName ?? row.Agent_Name ?? "",
  };
}

/**
 * @param {object[]} visitsRaw
 * @param {object|null} currentUser
 */
function computeScopedVisitMetrics(visitsRaw, currentUser) {
  const mapped = (visitsRaw || []).map(mapVisitRowForValidation);
  const scoped = filterVisitsForUser(mapped, currentUser);
  const sorted = [...scoped].sort((a, b) => {
    const tb = Date.parse(b.visitDate || "") || 0;
    const ta = Date.parse(a.visitDate || "") || 0;
    return tb - ta;
  });
  const todayYmd = localDateYmd();
  return {
    scopedCount: scoped.length,
    recentListCount: sorted.slice(0, RECENT_VISITS_LIMIT).length,
    todayCount: scoped.filter((v) => String(v.visitDate).slice(0, 10) === todayYmd).length,
  };
}

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 * @param {object|null} [params.currentUser]
 * @param {{ recentVisitsCount?: number, todayVisits?: number }|null} [params.rendered]
 */
export async function validateAgentVisitsModule({ ctx, currentUser = null, rendered = null }) {
  return predatorTrace("Agent Visits", "validation.full", async () => {
    const entries = [
      ...checkRoleAccess({
        module: "Agent Visits",
        step: "access",
        ctx,
        role: ctx.role,
        allowedRoles: ["admin", "agent"],
      }),
    ];

    if (!supabase) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Agent Visits",
          step: "supabase.client",
          rootCauseGuess: "Supabase not configured",
          suggestedFix: "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return { module: "Agent Visits", summary: summarizePredatorEntries(entries), entries };
    }

    const visitsRes = await supabase.from("agent_visits").select("*");
    const visitsRaw = visitsRes.error ? [] : visitsRes.data || [];
    const dbMetrics = computeScopedVisitMetrics(visitsRaw, currentUser);

    const apiRes = await getAgentWorkspaceRead(currentUser || { role: ctx.role, id: ctx.userId });
    const apiVisitRows = Array.isArray(apiRes?.data?.recentVisits) ? apiRes.data.recentVisits : [];
    const apiAssignedLabs = Array.isArray(apiRes?.data?.assignedLabs)
      ? apiRes.data.assignedLabs
      : [];
    const apiRecent = apiVisitRows.length;
    const apiToday = Number(apiRes?.data?.summary?.todayVisits ?? 0);

    const visitsWithLabId = apiVisitRows.filter((v) => labIdKey(v.labId));
    const enrichedRecent = visitsWithLabId.map((v) =>
      enrichVisitForDisplay(v, apiAssignedLabs)
    );
    const missingLabNames = enrichedRecent.filter((v) => !str(v.labName));

    entries.push(
      createPredatorEntry({
        status:
          visitsWithLabId.length === 0 || missingLabNames.length === 0 ? "PASS" : "FAIL",
        module: "Agent Visits",
        step: "recent_visits.lab_name_display",
        expected: "Recent visit rows with lab_id show a lab name after display enrichment",
        actual: {
          visitsWithLabId: visitsWithLabId.length,
          missingLabNames: missingLabNames.length,
          sample: missingLabNames.slice(0, 2).map((v) => ({
            visitId: v.visitId,
            labId: v.labId,
          })),
        },
        rootCauseGuess:
          missingLabNames.length > 0
            ? "Visit row missing lab_name and assigned lab lookup failed"
            : "Lab names resolve for recent visits",
        suggestedFix:
          "Ensure mapVisitRowForAgentDashboard and enrichVisitForDisplay resolve lab from assignedLabs",
        severity: missingLabNames.length > 0 ? "high" : "low",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (rendered?.recentVisitRowsWithLabName === false) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Agent Visits",
          step: "ui.recent_visits.lab_name",
          expected: "All rendered recent visits with labId show labName",
          actual: rendered,
          rootCauseGuess: "Recent Visits UI mapping dropped lab name",
          suggestedFix: "Use enrichVisitForDisplay on recentVisits before render",
          severity: "high",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    } else if (rendered?.recentVisitRowsWithLabName === true) {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Agent Visits",
          step: "ui.recent_visits.lab_name",
          expected: "Rendered recent visits show lab names",
          actual: { recentVisitsCount: rendered.recentVisitsCount },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    const uiRecent = rendered?.recentVisitsCount ?? null;
    const uiToday = rendered?.todayVisits ?? null;

    entries.push(
      ...checkMutableLayersAgreement({
        module: "Agent Visits",
        step: "recent_visits_list_count",
        ctx,
        label: "recent visits list length (max 10, scoped)",
        layers: {
          db: dbMetrics.recentListCount,
          api: apiRecent,
          ui: uiRecent,
        },
      })
    );

    entries.push(
      ...checkMutableLayersAgreement({
        module: "Agent Visits",
        step: "today_visits_metric",
        ctx,
        label: "today visits count (scoped, visit_date = local today)",
        layers: {
          db: dbMetrics.todayCount,
          api: apiToday,
          ui: uiToday,
        },
      })
    );

    if (dbMetrics.scopedCount > 0 && apiRecent === 0 && uiRecent === 0) {
      entries.push(
        ...checkEmptyApiWhenDbHasRows({
          module: "Agent Visits",
          step: "visit_rows",
          ctx,
          dbRowCount: dbMetrics.scopedCount,
          apiCount: apiRecent ?? 0,
          uiCount: uiRecent,
        })
      );
    } else if (dbMetrics.scopedCount > 0 && apiRecent != null && apiRecent > 0) {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Agent Visits",
          step: "visit_rows.row_visibility",
          expected: "Scoped visits visible in API when DB has rows",
          actual: {
            dbScopedCount: dbMetrics.scopedCount,
            apiRecent,
            uiRecent,
          },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    entries.push(
      ...checkTenantConsistency({
        module: "Agent Visits",
        step: "agent_visits",
        ctx,
        profileTenantId: ctx.tenantId,
        rowTenantIds: visitsRaw.map((r) => r.tenant_id).filter(Boolean),
      })
    );

    if (rendered?.hasQualificationStep === false) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Agent Visits",
          step: "ui.qualification_step.config",
          expected: "hasQualificationStep true in wizard sectionSteps",
          actual: rendered,
          rootCauseGuess: "Agent visit wizard sectionSteps missing qualification step",
          suggestedFix: "Include qualification key in AGENT_VISIT_SECTION_STEPS",
          severity: "high",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    if (
      ctx.role === "agent" &&
      rendered?.labSelected &&
      rendered?.currentWizardStep === "qualification" &&
      rendered?.hasQualificationStep !== true
    ) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Agent Visits",
          step: "ui.qualification_step.agent_lab_select",
          expected: "Qualification wizard step available after lab select",
          actual: rendered,
          rootCauseGuess: "Wizard guard blocked qualification step for agent with lab selected",
          suggestedFix: "Ensure step 5 renders when lab is selected",
          severity: "high",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    if (visitsRes.error) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Agent Visits",
          step: "visits_query_error",
          actual: visitsRes.error.message,
          rootCauseGuess: "RLS blocked agent_visits",
          suggestedFix: "Verify agent/admin RLS policies",
          severity: "high",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    const apiAssignedCount = Array.isArray(apiRes?.data?.assignedLabs)
      ? apiRes.data.assignedLabs.length
      : null;
    const uiAssignedCount =
      rendered?.assignedLabsCount != null ? Number(rendered.assignedLabsCount) : null;

    if (apiAssignedCount != null && uiAssignedCount != null) {
      entries.push(
        ...checkMutableLayersAgreement({
          module: "Agent Visits",
          step: "daily_workspace.assigned_labs_count",
          ctx,
          label: "assigned labs visible in daily workspace",
          layers: {
            api: apiAssignedCount,
            ui: uiAssignedCount,
          },
        })
      );
    }

    if (
      rendered?.actionQueueCount != null &&
      Array.isArray(apiRes?.data?.assignedLabs) &&
      rendered.actionQueueCount > apiRes.data.assignedLabs.length + (apiRes.data.tasks?.length || 0)
    ) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Agent Visits",
          step: "daily_workspace.queue_bounds",
          expected: "queue items bounded by assigned labs + tasks",
          actual: {
            actionQueueCount: rendered.actionQueueCount,
            assignedLabs: apiRes.data.assignedLabs.length,
            tasks: (apiRes.data.tasks || []).length,
          },
          rootCauseGuess: "Action queue may include unexpected cross-agent items",
          suggestedFix: "Verify filterLabsForUser on workspace reads",
          severity: "medium",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    return { module: "Agent Visits", summary: summarizePredatorEntries(entries), entries };
  });
}
