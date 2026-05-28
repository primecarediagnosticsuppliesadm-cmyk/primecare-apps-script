import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  UserPlus,
  ArrowUp,
  Check,
  MessageSquare,
  Camera,
  Clock,
  CheckCircle2,
  RotateCcw,
  MoreHorizontal,
} from "lucide-react";

const ACTIONS = [
  { key: "assign_owner", label: "Assign", icon: UserPlus },
  { key: "escalate", label: "Escalate", icon: ArrowUp },
  { key: "mark_reviewed", label: "Reviewed", icon: Check },
  { key: "request_followup", label: "Follow-up", icon: MessageSquare },
  { key: "require_proof", label: "Proof", icon: Camera },
  { key: "snooze", label: "Snooze 24h", icon: Clock },
  { key: "resolve", label: "Resolve", icon: CheckCircle2 },
  { key: "reopen", label: "Reopen", icon: RotateCcw },
];

/**
 * Compact executive action chips for intervention cards / drawer footer.
 */
export default function InterventionActionBar({
  issue,
  onAction,
  compact = false,
  className,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const resolved = issue?.workflowState === "RESOLVED";

  const visible = resolved
    ? ACTIONS.filter((a) => a.key === "reopen")
    : ACTIONS.filter((a) => a.key !== "reopen");

  const primary = visible.slice(0, compact ? 4 : 6);
  const overflow = visible.slice(compact ? 4 : 6);

  const run = (key) => {
    setMenuOpen(false);
    onAction?.(key, issue);
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {primary.map(({ key, label, icon: Icon }) => (
        <Button
          key={key}
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-[10px]"
          onClick={(e) => {
            e.stopPropagation();
            run(key);
          }}
        >
          <Icon className="h-3 w-3 shrink-0" />
          <span className="hidden sm:inline">{label}</span>
        </Button>
      ))}
      {overflow.length ? (
        <div className="relative">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          {menuOpen ? (
            <div
              className="absolute bottom-full right-0 z-30 mb-1 min-w-[9rem] rounded-md border bg-white py-1 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              {overflow.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-[11px] hover:bg-slate-50"
                  onClick={() => run(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
