const STORAGE_KEY = "primecare_qa_defect_registry_v1";
const LAST_PASS_KEY = "primecare_qa_last_successful_validation_v1";
const REGRESSION_KEY = "primecare_qa_regression_history_v1";

function str(v) {
  return String(v ?? "").trim();
}

function readJson(key, fallback) {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota */
  }
}

function nextDefectId(defects = []) {
  const nums = defects
    .map((d) => Number(String(d.id || "").replace(/^QA-/i, "")))
    .filter((n) => Number.isFinite(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `QA-${String(next).padStart(4, "0")}`;
}

export const DEFECT_SEVERITIES = ["Critical", "High", "Medium", "Low"];
export const DEFECT_STATUSES = ["Open", "In Progress", "Closed"];

/** @returns {object[]} */
export function loadQaDefects() {
  return readJson(STORAGE_KEY, []);
}

function persistDefects(defects) {
  writeJson(STORAGE_KEY, defects);
}

/**
 * @param {object} input
 */
export function createQaDefect(input = {}) {
  const defects = loadQaDefects();
  const defect = {
    id: nextDefectId(defects),
    module: str(input.module) || "General",
    severity: DEFECT_SEVERITIES.includes(input.severity) ? input.severity : "Medium",
    status: "Open",
    owner: str(input.owner) || "Unassigned",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    notes: str(input.notes),
    failedTestCase: Boolean(input.failedTestCase),
    title: str(input.title) || str(input.notes).slice(0, 80) || "Untitled defect",
  };
  defects.unshift(defect);
  persistDefects(defects);
  return defect;
}

/**
 * @param {string} id
 * @param {object} patch
 */
export function updateQaDefect(id, patch = {}) {
  const defects = loadQaDefects();
  const idx = defects.findIndex((d) => d.id === id);
  if (idx < 0) return null;
  const prev = defects[idx];
  const next = {
    ...prev,
    ...patch,
    id: prev.id,
    updated_at: new Date().toISOString(),
  };
  if (patch.severity && !DEFECT_SEVERITIES.includes(patch.severity)) {
    next.severity = prev.severity;
  }
  if (patch.status && !DEFECT_STATUSES.includes(patch.status)) {
    next.status = prev.status;
  }
  defects[idx] = next;
  persistDefects(defects);
  return next;
}

export function closeQaDefect(id, notes = "") {
  return updateQaDefect(id, {
    status: "Closed",
    notes: notes || undefined,
    closed_at: new Date().toISOString(),
  });
}

export function recordLastSuccessfulValidation(iso = new Date().toISOString()) {
  writeJson(LAST_PASS_KEY, { at: iso, status: "PASS" });
}

export function loadLastSuccessfulValidation() {
  return readJson(LAST_PASS_KEY, null);
}

/** @param {object} entry */
export function appendRegressionHistory(entry) {
  const history = readJson(REGRESSION_KEY, []);
  history.unshift({
    at: new Date().toISOString(),
    ...entry,
  });
  writeJson(REGRESSION_KEY, history.slice(0, 100));
}

export function loadRegressionHistory() {
  return readJson(REGRESSION_KEY, []);
}
