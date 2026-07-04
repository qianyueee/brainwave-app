"use client";

import type { BandPowers } from "@/lib/mind/types";
import BandBars from "./BandBars";

/**
 * 脳波バランス card. Presentational: the parent decides what `powers` to show —
 * the instantaneous latest sample while idle, or the running session-average
 * while a measurement is recording (which is exactly what gets imported into
 * 脳特性, so the chart at the moment you stop matches the imported pie). `note`
 * labels which of the two is on screen.
 */
export default function BandEqualizer({
  powers,
  note,
}: {
  powers: BandPowers;
  note?: string;
}) {
  return (
    <div className="bg-surface border border-surface-border rounded-3xl p-4 neu-raised">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <p className="text-base font-bold text-text-primary">脳波バランス</p>
        {note && <p className="text-xs text-text-muted shrink-0">{note}</p>}
      </div>
      <BandBars powers={powers} />
    </div>
  );
}
