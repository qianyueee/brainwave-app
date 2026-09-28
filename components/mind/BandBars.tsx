"use client";

import type { BandKey, BandPowers } from "@/lib/mind/types";
import { BAND_META } from "@/lib/mind/types";
import { useLocale } from "@/lib/i18n";

/**
 * English column labels. BAND_META's `en` ("High-Alpha", "Mid-Gamma") is too
 * wide for eight ~34px columns on a phone, so the English equalizer keeps the
 * Greek letters the Japanese labels use (δ波 → δ, 高α波 → High α). Mid γ
 * follows BAND_META's "Mid-Gamma".
 */
const BAND_SHORT_EN: Record<BandKey, string> = {
  delta: "δ",
  theta: "θ",
  lowAlpha: "Low α",
  highAlpha: "High α",
  lowBeta: "Low β",
  highBeta: "High β",
  lowGamma: "Low γ",
  highGamma: "Mid γ",
};

/**
 * Vertical equalizer of the 8 raw EEG bands (Delta … Mid-Gamma). Presentational
 * only — pass relative powers (0-100). Gamma bands use the accent color (the
 * 40Hz entrainment target); the rest use the primary.
 */
export default function BandBars({ powers }: { powers: BandPowers }) {
  const locale = useLocale();
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
            <span className="text-xs font-bold text-text-primary whitespace-nowrap">
              {locale === "en" ? BAND_SHORT_EN[b.key] : b.ja}
            </span>
            <span className="text-xs font-mono tabular-nums text-text-secondary">
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
