/**
 * Phase 4B payroll preview generation domain helpers.
 * Pure functions — no Supabase I/O.
 */

export const PAYROLL_PREVIEW_GENERATION_VERSION = "PC_COMP_PREVIEW_GEN_4B";

export function assertPayrollPeriodDraftForPreview(period = {}) {
  const status = String(period.status ?? "").toLowerCase();
  if (status !== "draft") {
    throw new Error(`payroll_preview_requires_draft_period:${status || "unknown"}`);
  }
  return true;
}

export function buildPreviewSourcePaymentHash(payments = []) {
  const refs = (payments || [])
    .map((payment) =>
      String(payment.payment_id ?? payment.paymentId ?? payment.id ?? "").trim()
    )
    .filter(Boolean)
    .sort();
  let hash = 0;
  const input = refs.join("|");
  for (let i = 0; i < input.length; i += 1) {
    hash = (Math.imul(31, hash) + input.charCodeAt(i)) | 0;
  }
  return {
    paymentCount: refs.length,
    sourcePaymentHash: refs.length ? `pc-pay-${Math.abs(hash).toString(16)}` : "pc-pay-empty",
    sourcePaymentRefs: refs,
  };
}

export function buildPreviewGenerationAuditEvidence({
  period = {},
  preview = {},
  actor = {},
  startedAt,
  durationMs,
  sourcePaymentHash,
  regenerated = false,
} = {}) {
  const planVersions = [
    ...new Set(
      (preview.commissionEntries || [])
        .map((entry) => entry.metadata?.plan_version)
        .filter(Boolean)
    ),
  ];
  return {
    period_id: period.id,
    period_ym: period.period_ym,
    generated_by: actor.userId || null,
    generated_at: preview.calculatedAt,
    rule_version: preview.ruleVersion,
    calculation_version: PAYROLL_PREVIEW_GENERATION_VERSION,
    plan_versions: planVersions,
    source_payment_hash: sourcePaymentHash,
    records_calculated: preview.payrollRunLines?.length || 0,
    commission_total: preview.totals?.commission_amount ?? 0,
    net_payable_total: preview.totals?.net_payable ?? 0,
    warnings: preview.warnings || [],
    execution_duration_ms: durationMs,
    started_at: startedAt,
    regenerated,
    preview_only: true,
    no_approval: true,
    no_export: true,
    no_paid: true,
  };
}
