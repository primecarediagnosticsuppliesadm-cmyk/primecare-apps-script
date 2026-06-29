function str(v) {
  return String(v ?? "").trim();
}

export const USER_DIRECTORY_CLASS = {
  REAL: "real",
  QA_TEST: "qa_test",
  PROBE_DEBUG: "probe_debug",
};

export const USER_DIRECTORY_CLASS_LABELS = {
  [USER_DIRECTORY_CLASS.REAL]: "Production user",
  [USER_DIRECTORY_CLASS.QA_TEST]: "QA user",
  [USER_DIRECTORY_CLASS.PROBE_DEBUG]: "Probe / Debug",
};

const PROBE_EMAIL_EXACT = new Set(
  ["user@example.com", "x@primecare.test", "test@gmail.com"].map((e) => e.toLowerCase())
);

const PROBE_EMAIL_SUFFIX = [
  /@invalid\.example\.com$/i,
  /@test\.localhost$/i,
  /@example\.test$/i,
];

const QA_EMAIL_PATTERNS = [/^qa\./i, /@primecare\.test$/i];

/**
 * Classify directory users for Operations Center display (read-only; no data mutation).
 * @param {object} user
 * @returns {"real"|"qa_test"|"probe_debug"}
 */
export function classifyDirectoryUser(user = {}) {
  const email = str(user.email ?? user.storedEmail).toLowerCase();
  const name = str(user.displayName ?? user.name).toLowerCase();
  const username = str(user.username).toLowerCase();
  const metaProbe = user.isProbeUser === true || user.is_probe_user === true;
  const metaQa = user.isQaUser === true || user.is_qa_user === true;

  if (metaProbe) return USER_DIRECTORY_CLASS.PROBE_DEBUG;
  if (metaQa) return USER_DIRECTORY_CLASS.QA_TEST;

  if (email && PROBE_EMAIL_EXACT.has(email)) return USER_DIRECTORY_CLASS.PROBE_DEBUG;
  for (const re of PROBE_EMAIL_SUFFIX) {
    if (re.test(email)) return USER_DIRECTORY_CLASS.PROBE_DEBUG;
  }

  if (/\bprobe\b/i.test(name) || /\bdebug\b/i.test(name) || /\bprobe\b/i.test(username)) {
    return USER_DIRECTORY_CLASS.PROBE_DEBUG;
  }

  if (email === "x@primecare.test") return USER_DIRECTORY_CLASS.PROBE_DEBUG;

  for (const re of QA_EMAIL_PATTERNS) {
    if (re.test(email) && email !== "x@primecare.test") {
      return USER_DIRECTORY_CLASS.QA_TEST;
    }
  }

  if (/qa\s+test\s+agent/i.test(name) || /qa\s+agent/i.test(name)) {
    return USER_DIRECTORY_CLASS.QA_TEST;
  }

  return USER_DIRECTORY_CLASS.REAL;
}

export function isRealDirectoryUser(user) {
  return classifyDirectoryUser(user) === USER_DIRECTORY_CLASS.REAL;
}

export function isProbeOrDebugUser(user) {
  return classifyDirectoryUser(user) === USER_DIRECTORY_CLASS.PROBE_DEBUG;
}

export function isQaTestDirectoryUser(user) {
  return classifyDirectoryUser(user) === USER_DIRECTORY_CLASS.QA_TEST;
}

export function isNonProductionDirectoryUser(user) {
  const cls = classifyDirectoryUser(user);
  return cls === USER_DIRECTORY_CLASS.PROBE_DEBUG || cls === USER_DIRECTORY_CLASS.QA_TEST;
}
