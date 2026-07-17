"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, X } from "lucide-react";

/**
 * Wraps a chart with a small expand button; tapping it opens the chart in a
 * full-screen overlay, scaled up to fit the viewport (crisp for SVG charts).
 * The chart is re-rendered inside the overlay, so it must be stateless /
 * prop-driven (all the Recharts charts are).
 */
export default function Fullscreenable({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState(1);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Measure the un-scaled card, then scale it to fill the viewport.
    const id = requestAnimationFrame(() => {
      const el = innerRef.current;
      if (!el) return;
      const w = el.offsetWidth || 360;
      const h = el.offsetHeight || 320;
      const s = Math.min((window.innerWidth * 0.94) / w, (window.innerHeight * 0.8) / h);
      setScale(Math.max(1, s));
    });
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      cancelAnimationFrame(id);
    };
  }, [open]);

  return (
    <div className="relative">
      {children}
      <button
        type="button"
        onClick={() => {
          setScale(1); // start un-scaled so the effect can measure natural size
          setOpen(true);
        }}
        aria-label="全画面表示"
        className="absolute top-2 right-2 z-10 w-8 h-8 rounded-lg bg-navy/70 backdrop-blur-sm flex items-center justify-center text-text-secondary neu-raised-sm active:opacity-70"
      >
        <Maximize2 size={16} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] bg-black/85 flex flex-col"
          onClick={() => setOpen(false)}
          role="button"
          aria-label="閉じる"
        >
          <div className="flex items-center justify-between p-3 shrink-0">
            <p className="text-base font-bold text-white truncate">{title ?? ""}</p>
            <button
              onClick={() => setOpen(false)}
              aria-label="閉じる"
              className="shrink-0 w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center overflow-hidden">
            <div
              ref={innerRef}
              style={{ width: 360, transform: `scale(${scale})`, transformOrigin: "center" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-surface border border-surface-border rounded-3xl p-4">
                {children}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
