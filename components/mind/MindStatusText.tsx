"use client";

import { BatteryMedium, AlertTriangle, Sparkles } from "lucide-react";
import type { EegSample } from "@/lib/mind/types";
import { getQuadrant, boostedPosition, QUADRANT_INFO } from "@/lib/mind/types";
import { nearestEmotion } from "@/lib/mind/emotions";

export default function MindStatusText({
  sample,
  boost = 0,
}: {
  sample: EegSample | null;
  boost?: number;
}) {
  if (!sample) {
    return (
      <div className="text-center py-2">
        <p className="text-lg text-text-secondary">データを待っています…</p>
      </div>
    );
  }

  if (sample.signal !== undefined && sample.signal > 50) {
    return (
      <div className="flex items-center justify-center gap-2 py-2 text-amber-400">
        <AlertTriangle size={22} />
        <p className="text-lg font-bold">ヘッドセットの装着を確認してください</p>
      </div>
    );
  }

  const eff = boostedPosition(sample.attention, sample.meditation, boost);
  // Closest Russell-circumplex emotion anchor to the current position.
  const emotion = nearestEmotion(eff.attention, eff.meditation);
  const zone = QUADRANT_INFO[getQuadrant(eff.attention, eff.meditation)].label;
  const gammaRising = boost > 0.12; // gamma clearly above the resting baseline

  return (
    <div className="text-center py-2">
      <p className="text-xl font-bold text-text-primary">{emotion.name}</p>
      <div className="flex items-center justify-center gap-3 mt-1 text-sm text-text-secondary">
        <span>{zone}</span>
        {gammaRising && (
          <span className="flex items-center gap-1 text-accent font-medium">
            <Sparkles size={16} />
            γ波 上昇中
          </span>
        )}
        {sample.battery !== undefined && (
          <span className="flex items-center gap-1">
            <BatteryMedium size={16} />
            {sample.battery}%
          </span>
        )}
      </div>
    </div>
  );
}
