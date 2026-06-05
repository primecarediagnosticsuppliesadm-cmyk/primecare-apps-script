import { useEffect } from "react";
import { useTenantView } from "@/context/TenantViewContext.jsx";
import { leaveDistributorOs } from "@/tenant/tenantFoundationStore.js";

/**
 * Keeps PrimeCare HQ shell on home tenant; Distributor OS context is module-local only.
 */
export default function OperatingZoneSync({ activePage }) {
  const { resetToHome } = useTenantView();

  useEffect(() => {
    if (activePage !== "distributorOs") {
      leaveDistributorOs();
    }
    if (activePage !== "tenantManagement") {
      resetToHome();
    }
  }, [activePage, resetToHome]);

  return null;
}
