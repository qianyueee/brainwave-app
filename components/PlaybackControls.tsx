"use client";

import { useAudio } from "@/components/AudioProvider";
import { useAppStore } from "@/store/useAppStore";
import { useSynthStore } from "@/store/useSynthStore";
import { getAdjustedProgram } from "@/lib/brain-profile";
import { isCustomProgramId } from "@/lib/programs";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { formatTime } from "@/lib/utils";

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
          className="w-14 h-14 rounded-full bg-navy-lighter border-2 border-text-muted flex items-center justify-center text-text-secondary disabled:opacity-30 transition-opacity active:scale-95"
          aria-label="停止"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <rect x="3" y="3" width="14" height="14" rx="2" />
          </svg>
        </button>

        <button
          onClick={handlePlay}
          className={`w-20 h-20 rounded-full flex items-center justify-center transition-all active:scale-95 ${
            isPlaying
              ? "bg-accent border-2 border-accent-dark"
              : "bg-primary border-2 border-primary-dark"
          }`}
          aria-label={isPlaying ? "一時停止" : "再生"}
        >
          {isPlaying ? (
            <svg width="28" height="28" viewBox="0 0 28 28" fill="white">
              <rect x="6" y="4" width="5" height="20" rx="1" />
              <rect x="17" y="4" width="5" height="20" rx="1" />
            </svg>
          ) : (
            <svg width="28" height="28" viewBox="0 0 28 28" fill="white">
              <path d="M8 4l16 10-16 10V4z" />
            </svg>
          )}
        </button>

        <div className="w-14 h-14" /> {/* spacer for symmetry */}
      </div>
    </div>
  );
}
