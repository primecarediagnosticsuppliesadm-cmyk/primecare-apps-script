/**
 * Auth session-apply generation gate + bounded profile-read timeout.
 * Pure helpers — no Supabase, no role-matrix changes.
 */

export const AUTH_PROFILE_FETCH_TIMEOUT_MS = 12000;

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
