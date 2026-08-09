"use client";

import { useState, useEffect } from "react";
import { useZodiacStore } from "@/store/useZodiacStore";
import {
  ZODIAC_SIGNS,
  getZodiacSign,
  getTodaySky,
  isNightNow,
  zodiacNameEn,
  dailyRecommendation,
  type TodaySky,
} from "@/lib/zodiac";
import { getProgramById } from "@/lib/programs";
import ZodiacSignPicker from "@/components/ZodiacSignPicker";
import ZodiacConstellation from "@/components/ZodiacConstellation";
import { usePlayProgram } from "@/components/usePlayProgram";
import { Sun, Moon, ChevronDown, Sparkles, Play } from "lucide-react";

/** Fixed deep-night gradient — the star map stays on a dark sky in every theme. */
const NIGHT_SKY =
  "radial-gradient(130% 130% at 30% 15%, #2a3670 0%, #19224f 45%, #0a102e 100%)";

/**
 * Today's Cosmic Sync — compact daily-recommendation entry for Home.
 * Order is CTA-first so starting a session fits in the first viewport:
 * header line → today's recommendation + start button → a slim star-map
 * strip → a disclosure holding the my-sign selector and sun/moon message.
 * (Session's WaterMandalaHero stays the full-size figure — Home is the
 * quick entry, Session the full selection.)
 */
