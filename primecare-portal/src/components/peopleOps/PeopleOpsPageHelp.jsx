import React, { useEffect, useId, useRef, useState } from "react";
import { CircleHelp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PEOPLE_OPS_PAGE_HELP, PEOPLE_OPS_SECTION_HELP } from "@/peopleOps/peopleOpsBusinessCopy.js";
import { cn } from "@/lib/utils";

/**
 * RC5/RC6 — Page or section help (business language only).
 */
export default function PeopleOpsPageHelp({
  moduleId = null,
  sectionId = null,
  title: titleOverride = null,
  body: bodyOverride = null,
  compact = false,
  className,
}) {
  const fromModule = moduleId ? PEOPLE_OPS_PAGE_HELP[moduleId] : null;
  const fromSection = sectionId ? PEOPLE_OPS_SECTION_HELP[sectionId] : null;
  const help = {
    title: titleOverride || fromSection?.title || fromModule?.title || "Why this matters",
    body: bodyOverride || fromSection?.body || fromModule?.body || "",
  };
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!help.body) return null;

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <Button
        type="button"
        size="sm"
        variant={compact ? "ghost" : "outline"}
        className={cn(compact ? "h-6 w-6 p-0" : "h-7 gap-1 px-2 text-[10px]")}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={help.title}
        onClick={() => setOpen((value) => !value)}
      >
        <CircleHelp className="h-3.5 w-3.5" aria-hidden />
        {compact ? null : <span>What does this page do?</span>}
      </Button>
      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={help.title}
          className="absolute right-0 top-full z-30 mt-1 w-72 rounded-lg border border-border bg-background p-3 shadow-lg"
        >
          <div className="mb-1.5 flex items-start justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">{help.title}</p>
            <Button type="button" size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setOpen(false)} aria-label="Close help">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{help.body}</p>
        </div>
      ) : null}
    </div>
  );
}
