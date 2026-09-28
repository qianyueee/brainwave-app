"use client";

import { useAppStore, useDisplayProgramId } from "@/store/useAppStore";
import { getProgramById } from "@/lib/programs";
import { useT, type LocalizedText } from "@/lib/i18n";

const PRESETS: { label: LocalizedText; value: number }[] = [
  { label: { ja: "5分", en: "5 min" }, value: 5 * 60 },
  { label: { ja: "10分", en: "10 min" }, value: 10 * 60 },
  { label: { ja: "15分", en: "15 min" }, value: 15 * 60 },
  { label: { ja: "20分", en: "20 min" }, value: 20 * 60 },
  { label: { ja: "30分", en: "30 min" }, value: 30 * 60 },
];

export default function Timer() {
  const timerDuration = useAppStore((s) => s.timerDuration);
  const setTimerDuration = useAppStore((s) => s.setTimerDuration);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const programId = useDisplayProgramId();
  const t = useT();

  const program = getProgramById(programId);
  const defaultMin = program ? program.defaultDuration / 60 : 15;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-text-secondary">
        {t(`タイマー（デフォルト: ${defaultMin}分）`, `Timer (default: ${defaultMin} min)`)}
      </p>
      <div className="flex gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => setTimerDuration(p.value)}
            disabled={isPlaying}
            className={`flex-1 min-h-12 py-2.5 rounded-xl text-sm font-medium transition-all ${
              timerDuration === p.value
                ? "bg-navy-light text-primary font-bold neu-inset"
                : "bg-navy text-text-secondary neu-raised-sm neu-press"
            } disabled:opacity-50`}
          >
            {t(p.label)}
          </button>
        ))}
      </div>
    </div>
  );
}
