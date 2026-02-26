"use client";

import { useAppStore } from "@/store/useAppStore";
import { getProgramById } from "@/lib/programs";
import { getCurrentPhaseInfo } from "@/lib/utils";
import { Waves, Zap, Moon } from "lucide-react";

const PROGRAM_ICONS: Record<string, typeof Waves> = {
  "reset-deep": Waves,
  "clarity-focus": Zap,
  "night-recovery": Moon,
};

export default function Visualizer() {
  const isPlaying = useAppStore((s) => s.isPlaying);
  const elapsed = useAppStore((s) => s.elapsed);
  const programId = useAppStore((s) => s.selectedProgramId);
  const timerDuration = useAppStore((s) => s.timerDuration);

  const program = getProgramById(programId);
  if (!program) return null;

  const timeScale = timerDuration / program.defaultDuration;
  const scaledElapsed = elapsed / timeScale;
  const { phase, beatFreq: rawBeatFreq } = getCurrentPhaseInfo(program.phases, scaledElapsed);

  // During intro phase, display the program's target frequency
  const displayFreq = phase?.name === "導入" ? program.targetBeatFreq : rawBeatFreq;
  const beatFreq = rawBeatFreq;

  // Map beat frequency to animation speed: lower freq = slower pulse
  const pulseDuration = isPlaying ? Math.max(0.3, 1 / Math.max(beatFreq, 0.5)) : 2;
  const Icon = PROGRAM_ICONS[program.id] ?? Waves;

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      {/* Pulse rings */}
      <div className="relative w-48 h-48 flex items-center justify-center">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-full"
            style={{
              boxShadow: isPlaying
                ? `0 0 ${12 + i * 6}px var(--color-primary), inset 0 0 ${8 + i * 4}px color-mix(in srgb, var(--color-primary) 20%, transparent)`
                : `3px 3px 8px var(--shadow-neu-dark), -2px -2px 6px var(--shadow-neu-light)`,
              border: `1px solid color-mix(in srgb, var(--color-primary) ${isPlaying ? 30 : 10}%, transparent)`,
              animationName: isPlaying ? "pulse-ring" : "none",
              animationDuration: `${pulseDuration}s`,
              animationTimingFunction: "ease-in-out",
              animationIterationCount: "infinite",
              animationDelay: `${i * (pulseDuration / 3)}s`,
            }}
          />
        ))}
        {/* Center circle */}
        <div
          className={`w-24 h-24 rounded-full flex items-center justify-center transition-all ${
            isPlaying ? "neu-glow-primary" : "bg-navy neu-raised-lg"
          }`}
          style={isPlaying ? {
            animationName: "pulse-glow",
            animationDuration: "3s",
            animationTimingFunction: "ease-in-out",
            animationIterationCount: "infinite",
            backgroundColor: "var(--color-navy)",
          } : undefined}
        >
          <Icon
            size={32}
            className={isPlaying ? "text-primary" : "text-text-muted"}
            strokeWidth={1.5}
          />
        </div>
      </div>

      {/* Info */}
      <div className="text-center">
        <p className="text-lg font-medium text-text-primary">
          {displayFreq.toFixed(1)} Hz
        </p>
        <p className="text-sm text-text-secondary">
          {phase ? phase.name : "待機中"}
        </p>
      </div>
    </div>
  );
}
