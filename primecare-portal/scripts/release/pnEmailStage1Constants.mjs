/**
 * PN-EMAIL Stage 1 auto-release pins. No secrets.
 * Deploy always uses PN_EMAIL_CANDIDATE_SHA, never the automation-branch HEAD.
 */
export const PN_EMAIL_CANDIDATE_SHA = "1141e617246fac15a5daa7318d0ec1cb54659062";
export const EXPECTED_CANDIDATE_SHA = PN_EMAIL_CANDIDATE_SHA;
export const PRE_RELEASE_PRODUCT_BASELINE_SHA = "f0d18efceab0d83d55526d842f6535916587e8c8";
export const CANDIDATE_BRANCH = "release/pn-email-prod-candidate";
export const MAIN_BRANCH = "main";

export const PROD_PROJECT_REF = "alxhrnotnvwpblsiadxj";
export const QA_PROJECT_REF = "zipuzmfkwwucbchlphcj";
export const CANONICAL_HOST = "https://app.primecarediagnostics.in";
export const VERCEL_PROD_PROJECT = "primecare-portal-prod";
export const DISPATCH_FUNCTION = "dispatch-notification-email";

export const BACKUP_MAX_AGE_MS = 2 * 60 * 60 * 1000;

export const MIGRATION_ALLOWLIST = Object.freeze([
  "20260912200000_pn1a_prospect_in_app_notifications.sql",
  "20260913010000_pn1b1_prospect_email_delivery_queue.sql",
  "20260913020000_pn1b2_email_dispatch_claim.sql",
]);

export const MIGRATION_REL_PREFIX = "primecare-portal/supabase/migrations/";

export const STAGE1_EMAIL_SECRETS = Object.freeze({
  APP_ENV: "prod",
  EMAIL_QA_MODE: "false",
  EMAIL_ENABLED: "false",
  APP_PUBLIC_URL: CANONICAL_HOST,
  EMAIL_FROM_NAME: "PrimeCare",
});

/** Secrets used by read-only CI DRY_RUN (backup + live SELECT). Vercel/cron not required. */
export const DRY_RUN_SECRET_NAMES = Object.freeze(["SUPABASE_ACCESS_TOKEN", "PROD_SUPABASE_DB_URL"]);

/** Secrets required only if execute mode is later unlocked. */
export const EXECUTE_SECRET_NAMES = Object.freeze([
  "SUPABASE_ACCESS_TOKEN",
  "PROD_SUPABASE_DB_URL",
  "VERCEL_TOKEN",
  "VERCEL_ORG_ID",
  "VERCEL_PROJECT_ID",
  "PROD_EMAIL_DISPATCH_CRON_SECRET",
]);

export const REQUIRED_PROD_SECRET_NAMES = EXECUTE_SECRET_NAMES;

export const HOLD_BACKUP = "PN-EMAIL AUTO DEPLOY HOLD — fresh physical backup unavailable";
export const HOLD_PREFIX = "PN-EMAIL AUTO DEPLOY HOLD — ";
export const READY_BANNER = "PN-EMAIL STAGE 1 AUTO DEPLOY COMPLETE — READY FOR FOUNDER UAT";

export const AUTOMATION_ONLY = "AUTOMATION_ONLY";
export const PRODUCT_DRIFT = "PRODUCT_DRIFT";

export const AUTOMATION_PATH_ALLOWLIST = Object.freeze([
  ".github/workflows/pn-email-stage1-auto-release.yml",
  "primecare-portal/docs/operations/PN_EMAIL_STAGE1_AUTO_RELEASE.md",
  "primecare-portal/package.json",
]);

export const AUTOMATION_PATH_PREFIXES = Object.freeze(["primecare-portal/scripts/release/"]);

export const APPROVED_PACKAGE_SCRIPTS = Object.freeze({
  "release:pn-email-stage1:dry-run": "node scripts/release/pn-email-stage1-auto-release.mjs --dry-run",
});
