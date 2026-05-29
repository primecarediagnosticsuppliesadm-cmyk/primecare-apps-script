import { loadOperationsCommandCenterData } from "@/operations/operationsCommandCenterLoader.js";

let sharedPayload = null;
let sharedAt = 0;
const SHARED_TTL_MS = 60_000;

/**
 * Reuse one ops payload across Predator validators in a single run (cuts repeated API reads).
 */
export async function resolvePredatorOpsPayload(currentUser, injected = null) {
  if (injected) return injected;
  if (sharedPayload && Date.now() - sharedAt < SHARED_TTL_MS) {
    return sharedPayload;
  }
  sharedPayload = await loadOperationsCommandCenterData(currentUser);
  sharedAt = Date.now();
  return sharedPayload;
}

export function primePredatorOpsPayload(payload) {
  if (!payload) return;
  sharedPayload = payload;
  sharedAt = Date.now();
}

export function clearPredatorOpsPayload() {
  sharedPayload = null;
  sharedAt = 0;
}
