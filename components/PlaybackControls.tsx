"use client";

import { useAudio } from "@/components/AudioProvider";
import { useAppStore } from "@/store/useAppStore";
import { useSynthStore } from "@/store/useSynthStore";
import { getAdjustedProgram } from "@/lib/brain-profile";
import { isCustomProgramId } from "@/lib/programs";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { formatTime } from "@/lib/utils";
import { Play, Pause, Square } from "lucide-react";

export default function PlaybackControls() {
  const { startSession, stopSession, startCustomProgram, stopCustomProgram } = useAudio();
  const isPlaying = useAppStore((s) => s.isPlaying);
  const elapsed = useAppStore((s) => s.elapsed);
  const programId = useAppStore((s) => s.selectedProgramId);
  const timerDuration = useAppStore((s) => s.timerDuration);
  const indicators = useBrainProfileStore((s) => s.profile?.indicators ?? null);
  const savedPrograms = useSynthStore((s) => s.savedPrograms);

  const isCustom = isCustomProgramId(programId);
  const program = isCustom ? undefined : getAdjustedProgram(programId, indicators);
  const customProgram = isCustom ? savedPrograms.find((p) => p.id === programId) : undefined;

  const handlePlay = () => {
    if (isPlaying) {
      if (isCustom) {
        stopCustomProgram();
      } else {
        stopSession();
      }
    } else {
      if (isCustom && customProgram) {
        startCustomProgram(customProgram, timerDuration);
      } else if (program) {
        startSession(program, timerDuration);
      }
    }
  };

  const handleStop = () => {
    if (isCustom) {
      stopCustomProgram();
    } else {
      stopSession();
    }
  };

  const remaining = Math.max(0, timerDuration - elapsed);

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Time display */}
      <div className="text-center">
        <p className="text-4xl font-mono text-text-primary tabular-nums">
          {formatTime(remaining)}
        </p>
        <p className="text-sm text-text-secondary mt-1">
          {isPlaying ? "残り時間" : "セッション時間"}
        </p>
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-6">
        <button
          onClick={handleStop}
          disabled={!isPlaying}
          className="w-14 h-14 rounded-full bg-navy flex items-center justify-center text-text-secondary disabled:opacity-30 transition-opacity active:scale-95 neu-raised-sm"
          aria-label="停止"
        >
          <Square size={20} fill="currentColor" />
        </button>

        <button
          onClick={handlePlay}
          className={`w-20 h-20 rounded-full flex items-center justify-center transition-all active:scale-95 neu-raised-lg breathe ${
            isPlaying
              ? "bg-accent text-white"
              : "bg-primary text-white"
          }`}
          style={{ "--breathe-delay": "0s" } as React.CSSProperties}
          aria-label={isPlaying ? "一時停止" : "再生"}
        >
          {isPlaying ? (
            <Pause size={32} fill="white" strokeWidth={0} />
          ) : (
            <Play size={32} fill="white" strokeWidth={0} className="ml-1" />
          )}
        </button>

        <div className="w-14 h-14" /> {/* spacer for symmetry */}
      </div>
    </div>
  );
}
