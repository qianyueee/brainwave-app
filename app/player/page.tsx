"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppStore, useDisplayProgramId } from "@/store/useAppStore";
import { useSynthStore } from "@/store/useSynthStore";
import { usePublishedProgramsStore } from "@/store/usePublishedProgramsStore";
import {
  getProgramById,
  isCustomProgramId,
  isTimelineProgram,
  programDescription,
  programName,
  timelineTotalDuration,
} from "@/lib/programs";
import { formatTime, getCurrentSegmentInfo } from "@/lib/utils";
import { musicBedUrl } from "@/lib/zodiac-audio";
import { preloadAudio } from "@/lib/nature-player";
import { useLocale, useT } from "@/lib/i18n";
import Visualizer from "@/components/Visualizer";
import PlaybackControls from "@/components/PlaybackControls";
import Timer from "@/components/Timer";
import Mixer from "@/components/Mixer";
import ExportDialog from "@/components/ExportDialog";
import { BareColumn } from "@/components/PageColumn";
import { ArrowLeft, Download } from "lucide-react";

/**
 * 見出しの1行目：左に「戻る」、中央に Sync Sound。右の空きは戻るボタンと同じ幅
 * で、Sync Sound を画面の中央に保つためのもの。番組名と説明は長くなるので、
 * この行には入れず下の段で幅いっぱいに使う。
 *
 * このページは菜单外で、プログラムのカード（Session・ホーム）やミニプレーヤー
 * から入ってくる。戻り先は来た画面そのものなので履歴を1つ戻る——リロードや
 * ブックマークで直接開いたときは戻る先が無いので、プログラムの一覧（Session）へ。
 */
function PlayerTopRow() {
  const router = useRouter();
  const t = useT();
  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push("/session");
  };
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={goBack}
        aria-label={t("戻る", "Back")}
        className="w-12 h-12 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-text-secondary active:scale-95 shrink-0"
      >
        <ArrowLeft size={20} />
      </button>
      <p className="min-w-0 flex-1 text-center text-xs font-bold text-primary tracking-wider">
        Sync Sound
      </p>
      <div className="w-12 shrink-0" aria-hidden="true" />
    </div>
  );
}

export default function PlayerPage() {
  const programId = useDisplayProgramId();
  const savedPrograms = useSynthStore((s) => s.savedPrograms);
  const publishedPrograms = usePublishedProgramsStore((s) => s.programs);
  const fetchPrograms = usePublishedProgramsStore((s) => s.fetchPrograms);
  const publishedLoading = usePublishedProgramsStore((s) => s.loading);
  const elapsed = useAppStore((s) => s.elapsed);
  const timerDuration = useAppStore((s) => s.timerDuration);
  const setTimerDuration = useAppStore((s) => s.setTimerDuration);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const [exportOpen, setExportOpen] = useState(false);
  const t = useT();
  const locale = useLocale();

  // Guard hydration mismatch: selectedProgramId/timerDuration are persisted
  // (and savedPrograms already was) — the prerendered HTML carries the
  // defaults, so gate the content until the client store is authoritative.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

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

  // The published list is fetched by /session on mount — but with the
  // selection persisted, a refresh/direct entry can land here first and a
  // custom id then resolves to nothing ("プログラムを選択" dead end). Fetch on
  // demand; runs once per unresolved id (deps stay stable if it's truly gone).
  useEffect(() => {
    if (isCustom && !customProgram) {
      fetchPrograms();
    }
  }, [isCustom, customProgram, fetchPrograms]);

  // Fetch and decode the music bed while the listener is still on this page:
  // the beat waits for the track to begin (lib/music-intro.ts), and that wait
  // should be a moment, not a download plus a second-long decode. Gated on
  // hydration so the pre-restore default program isn't fetched.
  useEffect(() => {
    if (!hydrated) return;
    const url = musicBedUrl(programId);
    if (url) preloadAudio(url);
  }, [hydrated, programId]);

  // Custom (synth) programs carry the user's own name/description — shown
  // as-is; built-in / catalog / zodiac programs follow the display language.
  const displayName = isCustom ? customProgram?.name : program && programName(program, locale);
  const displayDesc = isCustom
    ? customProgram?.description
    : program && programDescription(program, locale);

  // Timeline export is not supported yet (single-config export only).
  const canExport = isTimeline ? false : isCustom ? !!customProgram : !!program;
  const exportMode = isCustom ? "synth" : "binaural";

  // Skeleton before hydration: keep the page frame, hide store-derived content.
  if (!hydrated) {
    return (
      <BareColumn>
        <div className="flex flex-col gap-6 pt-6">
          <PlayerTopRow />
        </div>
      </BareColumn>
    );
  }

  return (
    <BareColumn>
    <div className="flex flex-col gap-6 pt-6" style={{ animation: "fade-in 0.3s ease-out" }}>
      {/* Back + program name */}
      <div className="flex flex-col gap-1">
      <PlayerTopRow />
      <div className="text-center">
        <h1 className="text-xl font-bold text-text-primary">
          {displayName ??
            (publishedLoading
              ? t("読み込み中…", "Loading…")
              : t("プログラムを選択", "Choose a program"))}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {displayDesc}
        </p>
      </div>
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
                  {t(
                    `タイムライン（合計 ${formatTime(timelineTotal)}・${timelineSegments.length}区間）`,
                    `Timeline (${formatTime(timelineTotal)} total · ${timelineSegments.length} ${
                      timelineSegments.length === 1 ? "segment" : "segments"
                    })`
                  )}
                </p>
                <p className="text-base text-text-primary font-bold">
                  {isPlaying && currentSeg?.segment
                    ? t(
                        `再生中: ${currentSeg.segment.name || `セグメント ${currentSeg.index + 1}`}（${currentSeg.index + 1}/${timelineSegments.length}）`,
                        `Playing: ${currentSeg.segment.name || `Segment ${currentSeg.index + 1}`} (${currentSeg.index + 1}/${timelineSegments.length})`
                      )
                    : t("再生で時間ごとに音が切り替わります", "The sound changes over time as it plays")}
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
              {t("音声をエクスポート", "Export audio")}
            </button>
          )}
        </div>
      </div>

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} mode={exportMode} customPreset={customProgram?.preset} />
    </div>
    </BareColumn>
  );
}
