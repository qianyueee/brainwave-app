"use client";

import type { EegSample } from "@/lib/mind/types";
import { rawBandPowers, EMPTY_BAND_POWERS } from "@/lib/mind/types";
import BandBars from "./BandBars";

export default function BandEqualizer({ sample }: { sample: EegSample | null }) {
  const powers = sample ? rawBandPowers(sample) : EMPTY_BAND_POWERS;

  return (
    <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised">
      <p className="text-base font-bold text-text-primary mb-3">脳波バランス</p>
      <BandBars powers={powers} />
    </div>
  );
}
