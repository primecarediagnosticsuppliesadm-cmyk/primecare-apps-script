import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Slide-out drawer shell for agent collection payment recording.
 */
export default function AgentCollectionPaymentDrawer({
  open,
  onClose,
  labName,
  loading = false,
  children,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Record payment">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close payment drawer"
      />
      <div
        className={cn(
          "absolute flex flex-col bg-white shadow-[-12px_0_40px_rgba(15,23,42,0.18)]",
          "inset-y-0 right-0 w-full max-w-[min(100vw,440px)]",
          "max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:h-[min(92vh,720px)] max-md:rounded-t-xl"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">Record payment</p>
            <p className="truncate text-[11px] text-slate-500">{labName || "Collection account"}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading collection details…
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}
