"use client";

import type { BandPowers } from "@/lib/mind/types";
import { BAND_META } from "@/lib/mind/types";

/**
 * Vertical equalizer of the 8 raw EEG bands (Delta … Mid-Gamma). Presentational
 * only — pass relative powers (0-100). Gamma bands use the accent color (the
 * 40Hz entrainment target); the rest use the primary.
 */
export default function BandBars({ powers }: { powers: BandPowers }) {
  return (
    <div className="flex justify-around items-end gap-1">
      {BAND_META.map((b) => {
        const pct = Math.min(100, Math.round(powers[b.key]));
        return (
          <div key={b.key} className="flex flex-col items-center gap-1 flex-1 min-w-0">
            <div className="relative w-full max-w-9 h-[110px] rounded-lg bg-navy neu-inset overflow-hidden">
              <div
                className="absolute bottom-0 left-0 right-0 rounded-t-md transition-[height] duration-700 ease-out"
                style={{
                  height: `${pct}%`,
                  backgroundColor: b.isGamma ? "var(--color-accent)" : "var(--color-primary)",
                }}
              />
            </div>
            <span className="text-[11px] font-bold text-text-primary whitespace-nowrap">
              {b.ja}
            </span>
            <span className="text-[11px] font-mono tabular-nums text-text-secondary">
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
