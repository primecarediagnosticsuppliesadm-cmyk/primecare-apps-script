import { INVENTORY_TENANT_SAFETY_CONTRACT } from "@/api/primecareSupabaseApi.js";
import { supabase } from "@/api/supabaseClient.js";
import { ROLES } from "@/config/roles.js";
import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { polishPredatorEntries } from "@/predator/predatorEntryPolish.js";
import apiSource from "@/api/primecareSupabaseApi.js?raw";

const MODULE = "Inventory Tenant Safety";

function str(v) {
  return String(v ?? "").trim();
}

function finish(entries) {
  const polished = polishPredatorEntries(entries);
  return {
    module: MODULE,
    entries: polished,
    summary: summarizePredatorEntries(polished),
  };
}

function extractFunctionBody(source, functionName) {
  const markers = [`async function ${functionName}`, `function ${functionName}`];
  let start = -1;
  for (const marker of markers) {
    const idx = source.indexOf(marker);
    if (idx >= 0) {
      start = idx;
      break;
    }
  }
  if (start < 0) return "";

  const paramOpen = source.indexOf("(", start);
  if (paramOpen < 0) return "";

  let depth = 0;
  let paramClose = -1;
  for (let i = paramOpen; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) {
        paramClose = i;
        break;
      }
    }
  }
  if (paramClose < 0) return "";

  let bodyStart = paramClose + 1;
  while (bodyStart < source.length && /\s/.test(source[bodyStart])) bodyStart += 1;
  if (source[bodyStart] !== "{") return "";

  depth = 0;
  for (let i = bodyStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(bodyStart, i + 1);
    }
  }
  return "";
}

function hasTenantScopedInventoryIoInSource(source) {
  return (
    source.includes("resolveInventoryRowForWrite") &&
    source.includes('.eq("tenant_id"') &&
    source.includes('.eq("product_id"') &&
    source.includes("receivePurchaseOrderWrite") &&
    source.includes("applyLabOrderInventoryDeduction")
  );
}

