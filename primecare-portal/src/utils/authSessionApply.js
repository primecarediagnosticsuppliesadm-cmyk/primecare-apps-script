/**
 * Auth session-apply generation gate + bounded profile-read timeout.
 * Pure helpers — no Supabase, no role-matrix changes.
 */

export const AUTH_PROFILE_FETCH_TIMEOUT_MS = 12000;
export const AUTH_PROFILE_FETCH_MAX_ATTEMPTS = 3;
export const AUTH_PROFILE_FETCH_RETRY_DELAY_MS = 400;
export const AUTH_PROFILE_TIMEOUT_MESSAGE =
  "Profile lookup timed out. Refresh the page and try again.";

export function createAuthApplyGate() {
  let current = 0;
  return {
    begin() {
      current += 1;
      return current;
    },
    isCurrent(generation) {
      return generation === current;
    },
    get current() {
      return current;
    },
  };
}

export function withTimeout(promise, ms, message) {
  const timeoutMs = Number(ms);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message || "Request timed out."));
    }, timeoutMs);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export function isAuthProfileTimeoutError(error) {
  const message = String(error?.message || error || "");
  return /profile lookup timed out/i.test(message);
}

/**
 * Transient load failures are not authorization denials.
 * JWT/permission/inactive/missing-profile errors stay fail-closed.
 */
export function isTransientAuthProfileError(error) {
  const message = String(error?.message || error || "");
  const name = String(error?.name || "");
  if (
    /profile is missing|profile is inactive|not authorized for pilot|does not have permission/i.test(
      message
    )
  ) {
    return false;
  }
  if (/jwt|invalid.*(token|api key)|permission denied|row-level security|rls/i.test(message)) {
    return false;
  }
  if (isAuthProfileTimeoutError(error)) return true;
  if (name === "AbortError") return true;
  if (/failed to fetch|networkerror|fetch failed|502|503|504|429/i.test(message)) return true;
  return false;
}

export async function runWithTransientRetries(fn, options = {}) {
  const attemptsRaw = Number(options.attempts);
  const attempts =
    Number.isFinite(attemptsRaw) && attemptsRaw > 0 ? Math.floor(attemptsRaw) : AUTH_PROFILE_FETCH_MAX_ATTEMPTS;
  const delayRaw = Number(options.delayMs);
  const delayMs =
    Number.isFinite(delayRaw) && delayRaw >= 0 ? delayRaw : AUTH_PROFILE_FETCH_RETRY_DELAY_MS;
  const isTransient =
    typeof options.isTransient === "function" ? options.isTransient : isTransientAuthProfileError;

  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn(i);
    } catch (error) {
      lastError = error;
      if (!isTransient(error) || i === attempts - 1) throw error;
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
      }
    }
  }
  throw lastError;
}

/**
 * Run one session apply. Stale generations never call onSuccess/onFailure.
 * @returns {Promise<{ status: "applied" | "stale" | "failed", error?: unknown }>}
 */
export async function runAuthApply({ gate, applyFn, onSuccess, onFailure }) {
  const generation = gate.begin();
  try {
    const result = await applyFn();
    if (!gate.isCurrent(generation)) return { status: "stale" };
    if (typeof onSuccess === "function") onSuccess(result);
    return { status: "applied" };
  } catch (error) {
    if (!gate.isCurrent(generation)) return { status: "stale", error };
    if (typeof onFailure === "function") onFailure(error);
    return { status: "failed", error };
  }
}
