import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  UserPlus,
  ArrowUp,
  Check,
  Camera,
  MessageSquare,
  CheckCircle2,
  RotateCcw,
  Play,
  MoreHorizontal,
} from "lucide-react";

const EXEC_ACTIONS = [
  { key: "assign", label: "Assign", icon: UserPlus },
  { key: "escalate", label: "Escalate", icon: ArrowUp },
  { key: "request_evidence", label: "Proof", icon: Camera },
  { key: "require_followup", label: "Follow-up", icon: MessageSquare },
  { key: "complete", label: "Done", icon: CheckCircle2 },
  { key: "reopen", label: "Reopen", icon: RotateCcw },
];

const AGENT_ACTIONS = [
  { key: "acknowledge", label: "Ack", icon: Check },
  { key: "start", label: "Start", icon: Play },
  { key: "request_evidence", label: "Proof", icon: Camera },
  { key: "complete", label: "Done", icon: CheckCircle2 },
];

export default function OperationalTaskActionBar({
  task,
  variant = "executive",
  onAction,
  compact = true,
  className,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const completed = task?.resolutionStatus === "COMPLETED";
  const pool = variant === "agent" ? AGENT_ACTIONS : EXEC_ACTIONS;
  const visible = completed ? pool.filter((a) => a.key === "reopen") : pool.filter((a) => a.key !== "reopen");
  const primary = visible.slice(0, compact ? 4 : 6);
  const overflow = visible.slice(compact ? 4 : 6);

  const run = (key) => {
    setMenuOpen(false);
    onAction?.(key, task);
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {primary.map(({ key, label, icon: Icon }) => (
        <Button
          key={key}
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 px-2 text-[11px] max-md:h-9"
          onClick={(e) => {
            e.stopPropagation();
            run(key);
          }}
        >
          <Icon className="h-3.5 w-3.5" />
          <span>{label}</span>
        </Button>
      ))}
      {overflow.length ? (
        <div className="relative">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          {menuOpen ? (
            <div className="absolute bottom-full right-0 z-30 mb-1 min-w-[8rem] rounded-md border bg-white py-1 shadow-lg">
              {overflow.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-xs hover:bg-slate-50"
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