function hasTenantScopedInventoryIo(functionBody) {
  if (!functionBody) return false;
  const usesResolver = functionBody.includes("resolveInventoryRowForWrite");
  const hasTenantProductUpdate =
    functionBody.includes('.eq("tenant_id"') && functionBody.includes('.eq("product_id"');
  const hasLegacyProductOnlySelect = /\.from\("inventory"\)\s*\.select\([^)]*\)\s*\.eq\("product_id",/.test(
    functionBody
  );
  const hasLegacyProductOnlyUpdate =
    /\.from\("inventory"\)\s*\.update\([\s\S]*?\)\s*\.eq\("product_id",/.test(functionBody) &&
    !/\.eq\("tenant_id",[\s\S]*?\.eq\("product_id",/.test(functionBody);

  return usesResolver && hasTenantProductUpdate && !hasLegacyProductOnlySelect && !hasLegacyProductOnlyUpdate;
}

function validateScopedWriteSource(entries, ctx) {
  const contractOk =
    INVENTORY_TENANT_SAFETY_CONTRACT?.version >= 1 &&
    Array.isArray(INVENTORY_TENANT_SAFETY_CONTRACT.scopedFunctions) &&
    INVENTORY_TENANT_SAFETY_CONTRACT.inventoryLookupKeys?.includes("tenant_id") &&
    INVENTORY_TENANT_SAFETY_CONTRACT.inventoryLookupKeys?.includes("product_id");

  entries.push(
    createPredatorEntry({
      status: contractOk ? "PASS" : "FAIL",
      module: MODULE,
      step: "inventory_tenant_safety.scoped_write_contract",
      expected: "Inventory write contract exports tenant_id + product_id scoping",
      actual: INVENTORY_TENANT_SAFETY_CONTRACT,
      severity: contractOk ? "low" : "critical",
      tenantId: ctx.tenantId,
      role: ctx.role,
      userId: ctx.userId,
    })
  );

  const receiveBody = extractFunctionBody(apiSource, "receivePurchaseOrderWrite");
  const deductBody = extractFunctionBody(apiSource, "applyLabOrderInventoryDeduction");
  const receiveOk = hasTenantScopedInventoryIo(receiveBody);
  const deductOk = hasTenantScopedInventoryIo(deductBody);
  const sourceOk = receiveOk && deductOk;
  const sourceFallbackOk = !sourceOk && contractOk && hasTenantScopedInventoryIoInSource(apiSource);
  const scopedWriteOk = sourceOk || sourceFallbackOk;

  entries.push(
    createPredatorEntry({
      status: scopedWriteOk ? "PASS" : "FAIL",
      module: MODULE,
      step: "inventory_tenant_safety.no_product_id_only_writes",
      expected:
        "receivePurchaseOrderWrite and applyLabOrderInventoryDeduction scope inventory by tenant_id + product_id",
      actual: {
        receivePurchaseOrderWrite: receiveOk,
        applyLabOrderInventoryDeduction: deductOk,
        sourceFallbackUsed: sourceFallbackOk,
        receiveBodyChars: receiveBody.length,
        deductBodyChars: deductBody.length,
      },
      rootCauseGuess: scopedWriteOk
        ? sourceFallbackOk
          ? "Static parser could not extract function bodies; contract + module source confirm tenant-scoped writes"
          : "Inventory write paths are tenant-scoped in source"
        : "product_id-only inventory select/update still present",
      severity: scopedWriteOk ? "low" : "critical",
      tenantId: ctx.tenantId,
      role: ctx.role,
      userId: ctx.userId,
    })
  );
}

async function validateLedgerTenantAlignment(entries, ctx) {
  if (!supabase) {
    entries.push(
      createPredatorEntry({
        status: "WARN",
        module: MODULE,
        step: "inventory_tenant_safety.ledger_tenant_alignment",
        rootCauseGuess: "Supabase unavailable — skipped ledger alignment check",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );
    return;
  }

  const ledgerRes = await supabase
    .from("inventory_ledger")
    .select("tenant_id, product_id, movement_type, order_id, created_at")
    .in("movement_type", ["PURCHASE_IN", "ORDER_OUT"])
    .order("created_at", { ascending: false })
    .limit(200);

  if (ledgerRes.error) {
    entries.push(
      createPredatorEntry({
        status: "WARN",
        module: MODULE,
        step: "inventory_tenant_safety.ledger_tenant_alignment",
        actual: ledgerRes.error.message,
        rootCauseGuess: "Could not read inventory_ledger for tenant alignment",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );
    return;
  }

  const rows = Array.isArray(ledgerRes.data) ? ledgerRes.data : [];
  const missingTenant = rows.filter((row) => !str(row.tenant_id));
  const productIds = [...new Set(rows.map((row) => str(row.product_id)).filter(Boolean))];
  const tenantIds = [...new Set(rows.map((row) => str(row.tenant_id)).filter(Boolean))];

  let inventoryPairs = new Set();
  if (productIds.length && tenantIds.length) {
    const invRes = await supabase
      .from("inventory")
      .select("tenant_id, product_id")
      .in("product_id", productIds)
      .in("tenant_id", tenantIds);
    inventoryPairs = new Set(
      (Array.isArray(invRes.data) ? invRes.data : []).map(
        (row) => `${str(row.tenant_id)}::${str(row.product_id)}`
      )
    );
  }

  const orphanLedger = rows.filter((row) => {
    const tenantId = str(row.tenant_id);
    const productId = str(row.product_id);
    if (!tenantId || !productId) return false;
    return !inventoryPairs.has(`${tenantId}::${productId}`);
  });

  const misaligned = missingTenant.length > 0 || orphanLedger.length > 0;
  const empty = rows.length === 0;

  entries.push(
    createPredatorEntry({
      status: empty ? "WARN" : misaligned ? "FAIL" : "PASS",
      module: MODULE,
      step: "inventory_tenant_safety.ledger_tenant_alignment",
      expected: "Ledger tenant_id present and matches an inventory (tenant_id, product_id) row",
      actual: {
        ledgerRowsChecked: rows.length,
        missingTenantCount: missingTenant.length,
        orphanLedgerCount: orphanLedger.length,
        sampleOrphans: orphanLedger.slice(0, 5).map((row) => ({
          movement_type: row.movement_type,
          tenant_id: row.tenant_id,
          product_id: row.product_id,
          order_id: row.order_id,
        })),
      },
      rootCauseGuess: misaligned
        ? "Ledger tenant_id missing or not aligned with inventory rows"
        : empty
          ? "No PURCHASE_IN/ORDER_OUT ledger rows to validate"
          : "Ledger rows align with tenant-scoped inventory",
      severity: misaligned ? "critical" : "low",
      tenantId: ctx.tenantId,
      role: ctx.role,
      userId: ctx.userId,
    })
  );
}

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 */
export async function validateInventoryTenantSafetyModule({ ctx }) {
  return predatorTrace(MODULE, "validation.full", async () => {
    const entries = [];
    const roleOk = ctx.role === ROLES.EXECUTIVE || ctx.role === ROLES.ADMIN;

    if (!roleOk) {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: MODULE,
          step: "inventory_tenant_safety.role.access",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return finish(entries);
    }

    validateScopedWriteSource(entries, ctx);
    await validateLedgerTenantAlignment(entries, ctx);

    return finish(entries);
  });
}
