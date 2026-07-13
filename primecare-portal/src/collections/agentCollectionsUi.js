export const AGENT_COLLECTIONS_SEARCH_DEBOUNCE_MS = 300;

export const AGENT_COLLECTIONS_SEARCH_KEY = "primecare_agent_collections_search";
export const AGENT_COLLECTIONS_SELECTED_LAB_KEY = "primecare_agent_collections_selected_lab";

/**
 * Search-aware empty copy for agent work queue.
 */
export function buildAgentCollectionsEmptyCopy({ debouncedSearch = "", collectionsCount = 0 } = {}) {
  const query = String(debouncedSearch ?? "").trim();
  if (collectionsCount === 0) {
    return {
      title: "No accounts in your queue",
      description: "Assigned labs with outstanding balances will appear here.",
    };
  }
  if (query) {
    return {
      title: `No labs match "${query}"`,
      description: "Try a different search term or clear the filter.",
    };
  }
  return {
    title: "No collection records",
    description: "Receivables will appear here when labs have outstanding balances.",
  };
}

export function readAgentCollectionsSearch() {
  try {
    return String(sessionStorage.getItem(AGENT_COLLECTIONS_SEARCH_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

export function writeAgentCollectionsSearch(value) {
  try {
    const next = String(value ?? "").trim();
    if (next) sessionStorage.setItem(AGENT_COLLECTIONS_SEARCH_KEY, next);
    else sessionStorage.removeItem(AGENT_COLLECTIONS_SEARCH_KEY);
  } catch {
    /* sessionStorage unavailable */
  }
}

export function readAgentCollectionsSelectedLab() {
  try {
    return String(sessionStorage.getItem(AGENT_COLLECTIONS_SELECTED_LAB_KEY) ?? "").trim();
  } catch {
    return "";
  }
}

export function writeAgentCollectionsSelectedLab(labKey) {
  try {
    const next = String(labKey ?? "").trim();
    if (next) sessionStorage.setItem(AGENT_COLLECTIONS_SELECTED_LAB_KEY, next);
    else sessionStorage.removeItem(AGENT_COLLECTIONS_SELECTED_LAB_KEY);
  } catch {
    /* sessionStorage unavailable */
  }
}
