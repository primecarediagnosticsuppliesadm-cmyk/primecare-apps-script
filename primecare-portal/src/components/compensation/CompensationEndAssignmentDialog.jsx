import React, { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import ActionErrorSummary from "@/components/ux/ActionErrorSummary.jsx";

/**
 * Confirmation + localized feedback for ending a compensation plan assignment.
 */
export default function CompensationEndAssignmentDialog({
  open = false,
  row = null,
  busy = false,
  mutationError = null,
  onConfirm,
  onCancel,
  onDismissError,
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => {
      panelRef.current?.querySelector("button")?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !busy) onCancel?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel, open]);

  if (!open || !row) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close end assignment dialog"
        onClick={() => {
          if (!busy) onCancel?.();
        }}
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="end-assignment-title"
        aria-describedby="end-assignment-description"
        className="relative w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-2xl"
      >
        <h2 id="end-assignment-title" className="text-base font-semibold text-foreground">
          End compensation assignment?
        </h2>
        <p id="end-assignment-description" className="mt-2 text-sm text-muted-foreground">
          End the active plan assignment for <span className="font-medium text-foreground">{row.employeeName}</span> (
          {row.planName}). History is preserved — this does not delete the record.
        </p>

        {mutationError ? (
          <ActionErrorSummary
            className="mt-4"
            title={mutationError.title}
            message={mutationError.message}
            fieldErrors={mutationError.fieldErrors}
            actions={mutationError.suggestedActions}
            technicalReference={mutationError.rawErrorForLogging}
            onDismiss={onDismissError}
          />
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? "Ending assignment…" : "End Assignment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
