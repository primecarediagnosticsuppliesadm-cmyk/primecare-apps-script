import React from "react";
import { cn } from "@/lib/utils";

const COLUMN_CLASS = {
  2: "grid-cols-2",
  3: "grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-2 lg:grid-cols-4",
  6: "grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
};

/**
 * Responsive grid for KpiCard children.
 * @param {{ columns?: 2 | 3 | 4 | 6, className?: string, children: React.ReactNode }} props
 */
export default function KpiCardGrid({ columns = 4, className, children }) {
  return (
    <div
      className={cn(
        "grid gap-3",
        COLUMN_CLASS[columns] || COLUMN_CLASS[4],
        className
      )}
    >
      {children}
    </div>
  );
}
