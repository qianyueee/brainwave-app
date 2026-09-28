"use client";

import { BatteryMedium, AlertTriangle, Sparkles } from "lucide-react";
import type { EegSample } from "@/lib/mind/types";
import { getQuadrant, boostedPosition, QUADRANT_INFO, POOR_SIGNAL_LIMIT } from "@/lib/mind/types";
import { emotionName, nearestEmotion } from "@/lib/mind/emotions";
import { useLocale, useT } from "@/lib/i18n";

export default function MindStatusText({
  sample,
  boost = 0,
  gammaBoost = 0,
}: {
  sample: EegSample | null;
  /** Combined gamma + program pull — positions the emotion/zone readout. */
  boost?: number;
  /** Gamma-only pull — gates the honest "γ波 上昇中" badge. */
  gammaBoost?: number;
}) {
  const t = useT();
  const locale = useLocale();

  if (!sample) {
    return (
      <div className="text-center py-2">
        <p className="text-lg text-text-secondary">
          {t("データを待っています…", "Waiting for data…")}
        </p>
      </div>
    );
  }

  if (sample.signal !== undefined && sample.signal > POOR_SIGNAL_LIMIT) {
    return (
      <div className="flex items-center justify-center gap-2 py-2 text-warning">
        <AlertTriangle size={22} />
        <p className="text-lg font-bold">
          {t("ヘッドセットの装着を確認してください", "Please check that the headset is on properly")}
        </p>
      </div>
    );
  }

  const eff = boostedPosition(sample.attention, sample.meditation, boost);
  // Closest Russell-circumplex emotion anchor to the current position.
  const emotion = nearestEmotion(eff.attention, eff.meditation);
  const zoneInfo = QUADRANT_INFO[getQuadrant(eff.attention, eff.meditation)];
  const zone = locale === "en" ? zoneInfo.labelEn : zoneInfo.label;
  const gammaRising = gammaBoost > 0.12; // gamma clearly above the resting baseline

  return (
    <div className="text-center py-2">
      <p className="text-xl font-bold text-text-primary">{emotionName(emotion, locale)}</p>
      <div className="flex items-center justify-center gap-3 mt-1 text-sm text-text-secondary">
        <span>{zone}</span>
        {gammaRising && (
          <span className="flex items-center gap-1 text-accent font-medium">
            <Sparkles size={16} />
            {t("γ波 上昇中", "γ waves rising")}
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
