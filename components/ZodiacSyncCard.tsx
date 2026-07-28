"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { useZodiacStore } from "@/store/useZodiacStore";
import {
  ZODIAC_SIGNS,
  getZodiacSign,
  getTodaySky,
  zodiacProgramId,
  type TodaySky,
} from "@/lib/zodiac";
import { getProgramById } from "@/lib/programs";
import ZodiacSignPicker from "@/components/ZodiacSignPicker";

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

  // Effective sign: the saved choice, else today's sun sign once computed.
  // The fallback is deliberately NOT written to the store — a default is not
  // a choice; only a tap persists.
  const effectiveKey = hydrated
    ? selectedSign ?? (sky ? ZODIAC_SIGNS[sky.sunIndex].key : null)
    : null;
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
      {/* Header + today's sky */}
      <div>
        <p className="text-sm text-text-secondary">Cosmic & Brain Sync</p>
        <p className="text-base text-text-primary mt-1">
          {sky
            ? `今日の空：太陽 ${ZODIAC_SIGNS[sky.sunIndex].glyph}${ZODIAC_SIGNS[sky.sunIndex].nameJa} × 月 ${ZODIAC_SIGNS[sky.moonIndex].glyph}${ZODIAC_SIGNS[sky.moonIndex].nameJa}`
            : skyFailed
              ? "今日の空は取得できませんでした"
              : "今日の空を計算中…"}
        </p>
      </div>

      {hydrated && <ZodiacSignPicker value={effectiveKey} onChange={setSelectedSign} />}

      {/* Recommendation for the selected sign — swaps in place on tap */}
      {sign && program ? (
        <div className="rounded-2xl bg-navy neu-inset p-4 flex flex-col gap-1">
          <p className="text-sm text-text-secondary">
            {sign.glyph} {sign.nameJa}のおすすめ
          </p>
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
