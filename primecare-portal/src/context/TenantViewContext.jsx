import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  readTenantViewContext,
  setTenantViewContext,
  clearTenantViewToHome,
} from "@/tenant/tenantFoundationStore.js";
import { ROLES } from "@/config/roles.js";

const TenantViewContext = createContext(null);

export function TenantViewProvider({ children, currentUser }) {
  const homeTenantId = currentUser?.tenantId || currentUser?.tenant_id || "";
  const isExecutive = currentUser?.role === ROLES.EXECUTIVE;

  const [viewState, setViewState] = useState(() =>
    isExecutive ? readTenantViewContext(homeTenantId) : { viewTenantId: homeTenantId, homeTenantId, readOnly: false }
  );

  const syncFromStorage = useCallback(() => {
    if (!isExecutive) return;
    setViewState(readTenantViewContext(homeTenantId));
  }, [homeTenantId, isExecutive]);

  const setViewTenant = useCallback(
    (tenantId) => {
      if (!isExecutive || !homeTenantId) return;
      setTenantViewContext(tenantId, homeTenantId);
      setViewState(readTenantViewContext(homeTenantId));
    },
    [homeTenantId, isExecutive]
  );

  const resetToHome = useCallback(() => {
    if (!homeTenantId) return;
    clearTenantViewToHome(homeTenantId);
    setViewState(readTenantViewContext(homeTenantId));
  }, [homeTenantId]);

  const value = useMemo(
    () => ({
      homeTenantId,
      viewTenantId: viewState.viewTenantId || homeTenantId,
      readOnly: isExecutive && viewState.readOnly,
      isExecutive,
      setViewTenant,
      resetToHome,
      syncFromStorage,
    }),
    [homeTenantId, viewState, isExecutive, setViewTenant, resetToHome, syncFromStorage]
  );

  return <TenantViewContext.Provider value={value}>{children}</TenantViewContext.Provider>;
}

export function useTenantView() {
  const ctx = useContext(TenantViewContext);
  return (
    ctx || {
      homeTenantId: "",
      viewTenantId: "",
      readOnly: false,
      isExecutive: false,
      setViewTenant: () => {},
      resetToHome: () => {},
      syncFromStorage: () => {},
    }
  );
}
