import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { ROLES } from "@/config/roles.js";
import {
  listOperationalEvidence,
  listOperationalEvidenceLocal,
  checkOperationalEvidenceBucket,
  resolveEvidencePreviewUrl,
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
      const labRows = listOperationalEvidenceLocal(ctx.tenantId, {
        role: ROLES.LAB,
        tenantId: ctx.tenantId,
      });
      entries.push(
        createPredatorEntry({
          status: labRows.length === 0 ? "PASS" : "FAIL",
          module: "Operational Evidence",
          step: "lab_role.isolation",
          rootCauseGuess:
            labRows.length === 0
              ? "Lab role cannot read agent evidence"
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

    const bucket = await checkOperationalEvidenceBucket(ctx.tenantId);
    entries.push(
      createPredatorEntry({
        status: bucket.ok ? "PASS" : bucket.missing ? "WARN" : "FAIL",
        module: "Operational Evidence",
        step: "storage.bucket_reachable",
        rootCauseGuess: bucket.ok
          ? `Bucket ${EVIDENCE_BUCKET} reachable`
          : bucket.error || "Bucket not reachable",
        suggestedFix:
          "Run supabase/sql/operational_evidence_storage_migration.sql in Supabase SQL editor",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (supabase && ctx.tenantId) {
      const { data, error } = await supabase
        .from("operational_evidence")
        .select("evidence_id, storage_path, storage_backend, tenant_id")
        .eq("tenant_id", ctx.tenantId)
        .order("created_at", { ascending: false })
        .limit(5);

      entries.push(
        createPredatorEntry({
          status: error ? "WARN" : "PASS",
          module: "Operational Evidence",
          step: "metadata.table_read",
          rootCauseGuess: error
            ? error.message
            : `operational_evidence readable (${(data || []).length} recent rows)`,
          suggestedFix: "Apply operational_evidence_storage_migration.sql",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      const crossTenant = (data || []).filter((r) => r.tenant_id && r.tenant_id !== ctx.tenantId);
      entries.push(
        createPredatorEntry({
          status: crossTenant.length === 0 ? "PASS" : "FAIL",
          module: "Operational Evidence",
          step: "tenant.scope",
          rootCauseGuess:
            crossTenant.length === 0
              ? "DB evidence rows scoped to active tenant"
              : "Cross-tenant evidence rows returned",
          suggestedFix: "Review RLS on operational_evidence",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      const durableRow = (data || []).find(
        (r) => r.storage_backend === "supabase" && r.storage_path
      );
      if (durableRow) {
        const signed = await resolveEvidencePreviewUrl({
          storagePath: durableRow.storage_path,
          storageBackend: "supabase",
        });
        entries.push(
          createPredatorEntry({
            status: signed ? "PASS" : "WARN",
            module: "Operational Evidence",
            step: "storage.signed_url",
            rootCauseGuess: signed
              ? "Signed preview URL generated"
              : "Could not create signed URL for stored evidence",
            suggestedFix: "Check storage SELECT policies and object owner",
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );
      } else {
        entries.push(
          createPredatorEntry({
            status: bucket.ok ? "WARN" : "PASS",
            module: "Operational Evidence",
            step: "storage.signed_url",
            rootCauseGuess: "No durable evidence rows yet to test signed URL",
            suggestedFix: "Upload visit or collection proof once bucket is live",
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );
      }
    }

    const localRows = listOperationalEvidenceLocal(ctx.tenantId, currentUser || { role: ctx.role });
    const crossTenantLocal = localRows.filter((r) => r.tenantId && r.tenantId !== ctx.tenantId);
    entries.push(
      createPredatorEntry({
        status: crossTenantLocal.length === 0 ? "PASS" : "FAIL",
        module: "Operational Evidence",
        step: "local_index.tenant_scope",
        rootCauseGuess:
          crossTenantLocal.length === 0
            ? "Local fallback index scoped to tenant"
            : "Cross-tenant rows in local index",
        suggestedFix: "Clear localStorage evidence index for QA tenants",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (ctx.role === ROLES.AGENT && currentUser) {
      const agentRows = await listOperationalEvidence(ctx.tenantId, currentUser, { limit: 20 });
      const foreign = agentRows.filter(
        (r) =>
          String(r.uploadedBy) !== String(currentUser.name) &&
          String(r.uploadedBy) !== String(currentUser.id) &&
          String(r.uploadedBy) !== String(currentUser.agentId) &&
          String(r.uploadedByUserId || "") !== String(currentUser.id || currentUser.userId || "")
      );
      entries.push(
        createPredatorEntry({
          status: foreign.length === 0 ? "PASS" : "FAIL",
          module: "Operational Evidence",
          step: "agent.ownership",
          rootCauseGuess:
            foreign.length === 0
              ? "Agent sees only own evidence"
              : "Agent can see other agents' evidence",
          suggestedFix: "Review operational_evidence RLS and list filters",
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
        step: "upload.failure_handling",
        rootCauseGuess: "Upload API falls back to local embed when bucket unavailable",
        suggestedFix: "Keep migration applied; monitor evidence.upload_fail Predator timings",
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
