import { createPredatorEntry, summarizePredatorEntries } from "@/predator/predatorSchema.js";
import { checkTenantConsistency, resolveExecutiveRegisteredTenantIds, executiveCrossTenantOpts, executiveForeignTenantsAllowed } from "@/predator/predatorChecks.js";
import { predatorTrace } from "@/predator/predatorTiming.js";
import { polishPredatorEntries } from "@/predator/predatorEntryPolish.js";
import { supabase } from "@/api/supabaseClient.js";
import { getMenuForRole } from "@/config/menuConfig.js";
import { getUserProvisioningEventsRead } from "@/api/userProvisioningApi.js";
import { validateProvisioningEventPayload } from "@/operations/userProvisioningEngine.js";
import {
  ALL_ROLE_SLUGS,
  ROLES,
  PROVISION_RULES_BY_ACTOR,
  UNAUTHORIZED_MENU_PAGES_BY_ROLE,
  REQUIRED_MENU_PAGES_BY_ROLE,
  canActorProvisionRole,
  isLoginEnabledRole,
  roleHasPermission,
} from "@/config/rolePermissionMatrix.js";

const MODULE = "User Provisioning";

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

/**
 * @param {Object} params
 * @param {import('@/predator/predatorSchema.js').PredatorTenantContext} params.ctx
 * @param {object|null} [params.currentUser]
 */
