import React from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ExecutiveActionModalShell({
  title,
  subtitle = "",
  onClose,
  children,
  footer = null,
  wide = false,
  className,
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className={cn(
          "max-h-[90vh] w-full overflow-y-auto rounded-xl border bg-white p-4 shadow-lg",
          wide ? "max-w-2xl" : "max-w-lg",
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="executive-action-modal-title"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h3 id="executive-action-modal-title" className="text-sm font-bold text-slate-900">
              {title}
            </h3>
            {subtitle ? <p className="mt-0.5 text-xs text-slate-600">{subtitle}</p> : null}
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        {children}
        {footer ? <div className="mt-4 flex flex-wrap justify-end gap-2 border-t pt-3">{footer}</div> : null}
      </div>
    </div>
  );
}
