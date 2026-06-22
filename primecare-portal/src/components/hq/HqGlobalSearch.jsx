import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { loadHqGlobalSearchIndex } from "@/operations/hqGlobalSearchData.js";
import {
  persistHqNavContext,
  searchHqIndex,
} from "@/operations/hqGlobalSearchEngine.js";
import { getMenuItem } from "@/config/menuConfig.js";
import { cn } from "@/lib/utils";
import { Loader2, Search, X } from "lucide-react";

function str(v) {
  return String(v ?? "").trim();
}

export default function HqGlobalSearch({ tenantId, open, onClose, setActivePage }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState([]);

  const loadIndex = useCallback(async () => {
    setLoading(true);
    try {
      const res = await loadHqGlobalSearchIndex(tenantId, { force: true });
      setIndex(res.index || []);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    void loadIndex();
  }, [open, loadIndex]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const groups = useMemo(() => searchHqIndex(index, query), [index, query]);

  function selectItem(item) {
    persistHqNavContext({ page: item.page, ...item.context });
    setActivePage?.(item.page);
    onClose?.();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 pt-[12vh]">
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="HQ search"
      >
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <Input
            autoFocus
            className="border-0 shadow-none focus-visible:ring-0"
            placeholder="Search labs, users, orders, SKUs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close search">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading search index…
            </div>
          ) : !str(query) ? (
            <p className="px-2 py-6 text-center text-xs text-slate-500">
              Type to search labs, users, orders, products, and purchase orders.
              <span className="mt-1 block text-[10px] text-slate-400">Tip: ⌘K / Ctrl+K anywhere in HQ</span>
            </p>
          ) : groups.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-slate-500">No matches for &quot;{query}&quot;</p>
          ) : (
            groups.map((group) => (
              <div key={group.id} className="mb-3">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {group.label}
                </p>
                <ul>
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="flex w-full flex-col rounded-lg px-2 py-2 text-left hover:bg-slate-100"
                        onClick={() => selectItem(item)}
                      >
                        <span className="text-sm font-medium text-slate-900">{item.title}</span>
                        <span className="text-[11px] text-slate-500">{item.subtitle}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/** Registers Cmd+K / Ctrl+K shortcut for HQ search. */
export function useHqGlobalSearchShortcut(onOpen) {
  useEffect(() => {
    function handleKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpen?.();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onOpen]);
}

export function HqSearchTriggerButton({ onClick, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border bg-white px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-50 md:max-w-md",
        className
      )}
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="truncate">Search labs, users, orders, SKUs…</span>
      <kbd className="ml-auto hidden rounded border bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 sm:inline">
        ⌘K
      </kbd>
    </button>
  );
}

export function relatedPageLabel(pageKey) {
  return getMenuItem(pageKey)?.label || pageKey;
}
