import { useMemo } from "react";
import { useTenantView } from "@/context/TenantViewContext.jsx";
import { resolveOperatingTenantId } from "@/tenant/resolveOperatingTenantId.js";

/**
 * React hook: canonical operating tenant for the signed-in user.
 * @param {object|null|undefined} currentUser
 * @returns {string|null}
 */
export function useOperatingTenantId(currentUser) {
  const { homeTenantId, viewTenantId } = useTenantView();

  return useMemo(
    () =>
      resolveOperatingTenantId(currentUser, {
        homeTenantId,
        viewTenantId,
      }),
    [currentUser, homeTenantId, viewTenantId]
  );
}
