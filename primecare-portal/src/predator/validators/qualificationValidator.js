import { supabase } from "@/api/supabaseClient.js";
import { getQualificationReviewRead } from "@/api/primecareSupabaseApi.js";
import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import {
  checkEmptyApiWhenDbHasRows,
  checkTenantConsistency,
  checkRoleAccess,
} from "@/predator/predatorChecks.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import {
  buildQualificationMetricDiagnoses,
  finalizeModuleDiagnosis,
} from "@/predator/buildModuleDiagnosis.js";
import { diagnoseProjectionColumns } from "@/predator/schemaAwareness.js";

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 * @param {{ rowCount?: number }|null} [params.rendered]
 */
export async function validateQualificationModule({ ctx, rendered = null }) {
  return predatorTrace("Qualification Review", "validation.full", async () => {
    const entries = [
      ...checkRoleAccess({
        module: "Qualification Review",
        step: "access",
        ctx,
        role: ctx.role,
        allowedRoles: ["admin", "executive"],
      }),
    ];

    if (!supabase) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Qualification Review",
          step: "supabase.client",
          rootCauseGuess: "Supabase not configured",
          suggestedFix: "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return {
        module: "Qualification Review",
        summary: summarizePredatorEntries(entries),
        entries,
      };
    }

    const qualRes = await supabase.from("lab_qualifications").select("*");
    const qualRaw = qualRes.error ? [] : qualRes.data || [];
    const dbCount = qualRaw.length;

    const apiRes = await getQualificationReviewRead();
    const apiRows = Array.isArray(apiRes?.data) ? apiRes.data : [];
    const uiCount = rendered?.rowCount ?? null;

    entries.push(
      ...checkEmptyApiWhenDbHasRows({
        module: "Qualification Review",
        step: "qualification_rows",
        ctx,
        dbRowCount: dbCount,
        apiCount: apiRows.length,
        uiCount,
      })
    );

    entries.push(
      ...checkTenantConsistency({
        module: "Qualification Review",
        step: "lab_qualifications",
        ctx,
        profileTenantId: ctx.tenantId,
        rowTenantIds: qualRaw.map((r) => r.tenant_id).filter(Boolean),
      })
    );

    if (!apiRes?.success) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Qualification Review",
          step: "api_read",
          actual: apiRes?.error,
          rootCauseGuess: "getQualificationReviewRead failed",
          suggestedFix: "Check lab_qualifications RLS and v_labs_credit join",
          severity: "high",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    const missingLabName = apiRows.filter((r) => !r.labName && !r.lab_name).length;
    if (apiRows.length > 0 && missingLabName > 0) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Qualification Review",
          step: "missing_fields",
          expected: "lab name on each row",
          actual: { missingLabName, total: apiRows.length },
          rootCauseGuess: "v_labs_credit join miss or stale lab_id",
          suggestedFix: "Verify lab_id keys match v_labs_credit",
          severity: "medium",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    await diagnoseProjectionColumns("lab_qualifications", ["pipeline_stage", "invalid_column_probe"]);

    const layerSnap = {
      dbCount,
      apiCount: apiRows.length,
      uiCount,
    };
    const metrics = buildQualificationMetricDiagnoses(layerSnap, ctx);
    const { diagnosis, extraEntries } = finalizeModuleDiagnosis({
      module: "Qualification Review",
      ctx,
      metrics,
    });

    const allEntries = [...entries, ...extraEntries];
    return {
      module: "Qualification Review",
      summary: summarizePredatorEntries(allEntries),
      entries: allEntries,
      diagnosis,
    };
  });
}
