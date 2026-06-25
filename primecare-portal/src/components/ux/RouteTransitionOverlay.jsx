import React, { useEffect, useRef, useState } from "react";
import PageSkeleton from "./PageSkeleton";
import { cn } from "@/lib/utils";

const MIN_MS = 60;
const MAX_MS = 500;

/**
 * Brief skeleton overlay on sidebar navigation — avoids frozen blank transitions.
 * @param {{ pageKey: string, children: React.ReactNode, className?: string }} props
 */
export default function RouteTransitionOverlay({ pageKey, children, className }) {
  const [visible, setVisible] = useState(false);
  const prevKey = useRef(pageKey);
  const hideTimer = useRef(null);

  useEffect(() => {
    if (prevKey.current === pageKey) return undefined;

    prevKey.current = pageKey;
    setVisible(true);

    if (hideTimer.current) window.clearTimeout(hideTimer.current);

    const minTimer = window.setTimeout(() => {
      hideTimer.current = window.setTimeout(() => setVisible(false), MAX_MS - MIN_MS);
    }, MIN_MS);

    return () => {
      window.clearTimeout(minTimer);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [pageKey]);

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
