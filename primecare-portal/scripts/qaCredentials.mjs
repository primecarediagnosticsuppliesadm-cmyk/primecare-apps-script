/** Canonical QA login credentials for automated verification scripts. */
export const QA_AGENT = {
  email: "qa.test.agent1@primecare.test",
  password: "115f4ce25fa0Aa1!",
};

export const QA_ADMIN = {
  email: "qa.admin@primecare.test",
  password: "1234",
};

export const QA_EXECUTIVE = {
  email: "qa.executive@primecare.test",
  password: "1234",
};

export const QA_LAB = {
  email: "qa.lab@primecare.test",
  password: "1234",
};

/** Live HR actor password is env-only (`QA_HR_PASSWORD`). Never commit the secret. */
export const QA_HR_PASSWORD_ENV = "QA_HR_PASSWORD";
export const QA_HR_PASSWORD_MIN_LENGTH = 6;

export function hydrateQaHrPasswordFromEnv(parsed = {}) {
  const fromProcess = String(process.env.QA_HR_PASSWORD || "").trim();
  if (fromProcess) return fromProcess;
  const fromFile = String(parsed.QA_HR_PASSWORD || "").trim();
  if (fromFile) {
    process.env.QA_HR_PASSWORD = fromFile;
    return fromFile;
  }
  return "";
}

export function resolveQaHrPassword({ required = false } = {}) {
  const value = String(process.env.QA_HR_PASSWORD || "").trim();
  if (required && value.length < QA_HR_PASSWORD_MIN_LENGTH) {
    throw new Error(
      "QA_HR_PASSWORD is required for live QA (min 6 characters). Set it in the environment or .env.local. Do not commit this secret."
    );
  }
  return value;
}

export const QA_HR = {
  email: "qa.hr@primecare.test",
  get password() {
    return resolveQaHrPassword();
  },
};

export const QA_HQ_TENANT_ID = "f168b98f-47a6-42c3-b788-24c00436fac2";