export default function ZodiacSyncCard() {
  const playProgram = usePlayProgram();
  const selectedSign = useZodiacStore((s) => s.selectedSign);
  const setSelectedSign = useZodiacStore((s) => s.setSelectedSign);

  // Guard hydration mismatch from the persisted sign
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

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

  // Hero = today's sign in the sky right now: sun by day, moon by night
  // (same 6:00/18:00 boundaries as the time-of-day theme). Only meaningful
  // once `sky` resolves, which happens client-side — so reading the clock
  // inline can't cause an SSR mismatch.
  const night = isNightNow();
  const heroSign = sky ? ZODIAC_SIGNS[night ? sky.moonIndex : sky.sunIndex] : undefined;
  const sunSign = sky ? ZODIAC_SIGNS[sky.sunIndex] : undefined;
  const moonSign = sky ? ZODIAC_SIGNS[sky.moonIndex] : undefined;

  // Effective sign: the saved choice, else today's hero sign once computed.
  // The fallback is deliberately NOT written to the store — a default is not
  // a choice; only a tap persists.
  const effectiveKey = hydrated ? selectedSign ?? heroSign?.key ?? null : null;
  const sign = effectiveKey ? getZodiacSign(effectiveKey) : undefined;

  // Modular synthesis: the carrier stays the user's own sign (fixed 音色),
  // while the guided beat varies daily with the sun/moon elements, weekday
  // and time of day (§5 matrix) — so the recommendation changes with the sky.
  const rec = sign ? dailyRecommendation(sky, sign) : null;
  const program = rec ? getProgramById(rec.programId) : undefined;

  const handleSelect = (key: (typeof ZODIAC_SIGNS)[number]["key"]) => {
    setSelectedSign(key);
    setPickerOpen(false);
  };

  const handlePlay = () => {
    if (!program) return;
    playProgram(program);
  };

  return (
    <div className="bg-surface border border-surface-border rounded-3xl p-5 neu-raised breathe-soft flex flex-col gap-4">
      {/* Header line: label + today's hero sign in one row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-text-secondary">Today&apos;s Cosmic Sync</p>
        {heroSign && (
          <p className="text-sm text-text-secondary flex items-center gap-1.5">
            {night ? <Moon size={15} strokeWidth={1.5} /> : <Sun size={15} strokeWidth={1.5} />}
            {night ? "今夜の月星座" : "今日の太陽星座"}
            <span className="font-bold text-text-primary">{heroSign.nameJa}</span>
          </p>
        )}
      </div>

      {/* Today's recommendation + start button — the card's reason to exist,
          so it comes first and stays inside the first viewport. */}
      {sign && rec && program ? (
        <div className="rounded-2xl bg-navy neu-inset p-4 flex flex-col gap-1">
          <p className="text-sm text-text-secondary flex items-center gap-1.5">
            <Sparkles size={15} strokeWidth={1.5} className="text-primary" />
            {sign.nameJa}のあなたへ 本日の星空おすすめ周波数
          </p>
          {rec.tagLabel && (
            <p className="text-sm font-bold text-primary mt-1">【{rec.tagLabel}】</p>
          )}
          <p className="text-base font-bold text-text-primary">{program.name}</p>
          <p className="text-sm text-text-secondary">
            {rec.reason ? `${rec.reason}、この周波数をおすすめします` : "星のサイクルと脳波を共鳴"}
          </p>
          <button
            onClick={handlePlay}
            className="mt-3 w-full h-12 rounded-2xl bg-primary text-on-primary text-base font-bold flex items-center justify-center gap-2 neu-raised neu-press active:scale-95 transition-all"
          >
            <Play size={18} strokeWidth={2} />
            この音でセッションを開始する
          </button>
        </div>
      ) : (
        <p className="text-sm text-text-secondary">
          {!hydrated || (!sky && !skyFailed)
            ? "今日の空を計算中…"
            : skyFailed && !sign
              ? "今日の星空は取得できませんでした。星座を選ぶとおすすめが表示されます"
              : "星座を選ぶとおすすめプログラムが表示されます"}
        </p>
      )}

      {/* Star map — reduced to a slim strip; the full figure lives on Session */}
      <div
        className="relative w-full h-28 rounded-2xl overflow-hidden neu-inset"
        style={{ background: NIGHT_SKY }}
      >
        {heroSign ? (
          <>
            {/* Breathing halo behind the figure — the luminous part of the motion */}
            <div
              className="sky-glow absolute inset-0"
              style={{
                background:
                  "radial-gradient(60% 55% at 50% 46%, rgba(165,190,255,0.30) 0%, rgba(165,190,255,0.10) 45%, transparent 72%)",
              }}
            />
            <ZodiacConstellation
              sign={heroSign.key}
              animated
              className="constellation-breathe absolute inset-0 w-full h-full text-[#dfe9ff]"
            />
          </>
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-sm text-[#8f9cc9]">
            {skyFailed ? "今日の空は取得できませんでした" : "今日の空を計算中…"}
          </span>
        )}
      </div>

      {/* Details disclosure: my-sign selector + today's sun/moon message */}
      {hydrated && (
        <div className="flex flex-col gap-3">
          <button
            onClick={() => setDetailsOpen((v) => !v)}
            aria-expanded={detailsOpen}
            className="w-full min-h-12 px-4 rounded-2xl bg-navy neu-raised-sm neu-press transition-transform flex items-center justify-between text-base text-text-secondary"
          >
            <span>星座の変更・今日の星空</span>
            <ChevronDown
              size={20}
              className={`shrink-0 text-text-muted transition-transform ${detailsOpen ? "rotate-180" : ""}`}
            />
          </button>

          {detailsOpen && (
            <>
              {/* My-sign dropdown selector */}
              <div className="flex flex-col gap-2">
                <p className="text-sm text-text-secondary">あなたの星座を選択</p>
                <button
                  onClick={() => setPickerOpen((v) => !v)}
                  aria-expanded={pickerOpen}
                  className="w-full min-h-12 px-4 py-2 rounded-2xl bg-navy neu-raised-sm neu-press transition-transform flex items-center gap-3 text-left"
                >
                  {sign ? (
                    <>
                      <ZodiacConstellation sign={sign.key} variant="icon" className="w-8 h-8 shrink-0 text-primary" />
                      <span className="flex-1 text-base font-bold text-text-primary">
                        {sign.nameJa}
                        <span className="font-medium text-text-secondary">（{zodiacNameEn(sign.key)}）</span>
                      </span>
                    </>
                  ) : (
                    <span className="flex-1 text-base text-text-secondary">星座を選択</span>
                  )}
                  <ChevronDown
                    size={20}
                    className={`shrink-0 text-text-muted transition-transform ${pickerOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {pickerOpen && <ZodiacSignPicker value={effectiveKey} onChange={handleSelect} />}
              </div>

              {/* Today's sky + daily message */}
              <div className="rounded-2xl bg-navy neu-inset p-4 flex flex-col gap-2">
                <div className="flex items-center justify-center gap-2 text-base text-text-primary">
                  <span className="flex items-center gap-1.5">
                    <Sun size={16} strokeWidth={1.5} className="text-accent" />
                    太陽：{sunSign ? sunSign.nameJa : "…"}
                  </span>
                  <span className="text-text-muted">｜</span>
                  <span className="flex items-center gap-1.5">
                    <Moon size={16} strokeWidth={1.5} className="text-primary" />
                    月：{moonSign ? moonSign.nameJa : "…"}
                  </span>
                </div>
                {rec && (
                  <p className="text-sm text-text-secondary leading-relaxed">「{rec.advice}」</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
