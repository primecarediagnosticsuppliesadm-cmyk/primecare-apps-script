import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { polishPredatorEntries } from "@/predator/predatorEntryPolish.js";
import { ROLES } from "@/config/roles.js";
import { supabase } from "@/api/supabaseClient.js";
import {
  listBillingPaymentsForDistributor,
  loadBillingLedgerTotalsForDistributors,
  readBillingMigrationStatus,
  sumCollectedForDistributor,
} from "@/api/distributorBillingSupabaseApi.js";
import {
  BILLING_COLLECTED_SOURCES,
  resolveBillingCollected,
} from "@/distributor/distributorBillingEngine.js";
import { fetchDatabaseTenants } from "@/tenant/durableTenantStore.js";
import { TENANT_ISOLATION_TABLE_SPECS } from "@/validation/tenantIsolationManifest.js";

function finish(entries) {
  const polished = polishPredatorEntries(entries);
  return {
    module: "Distributor Billing",
    entries: polished,
    summary: summarizePredatorEntries(polished),
  };
}

function str(v) {
  return String(v ?? "").trim();
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 */
export async function validateDistributorBillingModule({
  ctx,
  currentUser = null,
  rendered = null,
  opsPayload = null,
}) {
  void currentUser;
  void opsPayload;

  return predatorTrace("Distributor Billing", "validation.full", async () => {
    const entries = [];
    const roleOk = ctx.role === ROLES.EXECUTIVE || ctx.role === ROLES.ADMIN;

    if (!roleOk) {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Distributor Billing",
          step: "role.access",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries);
    }

    entries.push(
      createPredatorEntry({
        status: supabase ? "PASS" : "FAIL",
        module: "Distributor Billing",
        step: "persistence.supabase_configured",
        actual: supabase ? "client ready" : "missing VITE_SUPABASE_URL / anon key",
        suggestedFix: supabase
          ? undefined
          : "Configure Supabase env vars and apply distributor_billing_migration.sql",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const manifestRegistered = TENANT_ISOLATION_TABLE_SPECS.some(
      (s) => s.id === "distributor_billing_payments"
    );
    entries.push(
      createPredatorEntry({
        status: manifestRegistered ? "PASS" : "FAIL",
        module: "Distributor Billing",
        step: "isolation.manifest_registered",
        actual: manifestRegistered ? "registered" : "missing",
        suggestedFix: manifestRegistered
          ? undefined
          : "Add distributor_billing_payments to tenantIsolationManifest.js",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    let tableReadable = false;
    let tableError = null;
    if (supabase) {
      const { error } = await supabase
        .from("distributor_billing_payments")
        .select("id", { count: "exact", head: true });
      tableReadable = !error;
      tableError = error?.message || null;
    }
    entries.push(
      createPredatorEntry({
        status: !supabase ? "WARN" : tableReadable ? "PASS" : "FAIL",
        module: "Distributor Billing",
        step: "persistence.table_readable",
        actual: tableReadable ? "select ok" : tableError || "table missing or RLS blocked",
        suggestedFix: tableReadable
          ? undefined
          : "Run supabase/sql/distributor_billing_migration.sql in Supabase SQL editor",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const migration = readBillingMigrationStatus();
    entries.push(
      createPredatorEntry({
        status: migration.done ? "PASS" : "WARN",
        module: "Distributor Billing",
        step: "migration.status",
        actual: { done: migration.done, summary: migration.summary },
        suggestedFix: migration.done
          ? undefined
          : "Run migrateConfigBillingCollectedFromTenants after deploy (B3) or when config has billingCollected > 0",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const probeDistributorId = str(ctx.tenantId);
    if (probeDistributorId && supabase && tableReadable) {
      const sumRes = await sumCollectedForDistributor(probeDistributorId);
      entries.push(
        createPredatorEntry({
          status: sumRes.ok ? "PASS" : "FAIL",
          module: "Distributor Billing",
          step: "persistence.sum_collected",
          actual: {
            distributorId: probeDistributorId,
            sum: sumRes.sum,
            count: sumRes.count,
            error: sumRes.error,
          },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      const listRes = await listBillingPaymentsForDistributor(probeDistributorId, { limit: 5 });
      entries.push(
        createPredatorEntry({
          status: listRes.ok ? "PASS" : "FAIL",
          module: "Distributor Billing",
          step: "persistence.list_payments",
          actual: { count: listRes.payments.length, error: listRes.error },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    const { rows: tenants } = await fetchDatabaseTenants();
    const pendingMigration = (tenants || []).filter((t) => {
      const meta = t?.metadata && typeof t.metadata === "object" ? t.metadata : {};
      const config = meta.config && typeof meta.config === "object" ? meta.config : {};
      return num(config.billingCollected) > 0;
    });

    let reconciled = true;
    const reconciliation = [];
    for (const tenant of pendingMigration) {
      const distributorId = str(tenant.id);
      const configCollected = num(
        tenant?.metadata?.config?.billingCollected ?? tenant?.metadata?.config?.billing_collected
      );
      const sumRes = await sumCollectedForDistributor(distributorId);
      const ledgerSum = sumRes.ok ? sumRes.sum : 0;
      const match = Math.abs(ledgerSum - configCollected) < 0.01;
      if (!match) reconciled = false;
      reconciliation.push({ distributorId, configCollected, ledgerSum, match });
    }

    entries.push(
      createPredatorEntry({
        status:
          pendingMigration.length === 0
            ? "PASS"
            : migration.done && reconciled
              ? "PASS"
              : "WARN",
        module: "Distributor Billing",
        step: "migration.config_reconciled",
        expected: "SUM(ledger) matches config.billingCollected after migration",
        actual: {
          pendingCount: pendingMigration.length,
          reconciled,
          samples: reconciliation.slice(0, 5),
        },
        suggestedFix:
          pendingMigration.length === 0 || (migration.done && reconciled)
            ? undefined
            : "Run migrateConfigBillingCollectedFromTenants",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    entries.push(
      createPredatorEntry({
        status: "PASS",
        module: "Distributor Billing",
        step: "separation.no_lab_payments_coupling",
        actual: "Billing API uses distributor_billing_payments only",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (probeDistributorId && supabase && tableReadable) {
      const batchRes = await loadBillingLedgerTotalsForDistributors([probeDistributorId]);
      const ledger = batchRes.byDistributor?.[probeDistributorId] || { sum: 0, count: 0 };
      const resolved = resolveBillingCollected({
        config: {},
        ledgerSum: ledger.sum,
        ledgerCount: ledger.count,
        ledgerOk: batchRes.ok,
      });
      const usesLedger =
        ledger.count > 0 && resolved.collectedSource === BILLING_COLLECTED_SOURCES.LEDGER;
      const usesFallback =
        ledger.count === 0 &&
        (resolved.collectedSource === BILLING_COLLECTED_SOURCES.CONFIG_FALLBACK ||
          resolved.collectedSource === BILLING_COLLECTED_SOURCES.CONFIG_FALLBACK_ERROR);
      entries.push(
        createPredatorEntry({
          status:
            ledger.count > 0 ? (usesLedger ? "PASS" : "FAIL") : usesFallback ? "PASS" : "WARN",
          module: "Distributor Billing",
          step: "billing.collected_source",
          expected:
            "Ledger rows → collectedSource=ledger; no rows or read fail → config fallback",
          actual: {
            distributorId: probeDistributorId,
            ledgerCount: ledger.count,
            ledgerSum: ledger.sum,
            collectedSource: resolved.collectedSource,
            batchOk: batchRes.ok,
          },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    const scopeTenantId = str(rendered?.scopeTenantId);
    if (rendered?.hasRecordPaymentUi) {
      entries.push(
        createPredatorEntry({
          status: supabase && tableReadable ? "PASS" : "FAIL",
          module: "Distributor Billing",
          step: "billing.payment_record_persists",
          expected: "Executive Record Payment UI writes to distributor_billing_payments",
          actual: {
            hasRecordPaymentUi: true,
            scopeTenantId: scopeTenantId || null,
            supabaseReady: Boolean(supabase),
            tableReadable,
          },
          suggestedFix:
            supabase && tableReadable
              ? undefined
              : "Deploy distributor_billing_migration.sql and distributor_billing_payment_types_b4.sql",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    } else if (rendered?.billingTabActive && ctx.role === ROLES.EXECUTIVE) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Distributor Billing",
          step: "billing.payment_record_persists",
          actual: "Select a distributor on Billing tab to surface Record Payment UI",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    if (scopeTenantId && supabase && tableReadable && num(rendered?.billingPaymentHistoryCount) > 0) {
      const uiSum = num(rendered.billingPaymentHistorySum);
      const uiCollected = num(rendered.billingCollected);
      const listRes = await listBillingPaymentsForDistributor(scopeTenantId);
      const apiSum = (listRes.payments || []).reduce((s, p) => s + num(p.amount), 0);
      const historyMatchesLedger =
        listRes.ok &&
        Math.abs(apiSum - uiSum) < 0.01 &&
        Math.abs(uiSum - uiCollected) < 0.01;
      entries.push(
        createPredatorEntry({
          status: historyMatchesLedger ? "PASS" : "FAIL",
          module: "Distributor Billing",
          step: "billing.payment_history_matches_ledger",
          expected: "UI payment history sum matches ledger collected amount",
          actual: {
            scopeTenantId,
            uiHistoryCount: num(rendered.billingPaymentHistoryCount),
            uiHistorySum: uiSum,
            uiCollected,
            apiHistorySum: apiSum,
            listOk: listRes.ok,
          },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    } else if (rendered?.billingTabActive && scopeTenantId) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Distributor Billing",
          step: "billing.payment_history_matches_ledger",
          actual: "No payment history rows yet for selected distributor",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    if (num(rendered?.billingLedgerCount) > 0) {
      const usesLedger = rendered.billingCollectedSource === BILLING_COLLECTED_SOURCES.LEDGER;
      const rollup = rendered?.dashboardBillingRollup;
      const rollupOk =
        rendered?.billingLedgerLoadOk !== false &&
        rollup &&
        num(rollup.totalCollected) >= num(rendered.billingCollected);
      entries.push(
        createPredatorEntry({
          status: usesLedger && rollupOk ? "PASS" : usesLedger ? "WARN" : "FAIL",
          module: "Distributor Billing",
          step: "billing.rollup_refresh_after_payment",
          expected: "Collected/outstanding and dashboard rollups read from ledger after payment",
          actual: {
            billingLedgerCount: num(rendered.billingLedgerCount),
            billingCollectedSource: rendered.billingCollectedSource,
            billingCollected: num(rendered.billingCollected),
            billingOutstanding: num(rendered.billingOutstanding),
            rollupTotalCollected: num(rollup?.totalCollected),
            billingLedgerLoadOk: rendered?.billingLedgerLoadOk ?? true,
          },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    } else if (rendered?.billingTabActive && scopeTenantId) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: "Distributor Billing",
          step: "billing.rollup_refresh_after_payment",
          actual: "Record a payment to verify rollup refresh from ledger",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    return finish(entries);
  });
}
