"use client";

import type { EegSample } from "@/lib/mind/types";
import { relativeBandPowers } from "@/lib/mind/types";

// Theme-coordinated: all bars use the dynamic primary, γ (the 40Hz
// entrainment target) is set apart with the accent color.
const BANDS = [
  { key: "delta", symbol: "δ", label: "デルタ", color: "var(--color-primary)" },
  { key: "theta", symbol: "θ", label: "シータ", color: "var(--color-primary)" },
  { key: "alpha", symbol: "α", label: "アルファ", color: "var(--color-primary)" },
  { key: "beta", symbol: "β", label: "ベータ", color: "var(--color-primary)" },
  { key: "gamma", symbol: "γ", label: "ガンマ", color: "var(--color-accent)" },
] as const;

export default function BandEqualizer({ sample }: { sample: EegSample | null }) {
  const powers = sample
    ? relativeBandPowers(sample)
    : { delta: 0, theta: 0, alpha: 0, beta: 0, gamma: 0 };

  return (
    <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised">
      <p className="text-base font-bold text-text-primary mb-3">脳波バランス</p>
      <div className="flex justify-around items-end gap-2">
        {BANDS.map((band) => {
          const pct = Math.min(100, Math.round(powers[band.key]));
          return (
            <div key={band.key} className="flex flex-col items-center gap-1 flex-1">
              <div className="relative w-full max-w-10 h-[120px] rounded-xl bg-navy neu-inset overflow-hidden">
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-t-md transition-[height] duration-700 ease-out"
                  style={{ height: `${pct}%`, backgroundColor: band.color }}
                />
              </div>
              <span className="text-base font-bold text-text-primary">
                {band.symbol}
              </span>
              <span className="text-xs text-text-secondary">{band.label}</span>
              <span className="text-sm font-mono tabular-nums text-text-primary">
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
