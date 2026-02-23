"use client";

import { useAppStore } from "@/store/useAppStore";
import { getProgramById } from "@/lib/programs";
import { getCurrentPhaseInfo } from "@/lib/utils";

export default function Visualizer() {
  const isPlaying = useAppStore((s) => s.isPlaying);
  const elapsed = useAppStore((s) => s.elapsed);
  const programId = useAppStore((s) => s.selectedProgramId);
  const timerDuration = useAppStore((s) => s.timerDuration);

  const program = getProgramById(programId);
  if (!program) return null;

  const timeScale = timerDuration / program.defaultDuration;
  const scaledElapsed = elapsed / timeScale;
  const { phase, beatFreq } = getCurrentPhaseInfo(program.phases, scaledElapsed);

  // Map beat frequency to animation speed: lower freq = slower pulse
  const pulseDuration = isPlaying ? Math.max(0.3, 1 / Math.max(beatFreq, 0.5)) : 2;

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      {/* Pulse rings */}
      <div className="relative w-48 h-48 flex items-center justify-center">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-full border-2 border-primary/30"
            style={{
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
          className={`w-24 h-24 rounded-full flex items-center justify-center transition-colors ${
            isPlaying ? "bg-primary/20 border-2 border-primary" : "bg-navy-lighter border-2 border-text-muted"
          }`}
        >
          <span className="text-3xl">{program.icon}</span>
        </div>
      </div>

      {/* Info */}
      <div className="text-center">
        <p className="text-lg font-medium text-text-primary">
          {beatFreq.toFixed(1)} Hz
        </p>
        <p className="text-sm text-text-secondary">
          {phase ? phase.name : "待機中"}
        </p>
      </div>
    </div>
  );
}
