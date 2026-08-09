"use client";

import Link from "next/link";
import { useAudio } from "@/components/AudioProvider";
import { useAppStore, useDisplayProgramId } from "@/store/useAppStore";
import { useSynthStore } from "@/store/useSynthStore";
import { usePublishedProgramsStore } from "@/store/usePublishedProgramsStore";
import { getAdjustedProgram } from "@/lib/brain-profile";
import { isCustomProgramId } from "@/lib/programs";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { formatTime } from "@/lib/utils";
import { Play, Pause, Square, ListMusic } from "lucide-react";

export default function PlaybackControls() {
  const { startSession, stopSession, pauseSession, resumeSession, startCustomProgram, stopCustomProgram } = useAudio();
  const isPlaying = useAppStore((s) => s.isPlaying);
  const isPaused = useAppStore((s) => s.isPaused);
  const elapsed = useAppStore((s) => s.elapsed);
  const programId = useDisplayProgramId();
  const timerDuration = useAppStore((s) => s.timerDuration);
  const indicators = useBrainProfileStore((s) => s.profile?.indicators ?? null);
  const savedPrograms = useSynthStore((s) => s.savedPrograms);
  const publishedPrograms = usePublishedProgramsStore((s) => s.programs);

  const isCustom = isCustomProgramId(programId);
  const program = isCustom ? undefined : getAdjustedProgram(programId, indicators);
  const customProgram = isCustom
    ? savedPrograms.find((p) => p.id === programId) ?? publishedPrograms.find((p) => p.id === programId)
    : undefined;
  const hasProgram = isCustom ? !!customProgram : !!program;

  const handlePlay = () => {
    if (isPlaying) {
      // Session active: the big button toggles pause/resume — ending the
      // session is the Stop button's job alone.
      if (isPaused) {
        resumeSession();
      } else {
        pauseSession();
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
      stopCustomProgram({ log: true });
    } else {
      stopSession({ log: true });
    }
  };

  const remaining = Math.max(0, timerDuration - elapsed);

  // No resolvable program (e.g. a deleted/unfetched custom id): a dead play
  // button would fail silently — offer the way to pick a program instead.
  if (!isPlaying && !hasProgram) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="text-center">
          <p className="text-4xl font-mono text-text-primary tabular-nums">
            {formatTime(timerDuration)}
          </p>
          <p className="text-sm text-text-secondary mt-1">セッション時間</p>
        </div>
        <Link
          href="/session"
          className="min-h-14 px-8 rounded-2xl bg-primary text-on-primary text-base font-bold flex items-center justify-center gap-2 neu-raised neu-press transition-transform active:scale-95"
        >
          <ListMusic size={22} />
          プログラムを選択
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Time display */}
      <div className="text-center">
        <p className="text-4xl font-mono text-text-primary tabular-nums">
          {formatTime(remaining)}
        </p>
        <p className="text-sm text-text-secondary mt-1">
          {isPlaying ? (isPaused ? "一時停止中" : "残り時間") : "セッション時間"}
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
            isPlaying && !isPaused
              ? "bg-accent text-on-accent"
              : "bg-primary text-on-primary"
          }`}
          style={{ "--breathe-delay": "0s" } as React.CSSProperties}
          aria-label={isPlaying ? (isPaused ? "再開" : "一時停止") : "再生"}
        >
          {isPlaying && !isPaused ? (
            <Pause size={32} fill="currentColor" strokeWidth={0} />
          ) : (
            <Play size={32} fill="currentColor" strokeWidth={0} className="ml-1" />
          )}
        </button>

        <div className="w-14 h-14" /> {/* spacer for symmetry */}
      </div>
    </div>
  );
}
