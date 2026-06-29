"use client";

import { useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

/**
 * Indicator name that reveals its description in a popup instead of showing it
 * inline. Opens on hover/focus (desktop) and tap (touch); tapping outside or
 * pressing Escape closes it.
 */
export default function IndicatorInfoTooltip({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDocPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-label={`${label}の説明`}
        aria-expanded={open}
        className="inline-flex items-center gap-1 py-1 text-base font-bold text-text-primary cursor-help text-left"
      >
        {label}
        <Info size={15} className="text-text-muted shrink-0" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute z-30 left-0 top-full mt-2 w-72 max-w-[78vw] p-3 rounded-2xl bg-navy border border-surface-border neu-raised-lg text-sm font-normal text-text-secondary leading-relaxed text-left"
        >
          {description}
        </span>
      )}
    </span>
  );
}
