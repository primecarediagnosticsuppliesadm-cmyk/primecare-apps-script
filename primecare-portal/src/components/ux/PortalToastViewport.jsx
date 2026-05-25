import React from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TOAST_STYLES = {
  success: {
    box: "border-[var(--pc-success-border)] bg-[var(--pc-success-bg)] text-[var(--pc-success)]",
    Icon: CheckCircle2,
  },
  error: {
    box: "border-[var(--pc-danger-border)] bg-[var(--pc-danger-bg)] text-[var(--pc-danger)]",
    Icon: AlertCircle,
  },
  warning: {
    box: "border-[var(--pc-warning-border)] bg-[var(--pc-warning-bg)] text-[var(--pc-warning)]",
    Icon: AlertTriangle,
  },
  info: {
    box: "border-[var(--pc-info-border)] bg-[var(--pc-info-bg)] text-[var(--pc-info)]",
    Icon: Info,
  },
};

/**
 * Fixed toast stack — rendered by PortalToastProvider.
 */
export default function PortalToastViewport({ toasts = [], onDismiss }) {
  if (!toasts.length) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 p-4 md:items-end md:pr-6"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((toast) => {
        const style = TOAST_STYLES[toast.variant] || TOAST_STYLES.info;
        const Icon = style.Icon;

        return (
          <div
            key={toast.id}
            role="status"
            className={cn(
              "pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-xl border px-3 py-2.5 text-sm shadow-[var(--pc-shadow-toast)]",
              style.box
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1 font-medium">{toast.message}</span>
            <button
              type="button"
              onClick={() => onDismiss?.(toast.id)}
              className="rounded p-0.5 opacity-70 transition hover:opacity-100"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
