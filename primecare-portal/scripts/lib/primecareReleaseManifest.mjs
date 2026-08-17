/**
 * Canonical PrimeCare Supabase project identity (no secrets).
 */
export const PRIMECARE_SUPABASE_PROJECTS = Object.freeze({
  qa: {
    env: "QA",
    projectRef: "zipuzmfkwwucbchlphcj",
    label: "PrimeCare QA",
  },
  prod: {
    env: "PRODUCTION",
    projectRef: "alxhrnotnvwpblsiadxj",
    label: "PrimeCare Production",
  },
});

export const PRIMECARE_PROJECT_REF_BY_ENV = Object.freeze({
  qa: PRIMECARE_SUPABASE_PROJECTS.qa.projectRef,
  prod: PRIMECARE_SUPABASE_PROJECTS.prod.projectRef,
  production: PRIMECARE_SUPABASE_PROJECTS.prod.projectRef,
});

export function resolveKnownEnv(projectRef) {
  const ref = String(projectRef || "").trim();
  for (const entry of Object.values(PRIMECARE_SUPABASE_PROJECTS)) {
    if (entry.projectRef === ref) return entry;
  }
  return null;
}

export function formatEnvBanner(entry) {
  const env = entry?.env || "UNKNOWN";
  const ref = entry?.projectRef || String(arguments[1] || "missing");
  return [
    "========================================",
    "PRIMECARE DATABASE ENVIRONMENT",
    `ENV: ${env}`,
    `PROJECT REF: ${ref}`,
    "========================================",
  ].join("\n");
}

/** Critical V1 foundation objects for release parity (schema names only). */
export const RELEASE_FOUNDATION_MANIFEST = Object.freeze({
  tables: [
    "agent_visits",
    "lab_product_intelligence",
    "lab_qualifications",
    "notification_events",
    "notification_delivery_log",
  ],
  columns: {
    agent_visits: ["next_follow_up_type", "next_action", "tenant_id", "visit_id", "lab_id"],
    lab_product_intelligence: ["tenant_id", "lab_id", "source_visit_id", "product_category", "brand"],
    notification_events: [
      "event_id",
      "tenant_id",
      "event_type",
      "source_module",
      "actor_user_id",
      "payload_json",
    ],
    notification_delivery_log: [
      "delivery_id",
      "event_id",
      "tenant_id",
      "channel",
      "status",
      "provider_message_id",
      "provider_error",
      "attempted_at",
      "delivered_at",
      "created_at",
    ],
  },
  forbiddenDeliveryColumns: ["recipient", "provider_response", "error_message"],
  functions: [
    "tenant_id_matches",
    "current_user_role",
    "current_tenant_id",
    "current_profile",
    "notification_event_visible_to_current_user",
  ],
  grants: {
    agent_visits: { authenticated: ["SELECT", "INSERT", "UPDATE"], denyAnonWrite: true },
    lab_product_intelligence: {
      authenticated: ["SELECT", "INSERT", "UPDATE", "DELETE"],
      denyAnonWrite: true,
    },
    notification_events: { authenticated: ["SELECT", "INSERT", "UPDATE"], denyAnonWrite: true },
    notification_delivery_log: { authenticated: ["SELECT", "INSERT"], denyAnonWrite: true },
  },
  versionedMigrations: [
    "20260815120000_lab_product_intelligence.sql",
    "20260816120000_agent_visit_authenticated_grants.sql",
    "20260816140000_notification_events_foundation_parity.sql",
    "20260816145000_notification_event_visibility_helper_parity.sql",
    "20260816150000_notification_delivery_log_parity.sql",
  ],
  highRiskManualSql: [
    "notifications_foundation_migration.sql",
    "production_auth_rls_pilot_migration.sql",
    "agent_visit_authenticated_grants.sql",
    "notification_delivery_log_parity.sql",
    "notification_event_visibility_helper_parity.sql",
  ],
});
