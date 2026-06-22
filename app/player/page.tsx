"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useSynthStore } from "@/store/useSynthStore";
import { usePublishedProgramsStore } from "@/store/usePublishedProgramsStore";
import { getProgramById, isCustomProgramId, isTimelineProgram, timelineTotalDuration } from "@/lib/programs";
import { formatTime, getCurrentSegmentInfo } from "@/lib/utils";
import Visualizer from "@/components/Visualizer";
import PlaybackControls from "@/components/PlaybackControls";
import Timer from "@/components/Timer";
import Mixer from "@/components/Mixer";
import ExportDialog from "@/components/ExportDialog";
import { Download } from "lucide-react";

export default function PlayerPage() {
  const programId = useAppStore((s) => s.selectedProgramId);
  const savedPrograms = useSynthStore((s) => s.savedPrograms);
  const publishedPrograms = usePublishedProgramsStore((s) => s.programs);
  const elapsed = useAppStore((s) => s.elapsed);
  const timerDuration = useAppStore((s) => s.timerDuration);
  const setTimerDuration = useAppStore((s) => s.setTimerDuration);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const [exportOpen, setExportOpen] = useState(false);

  const isCustom = isCustomProgramId(programId);
  const program = isCustom ? undefined : getProgramById(programId);
  const customProgram = isCustom
    ? savedPrograms.find((p) => p.id === programId) ?? publishedPrograms.find((p) => p.id === programId)
    : undefined;

  const isTimeline = !!customProgram && isTimelineProgram(customProgram);
  const timelineSegments = isTimeline ? customProgram!.preset.timeline!.segments : [];
  const timelineTotal = isTimeline ? timelineTotalDuration(customProgram!) : 0;
  const currentSeg = isTimeline ? getCurrentSegmentInfo(timelineSegments, elapsed) : null;

  // Keep the timer/countdown in sync with the timeline's fixed total length.
  useEffect(() => {
    if (isTimeline && !isPlaying && timerDuration !== timelineTotal) {
      setTimerDuration(timelineTotal);
    }
  }, [isTimeline, isPlaying, timerDuration, timelineTotal, setTimerDuration]);

  const displayName = isCustom ? customProgram?.name : program?.name;
  const displayDesc = isCustom ? customProgram?.description : program?.description;

  // Timeline export is not supported yet (single-config export only).
  const canExport = isTimeline ? false : isCustom ? !!customProgram : !!program;
  const exportMode = isCustom ? "synth" : "binaural";

  return (
    <div className="flex flex-col gap-6 pt-6" style={{ animation: "fade-in 0.3s ease-out" }}>
      {/* Program name */}
      <div className="text-center">
        <h1 className="text-xl font-bold text-text-primary">
          {displayName ?? "プログラムを選択"}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {displayDesc}
        </p>
      </div>

      {/* Mobile: single column. Desktop: visualizer+controls | timer/mixer side by side. */}
      <div className="flex flex-col gap-6 md:grid md:grid-cols-2 md:gap-6 md:items-start">
        <div className="flex flex-col gap-6">
          <Visualizer />
          <PlaybackControls />
        </div>

        <div className="flex flex-col gap-6">
          <div className="bg-surface border border-surface-border rounded-3xl p-4 flex flex-col gap-4 neu-raised breathe" style={{ "--breathe-delay": "0.8s" } as React.CSSProperties}>
            {isTimeline ? (
              <div className="flex flex-col gap-1">
                <p className="text-sm text-text-secondary">
                  タイムライン（合計 {formatTime(timelineTotal)}・{timelineSegments.length}区間）
                </p>
                <p className="text-base text-text-primary font-bold">
                  {isPlaying && currentSeg?.segment
                    ? `再生中: ${currentSeg.segment.name || `セグメント ${currentSeg.index + 1}`}（${currentSeg.index + 1}/${timelineSegments.length}）`
                    : "再生で時間ごとに音が切り替わります"}
                </p>
              </div>
            ) : (
              <Timer />
            )}
            <Mixer />
          </div>

          {/* Export button */}
          {canExport && (
            <button
              onClick={() => setExportOpen(true)}
              className="w-full py-3 rounded-2xl bg-navy text-text-primary text-base font-bold flex items-center justify-center gap-2 neu-raised-sm neu-press transition-transform"
            >
              <Download size={20} strokeWidth={2} />
              音声をエクスポート
            </button>
          )}
        </div>
      </div>

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} mode={exportMode} customPreset={customProgram?.preset} />
    </div>
  );
}
