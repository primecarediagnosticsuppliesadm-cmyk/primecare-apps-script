/**
 * Prospect email deep link. Canonical lab id only.
 * No lab name lookup. No external return URLs.
 */

export const LABS_RETURN_STORAGE_KEY = "primecare_labs_return";

const LAB_ID_RE = /^[A-Z0-9][A-Z0-9_-]{0,80}$/;

export function canonicalLabId(value) {
  const id = String(value ?? "").trim().toUpperCase();
  return LAB_ID_RE.test(id) ? id : "";
}

export function prospectReviewPath(labId) {
  const id = canonicalLabId(labId);
  if (!id) return "/labs";
  const params = new URLSearchParams({
    tab: "prospects",
    labId: id,
    action: "review",
  });
  return `/labs?${params.toString()}`;
}

export function safeInternalReturnPath(value) {
  const raw = String(value ?? "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\") || raw.includes("://")) {
    return "";
  }
  let url;
  try {
    url = new URL(raw, "https://app.primecarediagnostics.in");
  } catch {
    return "";
  }
  if (url.origin !== "https://app.primecarediagnostics.in") return "";
  if (url.pathname.replace(/\/+$/, "") !== "/labs") return "";
  const labId = canonicalLabId(url.searchParams.get("labId"));
  const tab = url.searchParams.get("tab");
  const action = url.searchParams.get("action");
  if (url.searchParams.has("labId") && !labId) return "";
  if (tab && tab !== "prospects") return "";
  if (action && action !== "review") return "";
  if (!labId) return "/labs";
  return prospectReviewPath(labId);
}

export function rememberLabsReturn(href, storage) {
  const safe = safeInternalReturnPath(href);
  if (!safe.includes("labId=")) return "";
  storage?.setItem?.(LABS_RETURN_STORAGE_KEY, safe);
  return safe;
}

export function takeLabsReturn(storage) {
  const raw = storage?.getItem?.(LABS_RETURN_STORAGE_KEY) || "";
  storage?.removeItem?.(LABS_RETURN_STORAGE_KEY);
  const safe = safeInternalReturnPath(raw);
  return safe.includes("labId=") ? safe : "";
}

export function parseProspectDeepLink(search) {
  const params = new URLSearchParams(String(search ?? "").replace(/^\?/, ""));
  const hasLab = params.has("labId") || params.has("lab_id");
  const action = params.get("action");
  const tab = params.get("tab");
  const requested = hasLab || action === "review";
  if (!requested) return { active: false, invalid: false, labId: "" };
  if (action && action !== "review") {
    return { active: false, invalid: true, labId: "", message: "This review link is not valid." };
  }
  if (tab && tab !== "prospects") {
    return { active: false, invalid: true, labId: "", message: "This review link is not valid." };
  }
  const labId = canonicalLabId(params.get("labId") || params.get("lab_id"));
  if (!labId) {
    return { active: false, invalid: true, labId: "", message: "This review link is not valid." };
  }
  return { active: true, invalid: false, labId, message: "" };
}

/**
 * Decide how Labs should react to a deep link using only labs the caller
 * is already allowed to see. Does not fetch or reveal other records.
 */
export function resolveProspectDeepLink({ search, labs, canReview }) {
  const parsed = parseProspectDeepLink(search);
  if (!parsed.active) {
    return {
      openReview: false,
      tab: "",
      labId: "",
      alreadyActive: false,
      message: parsed.invalid ? parsed.message : "",
    };
  }
  if (!canReview) {
    return { openReview: false, tab: "", labId: "", alreadyActive: false, message: "" };
  }
  const match = (Array.isArray(labs) ? labs : []).find(
    (lab) => canonicalLabId(lab?.labId ?? lab?.lab_id) === parsed.labId
  );
  if (!match) {
    return {
      openReview: false,
      tab: "prospects",
      labId: parsed.labId,
      alreadyActive: false,
      message: "Prospect not found or no longer available.",
    };
  }
  const status = String(match.status ?? "").trim().toUpperCase();
  const alreadyActive = status === "ACTIVE";
  return {
    openReview: true,
    tab: alreadyActive ? "all" : "prospects",
    labId: parsed.labId,
    alreadyActive,
    message: "",
  };
}
