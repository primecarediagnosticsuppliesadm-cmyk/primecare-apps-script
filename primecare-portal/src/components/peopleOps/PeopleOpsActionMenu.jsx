import React, { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Compact overflow action menu for enterprise tables.
 */
export default function PeopleOpsActionMenu({ items = [], ariaLabel = "Row actions", disabled = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const visibleItems = items.filter((item) => item && !item.hidden);

  if (!visibleItems.length) return null;

  return (
    <div className="relative" ref={rootRef}>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-8 w-8 p-0"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 min-w-[10rem] rounded-lg border border-border bg-card py-1 shadow-lg"
        >
          {visibleItems.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={cn(
                "block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50",
                item.destructive && "text-destructive"
              )}
              onClick={() => {
                setOpen(false);
                item.onClick?.();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
