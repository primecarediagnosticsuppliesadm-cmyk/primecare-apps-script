import React from "react";
import { Button } from "@/components/ui/button";
import { getHqPageHelp } from "@/config/hqPageHelpConfig.js";
import { getMenuItem } from "@/config/menuConfig.js";
import { X, HelpCircle } from "lucide-react";

export default function HqHelpDrawer({ pageKey, open, onClose, setActivePage }) {
  const help = getHqPageHelp(pageKey);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[65] flex justify-end bg-black/30" role="dialog" aria-modal="true">
      <div className="h-full w-full max-w-md overflow-y-auto border-l bg-white p-4 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-indigo-600" />
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">Help</p>
              <h2 className="text-base font-bold text-slate-900">{help?.title || "HQ Page Guide"}</h2>
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close help">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {!help ? (
          <p className="text-sm text-slate-600">No help content configured for this page yet.</p>
        ) : (
          <div className="space-y-4 text-sm text-slate-700">
            <section>
              <h3 className="font-semibold text-slate-900">What is this page?</h3>
              <p className="mt-1 text-slate-600">{help.what}</p>
            </section>
            <section>
              <h3 className="font-semibold text-slate-900">What should I do here?</h3>
              <p className="mt-1 text-slate-600">{help.doHere}</p>
            </section>
            <section>
              <h3 className="font-semibold text-slate-900">Common actions</h3>
              <ul className="mt-1 list-inside list-disc text-slate-600">
                {help.actions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </section>
            <section>
              <h3 className="font-semibold text-slate-900">Related pages</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {(help.related || []).map((key) => (
                  <Button
                    key={key}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => {
                      setActivePage?.(key);
                      onClose?.();
                    }}
                  >
                    {getMenuItem(key)?.label || key}
                  </Button>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

export function HqHelpButton({ onClick }) {
  return (
    <Button type="button" variant="outline" size="sm" className="h-10 gap-1.5" onClick={onClick}>
      <HelpCircle className="h-4 w-4" />
      Help
    </Button>
  );
}
