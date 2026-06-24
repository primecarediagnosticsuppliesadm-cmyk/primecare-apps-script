import { supabase } from "@/api/supabaseClient.js";
import { getQualificationReviewRead } from "@/api/primecareSupabaseApi.js";
import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import {
  checkEmptyApiWhenDbHasRows,
  checkTenantConsistency,
  checkRoleAccess,
  resolveExecutiveRegisteredTenantIds,
  executiveCrossTenantOpts,
} from "@/predator/predatorChecks.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import {
  buildQualificationMetricDiagnoses,
  finalizeModuleDiagnosis,
} from "@/predator/buildModuleDiagnosis.js";
import { diagnoseProjectionColumns } from "@/predator/schemaAwareness.js";
import { predatorStore } from "@/predator/predatorStore.js";
import {
  QUALIFICATION_REVIEW_MODULE,
  resolveQualificationUiSnapshot,
} from "@/predator/moduleUiSnapshot.js";
import { validateQualificationRevenueConsistency } from "@/predator/validators/qualificationRevenueConsistencyValidator.js";

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 * @param {{ rowCount?: number }|null} [params.rendered]
 */
export async function validateQualificationModule({ ctx, rendered = null }) {
  return predatorTrace("Qualification Analytics", "validation.full", async () => {
    const stored = predatorStore.getModuleRenderedSnapshot(QUALIFICATION_REVIEW_MODULE, ctx);
    const renderedInput = rendered ?? stored?.snapshot ?? null;
    const entries = [
      ...checkRoleAccess({
        module: "Qualification Analytics",
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
          module: "Qualification Analytics",
          step: "supabase.client",
          rootCauseGuess: "Supabase not configured",
          suggestedFix: "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return {
        module: "Qualification Analytics",
        summary: summarizePredatorEntries(entries),
        entries,
      };
    }

    const qualRes = await supabase.from("lab_qualifications").select("*");
    const qualRaw = qualRes.error ? [] : qualRes.data || [];
    const dbCount = qualRaw.length;

    const apiValidatedAt = Date.now();
    const apiRes = await getQualificationReviewRead();
    const apiRows = Array.isArray(apiRes?.data) ? apiRes.data : [];
    const uiSnapshot = resolveQualificationUiSnapshot({
      explicitRendered: renderedInput,
      apiValidatedAt,
    });
    const uiSnapshotFresh = Boolean(uiSnapshot.fresh);
    const uiRendered = uiSnapshotFresh ? uiSnapshot.rendered : null;
    const uiCount = uiRendered
      ? Number(uiRendered.qualificationRowsCount ?? uiRendered.rowCount ?? 0)
      : null;

    if (!uiSnapshotFresh) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Qualification Analytics",
          step: "ui_snapshot_freshness",
          expected: "fresh rendered snapshot from Qualification Analytics page",
          actual: {
            reason: uiSnapshot.reason,
            source: uiSnapshot.source,
            ageMs: uiSnapshot.ageMs,
            capturedAt: uiSnapshot.capturedAt,
            apiValidatedAt: uiSnapshot.apiValidatedAt,
          },
          rootCauseGuess: uiSnapshot.message || "UI snapshot not available for comparison",
          suggestedFix:
            "Open Qualification Analytics page and wait for data to load before full Predator run",
          severity: "medium",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    entries.push(
      ...checkEmptyApiWhenDbHasRows({
        module: "Qualification Analytics",
        step: "qualification_rows",
        ctx,
        dbRowCount: dbCount,
        apiCount: apiRows.length,
        uiCount,
      })
    );

    const registeredTenantIds = await resolveExecutiveRegisteredTenantIds(ctx);
    entries.push(
      ...checkTenantConsistency({
        module: "Qualification Analytics",
        step: "lab_qualifications",
        ctx,
        profileTenantId: ctx.tenantId,
        rowTenantIds: qualRaw.map((r) => r.tenant_id).filter(Boolean),
        ...executiveCrossTenantOpts(ctx, registeredTenantIds),
      })
    );

    entries.push(...(await validateQualificationRevenueConsistency({ ctx })));

    if (!apiRes?.success) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Qualification Analytics",
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
          module: "Qualification Analytics",
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

    await diagnoseProjectionColumns("lab_qualifications", {
      required: ["tenant_id", "lab_id", "qualification_score", "founder_review_status"],
      optional: ["pipeline_stage"],
    });

    const layerSnap = {
      dbCount,
      apiCount: apiRows.length,
      uiCount,
    };
    const metrics = buildQualificationMetricDiagnoses(layerSnap, ctx, { uiSnapshotFresh });
    const { diagnosis, extraEntries } = finalizeModuleDiagnosis({
      module: "Qualification Analytics",
      ctx,
      metrics,
    });

    const allEntries = [...entries, ...extraEntries];
    return {
      module: "Qualification Analytics",
      summary: summarizePredatorEntries(allEntries),
      entries: allEntries,
      diagnosis,
    };
  });
}
