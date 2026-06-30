"use client";

import { useEffect, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { INDICATOR_META } from "@/lib/brain-profile";

/**
 * "?" button that opens a popup listing all 6 indicators with their
 * descriptions — replaces the per-card always-on description text.
 */
export default function IndicatorHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="指標の説明を表示"
        className="w-8 h-8 rounded-full bg-navy neu-raised-sm flex items-center justify-center text-text-muted"
      >
        <HelpCircle size={18} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
          role="button"
          aria-label="閉じる"
        >
          <div
            className="w-full max-w-[480px] max-h-[80vh] overflow-y-auto bg-surface border border-surface-border rounded-3xl p-6 flex flex-col gap-4 neu-raised-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between sticky top-0">
              <h2 className="text-lg font-bold text-text-primary">指標の説明</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="閉じる"
                className="w-10 h-10 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-text-secondary"
              >
                <X size={20} />
              </button>
            </div>
            {INDICATOR_META.map((m) => (
              <div key={m.key} className="flex flex-col gap-1">
                <p className="text-base font-bold text-text-primary">{m.label}</p>
                <p className="text-sm text-text-secondary leading-relaxed">{m.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
