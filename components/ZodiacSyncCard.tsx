"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { useZodiacStore } from "@/store/useZodiacStore";
import {
  ZODIAC_SIGNS,
  getZodiacSign,
  getTodaySky,
  isNightNow,
  zodiacProgramId,
  type TodaySky,
} from "@/lib/zodiac";
import { getProgramById } from "@/lib/programs";
import ZodiacSignPicker from "@/components/ZodiacSignPicker";
import ZodiacConstellation from "@/components/ZodiacConstellation";
import { Sun, Moon } from "lucide-react";

/** Fixed deep-night gradient — the star map stays on a dark sky in every theme. */
const NIGHT_SKY =
  "radial-gradient(130% 130% at 30% 15%, #2a3670 0%, #19224f 45%, #0a102e 100%)";

/**
 * Cosmic & Brain Sync — today's sun × moon sign plus the 12-sign program
 * picker (replaces the old BrainWeather placeholder). The astronomy chunk
 * loads lazily; the picker and recommendation never depend on it.
 */
export default function ZodiacSyncCard() {
  const router = useRouter();
  const selectedSign = useZodiacStore((s) => s.selectedSign);
  const setSelectedSign = useZodiacStore((s) => s.setSelectedSign);
  const setSelectedProgramId = useAppStore((s) => s.setSelectedProgramId);
  const setTimerDuration = useAppStore((s) => s.setTimerDuration);

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

  // Hero = today's sign in the sky right now: sun by day, moon by night
  // (same 6:00/18:00 boundaries as the time-of-day theme). Only meaningful
  // once `sky` resolves, which happens client-side — so reading the clock
  // inline can't cause an SSR mismatch.
  const night = isNightNow();
  const heroSign = sky ? ZODIAC_SIGNS[night ? sky.moonIndex : sky.sunIndex] : undefined;
  const otherSign = sky ? ZODIAC_SIGNS[night ? sky.sunIndex : sky.moonIndex] : undefined;

  // Effective sign: the saved choice, else today's hero sign once computed.
  // The fallback is deliberately NOT written to the store — a default is not
  // a choice; only a tap persists.
  const effectiveKey = hydrated ? selectedSign ?? heroSign?.key ?? null : null;
  const sign = effectiveKey ? getZodiacSign(effectiveKey) : undefined;
  const program = effectiveKey ? getProgramById(zodiacProgramId(effectiveKey)) : undefined;

  const handlePlay = () => {
    if (!program) return;
    // Re-tapping the program that is already sounding must not reset the
    // running countdown/selection — just return to the player.
    const { isPlaying, selectedProgramId } = useAppStore.getState();
    if (!(isPlaying && selectedProgramId === program.id)) {
      setSelectedProgramId(program.id);
      setTimerDuration(program.defaultDuration);
    }
    router.push("/player");
  };

  return (
    <div className="bg-surface border border-surface-border rounded-3xl p-5 neu-raised breathe flex flex-col gap-4">
      {/* Hero — today's big sign: sun sign by day, moon sign by night */}
      <div className="flex flex-col items-center text-center gap-3">
        <p className="text-sm text-text-secondary self-start">Cosmic & Brain Sync</p>
        {heroSign && otherSign ? (
          <>
            <div
              className="relative w-full aspect-[16/10] rounded-2xl overflow-hidden neu-inset"
              style={{ background: NIGHT_SKY }}
            >
              <ZodiacConstellation
                sign={heroSign.key}
                animated
                className="constellation-breathe absolute inset-0 w-full h-full text-[#dfe9ff]"
              />
            </div>
            <div>
              <p className="text-sm text-text-secondary flex items-center justify-center gap-1.5">
                {night ? (
                  <Moon size={16} strokeWidth={1.5} />
                ) : (
                  <Sun size={16} strokeWidth={1.5} />
                )}
                {night ? "今夜の月星座" : "今日の太陽星座"}
              </p>
              <p className="text-2xl font-bold text-text-primary mt-0.5">{heroSign.nameJa}</p>
              <p className="text-xs text-text-muted mt-1">
                {night ? `太陽は ${otherSign.nameJa}` : `月は ${otherSign.nameJa}`}
              </p>
            </div>
          </>
        ) : skyFailed ? (
          <p className="text-base text-text-primary py-6">今日の空は取得できませんでした</p>
        ) : (
          <div
            className="relative w-full aspect-[16/10] rounded-2xl overflow-hidden neu-inset flex items-center justify-center"
            style={{ background: NIGHT_SKY }}
          >
            <span className="text-sm text-[#8f9cc9]">計算中…</span>
          </div>
        )}
      </div>

      {hydrated && <ZodiacSignPicker value={effectiveKey} onChange={setSelectedSign} />}

      {/* Recommendation for the selected sign — swaps in place on tap */}
      {sign && program ? (
        <div className="rounded-2xl bg-navy neu-inset p-4 flex flex-col gap-1">
          <p className="text-sm text-text-secondary">{sign.nameJa}のおすすめ</p>
          <p className="text-base font-bold text-text-primary">{program.name}</p>
          <p className="text-sm text-text-secondary">{program.description}</p>
          <button
            onClick={handlePlay}
            className="mt-3 w-full h-12 rounded-2xl bg-primary text-white text-base font-bold flex items-center justify-center neu-raised neu-press active:scale-95 transition-all"
          >
            このプログラムを再生
          </button>
        </div>
      ) : (
        hydrated && (
          <p className="text-sm text-text-secondary">
            星座を選ぶとおすすめプログラムが表示されます
          </p>
        )
      )}
    </div>
  );
}
