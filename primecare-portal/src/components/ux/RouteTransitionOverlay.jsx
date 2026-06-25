import React, { useEffect, useRef, useState } from "react";
import PageSkeleton from "./PageSkeleton";
import { cn } from "@/lib/utils";

const COLD_MIN_MS = 0;
const COLD_MAX_MS = 120;

/**
 * Brief skeleton overlay on cold sidebar navigation only.
 * Skipped when skipOverlay is true (warm cache / revisit).
 * @param {{ pageKey: string, skipOverlay?: boolean, children: React.ReactNode, className?: string }} props
 */
export default function RouteTransitionOverlay({ pageKey, skipOverlay = false, children, className }) {
  const [visible, setVisible] = useState(false);
  const prevKey = useRef(pageKey);
  const hideTimer = useRef(null);

  useEffect(() => {
    if (prevKey.current === pageKey) return undefined;

    prevKey.current = pageKey;

    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    if (skipOverlay) {
      setVisible(false);
      return undefined;
    }

    setVisible(true);

    const minTimer = window.setTimeout(() => {
      hideTimer.current = window.setTimeout(
        () => setVisible(false),
        Math.max(0, COLD_MAX_MS - COLD_MIN_MS)
      );
    }, COLD_MIN_MS);

    return () => {
      window.clearTimeout(minTimer);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [pageKey, skipOverlay]);

  return (
    <div className={cn("relative", className)}>
      {visible ? (
        <div
          className="pointer-events-none absolute inset-0 z-20 bg-slate-50/90 will-change-[opacity]"
          aria-hidden="true"
        >
          <PageSkeleton kpiCount={4} kpiColumns={4} listRows={5} className="p-3 md:p-5" />
        </div>
      ) : null}
      {children}
    </div>
  );
}
