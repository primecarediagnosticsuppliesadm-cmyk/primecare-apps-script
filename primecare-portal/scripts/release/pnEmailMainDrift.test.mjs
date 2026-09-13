#!/usr/bin/env node
import { APPROVED_PACKAGE_SCRIPTS, AUTOMATION_ONLY, PRODUCT_DRIFT } from "./pnEmailStage1Constants.mjs";
import { classifyMainDrift, classifyPackageJsonChange, pathIsAutomationOnly } from "./pnEmailMainDrift.mjs";
import { isExecuteUnlocked } from "./pnEmailExecuteGuard.mjs";

const BASE_PKG = {
  name: "primecare-portal",
  private: true,
  version: "0.0.0",
  scripts: { build: "vite build", lint: "eslint ." },
  dependencies: { react: "^19.2.4" },
  devDependencies: { vite: "^7.3.1" },
};

function withApprovedScript(pkg) {
  return {
    ...pkg,
    scripts: { ...pkg.scripts, ...APPROVED_PACKAGE_SCRIPTS },
  };
}

let failed = 0;
function check(name, cond, detail = "") {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failed += 1;
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const none = classifyMainDrift({ files: [] });
check("no main drift", none.class === AUTOMATION_ONLY && none.disallowed.length === 0);

const workflow = classifyMainDrift({
  files: [".github/workflows/pn-email-stage1-auto-release.yml"],
});
check("approved workflow-only drift", workflow.class === AUTOMATION_ONLY);

const releaseScript = classifyMainDrift({
  files: ["primecare-portal/scripts/release/pn-email-stage1-auto-release.mjs"],
});
check("approved release-script drift", releaseScript.class === AUTOMATION_ONLY);

const pkgOnly = classifyMainDrift({
  files: ["primecare-portal/package.json"],
  packageBaseline: JSON.stringify(BASE_PKG),
  packageCurrent: JSON.stringify(withApprovedScript(BASE_PKG)),
});
check("approved package.json script only", pkgOnly.class === AUTOMATION_ONLY, pkgOnly.notes.join(";"));

const src = classifyMainDrift({ files: ["primecare-portal/src/pages/NotificationCenterPage.jsx"] });
check(
  "disallowed src/ change",
  src.class === PRODUCT_DRIFT && src.disallowed.includes("primecare-portal/src/pages/NotificationCenterPage.jsx")
);

const migration = classifyMainDrift({
  files: ["primecare-portal/supabase/migrations/20260912200000_pn1a_prospect_in_app_notifications.sql"],
});
check(
  "disallowed migration change",
  migration.class === PRODUCT_DRIFT &&
    migration.disallowed.includes("primecare-portal/supabase/migrations/20260912200000_pn1a_prospect_in_app_notifications.sql")
);

const depPkg = classifyMainDrift({
  files: ["primecare-portal/package.json"],
  packageBaseline: JSON.stringify(BASE_PKG),
  packageCurrent: JSON.stringify({
    ...withApprovedScript(BASE_PKG),
    dependencies: { ...BASE_PKG.dependencies, lodash: "^4.0.0" },
  }),
});
check("disallowed package dependency change", depPkg.class === PRODUCT_DRIFT);

const fn = classifyMainDrift({
  files: ["primecare-portal/supabase/functions/dispatch-notification-email/index.ts"],
});
check(
  "disallowed Supabase function change",
  fn.class === PRODUCT_DRIFT &&
    fn.disallowed.includes("primecare-portal/supabase/functions/dispatch-notification-email/index.ts")
);

check("path allow workflow", pathIsAutomationOnly(".github/workflows/pn-email-stage1-auto-release.yml"));
check("path deny other workflow", !pathIsAutomationOnly(".github/workflows/architecture-enforcement.yml"));
check(
  "package.json script helper",
  classifyPackageJsonChange(JSON.stringify(BASE_PKG), JSON.stringify(withApprovedScript(BASE_PKG))).ok
);

const locks = {
  PRIMECARE_CONFIRM_PROD: "YES",
  APPLY_PN_EMAIL_STAGE1: "YES",
  PN_EMAIL_STAGE1_ALLOW_EXECUTE: "true",
};
check(
  "pull_request execute hard-block",
  isExecuteUnlocked(["--execute-prod"], { ...locks, GITHUB_EVENT_NAME: "pull_request" }) === false
);
check(
  "execute unlocks only with all locks outside PR",
  isExecuteUnlocked(["--execute-prod"], locks) === true
);
check(
  "execute still locked when CI force dry-run",
  isExecuteUnlocked(["--execute-prod"], { ...locks, PN_EMAIL_STAGE1_CI_FORCE_DRY_RUN: "true" }) === false
);

if (failed) {
  console.log(`\n${failed} FAIL`);
  process.exit(1);
}
console.log("\nPN-EMAIL main-drift classifier tests PASS");
