"use client";

import { isLowQuality } from "@/lib/brain-profile";

/**
 * How much of a measurement rests on real data: the share of recorded seconds
 * the headset actually read. Renders nothing when that is unknown (uploaded
 * files carry no POOR_SIGNAL column, and records predating the field never
 * stored it) — an absent badge means "not measured", never "perfect".
 */
export default function SignalQualityBadge({
  qualityPct,
  className = "",
}: {
  qualityPct?: number;
  className?: string;
}) {
  if (qualityPct === undefined) return null;
  const low = isLowQuality(qualityPct);

  return (
    <span
      title={
        low
          ? "装着が不安定で、測定時間の一部しか脳波を読み取れませんでした。スコアは目安としてご覧ください"
          : "測定時間のうち脳波を読み取れた割合です"
      }
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${
        low ? "bg-amber-400/15 text-amber-400" : "bg-navy text-text-muted font-normal"
      } ${className}`}
    >
      有効データ {qualityPct}%
      {low && "・参考値"}
    </span>
  );
}
