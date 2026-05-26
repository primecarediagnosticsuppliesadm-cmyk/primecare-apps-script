import { supabase } from "@/api/supabaseClient.js";
import { getAgentWorkspaceRead } from "@/api/primecareSupabaseApi.js";
import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import {
  checkEmptyApiWhenDbHasRows,
  checkTenantConsistency,
  checkRoleAccess,
} from "@/predator/predatorChecks.js";
import { predatorTrace } from "@/predator/predatorTiming.js";

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
    const dbCount = visitsRaw.length;

    const apiRes = await getAgentWorkspaceRead(currentUser || { role: ctx.role, id: ctx.userId });
    const apiRecent = Array.isArray(apiRes?.data?.recentVisits)
      ? apiRes.data.recentVisits.length
      : 0;
    const apiToday = Number(apiRes?.data?.summary?.todayVisits ?? 0);

    const uiRecent = rendered?.recentVisitsCount ?? null;
    const uiToday = rendered?.todayVisits ?? null;

    entries.push(
      ...checkEmptyApiWhenDbHasRows({
        module: "Agent Visits",
        step: "visit_rows",
        ctx,
        dbRowCount: dbCount,
        apiCount: apiRecent,
        uiCount: uiRecent,
      })
    );

    entries.push(
      ...checkTenantConsistency({
        module: "Agent Visits",
        step: "agent_visits",
        ctx,
        profileTenantId: ctx.tenantId,
        rowTenantIds: visitsRaw.map((r) => r.tenant_id).filter(Boolean),
      })
    );

    if (dbCount > 0 && apiToday === 0 && uiToday === 0) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Agent Visits",
          step: "today_visits_metric",
          expected: "todayVisits may be > 0 when visits exist for today",
          actual: { dbCount, apiToday, uiToday },
          rootCauseGuess: "Visit dates may not match local today or agent scope filter",
          suggestedFix: "Check visit_date vs created_at and filterVisitsForUser",
          severity: "low",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

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

    return { module: "Agent Visits", summary: summarizePredatorEntries(entries), entries };
  });
}
