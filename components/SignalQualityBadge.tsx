"use client";

import { isLowQuality } from "@/lib/brain-profile";
import { useT } from "@/lib/i18n";

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
  const t = useT();
  if (qualityPct === undefined) return null;
  const low = isLowQuality(qualityPct);

  return (
    <span
      title={
        low
          ? t(
              "装着が不安定で、測定時間の一部しか脳波を読み取れませんでした。スコアは目安としてご覧ください",
              "The headset fit was unstable, so brainwaves were read for only part of the time. Treat the scores as a rough guide."
            )
          : t("測定時間のうち脳波を読み取れた割合です", "Share of the measuring time in which brainwaves could be read")
      }
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap ${
        low ? "bg-warning/15 text-warning" : "bg-navy text-text-muted font-normal"
      } ${className}`}
    >
      {t(`有効データ ${qualityPct}%`, `Usable data ${qualityPct}%`)}
      {/* English is kept to one word: the pill is nowrap and must fit a 320px list row. */}
      {low && t("・参考値", " · rough")}
    </span>
  );
}
