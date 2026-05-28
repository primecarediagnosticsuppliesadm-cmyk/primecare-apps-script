import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { ROLES } from "@/config/roles.js";
import {
  listOperationalEvidence,
  EVIDENCE_BUCKET,
} from "@/api/operationalEvidenceApi.js";
import { supabase } from "@/api/supabaseClient.js";

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 * @param {object|null} params.currentUser
 */
export async function validateOperationalEvidenceModule({ ctx, currentUser }) {
  return predatorTrace("Operational Evidence", "validation.full", async () => {
    const entries = [];

    if (ctx.role === ROLES.LAB) {
      const labRows = listOperationalEvidence(ctx.tenantId, { role: ROLES.LAB, tenantId: ctx.tenantId });
      entries.push(
        createPredatorEntry({
          status: labRows.length === 0 ? "PASS" : "FAIL",
          module: "Operational Evidence",
          step: "lab_role.isolation",
          rootCauseGuess:
            labRows.length === 0
              ? "Lab role cannot read agent evidence index"
              : "Lab role leaked evidence records",
          suggestedFix: "Ensure listOperationalEvidence returns [] for lab role",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return {
        module: "Operational Evidence",
        summary: summarizePredatorEntries(entries),
        entries,
      };
    }

    entries.push(
      createPredatorEntry({
        status: supabase ? "PASS" : "WARN",
        module: "Operational Evidence",
        step: "supabase.client",
        rootCauseGuess: supabase ? "Supabase client configured" : "Supabase not configured",
        suggestedFix: "Set VITE_SUPABASE_URL for durable storage uploads",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const tenantRows = listOperationalEvidence(ctx.tenantId, {
      role: ROLES.ADMIN,
      tenantId: ctx.tenantId,
      id: ctx.userId,
    });
    const crossTenant = tenantRows.filter((r) => r.tenantId && r.tenantId !== ctx.tenantId);
    entries.push(
      createPredatorEntry({
        status: crossTenant.length === 0 ? "PASS" : "FAIL",
        module: "Operational Evidence",
        step: "tenant.scope",
        rootCauseGuess:
          crossTenant.length === 0
            ? "Evidence index scoped to active tenant"
            : "Cross-tenant evidence rows in index",
        suggestedFix: "Clear local evidence index or fix tenantId on upload",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
        detail: { crossTenantCount: crossTenant.length },
      })
    );

    const stale = tenantRows.filter((r) => !r.previewUrl && !r.storagePath);
    entries.push(
      createPredatorEntry({
        status: stale.length === 0 ? "PASS" : "WARN",
        module: "Operational Evidence",
        step: "preview.references",
        rootCauseGuess:
          stale.length === 0 ? "All indexed records have preview or storage path" : "Stale evidence without preview",
        suggestedFix: "Re-upload or purge orphan index rows",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
        detail: { staleCount: stale.length },
      })
    );

    if (ctx.role === ROLES.AGENT && currentUser) {
      const agentRows = listOperationalEvidence(ctx.tenantId, currentUser);
      const foreign = agentRows.filter(
        (r) =>
          String(r.uploadedBy) !== String(currentUser.name) &&
          String(r.uploadedBy) !== String(currentUser.id) &&
          String(r.uploadedBy) !== String(currentUser.agentId)
      );
      entries.push(
        createPredatorEntry({
          status: foreign.length === 0 ? "PASS" : "FAIL",
          module: "Operational Evidence",
          step: "agent.ownership",
          rootCauseGuess:
            foreign.length === 0
              ? "Agent sees only own uploads"
              : "Agent can see other agents' evidence",
          suggestedFix: "Tighten listOperationalEvidence agent filter",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    entries.push(
      createPredatorEntry({
        status: "PASS",
        module: "Operational Evidence",
        step: "storage.bucket",
        rootCauseGuess: `Target bucket: ${EVIDENCE_BUCKET}`,
        suggestedFix: "Create private bucket with tenant path policies in Supabase Storage",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    return {
      module: "Operational Evidence",
      summary: summarizePredatorEntries(entries),
      entries,
    };
  });
}
