"use client";

import { useState, useEffect } from "react";
import { useZodiacStore } from "@/store/useZodiacStore";
import {
  ZODIAC_SIGNS,
  getZodiacSign,
  getTodaySky,
  isNightNow,
  dailyRecommendation,
  zodiacName,
  type TodaySky,
} from "@/lib/zodiac";
import { getProgramById, programName } from "@/lib/programs";
import { useLocale, useT } from "@/lib/i18n";
import WaterMandala from "@/components/WaterMandala";
import { usePlayProgram } from "@/components/usePlayProgram";
import { Play } from "lucide-react";

/** Fixed deep-water gradient — the mandala floats on dark water in every theme. */
const DEEP_WATER =
  "radial-gradient(120% 120% at 50% 30%, #16456b 0%, #0e2b4e 52%, #0a1830 100%)";

/**
 * Sync Session hero — the water mandala for today's frequency. Defaults to
 * the same daily zodiac recommendation as the home card (own-sign carrier ×
 * today's guided beat, my-sign preference respected, hero sign as fallback),
 * so the figure people see on entry is the sound they are invited to start.
 */
export default function WaterMandalaHero() {
  const playProgram = usePlayProgram();
  const selectedSign = useZodiacStore((s) => s.selectedSign);
  const t = useT();
  const locale = useLocale();

  // Guard hydration mismatch from the persisted sign
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const [sky, setSky] = useState<TodaySky | null>(null);
  const [skyFailed, setSkyFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getTodaySky()
      .then((s) => {
        if (!cancelled) setSky(s);
      })
      .catch(() => {
        if (!cancelled) setSkyFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Same fallback chain as the home card: saved sign, else today's hero sign
  // (sun by day / moon by night). Reading the clock is client-only here too.
  const night = isNightNow();
  const heroKey = sky ? ZODIAC_SIGNS[night ? sky.moonIndex : sky.sunIndex].key : undefined;
  const effectiveKey = hydrated ? selectedSign ?? heroKey ?? null : null;
  const sign = effectiveKey ? getZodiacSign(effectiveKey) : undefined;

  const rec = sign ? dailyRecommendation(sky, sign, new Date(), locale) : null;
  const program = rec ? getProgramById(rec.programId) : undefined;

  const handlePlay = () => {
    if (!program) return;
    playProgram(program);
  };

  return (
    <div className="bg-surface border border-surface-border rounded-3xl p-5 neu-raised breathe-soft flex flex-col gap-4">
      <p className="text-sm text-text-secondary">
        {t("Water Mandala｜本日のシンクロ周波数", "Water Mandala · Today's sync frequency")}
      </p>

      <div
        className="relative w-full aspect-[16/10] rounded-2xl overflow-hidden neu-inset"
        style={{ background: DEEP_WATER }}
      >
        {/* Breathing halo behind the figure — same luminous layer as the star map */}
        <div
          className="sky-glow absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 55% at 50% 50%, rgba(140,205,255,0.28) 0%, rgba(140,205,255,0.09) 45%, transparent 72%)",
          }}
        />
        <WaterMandala
          carrier={sign?.carrierFreq ?? 432}
          beat={rec?.beatFreq ?? 7.83}
          animated
          locale={locale}
          className="absolute inset-0 w-full h-full text-[#cfe9ff]"
        />
        {!sign && (
          <span className="absolute inset-x-0 bottom-3 text-center text-sm text-[#8fb3d9]">
            {skyFailed
              ? t("今日の星空は取得できませんでした", "Couldn't load today's sky")
              : t("今日の周波数を計算中…", "Calculating today's frequency…")}
          </span>
        )}
      </div>

      {sign && rec && program ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-center gap-2 flex-wrap">
            {/* 英語は【】の代わりにコロンで名前と区切る（同じ行に並ぶので、
                区切りが無いと太字の2語が1つの名前に読める） */}
            {rec.tagLabel && (
              <span className="text-sm font-bold text-primary">
                {t(`【${rec.tagLabel}】`, `${rec.tagLabel}:`)}
              </span>
            )}
            <span className="text-base font-bold text-text-primary">
              {programName(program, locale)}
            </span>
          </div>
          <p className="text-sm text-text-secondary text-center">
            {t(
              `${sign.nameJa}のあなたへ、本日の星空が描く水の紋様`,
              `For you, ${zodiacName(sign, locale)}: a water pattern drawn by today's sky`
            )}
          </p>
          <button
            onClick={handlePlay}
            className="mt-2 w-full h-12 rounded-2xl bg-primary text-on-primary text-base font-bold flex items-center justify-center gap-2 neu-raised neu-press active:scale-95 transition-all"
          >
            <Play size={18} strokeWidth={2} />
            {t("この音でセッションを開始する", "Start a session with this sound")}
          </button>
        </div>
      ) : (
        hydrated &&
        skyFailed && (
          <p className="text-sm text-text-secondary text-center">
            {t(
              "ホームで星座を選ぶと、本日のおすすめ周波数が表示されます",
              "Choose your sign on Home to see today's recommended frequency."
            )}
          </p>
        )
      )}
    </div>
  );
}
