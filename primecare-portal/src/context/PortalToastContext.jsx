import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { TOAST_DURATION_MS } from "@/styles/designTokens";
import PortalToastViewport from "@/components/ux/PortalToastViewport";

const PortalToastContext = createContext(null);

/**
 * @typedef {'success' | 'error' | 'warning' | 'info'} ToastVariant
 */

/**
 * @returns {{
 *   showToast: (variant: ToastVariant, message: string) => void,
 *   dismissToast: (id?: number) => void,
 * }}
 */
export function usePortalToast() {
  const ctx = useContext(PortalToastContext);
  if (!ctx) {
    throw new Error("usePortalToast must be used within PortalToastProvider");
  }
  return ctx;
}

export function PortalToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismissToast = useCallback((id) => {
    if (id == null) {
      setToasts([]);
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
      return;
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback(
    (variant, message) => {
      const text = String(message || "").trim();
      if (!text) return;

      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev.slice(-2), { id, variant, message: text }]);

      const timer = setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
      timersRef.current.set(id, timer);
    },
    [dismissToast]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  const value = useMemo(
    () => ({ showToast, dismissToast }),
    [showToast, dismissToast]
  );

  return (
    <PortalToastContext.Provider value={value}>
      {children}
      <PortalToastViewport toasts={toasts} onDismiss={dismissToast} />
    </PortalToastContext.Provider>
  );
}
