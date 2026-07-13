import React, { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const IS_DEV = import.meta.env.DEV;

/**
 * PrimeCare action-feedback standard — mutation errors appear where the action occurred.
 */
export default function ActionErrorSummary({
  title = "Action failed",
  message = "",
  fieldErrors = {},
  actions = [],
  onAction,
  onDismiss,
  technicalReference = "",
  className,
  autoFocus = true,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!autoFocus) return;
    ref.current?.focus();
  }, [autoFocus, title, message]);

  if (!message && !title) return null;

  const fieldEntries = Object.entries(fieldErrors || {}).filter(([, value]) => Boolean(value));

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      aria-live="assertive"
      className={cn(
        "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 outline-none",
        className
      )}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="font-semibold">{title}</p>
            {message ? <p className="mt-1 text-red-800">{message}</p> : null}
          </div>
          {fieldEntries.length ? (
            <ul className="space-y-1 text-xs text-red-800">
              {fieldEntries.map(([field, detail]) => (
                <li key={field}>
                  <span className="font-medium capitalize">{field.replace(/([A-Z])/g, " $1")}:</span> {detail}
                </li>
              ))}
            </ul>
          ) : null}
          {actions?.length ? (
            <div className="flex flex-wrap gap-2">
              {actions.map((action) => (
                <Button
                  key={action.id}
                  type="button"
                  size="sm"
                  variant={action.variant || "outline"}
                  className="h-8 border-red-200 bg-white text-red-900 hover:bg-red-50"
                  onClick={() => onAction?.(action.id)}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          ) : null}
          {IS_DEV && technicalReference ? (
            <details className="text-[11px] text-red-700/80">
              <summary className="cursor-pointer">Technical detail</summary>
              <pre className="mt-1 whitespace-pre-wrap break-words">{technicalReference}</pre>
            </details>
          ) : null}
          {onDismiss ? (
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-red-800" onClick={onDismiss}>
              Dismiss
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
