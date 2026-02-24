"use client";

import { useAppStore } from "@/store/useAppStore";
import { getProgramById } from "@/lib/programs";

const PRESETS = [
  { label: "5分", value: 5 * 60 },
  { label: "10分", value: 10 * 60 },
  { label: "15分", value: 15 * 60 },
  { label: "20分", value: 20 * 60 },
  { label: "30分", value: 30 * 60 },
];

export default function Timer() {
  const timerDuration = useAppStore((s) => s.timerDuration);
  const setTimerDuration = useAppStore((s) => s.setTimerDuration);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const programId = useAppStore((s) => s.selectedProgramId);

  const program = getProgramById(programId);
  const defaultMin = program ? program.defaultDuration / 60 : 15;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-text-secondary">
        タイマー（デフォルト: {defaultMin}分）
      </p>
      <div className="flex gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => setTimerDuration(p.value)}
            disabled={isPlaying}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              timerDuration === p.value
                ? "bg-primary text-white"
                : "bg-navy-lighter text-text-secondary"
            } disabled:opacity-50`}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
