import { ROLES } from "@/config/roles.js";

/** Bottom-bar primary keys for field agents. Resources + Dashboard go under More. */
export const AGENT_FIELD_PRIMARY_NAV_KEYS = [
  "myBusiness",
  "visits",
  "labs",
  "collections",
];

/**
 * Split agent menu into primary bottom-bar items and overflow (More).
 * Other roles keep first-four + remainder behavior.
 *
 * @param {string} role
 * @param {{ key: string, label: string }[]} menu
 */
export function splitFieldMobileNav(role, menu = []) {
  const items = Array.isArray(menu) ? menu : [];
  const normalized = String(role || "").toLowerCase();
  if (normalized !== ROLES.AGENT) {
    return {
      primary: items.slice(0, 4),
      more: items.slice(4),
    };
  }

  const byKey = new Map(items.map((item) => [item.key, item]));
  const primary = AGENT_FIELD_PRIMARY_NAV_KEYS.map((key) => byKey.get(key)).filter(Boolean);
  const used = new Set(primary.map((item) => item.key));
  const more = items.filter((item) => !used.has(item.key));
  return { primary, more };
}

export function isFieldMobileNavKey(role, pageKey, split) {
  const key = String(pageKey || "");
  const { primary, more } = split || splitFieldMobileNav(role, []);
  if (primary.some((item) => item.key === key)) return "primary";
  if (more.some((item) => item.key === key)) return "more";
  return "";
}
