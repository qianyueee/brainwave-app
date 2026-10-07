"use client";

import { useState, useCallback } from "react";
import { useAppStore, useDisplayProgramId } from "@/store/useAppStore";
import { useSynthStore } from "@/store/useSynthStore";
import { getProgramById } from "@/lib/programs";
import type { SynthPreset } from "@/lib/synth-engine";
import {
  ExportFormat,
  ExportDuration,
  ExportProgress,
  EXPORT_DURATIONS,
  exportBinaural,
  exportSynth,
} from "@/lib/audio-export";
import { useT, type LocalizedText } from "@/lib/i18n";

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  mode: "binaural" | "synth";
  customPreset?: SynthPreset;
}

const STATUS_LABELS: Record<string, LocalizedText> = {
  rendering: { ja: "レンダリング中...", en: "Rendering..." },
  encoding: { ja: "エンコード中...", en: "Encoding..." },
  done: { ja: "完了！", en: "Done!" },
};

export default function ExportDialog({ open, onClose, mode, customPreset }: ExportDialogProps) {
  const [duration, setDuration] = useState<ExportDuration>(60);
  const [format, setFormat] = useState<ExportFormat>("mp3");
  const [progress, setProgress] = useState<ExportProgress>({ status: "idle" });
  const t = useT();

  // Binaural data
  const selectedProgramId = useDisplayProgramId();
  const beatVolume = useAppStore((s) => s.beatVolume);
  const natureSoundId = useAppStore((s) => s.natureSoundId);
  const natureVolume = useAppStore((s) => s.natureVolume);
  // 書き出しもプレーヤーの「聴き方」どおり（モノラルを選んでいればモノラルビートで）。
  const beatChannelMode = useAppStore((s) => s.beatChannelMode);

  // Synth data
  const layers = useSynthStore((s) => s.layers);
  const leftLayers = useSynthStore((s) => s.leftLayers);
  const rightLayers = useSynthStore((s) => s.rightLayers);
  const vibrato = useSynthStore((s) => s.vibrato);
  const isStereo = useSynthStore((s) => s.isStereo);

  const isExporting = progress.status === "rendering" || progress.status === "encoding";

  const handleExport = useCallback(async () => {
    if (isExporting) return;

    if (mode === "binaural") {
      const program = getProgramById(selectedProgramId);
      if (!program) return;

      await exportBinaural({
        program,
        duration,
        format,
        beatVolume,
        natureSoundId: natureSoundId || undefined,
        natureVolume,
        mode: beatChannelMode,
        onProgress: (p) => {
          setProgress(p);
          if (p.status === "done") {
            setTimeout(() => {
              setProgress({ status: "idle" });
              onClose();
            }, 800);
          }
        },
      });
    } else {
      const presetEditorMode = customPreset?.editorMode ?? "";
      const useStereo = customPreset ? presetEditorMode.endsWith("-stereo") : isStereo;
      const synthLayers = customPreset?.layers ?? layers;
      const synthLeft = customPreset?.leftLayers ?? leftLayers;
      const synthRight = customPreset?.rightLayers ?? rightLayers;
      const synthVibrato = customPreset?.vibrato ?? vibrato;

      await exportSynth({
        layers: synthLayers,
        vibrato: synthVibrato,
        isStereo: useStereo,
        leftLayers: useStereo ? synthLeft : undefined,
        rightLayers: useStereo ? synthRight : undefined,
        duration,
        format,
        natureSoundId: natureSoundId || undefined,
        natureVolume,
        onProgress: (p) => {
          setProgress(p);
          if (p.status === "done") {
            setTimeout(() => {
              setProgress({ status: "idle" });
              onClose();
            }, 800);
          }
        },
      });
    }
  }, [
    mode, duration, format, isExporting,
    selectedProgramId, beatVolume, natureSoundId, natureVolume, beatChannelMode,
    layers, leftLayers, rightLayers, vibrato, isStereo, customPreset, onClose,
  ]);

  const handleRetry = () => {
    setProgress({ status: "idle" });
  };

  if (!open) return null;

  const statusLabel = STATUS_LABELS[progress.status];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={() => { if (!isExporting) onClose(); }}
    >
      <div
        className="w-full max-w-[420px] mx-4 bg-surface border border-surface-border rounded-3xl p-6 flex flex-col gap-5 neu-raised-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-text-primary text-center">
          {t("音声エクスポート", "Export audio")}
        </h2>
        {mode === "binaural" && (
          <p className="-mt-3 text-sm text-text-secondary text-center">
            {beatChannelMode === "mono"
              ? t("聴き方：モノラル（プレーヤーの設定）", "Listening mode: mono (from the player)")
              : t("聴き方：ステレオ（プレーヤーの設定）", "Listening mode: stereo (from the player)")}
          </p>
        )}

        {/* Duration selector - 2x2 grid */}
        <div>
          <p className="text-sm text-text-secondary mb-2">{t("再生時間", "Length")}</p>
          <div className="grid grid-cols-2 gap-2">
            {EXPORT_DURATIONS.map((d) => (
              <button
                key={d.value}
                onClick={() => setDuration(d.value)}
                disabled={isExporting}
                className={`py-3 rounded-2xl text-base font-bold transition-all active:scale-95 ${
                  duration === d.value
                    ? "bg-navy-light text-primary neu-inset"
                    : "bg-navy text-text-secondary neu-raised-sm"
                }`}
              >
                {t(d.label, d.labelEn)}
              </button>
            ))}
          </div>
        </div>

        {/* Format selector */}
        <div>
          <p className="text-sm text-text-secondary mb-2">{t("ファイル形式", "File format")}</p>
          <div className="flex gap-2">
            {(["wav", "mp3"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                disabled={isExporting}
                className={`flex-1 py-3 rounded-2xl text-base font-bold transition-all active:scale-95 ${
                  format === f
                    ? "bg-navy-light text-primary neu-inset"
                    : "bg-navy text-text-secondary neu-raised-sm"
                }`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
          {format === "wav" && duration >= 300 && (
            <p className="text-xs text-accent mt-1">
              {t(
                "WAV形式は容量が大きくなります。MP3がおすすめです。",
                "WAV files are large. We recommend MP3."
              )}
            </p>
          )}
        </div>

        {/* Export / status area */}
        {progress.status === "error" ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-danger text-center">{progress.error}</p>
            <button
              onClick={handleRetry}
              className="w-full py-3 rounded-2xl bg-accent text-on-accent text-base font-bold active:scale-95 neu-raised-sm"
            >
              {t("リトライ", "Try again")}
            </button>
          </div>
        ) : isExporting || progress.status === "done" ? (
          <div className="flex items-center justify-center gap-3 py-3">
            {isExporting && (
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            )}
            <span className="text-base text-text-primary font-medium">
              {statusLabel ? t(statusLabel) : ""}
            </span>
          </div>
        ) : (
          <button
            onClick={handleExport}
            className="w-full py-3 rounded-2xl bg-primary text-on-primary text-base font-bold active:scale-95 transition-opacity neu-raised neu-press"
          >
            {t("エクスポート開始", "Start export")}
          </button>
        )}

        {/* Cancel */}
        {!isExporting && progress.status !== "done" && (
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl bg-navy text-text-secondary text-base font-bold active:scale-95 neu-raised-sm neu-press"
          >
            {t("キャンセル", "Cancel")}
          </button>
        )}
      </div>
    </div>
  );
}
