/**
 * Classify origin/main vs PRE_RELEASE_PRODUCT_BASELINE_SHA.
 * AUTOMATION_ONLY: bootstrap files only.
 * PRODUCT_DRIFT: any product/runtime/migration/dependency change.
 */
import {
  APPROVED_PACKAGE_SCRIPTS,
  AUTOMATION_ONLY,
  AUTOMATION_PATH_ALLOWLIST,
  AUTOMATION_PATH_PREFIXES,
  PRE_RELEASE_PRODUCT_BASELINE_SHA,
  PRODUCT_DRIFT,
} from "./pnEmailStage1Constants.mjs";

function normalizePath(file) {
  return String(file || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]));
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(sortKeys(value));
}

export function pathIsAutomationOnly(file) {
  const name = normalizePath(file);
  if (AUTOMATION_PATH_ALLOWLIST.includes(name)) return true;
  return AUTOMATION_PATH_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export function classifyPackageJsonChange(baselineText, currentText) {
  if (baselineText == null || currentText == null) {
    return { ok: false, reason: "package.json content missing for comparison" };
  }
  let baseline;
  let current;
  try {
    baseline = JSON.parse(baselineText);
    current = JSON.parse(currentText);
  } catch {
    return { ok: false, reason: "package.json parse failed" };
  }
  if (stableStringify(baseline) === stableStringify(current)) {
    return { ok: true, reason: "unchanged" };
  }
  const expected = JSON.parse(JSON.stringify(baseline));
  expected.scripts = { ...(expected.scripts || {}) };
  for (const [key, value] of Object.entries(APPROVED_PACKAGE_SCRIPTS)) {
    expected.scripts[key] = value;
  }
  if (stableStringify(expected) !== stableStringify(current)) {
    return { ok: false, reason: "package.json has non-approved script, dependency, or version change" };
  }
  return { ok: true, reason: "approved release script only" };
}

export function classifyMainDrift({ files = [], packageBaseline = null, packageCurrent = null } = {}) {
  const changed = [...new Set((files || []).map(normalizePath).filter(Boolean))].sort();
  const disallowed = [];
  const notes = [];
  for (const file of changed) {
    if (file === "primecare-portal/package.json") {
      const pkg = classifyPackageJsonChange(packageBaseline, packageCurrent);
      notes.push(`package.json: ${pkg.reason}`);
      if (!pkg.ok) disallowed.push(file);
      continue;
    }
    if (!pathIsAutomationOnly(file)) disallowed.push(file);
  }
  return {
    class: disallowed.length ? PRODUCT_DRIFT : AUTOMATION_ONLY,
    files: changed,
    disallowed,
    notes,
  };
}

export function classifyGitRange(runGit, { baselineSha = PRE_RELEASE_PRODUCT_BASELINE_SHA, mainRef = "origin/main" } = {}) {
  const ancestor = runGit(["merge-base", "--is-ancestor", baselineSha, mainRef]);
  if (ancestor.status !== 0) {
    return {
      class: PRODUCT_DRIFT,
      files: [],
      disallowed: ["<main is not a descendant of PRE_RELEASE_PRODUCT_BASELINE_SHA>"],
      notes: [`${mainRef} does not contain ${baselineSha}`],
    };
  }
  const diff = runGit(["diff", "--name-only", `${baselineSha}..${mainRef}`]);
  if (diff.status !== 0) {
    return {
      class: PRODUCT_DRIFT,
      files: [],
      disallowed: ["<git diff failed>"],
      notes: [(diff.stderr || diff.stdout || "git diff failed").slice(0, 240)],
    };
  }
  const files = String(diff.stdout || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  let packageBaseline = null;
  let packageCurrent = null;
  if (files.includes("primecare-portal/package.json")) {
    const base = runGit(["show", `${baselineSha}:primecare-portal/package.json`]);
    const cur = runGit(["show", `${mainRef}:primecare-portal/package.json`]);
    packageBaseline = base.status === 0 ? base.stdout : null;
    packageCurrent = cur.status === 0 ? cur.stdout : null;
  }
  return classifyMainDrift({ files, packageBaseline, packageCurrent });
}
