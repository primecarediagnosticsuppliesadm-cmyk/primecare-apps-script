/**
 * Execute-mode locks. pull_request can never mutate Production.
 */
export function isPullRequestEvent(env = process.env) {
  return String(env.GITHUB_EVENT_NAME || "").trim() === "pull_request";
}

export function ciForceDryRun(env = process.env) {
  return String(env.PN_EMAIL_STAGE1_CI_FORCE_DRY_RUN || "").trim() === "true";
}

export function isExecuteUnlocked(argv = process.argv, env = process.env) {
  if (isPullRequestEvent(env)) return false;
  return (
    argv.includes("--execute-prod") &&
    !ciForceDryRun(env) &&
    String(env.PRIMECARE_CONFIRM_PROD || "").trim() === "YES" &&
    String(env.APPLY_PN_EMAIL_STAGE1 || "").trim() === "YES" &&
    String(env.PN_EMAIL_STAGE1_ALLOW_EXECUTE || "").trim() === "true"
  );
}
