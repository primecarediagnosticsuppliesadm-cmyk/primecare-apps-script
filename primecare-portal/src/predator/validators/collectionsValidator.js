import { supabase } from "@/api/supabaseClient.js";
import { getCollectionsRead } from "@/api/primecareSupabaseApi.js";
import { computeReceivableMetrics } from "@/metrics/computeReceivableMetrics.js";
import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import {
  checkEmptyApiWhenDbHasRows,
  checkTenantConsistency,
  checkRoleAccess,
} from "@/predator/predatorChecks.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import {
  buildCollectionsMetricDiagnoses,
  finalizeModuleDiagnosis,
} from "@/predator/buildModuleDiagnosis.js";
import { predatorStore } from "@/predator/predatorStore.js";
import {
  COLLECTIONS_MODULE,
  resolveCollectionsUiSnapshot,
} from "@/predator/moduleUiSnapshot.js";

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 * @param {{ summary?: object, collections?: unknown[] }|null} [params.rendered]
 */
export async function validateCollectionsModule({ ctx, rendered = null }) {
  return predatorTrace("Collections", "validation.full", async () => {
    const stored = predatorStore.getModuleRenderedSnapshot(COLLECTIONS_MODULE, ctx);
    const renderedInput = rendered ?? stored?.snapshot ?? null;
    const entries = [
      ...checkRoleAccess({
        module: "Collections",
        step: "access",
        ctx,
        role: ctx.role,
        allowedRoles: ["admin", "agent", "executive", "lab"],
      }),
    ];

    if (!supabase) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Collections",
          step: "supabase.client",
          rootCauseGuess: "Supabase not configured",
          suggestedFix: "Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return { module: "Collections", summary: summarizePredatorEntries(entries), entries };
    }

    const arRes = await supabase.from("ar_credit_control").select("*");
    const arRaw = arRes.error ? [] : arRes.data || [];
    const { outstandingReceivables } = computeReceivableMetrics(arRaw);
    const dbArRows = arRaw.length;

    const apiValidatedAt = Date.now();
    const apiRes = await getCollectionsRead();
    const apiCollections = Array.isArray(apiRes?.data?.collections) ? apiRes.data.collections : [];
    const apiOutstanding = Number(apiRes?.data?.summary?.totalOutstanding ?? 0);

    const uiSnapshot = resolveCollectionsUiSnapshot({
      explicitRendered: renderedInput,
      apiValidatedAt,
    });
    const uiSnapshotFresh = Boolean(uiSnapshot.fresh);
    const uiRendered = uiSnapshotFresh ? uiSnapshot.rendered : null;

    const uiCollections = uiRendered
      ? Number(
          uiRendered.collectionsListCount ??
            (Array.isArray(uiRendered.collections) ? uiRendered.collections.length : 0)
        )
      : null;
    const uiOutstanding = uiRendered
      ? Number(uiRendered.outstandingReceivables ?? uiRendered.summary?.totalOutstanding ?? 0)
      : null;

    if (!uiSnapshotFresh) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Collections",
          step: "ui_snapshot_freshness",
          expected: "fresh rendered snapshot from Collections page",
          actual: {
            reason: uiSnapshot.reason,
            source: uiSnapshot.source,
            ageMs: uiSnapshot.ageMs,
            capturedAt: uiSnapshot.capturedAt,
            apiValidatedAt: uiSnapshot.apiValidatedAt,
          },
          rootCauseGuess: uiSnapshot.message || "UI snapshot not available for comparison",
          suggestedFix: "Open Collections page and wait for data to load before full Predator run",
          severity: "medium",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    entries.push(
      ...checkEmptyApiWhenDbHasRows({
        module: "Collections",
        step: "collections_list",
        ctx,
        dbRowCount: dbArRows,
        apiCount: apiCollections.length,
        uiCount: uiCollections,
      })
    );

    entries.push(
      ...checkTenantConsistency({
        module: "Collections",
        step: "ar_credit_control",
        ctx,
        profileTenantId: ctx.tenantId,
        rowTenantIds: arRaw.map((r) => r.tenant_id).filter(Boolean),
      })
    );

    const arMismatch = Math.abs(outstandingReceivables - apiOutstanding) > 0.01;
    entries.push(
      createPredatorEntry({
        status: arMismatch ? "FAIL" : "PASS",
        module: "Collections",
        step: "outstanding_receivables",
        expected: outstandingReceivables,
        actual: { dbComputed: outstandingReceivables, api: apiOutstanding, ui: uiOutstanding },
        rootCauseGuess: arMismatch
          ? "API summary.totalOutstanding does not match AR table rollup"
          : "",
        suggestedFix: arMismatch
          ? "Trace getCollectionsRead summarizeCollectionsList vs computeReceivableMetrics"
          : "",
        severity: arMismatch ? "high" : "low",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (arRes.error) {
      entries.push(
        createPredatorEntry({
          status: "FAIL",
          module: "Collections",
          step: "ar_query_error",
          actual: arRes.error.message,
          rootCauseGuess: "RLS or schema error on ar_credit_control",
          suggestedFix: "Check PostgREST error and column grants",
          severity: "high",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    const layerSnap = {
      dbArRows,
      dbOutstanding: outstandingReceivables,
      apiCollectionCount: apiCollections.length,
      apiOutstanding,
      uiCollectionCount: uiCollections,
      uiOutstanding,
    };

    const metrics = buildCollectionsMetricDiagnoses(layerSnap, ctx, { uiSnapshotFresh });
    const { diagnosis, extraEntries } = finalizeModuleDiagnosis({
      module: "Collections",
      ctx,
      metrics,
    });

    const allEntries = [...entries, ...extraEntries];
    return {
      module: "Collections",
      summary: summarizePredatorEntries(allEntries),
      entries: allEntries,
      diagnosis,
    };
  });
}
