"use client";

import { useState, useEffect } from "react";
import { useZodiacStore } from "@/store/useZodiacStore";
import {
  ZODIAC_SIGNS,
  getZodiacSign,
  getTodaySky,
  isNightNow,
  dailyRecommendation,
  type TodaySky,
} from "@/lib/zodiac";
import { getProgramById } from "@/lib/programs";
import WaterMandala from "@/components/WaterMandala";
import { usePlayProgram } from "@/components/usePlayProgram";
import { Play } from "lucide-react";

/**
 * Sync Session hero — the water mandala for today's frequency. Defaults to
 * the same daily zodiac recommendation as the home card (own-sign carrier ×
 * today's guided beat, my-sign preference respected, hero sign as fallback),
 * so the figure people see on entry is the sound they are invited to start.
 *
 * Built on the same sky surface as Home's Astro Sync card — one art ground
 * shared by the two heroes, following the time of day rather than sitting on
 * fixed dark water. (The fullscreen visualizer on /player keeps its own fixed
 * dark canvas: that one is a viewing surface, not a card in the page.)
 */
export default function WaterMandalaHero() {
  const playProgram = usePlayProgram();
  const selectedSign = useZodiacStore((s) => s.selectedSign);

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

  const rec = sign ? dailyRecommendation(sky, sign) : null;
  const program = rec ? getProgramById(rec.programId) : undefined;

  const handlePlay = () => {
    if (!program) return;
    playProgram(program);
  };

  return (
    <div className="sky-surface relative rounded-3xl overflow-hidden border border-surface-border neu-raised breathe-soft">
      {/* Breathing halo behind the figure, centred high like the drop point */}
      <div
        className="sky-glow absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 55% at 50% 30%, var(--sky-glow) 0%, transparent 72%)",
        }}
      />

      {/* Stacked on mobile; on desktop the hero runs full width, so the figure
          moves beside the copy rather than growing to a half-page circle. */}
      <div className="relative p-5 flex flex-col gap-3 md:flex-row md:items-center md:gap-7">
        <div className="relative w-full aspect-[16/10] md:w-[220px] md:h-[132px] md:aspect-auto md:shrink-0">
          <WaterMandala
            carrier={sign?.carrierFreq ?? 432}
            beat={rec?.beatFreq ?? 7.83}
            animated
            className="absolute inset-0 w-full h-full text-sky-ink"
          />
          {!sign && (
            <span className="absolute inset-x-0 bottom-3 text-center text-sm text-sky-text">
              {skyFailed ? "今日の星空は取得できませんでした" : "今日の周波数を計算中…"}
            </span>
          )}
        </div>

        {sign && rec && program ? (
          <div className="flex flex-col gap-3 md:flex-1 md:min-w-0">
            <div className="text-center md:text-left">
              <p className="text-sm text-sky-text">
                本日の星空おすすめ
                {rec.tagLabel && (
                  <span className="font-bold text-sky-strong">　【{rec.tagLabel}】</span>
                )}
              </p>
              <p className="text-lg font-bold text-sky-strong mt-0.5">{program.name}</p>
              <p className="text-xs text-sky-text mt-1">
                {sign.nameJa}のあなたへ、本日の星空が描く水の紋様
              </p>
            </div>
            <button
              onClick={handlePlay}
              className="w-full h-12 rounded-2xl bg-primary text-on-primary text-base font-bold flex items-center justify-center gap-2 neu-press active:scale-95 transition-transform md:w-auto md:self-start md:px-8"
            >
              <Play size={18} strokeWidth={2} />
              この音でセッションを開始する
            </button>
          </div>
        ) : (
          hydrated &&
          skyFailed && (
            <p className="text-sm text-sky-text text-center md:flex-1 md:text-left">
              ホームで星座を選ぶと、本日のおすすめ周波数が表示されます
            </p>
          )
        )}
      </div>
    </div>
  );
}
