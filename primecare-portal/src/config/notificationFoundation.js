function envFlag(name, defaultValue = false) {
  const value = import.meta.env[name];
  if (value === undefined || value === null || value === "") return defaultValue;
  return String(value).trim().toLowerCase() === "true";
}

/** When true, Predator and tenant isolation run notification table RLS probes. */
export function isNotificationsFoundationEnabled() {
  return envFlag("VITE_NOTIFICATIONS_FOUNDATION_ENABLED", false);
}