export async function validateUserProvisioningModule({ ctx, currentUser = null }) {
  return predatorTrace(MODULE, "validation.full", async () => {
    const entries = [];

    const missingRoles = ALL_ROLE_SLUGS.filter((slug) => !isLoginEnabledRole(slug));
    entries.push(
      createPredatorEntry({
        status: missingRoles.length === 0 ? "PASS" : "FAIL",
        module: MODULE,
        step: "role.matrix.complete",
        expected: "All seven platform roles defined and login-enabled",
        actual: { allRoles: ALL_ROLE_SLUGS, missingLogin: missingRoles },
        rootCauseGuess:
          missingRoles.length === 0
            ? "Role matrix includes all V1 roles"
            : `Missing login-enabled roles: ${missingRoles.join(", ")}`,
        suggestedFix: missingRoles.length ? "Extend LOGIN_ENABLED_ROLES in rolePermissionMatrix.js" : undefined,
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const adminCanProvisionExecutive = canActorProvisionRole(ROLES.ADMIN, ROLES.EXECUTIVE);
    const execCanProvisionExecutive = canActorProvisionRole(ROLES.EXECUTIVE, ROLES.EXECUTIVE);
    entries.push(
      createPredatorEntry({
        status: !adminCanProvisionExecutive && execCanProvisionExecutive ? "PASS" : "FAIL",
        module: MODULE,
        step: "role.boundary.hq_admin_cannot_provision_executive",
        expected: "HQ Admin cannot provision Executive; Executive can provision Executive",
        actual: {
          adminToExecutive: adminCanProvisionExecutive,
          executiveToExecutive: execCanProvisionExecutive,
        },
        suggestedFix: "Align PROVISION_RULES_BY_ACTOR.admin in rolePermissionMatrix.js",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const distAdminCanAgent = canActorProvisionRole(ROLES.DISTRIBUTOR_ADMIN, ROLES.AGENT);
    const distAdminCannotHqAdmin = !canActorProvisionRole(ROLES.DISTRIBUTOR_ADMIN, ROLES.ADMIN);
    entries.push(
      createPredatorEntry({
        status: distAdminCanAgent && distAdminCannotHqAdmin ? "PASS" : "FAIL",
        module: MODULE,
        step: "role.boundary.distributor_admin_scope",
        expected: "Distributor Admin may provision Agent/Manager only — not HQ Admin",
        actual: {
          canProvisionAgent: distAdminCanAgent,
          blockedHqAdmin: distAdminCannotHqAdmin,
          rules: PROVISION_RULES_BY_ACTOR[ROLES.DISTRIBUTOR_ADMIN],
        },
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
      })
    );

    const actorRole = normalizeCtxRole(ctx.role);
    if (actorRole && REQUIRED_MENU_PAGES_BY_ROLE[actorRole]) {
      const menu = getMenuForRole(actorRole).map((item) => item.key);
      const required = REQUIRED_MENU_PAGES_BY_ROLE[actorRole];
      const missingRequired = required.filter((key) => !menu.includes(key));
      const forbidden = UNAUTHORIZED_MENU_PAGES_BY_ROLE[actorRole] || [];
      const forbiddenVisible = menu.filter((key) => forbidden.includes(key));

      entries.push(
        createPredatorEntry({
          status: missingRequired.length === 0 && forbiddenVisible.length === 0 ? "PASS" : "FAIL",
          module: MODULE,
          step: "menu.visibility",
          expected: { required, forbiddenHidden: forbidden },
          actual: { role: actorRole, menu, missingRequired, forbiddenVisible },
          rootCauseGuess:
            forbiddenVisible.length > 0
              ? "Sidebar exposes unauthorized pages for role"
              : missingRequired.length > 0
                ? "Sidebar missing required pages for role"
                : "Menu visibility matches role matrix",
          suggestedFix:
            forbiddenVisible.length > 0 || missingRequired.length > 0
              ? "Update PERMISSION_BY_KEY and menu allowlists in rolePermissionMatrix.js / menuConfig.js"
              : undefined,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    } else {
      entries.push(
        createPredatorEntry({
          status: "INFO",
          module: MODULE,
          step: "menu.visibility",
          rootCauseGuess: "Menu visibility check skipped — no required menu map for active role",
          actual: { role: actorRole || ctx.role },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    if (actorRole === ROLES.READ_ONLY_AUDITOR) {
      const writePages = ["operationsCenter", "purchase", "predatorDebug", "visits"];
      const unauthorizedAccess = writePages.filter((key) => roleHasPermission(actorRole, key));
      const shouldBeViewOnly = !unauthorizedAccess.includes("predatorDebug") &&
        !unauthorizedAccess.includes("visits") &&
        !unauthorizedAccess.includes("purchase");
      entries.push(
        createPredatorEntry({
          status: shouldBeViewOnly ? "PASS" : "FAIL",
          module: MODULE,
          step: "menu.unauthorized_access",
          expected: "Read Only Auditor has no agent/HQ write or debug pages",
          actual: { unauthorizedAccess },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    } else if (
      actorRole === ROLES.DISTRIBUTOR_MANAGER ||
      actorRole === ROLES.DISTRIBUTOR_ADMIN
    ) {
      const blocked = ["founderNavigation", "tenantManagement", "commissionEngine", "predatorDebug"];
      const leaked = blocked.filter((key) => roleHasPermission(actorRole, key));
      entries.push(
        createPredatorEntry({
          status: leaked.length === 0 ? "PASS" : "FAIL",
          module: MODULE,
          step: "menu.unauthorized_access",
          expected: "Distributor roles cannot access founder/HQ system pages",
          actual: { role: actorRole, leaked },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    } else {
      entries.push(
        createPredatorEntry({
          status: "PASS",
          module: MODULE,
          step: "menu.unauthorized_access",
          rootCauseGuess: "Unauthorized menu probe applies to distributor and auditor roles",
          actual: { role: actorRole || ctx.role, skipped: true },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    const tenantPresent = Boolean(str(ctx.tenantId));
    entries.push(
      createPredatorEntry({
        status: tenantPresent ? "PASS" : "FAIL",
        module: MODULE,
        step: "tenant.isolation.ctx_tenant",
        expected: "Active Predator context carries tenant_id from profile",
        actual: { tenantId: ctx.tenantId || null, userId: ctx.userId || null },
        suggestedFix: tenantPresent ? undefined : "Verify profile.tenant_id on login bootstrap",
        tenantId: ctx.tenantId,
        role: ctx.role,
        userId: ctx.userId,
        issueClass: tenantPresent ? undefined : "tenant_isolation",
      })
    );

    if (!supabase) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: MODULE,
          step: "tenant.isolation.probe_profiles",
          rootCauseGuess: "Supabase client unavailable — skip live profile tenant probe",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    if (!tenantPresent) {
      entries.push(
        createPredatorEntry({
          status: "WARN",
          module: MODULE,
          step: "tenant.isolation.probe_profiles",
          rootCauseGuess: "No tenant on context — cannot probe profile row isolation",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    } else if (supabase) {
      const profileRes = await supabase
        .from("profiles")
        .select("user_id, tenant_id, role")
        .limit(25);

      if (profileRes.error) {
        entries.push(
          createPredatorEntry({
            status: /relation.*does not exist/i.test(profileRes.error.message || "")
              ? "WARN"
              : "FAIL",
            module: MODULE,
            step: "tenant.isolation.probe_profiles",
            actual: { error: profileRes.error.message },
            rootCauseGuess: "Profile read probe failed — verify RLS and schema",
            suggestedFix: "Apply user provisioning migrations; confirm authenticated session",
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
            issueClass: "tenant_isolation",
          })
        );
      } else {
        const rows = Array.isArray(profileRes.data) ? profileRes.data : [];
        const registeredTenantIds = await resolveExecutiveRegisteredTenantIds(ctx);
        entries.push(
          ...checkTenantConsistency({
            module: MODULE,
            step: "tenant.isolation.probe_profiles",
            ctx,
            profileTenantId: ctx.tenantId,
            rowTenantIds: rows.map((r) => r.tenant_id).filter(Boolean),
            ...executiveCrossTenantOpts(ctx, registeredTenantIds),
          })
        );
      }

      if (currentUser?.userId || ctx.userId) {
        const subjectId = str(currentUser?.userId || ctx.userId);
        const crossTenantId = "00000000-0000-0000-0000-000000000099";
        const crossRes = await supabase
          .from("profiles")
          .select("user_id")
          .eq("tenant_id", crossTenantId)
          .eq("user_id", subjectId)
          .maybeSingle();

        const crossLeak = Boolean(crossRes.data?.user_id);
        entries.push(
          createPredatorEntry({
            status: crossRes.error ? "WARN" : crossLeak ? "FAIL" : "PASS",
            module: MODULE,
            step: "tenant.isolation.cross_tenant_read",
            expected: "Subject profile not readable under foreign tenant_id",
            actual: {
              crossTenantId,
              subjectId,
              leaked: crossLeak,
              error: crossRes.error?.message || null,
            },
            suggestedFix: crossLeak
              ? "Tighten profiles RLS tenant_id_matches predicate"
              : undefined,
            tenantId: ctx.tenantId,
            role: ctx.role,
            userId: ctx.userId,
            issueClass: "tenant_isolation",
          })
        );
      }
    }

    if (str(ctx.tenantId) && supabase) {
      const auditRes = await getUserProvisioningEventsRead({
        tenantId: ctx.tenantId,
        limit: 150,
      });
      const events = Array.isArray(auditRes?.data?.events) ? auditRes.data.events : [];

      const createdEvents = events.filter((e) => str(e.event_type).toLowerCase() === "created");
      entries.push(
        createPredatorEntry({
          status:
            auditRes.error
              ? "WARN"
              : createdEvents.length > 0 || events.length === 0
                ? "PASS"
                : "WARN",
          module: MODULE,
          step: "audit.event_created",
          expected: "At least one created event when provisioning history exists",
          actual: {
            totalEvents: events.length,
            createdCount: createdEvents.length,
            loadError: auditRes.error || null,
          },
          suggestedFix:
            createdEvents.length === 0 && events.length > 0
              ? "Provision a user or verify user_provisioning_events inserts on create"
              : auditRes.error
                ? "Apply user_provisioning_phase3b_migration.sql"
                : undefined,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      const roleEvents = events.filter((e) => str(e.event_type).toLowerCase() === "role_changed");
      const roleValidations = roleEvents.map((e) =>
        validateProvisioningEventPayload("role_changed", e.payload)
      );
      const roleInvalid = roleValidations.filter((r) => !r.valid);
      entries.push(
        createPredatorEntry({
          status: auditRes.error
            ? "WARN"
            : roleEvents.length === 0
              ? "INFO"
              : roleInvalid.length === 0
                ? "PASS"
                : "FAIL",
          module: MODULE,
          step: "audit.role_change",
          expected: "role_changed payloads include previous.role and next.role",
          actual: {
            roleEventCount: roleEvents.length,
            invalid: roleInvalid,
          },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      const passwordEvents = events.filter(
        (e) => str(e.event_type).toLowerCase() === "password_reset"
      );
      const passwordValidations = passwordEvents.map((e) =>
        validateProvisioningEventPayload("password_reset", e.payload)
      );
      const passwordInvalid = passwordValidations.filter((r) => !r.valid && !r.legacy);
      entries.push(
        createPredatorEntry({
          status: auditRes.error
            ? "WARN"
            : passwordEvents.length === 0
              ? "INFO"
              : passwordInvalid.length === 0
                ? "PASS"
                : "FAIL",
          module: MODULE,
          step: "audit.password_reset",
          expected: "password_reset payloads include method metadata",
          actual: {
            passwordResetCount: passwordEvents.length,
            invalid: passwordInvalid,
          },
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );

      const shapeResults = events.map((e) => ({
        id: e.id,
        eventType: e.event_type,
        ...validateProvisioningEventPayload(e.event_type, e.payload),
      }));
      const shapeFailures = shapeResults.filter((r) => !r.valid && !r.legacy);
      entries.push(
        createPredatorEntry({
          status: auditRes.error
            ? "WARN"
            : events.length === 0
              ? "INFO"
              : shapeFailures.length === 0
                ? "PASS"
                : shapeFailures.length <= 2
                  ? "WARN"
                  : "FAIL",
          module: MODULE,
          step: "audit.payload_shape",
          expected: "Provisioning audit payloads match Phase 3B schema rules",
          actual: {
            checked: shapeResults.length,
            failures: shapeFailures.slice(0, 8),
          },
          suggestedFix:
            shapeFailures.length > 0
              ? "Use buildProvisioningAuditPayload for new writes; backfill legacy events optional"
              : undefined,
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    } else {
      entries.push(
        createPredatorEntry({
          status: "INFO",
          module: MODULE,
          step: "audit.payload_shape",
          rootCauseGuess: "Audit validation skipped — tenant or Supabase unavailable",
          tenantId: ctx.tenantId,
          role: ctx.role,
          userId: ctx.userId,
        })
      );
    }

    return finish(entries);
  });
}

function normalizeCtxRole(role) {
  const r = str(role).toLowerCase();
  return ALL_ROLE_SLUGS.includes(r) ? r : "";
}
