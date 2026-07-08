import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ux";
import { ChevronDown, ChevronRight, Building2, User, Users, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import CompensationAttributionPreview from "@/components/peopleOps/ownership/CompensationAttributionPreview.jsx";

const TYPE_ICON = {
  executive: Crown,
  admin: Users,
  agent: User,
  lab: Building2,
};

function TreeNode({ node, depth = 0, expanded, onToggle, onOpenLab, onOpenEmployee }) {
  const Icon = TYPE_ICON[node.type] || User;
  const isExpanded = expanded.has(node.id);
  const hasChildren = (node.children || []).length > 0;

  const handleClick = () => {
    if (node.type === "lab") onOpenLab?.(node.entityId);
    else if (node.profileUserId) onOpenEmployee?.(node.profileUserId);
    if (hasChildren) onToggle(node.id);
  };

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 hover:border-border hover:bg-muted/40",
          node.type === "lab" && "cursor-pointer"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-muted"
            onClick={() => onToggle(node.id)}
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          <span className="inline-block h-6 w-6" />
        )}
        <Icon className="h-4 w-4 shrink-0 text-[var(--pc-brand-primary)]" aria-hidden />
        <button type="button" className="min-w-0 flex-1 text-left" onClick={handleClick}>
          <p className="truncate text-sm font-medium text-foreground">{node.label}</p>
          <p className="truncate text-[11px] text-muted-foreground">{node.subtitle}</p>
        </button>
        {node.collectionsLabel ? (
          <div className="hidden shrink-0 text-right text-[11px] sm:block">
            <p className="font-medium tabular-nums">{node.collectionsLabel}</p>
            <p className="text-muted-foreground">Collections</p>
          </div>
        ) : null}
        {node.type === "lab" ? <StatusBadge variant="info" label="Lab" /> : null}
      </div>

      {isExpanded && hasChildren ? (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onOpenLab={onOpenLab}
              onOpenEmployee={onOpenEmployee}
            />
          ))}
        </div>
      ) : null}

      {isExpanded && node.type === "agent" && node.compensationPreview ? (
        <div className="mx-2 mb-2 rounded-lg border border-dashed border-border bg-muted/20 p-3" style={{ marginLeft: `${depth * 16 + 40}px` }}>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Compensation Preview (read-only)
          </p>
          <CompensationAttributionPreview preview={node.compensationPreview} compact />
        </div>
      ) : null}
    </div>
  );
}

export default function OwnershipExplorerTree({ orgTree = [], onOpenLab, onOpenEmployee }) {
  const [expanded, setExpanded] = useState(() => new Set(orgTree.map((node) => node.id)));

  const allNodeIds = useMemo(() => {
    const ids = [];
    const walk = (nodes) => {
      for (const node of nodes || []) {
        ids.push(node.id);
        walk(node.children);
      }
    };
    walk(orgTree);
    return ids;
  }, [orgTree]);

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setExpanded(new Set(allNodeIds))}>
          Expand all
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setExpanded(new Set())}>
          Collapse all
        </Button>
      </div>
      <div className="rounded-xl border border-border bg-card p-2">
        {orgTree.length ? (
          orgTree.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              expanded={expanded}
              onToggle={toggle}
              onOpenLab={onOpenLab}
              onOpenEmployee={onOpenEmployee}
            />
          ))
        ) : (
          <p className="px-3 py-6 text-sm text-muted-foreground">No ownership hierarchy available yet.</p>
        )}
      </div>
    </div>
  );
}
