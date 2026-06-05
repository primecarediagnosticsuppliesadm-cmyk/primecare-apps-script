import { getLabRecentOrdersRead } from "@/api/primecareSupabaseApi.js";
import { supabase } from "@/api/supabaseClient.js";
import { getMenuForRole } from "@/config/menuConfig.js";
import { ROLES } from "@/config/roles.js";
import { readDistributorLabContext } from "@/tenant/tenantFoundationStore.js";
import { labIdKey } from "@/utils/labId.js";
import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { predatorTrace } from "@/predator/predatorTiming.js";

function str(v) {
  return String(v ?? "").trim();
}

const LAB_MENU_KEYS = new Set(["labOrders", "labAccount", "notifications"]);
const FORBIDDEN_LAB_MENU_KEYS = new Set([
  "collections",
  "dashboard",
  "visits",
  "labs",
  "orders",
  "inventory",
  "risk",
  "purchase",
  "qualificationReview",
  "predatorDebug",
]);

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 * @param {object|null} [params.rendered]
 */
async function validateExecutiveLabsRegistry(ctx, entries, rendered = null) {
  if (ctx.role !== ROLES.EXECUTIVE && ctx.role !== ROLES.ADMIN) {
    return;
  }

  if (!supabase) {
    entries.push(
      createPredatorEntry({
        status: "WARN",
        module: "Lab Portal",
        step: "labs.supabase",
        rootCauseGuess: "Supabase client unavailable for lab registry checks",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );
    return;
  }

  const labsRes = await supabase
    .from("labs")
    .select("tenant_id, lab_id, lab_name")
    .limit(500);
  const labs = Array.isArray(labsRes.data) ? labsRes.data : [];
  const missingTenant = labs.filter((row) => !String(row.tenant_id || "").trim());

  entries.push(
    createPredatorEntry({
      status: missingTenant.length === 0 ? "PASS" : "FAIL",
      module: "Lab Portal",
      step: "labs.tenant_scoped",
      expected: "Every lab row has tenant_id",
      actual: {
        labCount: labs.length,
        missingTenantCount: missingTenant.length,
      },
      rootCauseGuess:
        missingTenant.length > 0
          ? "Orphan lab rows without tenant_id"
          : "Labs are tenant-scoped",
      suggestedFix:
        missingTenant.length > 0
          ? "Backfill tenant_id on labs or delete orphan rows"
          : "",
      severity: missingTenant.length > 0 ? "critical" : "low",
      tenantId: ctx.tenantId,
      role: ctx.role,
      userId: ctx.userId,
    })
  );

  const arRes = await supabase
    .from("ar_credit_control")
    .select("tenant_id, lab_id")
    .limit(500);
  const arRows = Array.isArray(arRes.data) ? arRes.data : [];
  const labKeys = new Set(
    labs.map((row) => `${String(row.tenant_id || "").trim()}:${labIdKey(row.lab_id)}`)
  );
  const arWithoutLab = arRows.filter((row) => {
    const key = `${String(row.tenant_id || "").trim()}:${labIdKey(row.lab_id)}`;
    return labIdKey(row.lab_id) && !labKeys.has(key);
  });

  entries.push(
    createPredatorEntry({
      status: arWithoutLab.length === 0 ? "PASS" : "FAIL",
      module: "Lab Portal",
      step: "labs.no_orphan_ar",
      expected: "Every AR row maps to a labs row",
      actual: { arCount: arRows.length, orphanArCount: arWithoutLab.length },
      rootCauseGuess:
        arWithoutLab.length > 0
          ? "AR credit rows reference missing labs"
          : "AR rows align with labs registry",
      suggestedFix:
        arWithoutLab.length > 0
          ? "Create matching labs row or remove orphan AR entries"
          : "",
      severity: arWithoutLab.length > 0 ? "high" : "low",
      tenantId: ctx.tenantId,
      role: ctx.role,
      userId: ctx.userId,
    })
  );

  const arKeys = new Set(
    arRows.map((row) => `${String(row.tenant_id || "").trim()}:${labIdKey(row.lab_id)}`)
  );
  const labsWithoutAr = labs.filter((row) => {
    const key = `${String(row.tenant_id || "").trim()}:${labIdKey(row.lab_id)}`;
    return labIdKey(row.lab_id) && !arKeys.has(key);
  });

  entries.push(
    createPredatorEntry({
      status: labsWithoutAr.length === 0 ? "PASS" : "WARN",
      module: "Lab Portal",
      step: "labs.no_orphan",
      expected: "Every lab has an AR credit row",
      actual: { labsWithoutAr: labsWithoutAr.length },
      rootCauseGuess:
        labsWithoutAr.length > 0
          ? "Labs missing AR credit_control rows"
          : "Labs paired with AR credit rows",
      suggestedFix:
        labsWithoutAr.length > 0
          ? "Use Add Lab flow or backfill ar_credit_control for orphan labs"
          : "",
      severity: labsWithoutAr.length > 0 ? "medium" : "low",
      tenantId: ctx.tenantId,
      role: ctx.role,
      userId: ctx.userId,
    })
  );

  const arTenantMismatch = arRows.filter((ar) => {
    const match = labs.find(
      (lab) =>
        labIdKey(lab.lab_id) === labIdKey(ar.lab_id) &&
        str(lab.tenant_id) === str(ar.tenant_id)
    );
    return labIdKey(ar.lab_id) && !match;
  });

  entries.push(
    createPredatorEntry({
      status: arTenantMismatch.length === 0 ? "PASS" : "FAIL",
      module: "Lab Portal",
      step: "ar_credit_control.same_tenant_as_lab",
      expected: "AR credit_control.tenant_id matches labs.tenant_id per lab_id",
      actual: { mismatchCount: arTenantMismatch.length },
      rootCauseGuess:
        arTenantMismatch.length > 0
          ? "AR row tenant_id diverges from labs row"
          : "AR and labs share tenant_id",
      severity: arTenantMismatch.length > 0 ? "critical" : "low",
      tenantId: ctx.tenantId,
      role: ctx.role,
      userId: ctx.userId,
    })
  );

  const labCtx = readDistributorLabContext();
  const homeTenantId = str(rendered?.homeTenantId || labCtx?.homeTenantId || ctx.tenantId);
  const selectedDistributorTenantId = str(
    rendered?.selectedDistributorTenantId || labCtx?.tenantId
  );
  const lastCreatedLabName = str(rendered?.lastCreatedLabName);
  const lastCreatedTenantId = str(rendered?.lastCreatedTenantId);

  if (ctx.role === ROLES.EXECUTIVE && selectedDistributorTenantId && homeTenantId) {
    let canInsert = false;
    let rpcError = null;
    try {
      const rpc = await supabase.rpc("can_insert_lab_for_tenant", {
        target_tenant_id: selectedDistributorTenantId,
      });
      if (rpc.error) {
        rpcError = rpc.error.message;
      } else {
        canInsert = rpc.data === true;
      }
    } catch (err) {
      rpcError = err?.message || String(err);
    }

    entries.push(
      createPredatorEntry({
        status: canInsert ? "PASS" : rpcError ? "FAIL" : "WARN",
        module: "Lab Portal",
        step: "executive_can_create_lab_for_distributor",
        expected: "Executive can INSERT labs for registered distributor tenant",
        actual: {
          selectedDistributorTenantId,
          canInsert,
          rpcError: rpcError || null,
        },
        rootCauseGuess: canInsert
          ? "RLS helper can_insert_lab_for_tenant allows distributor lab create"
          : rpcError
            ? "Run executive_distributor_lab_create_migration.sql — RLS blocks distributor lab insert"
            : "Executive cannot insert lab for selected distributor (check tenants row + role)",
        suggestedFix: canInsert
          ? ""
          : "Apply supabase/sql/executive_distributor_lab_create_migration.sql",
        severity: canInsert ? "low" : "critical",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );
  }

  if (lastCreatedTenantId && selectedDistributorTenantId) {
    const tenantMatch = lastCreatedTenantId === selectedDistributorTenantId;
    entries.push(
      createPredatorEntry({
        status: tenantMatch ? "PASS" : "FAIL",
        module: "Lab Portal",
        step: "lab_tenant_id_matches_selected_distributor",
        expected: "labs.tenant_id equals selected distributor tenant",
        actual: {
          selectedDistributorTenantId,
          lastCreatedTenantId,
          lastCreatedLabName: lastCreatedLabName || null,
        },
        rootCauseGuess: tenantMatch
          ? "Lab tenant_id matches distributor context"
          : "Lab created with wrong tenant_id vs selected distributor",
        severity: tenantMatch ? "low" : "critical",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );
  }

  if (selectedDistributorTenantId && homeTenantId && selectedDistributorTenantId !== homeTenantId) {
    const leakedToHome =
      lastCreatedTenantId === homeTenantId ||
      (lastCreatedLabName &&
        labs.some(
          (lab) =>
            str(lab.lab_name) === lastCreatedLabName &&
            str(lab.tenant_id) === homeTenantId
        ));

    entries.push(
      createPredatorEntry({
        status: leakedToHome ? "FAIL" : "PASS",
        module: "Lab Portal",
        step: "labs.no_home_tenant_leakage",
        expected: "Distributor-context lab create must not use home tenant_id",
        actual: {
          selectedDistributorTenantId,
          homeTenantId,
          lastCreatedTenantId: lastCreatedTenantId || null,
          lastCreatedLabName: lastCreatedLabName || null,
        },
        rootCauseGuess: leakedToHome
          ? "Lab created under PrimeCare HQ instead of selected distributor"
          : "No HQ tenant leakage detected for distributor lab context",
        severity: leakedToHome ? "critical" : "low",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (lastCreatedLabName || lastCreatedTenantId) {
      const createdUnderSelected =
        lastCreatedTenantId === selectedDistributorTenantId ||
        labs.some(
          (lab) =>
            str(lab.lab_name) === lastCreatedLabName &&
            str(lab.tenant_id) === selectedDistributorTenantId
        );

      entries.push(
        createPredatorEntry({
          status: createdUnderSelected ? "PASS" : "FAIL",
          module: "Lab Portal",
          step: "labs.created_under_selected_distributor",
          expected: "New lab tenant_id equals selected distributor tenant",
          actual: {
            selectedDistributorTenantId,
            lastCreatedTenantId: lastCreatedTenantId || null,
            lastCreatedLabName: lastCreatedLabName || null,
          },
          rootCauseGuess: createdUnderSelected
            ? "Lab created under selected distributor tenant"
            : "Lab tenant_id does not match selected distributor",
          severity: createdUnderSelected ? "low" : "critical",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }
  }
}

export async function validateLabPortalModule({ ctx, rendered = null }) {
  return predatorTrace("Lab Portal", "validation.full", async () => {
    const entries = [];

    await validateExecutiveLabsRegistry(ctx, entries, rendered);

    if (ctx.role !== ROLES.LAB) {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Lab Portal",
          step: "role.skip",
          rootCauseGuess: "Lab portal checks apply to lab role only",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
      return { module: "Lab Portal", summary: summarizePredatorEntries(entries), entries };
    }

    const menu = getMenuForRole(ROLES.LAB).map((item) => item.key);
    const forbiddenVisible = menu.filter((key) => FORBIDDEN_LAB_MENU_KEYS.has(key));
    const missingRequired = ["labOrders", "labAccount"].filter((key) => !menu.includes(key));

    entries.push(
      createPredatorEntry({
        status:
          forbiddenVisible.length === 0 && missingRequired.length === 0 ? "PASS" : "FAIL",
        module: "Lab Portal",
        step: "menu.lab_safe",
        expected: Array.from(LAB_MENU_KEYS),
        actual: { menu, forbiddenVisible, missingRequired },
        rootCauseGuess:
          forbiddenVisible.length > 0
            ? "Lab sidebar exposes admin/agent pages"
            : missingRequired.length > 0
              ? "Lab sidebar missing core lab pages"
              : "Lab menu is lab-safe",
        suggestedFix:
          forbiddenVisible.length > 0
            ? "Restrict getMenuForRole(lab) to labOrders, labAccount, notifications"
            : "Grant labAccount and labOrders in PERMISSIONS for LAB",
        severity: forbiddenVisible.length > 0 ? "high" : "medium",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const profileLabId = labIdKey(ctx.labId || rendered?.labId);
    entries.push(
      createPredatorEntry({
        status: profileLabId ? "PASS" : "WARN",
        module: "Lab Portal",
        step: "profile.lab_id",
        expected: "non-empty labId on profile",
        actual: { labId: profileLabId || null },
        rootCauseGuess: profileLabId
          ? "Lab identity present for RLS scoping"
          : "Lab user missing labId — ordering and account scope may fail",
        suggestedFix: profileLabId
          ? ""
          : "Set lab_id on profiles row for this lab user",
        severity: profileLabId ? "low" : "medium",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    if (rendered) {
      const recentCount = Number(rendered.recentOrdersCount ?? 0);
      const crossLabOrders = Number(rendered.crossLabOrderCount ?? 0);
      const cartLineCount = Number(rendered.cartLineCount ?? 0);
      const cartQtyCount = Number(rendered.cartQtyCount ?? 0);
      const cartSubTotal = Number(rendered.cartSubTotal ?? 0);
      const cartDrawerOpen = Boolean(rendered.cartDrawerOpen);
      const canCheckout = Boolean(rendered.canCheckout);
      const submitLocked = Boolean(rendered.submitLocked);
      const submitSuccess = Boolean(rendered.submitSuccess);
      const productQtyInSync = rendered.productQtyInSync !== false;
      entries.push(
        createPredatorEntry({
          status: crossLabOrders > 0 ? "FAIL" : "PASS",
          module: "Lab Portal",
          step: "ordering.own_lab_orders",
          expected: "0 orders from other labs in UI list",
          actual: { recentOrdersCount: recentCount, crossLabOrderCount: crossLabOrders },
          rootCauseGuess:
            crossLabOrders > 0
              ? "Lab ordering page shows another lab's orders"
              : "Recent orders list is lab-scoped in UI",
          suggestedFix:
            crossLabOrders > 0
              ? "Filter getLabRecentOrdersRead results by profile labId in LabOrderingPage"
              : "",
          severity: crossLabOrders > 0 ? "critical" : "low",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      entries.push(
        createPredatorEntry({
          status: productQtyInSync ? "PASS" : "FAIL",
          module: "Lab Portal",
          step: "cart.product_qty_sync",
          expected: "Product qty steppers mirror cart quantities for items in cart",
          actual: { productQtyInSync, cartLineCount, cartQtyCount },
          rootCauseGuess: productQtyInSync
            ? "Product qty state stays synchronized with cart lines"
            : "Product qty state diverged from cart quantities",
          suggestedFix: productQtyInSync
            ? ""
            : "Update productQty whenever cart quantities mutate or cart resets",
          severity: productQtyInSync ? "low" : "high",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      entries.push(
        createPredatorEntry({
          status: !submitLocked || !canCheckout ? "PASS" : "FAIL",
          module: "Lab Portal",
          step: "checkout.duplicate_submit_guard",
          expected: "Checkout disabled when submit lock active",
          actual: { submitLocked, canCheckout },
          rootCauseGuess:
            !submitLocked || !canCheckout
              ? "Submit lock and button disable states are coherent"
              : "Checkout may still be clickable while submit lock is active",
          suggestedFix:
            !submitLocked || !canCheckout
              ? ""
              : "Drive checkout disabled state from submit lock and submitting flags",
          severity: !submitLocked || !canCheckout ? "low" : "high",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      entries.push(
        createPredatorEntry({
          status: !submitSuccess || (cartLineCount === 0 && cartQtyCount === 0 && cartSubTotal === 0)
            ? "PASS"
            : "FAIL",
          module: "Lab Portal",
          step: "checkout.success_cart_reset",
          expected: "After successful submit, cart lines/qty/subtotal reset to zero",
          actual: { submitSuccess, cartLineCount, cartQtyCount, cartSubTotal, cartDrawerOpen },
          rootCauseGuess:
            !submitSuccess || (cartLineCount === 0 && cartQtyCount === 0 && cartSubTotal === 0)
              ? "Successful checkout clears cart UI state"
              : "Cart state remains stale after successful checkout",
          suggestedFix:
            !submitSuccess || (cartLineCount === 0 && cartQtyCount === 0 && cartSubTotal === 0)
              ? ""
              : "Use a single post-submit success handler to clear cart, qty, and drawer state",
          severity:
            !submitSuccess || (cartLineCount === 0 && cartQtyCount === 0 && cartSubTotal === 0)
              ? "low"
              : "critical",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      entries.push(
        createPredatorEntry({
          status: rendered.isLabAccountView ? "PASS" : "FAIL",
          module: "Lab Portal",
          step: "account.payments_view",
          expected: "Payments & Account read-only view",
          actual: { isLabAccountView: rendered.isLabAccountView },
          rootCauseGuess: rendered.isLabAccountView
            ? "Lab account page mode active"
            : "Lab user may see collections management UI",
          suggestedFix: "Open labAccount route with viewMode=labAccount",
          severity: rendered.isLabAccountView ? "low" : "high",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      entries.push(
        createPredatorEntry({
          status:
            cartLineCount === 0 || cartQtyCount >= cartLineCount
              ? "PASS"
              : "FAIL",
          module: "Lab Portal",
          step: "cart.count_consistency",
          expected: "cart quantity total >= cart line count",
          actual: { cartLineCount, cartQtyCount },
          rootCauseGuess:
            cartLineCount === 0 || cartQtyCount >= cartLineCount
              ? "Cart counters are internally consistent"
              : "Cart count snapshot mismatch in UI state",
          suggestedFix:
            cartLineCount === 0 || cartQtyCount >= cartLineCount
              ? ""
              : "Sync cart count badges with cart item quantity reducer",
          severity: cartLineCount === 0 || cartQtyCount >= cartLineCount ? "low" : "high",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Lab Portal",
          step: "cart.drawer_state",
          expected: "Drawer can toggle without data loss",
          actual: { cartDrawerOpen },
          rootCauseGuess: "Observed cart drawer state snapshot captured",
          suggestedFix: "If unstable, test open/close while editing quantities",
          severity: "low",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: "Lab Portal",
          step: "order_tracking.drawer_state",
          expected: "Order tracking drawer can open without breaking list counts",
          actual: {
            trackingDrawerOpen: Boolean(rendered.trackingDrawerOpen),
            recentOrdersCount: rendered.recentOrdersCount,
          },
          rootCauseGuess: "Order tracking drawer snapshot captured for lab ordering",
          suggestedFix: "Verify drawer uses getOrderDetailsRead with lab scope",
          severity: "low",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    if (supabase && profileLabId) {
      const ordersRes = await getLabRecentOrdersRead(profileLabId);
      const orders = Array.isArray(ordersRes?.data?.orders) ? ordersRes.data.orders : [];
      const crossLab = orders.filter((o) => {
        const rowLab = labIdKey(o.labId || o.lab_id);
        return rowLab && rowLab !== profileLabId;
      });

      entries.push(
        createPredatorEntry({
          status: crossLab.length > 0 ? "FAIL" : "PASS",
          module: "Lab Portal",
          step: "ordering.api_lab_scope",
          expected: "All recent orders match profile labId",
          actual: { orderCount: orders.length, crossLabCount: crossLab.length },
          rootCauseGuess:
            crossLab.length > 0
              ? "API returned orders for another lab"
              : "getLabRecentOrdersRead is lab-scoped",
          suggestedFix:
            crossLab.length > 0 ? "Verify orders RLS for lab role" : "",
          severity: crossLab.length > 0 ? "critical" : "low",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      const directRes = await supabase
        .from("orders")
        .select("tenant_id, lab_id")
        .limit(25);
      if (!directRes.error && Array.isArray(directRes.data)) {
        const unauthorized = directRes.data.filter(
          (r) => labIdKey(r.lab_id) && labIdKey(r.lab_id) !== profileLabId
        );
        entries.push(
          createPredatorEntry({
            status: unauthorized.length > 0 ? "FAIL" : "PASS",
            module: "Lab Portal",
            step: "orders.rls_own_lab",
            expected: "No other-lab order rows visible to lab JWT",
            actual: {
              visibleCount: directRes.data.length,
              unauthorizedCount: unauthorized.length,
            },
            rootCauseGuess:
              unauthorized.length > 0
                ? "RLS allows cross-lab order reads"
                : "Orders table RLS scopes lab to own lab_id",
            suggestedFix:
              unauthorized.length > 0
                ? "Review orders RLS policies (do not weaken other roles)"
                : "",
            severity: unauthorized.length > 0 ? "critical" : "low",
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
          })
        );
      }
    }

    return { module: "Lab Portal", summary: summarizePredatorEntries(entries), entries };
  });
}
