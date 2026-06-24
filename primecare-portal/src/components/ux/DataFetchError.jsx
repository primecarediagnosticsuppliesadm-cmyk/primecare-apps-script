import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Standard data-fetch failure banner with optional retry.
 * Use staleDataNote when last-known data remains visible.
 */
export default function DataFetchError({
  message = "Unable to load data. Check your connection and try again.",
  onRetry,
  retrying = false,
  retryLabel = "Retry",
  staleDataNote = "",
  className,
}) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium">{message}</p>
            {staleDataNote ? (
              <p className="mt-1 text-xs text-red-700/90">{staleDataNote}</p>
            ) : null}
          </div>
        </div>
        {onRetry ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 rounded-lg border-red-200 bg-white text-red-800 hover:bg-red-50"
            onClick={onRetry}
            disabled={retrying}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", retrying && "animate-spin")} />
            {retryLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
