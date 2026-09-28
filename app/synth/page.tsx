"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSynthStore, EditorMode, StereoChannel } from "@/store/useSynthStore";
import { useAppStore } from "@/store/useAppStore";
import { useAudio } from "@/components/AudioProvider";
import SynthLayerCard from "@/components/SynthLayerCard";
import SynthPlaybackButton from "@/components/SynthPlaybackButton";
import SynthTimelineStrip from "@/components/SynthTimelineStrip";
import SynthVibratoPanel from "@/components/SynthVibratoPanel";
import ExportDialog from "@/components/ExportDialog";
import ConfirmDialog from "@/components/ConfirmDialog";
import { BareColumn } from "@/components/PageColumn";
import { ChevronLeft, Plus, Download, Upload, FileDown, Lock, Play, Square } from "lucide-react";
import { downloadBlob } from "@/lib/audio-export";
import { SynthPreset } from "@/lib/synth-engine";
import { useAuthStore } from "@/store/useAuthStore";
import { useAdminStore } from "@/store/useAdminStore";
import { useT, type LocalizedText } from "@/lib/i18n";

const MAX_LAYERS = 8;
const FREQ_MIN = 20;
const FREQ_MAX = 10000;
const HARMONIC_BASE_MIN = 1;

/**
 * A save action held back until the user confirms it in the dialog.
 * Texts are kept in both languages and picked at render time, so an open
 * dialog follows a language switch.
 */
interface ConfirmRequest {
  title: LocalizedText;
  message: LocalizedText;
  confirmLabel: LocalizedText;
  tone: "primary" | "accent";
  run: () => Promise<void>;
}

const SAVE_FAILED: LocalizedText = { ja: "保存に失敗しました", en: "Couldn't save" };
const CONFIRM_SAVE: LocalizedText = { ja: "保存する", en: "Save" };

export default function SynthPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const isAdmin = useAdminStore((s) => s.isAdmin);
  const roleLoaded = useAdminStore((s) => s.roleLoaded);
  const t = useT();

  useEffect(() => {
    if (!authLoading && roleLoaded && (!user || !isAdmin)) {
      router.replace("/");
    }
  }, [authLoading, roleLoaded, user, isAdmin, router]);

  const layers = useSynthStore((s) => s.layers);
  const leftLayers = useSynthStore((s) => s.leftLayers);
  const rightLayers = useSynthStore((s) => s.rightLayers);
  const addLayer = useSynthStore((s) => s.addLayer);
  const addStereoLayer = useSynthStore((s) => s.addStereoLayer);
  const savePreset = useSynthStore((s) => s.savePreset);
  const isSynthPlaying = useSynthStore((s) => s.isSynthPlaying);
  const editorMode = useSynthStore((s) => s.editorMode);
  const isStereo = useSynthStore((s) => s.isStereo);
  const harmonicBaseFreq = useSynthStore((s) => s.harmonicBaseFreq);
  const harmonicBaseFreqLeft = useSynthStore((s) => s.harmonicBaseFreqLeft);
  const harmonicBaseFreqRight = useSynthStore((s) => s.harmonicBaseFreqRight);
  const monitorChannel = useSynthStore((s) => s.monitorChannel);
  const setEditorMode = useSynthStore((s) => s.setEditorMode);
  const setIsStereo = useSynthStore((s) => s.setIsStereo);
  const generateHarmonics = useSynthStore((s) => s.generateHarmonics);
  const setMonitorChannel = useSynthStore((s) => s.setMonitorChannel);
  const {
    getSynth,
    startSynth,
    stopSynth,
    stopCustomProgram,
    startTimelinePreview,
    setMonitorChannel: audioSetMonitor,
  } = useAudio();

  const updatePreset = useSynthStore((s) => s.updatePreset);
  const editingPresetId = useSynthStore((s) => s.editingPresetId);
  const savedPresets = useSynthStore((s) => s.savedPresets);
  const importPresets = useSynthStore((s) => s.importPresets);
  const saveAsProgram = useSynthStore((s) => s.saveAsProgram);
  const updateProgram = useSynthStore((s) => s.updateProgram);
  const editingProgramId = useSynthStore((s) => s.editingProgramId);
  const savedPrograms = useSynthStore((s) => s.savedPrograms);

  // Timeline editor state
  const isTimelineMode = useSynthStore((s) => s.isTimelineMode);
  const timelineSegments = useSynthStore((s) => s.timelineSegments);
  const activeSegmentIndex = useSynthStore((s) => s.activeSegmentIndex);
  const flushActiveSegment = useSynthStore((s) => s.flushActiveSegment);
  const saveAsTimelineProgram = useSynthStore((s) => s.saveAsTimelineProgram);
  const appIsPlaying = useAppStore((s) => s.isPlaying);

  // runTimeline sets BOTH app.isPlaying and isSynthPlaying; startSynth sets only
  // isSynthPlaying. That lets us tell a whole-timeline preview from a segment one.
  const wholeTimelinePlaying = appIsPlaying && isSynthPlaying;
  const segmentPreviewPlaying = isSynthPlaying && !appIsPlaying;

  const [presetName, setPresetName] = useState("");
  const [presetMsg, setPresetMsg] = useState<LocalizedText | null>(null);
  const [programName, setProgramName] = useState("");
  const [programDesc, setProgramDesc] = useState("");
  const [programMsg, setProgramMsg] = useState<LocalizedText | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmRequest | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [baseFreqInput, setBaseFreqInput] = useState(harmonicBaseFreq.toString());
  const [baseFreqInputLeft, setBaseFreqInputLeft] = useState(harmonicBaseFreqLeft.toString());
  const [baseFreqInputRight, setBaseFreqInputRight] = useState(harmonicBaseFreqRight.toString());
  const [activeChannel, setActiveChannel] = useState<StereoChannel>("left");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync local input strings when store values change (e.g. on stereo toggle or preset load)
  useEffect(() => {
    setBaseFreqInput(harmonicBaseFreq.toString());
  }, [harmonicBaseFreq]);
  useEffect(() => {
    setBaseFreqInputLeft(harmonicBaseFreqLeft.toString());
  }, [harmonicBaseFreqLeft]);
  useEffect(() => {
    setBaseFreqInputRight(harmonicBaseFreqRight.toString());
  }, [harmonicBaseFreqRight]);

  // Editing target changed (opened a program, or just saved a copy): refill the
  // description from it so "更新" doesn't overwrite it with the auto-generated one.
  // Reads the store directly so typing in the textarea doesn't re-trigger this.
  useEffect(() => {
    const target = useSynthStore
      .getState()
      .savedPrograms.find((p) => p.id === editingProgramId);
    setProgramDesc(target?.description ?? "");
  }, [editingProgramId]);

  // Destructive edits rebuild the active buffer, so stop any preview (segment or
  // whole-timeline) first to keep the live nodes consistent with the buffer.
  const stopAllPreview = () => {
    stopSynth();
    stopCustomProgram();
  };

  const handleModeChange = (mode: EditorMode) => {
    if (mode === editorMode) return;
    stopAllPreview();
    setEditorMode(mode);
  };

  const handleStereoToggle = () => {
    stopAllPreview();
    setIsStereo(!isStereo);
  };

  const handleBaseFreqApply = (channel?: StereoChannel) => {
    const raw = channel === "left" ? baseFreqInputLeft
      : channel === "right" ? baseFreqInputRight
      : baseFreqInput;
    const current = channel === "left" ? harmonicBaseFreqLeft
      : channel === "right" ? harmonicBaseFreqRight
      : harmonicBaseFreq;
    const setInput = channel === "left" ? setBaseFreqInputLeft
      : channel === "right" ? setBaseFreqInputRight
      : setBaseFreqInput;

    const parsed = parseFloat(raw);
    if (isNaN(parsed)) {
      setInput(current.toString());
      return;
    }
    const clamped = Math.round(Math.max(HARMONIC_BASE_MIN, Math.min(FREQ_MAX, parsed)) * 100) / 100;
    setInput(clamped.toString());
    stopAllPreview();
    generateHarmonics(clamped, channel);
  };

  const handleBaseFreqKeyDown = (channel?: StereoChannel) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleBaseFreqApply(channel);
  };

  const handleAddLayer = () => {
    addLayer();
    const synth = getSynth();
    if (synth?.isPlaying) {
      const newLayers = useSynthStore.getState().layers;
      synth.addLayer(newLayers[newLayers.length - 1]);
    }
  };

  const handleAddStereoLayer = (channel: StereoChannel) => {
    addStereoLayer(channel);
    const synth = getSynth();
    if (synth?.isPlaying) {
      const key = channel === "left" ? "leftLayers" : "rightLayers";
      const arr = useSynthStore.getState()[key];
      synth.addLayer(arr[arr.length - 1], channel);
    }
  };

  const editingPresetName = editingPresetId
    ? savedPresets.find((p) => p.id === editingPresetId)?.name
    : null;

  const editingProgramName = editingProgramId
    ? savedPrograms.find((p) => p.id === editingProgramId)?.name
    : null;

  // --- Save actions (each runs only after the confirm dialog) ---

  const handleSave = async () => {
    const name = presetName.trim();
    if (!name) return;
    try {
      await savePreset(name);
      setPresetName("");
      setPresetMsg({ ja: `「${name}」を保存しました`, en: `Saved “${name}”` });
    } catch {
      setPresetMsg(SAVE_FAILED);
    }
  };

  const handleOverwriteSave = async () => {
    if (!editingPresetId) return;
    try {
      await updatePreset(editingPresetId);
      setPresetMsg({ ja: `「${editingPresetName}」を上書きしました`, en: `Overwrote “${editingPresetName}”` });
    } catch {
      setPresetMsg(SAVE_FAILED);
    }
  };

  /** Overwrite the program currently open in the editor. */
  const handleUpdateProgram = async () => {
    if (!editingProgramId) return;
    try {
      // updateProgram is timeline-aware (branches on isTimelineMode internally).
      await updateProgram(editingProgramId, programDesc);
      setProgramMsg({ ja: `「${editingProgramName}」を更新しました`, en: `Updated “${editingProgramName}”` });
    } catch {
      setProgramMsg(SAVE_FAILED);
    }
  };

  /**
   * Save the current editor state as a brand-new program. The program that was
   * open stays untouched; the editor switches to the new copy (the save actions
   * move editingProgramId onto it).
   */
  const handleSaveAsNewProgram = async () => {
    const name = programName.trim();
    if (!name) return;
    try {
      if (isTimelineMode) {
        await saveAsTimelineProgram(name, programDesc);
      } else {
        await saveAsProgram(name, programDesc);
      }
      setProgramName("");
      setProgramMsg({ ja: `「${name}」として保存しました`, en: `Saved as “${name}”` });
    } catch {
      setProgramMsg(SAVE_FAILED);
    }
  };

  // --- Confirm dialog plumbing ---

  const runConfirmed = async () => {
    if (!confirmState || confirmBusy) return;
    setConfirmBusy(true);
    try {
      // The save handlers report their own success/failure below the buttons.
      await confirmState.run();
    } finally {
      setConfirmBusy(false);
      setConfirmState(null);
    }
  };

  const requestSavePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    setConfirmState({
      title: { ja: "プリセットを保存しますか？", en: "Save this preset?" },
      message: {
        ja: `「${name}」という名前で新しいプリセットを保存します。`,
        en: `This saves a new preset named “${name}”.`,
      },
      confirmLabel: CONFIRM_SAVE,
      tone: "primary",
      run: handleSave,
    });
  };

  const requestOverwritePreset = () => {
    if (!editingPresetId) return;
    setConfirmState({
      title: { ja: "プリセットを上書きしますか？", en: "Overwrite this preset?" },
      message: {
        ja: `「${editingPresetName}」の内容が現在の設定に置き換わります。\n元に戻すことはできません。`,
        en: `“${editingPresetName}” will be replaced with the current settings.\nThis can't be undone.`,
      },
      confirmLabel: { ja: "上書きする", en: "Overwrite" },
      tone: "accent",
      run: handleOverwriteSave,
    });
  };

  const requestUpdateProgram = () => {
    if (!editingProgramId) return;
    setConfirmState({
      title: { ja: "プログラムを更新しますか？", en: "Update this program?" },
      message: {
        ja: `「${editingProgramName}」の内容が現在の設定に置き換わります。\n元に戻すことはできません。`,
        en: `“${editingProgramName}” will be replaced with the current settings.\nThis can't be undone.`,
      },
      confirmLabel: { ja: "更新する", en: "Update" },
      tone: "accent",
      run: handleUpdateProgram,
    });
  };

  const requestSaveAsNewProgram = () => {
    const name = programName.trim();
    if (!name) return;
    setConfirmState({
      title: editingProgramId
        ? { ja: "別名で保存しますか？", en: "Save as a new program?" }
        : { ja: "プログラムを保存しますか？", en: "Save this program?" },
      message: editingProgramId
        ? {
            ja: `「${name}」を新しいプログラムとして追加します。\n「${editingProgramName}」はそのまま残ります。`,
            en: `“${name}” will be added as a new program.\n“${editingProgramName}” stays as it is.`,
          }
        : {
            ja: `「${name}」をホーム画面にカードとして追加します。`,
            en: `“${name}” will be added to the Home screen as a card.`,
          },
      confirmLabel: CONFIRM_SAVE,
      tone: "primary",
      run: handleSaveAsNewProgram,
    });
  };

  // --- Timeline preview controls ---
  const handleSegmentPreview = () => {
    if (segmentPreviewPlaying) {
      stopSynth();
    } else {
      stopCustomProgram();
      startSynth(useSynthStore.getState().layers);
    }
  };

  const handleWholeTimeline = () => {
    if (wholeTimelinePlaying) {
      stopCustomProgram();
    } else {
      stopSynth();
      flushActiveSegment();
      startTimelinePreview(useSynthStore.getState().timelineSegments);
    }
  };

  const handleExportPresets = () => {
    if (savedPresets.length === 0) return;
    const json = JSON.stringify(savedPresets, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    downloadBlob(blob, "brainwave-presets.json");
  };

  const handleImportPresets = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (!Array.isArray(data)) return;
        importPresets(data as SynthPreset[]);
      } catch {
        // invalid JSON — silently ignore
      }
    };
    reader.readAsText(file);
    // reset so the same file can be re-selected
    e.target.value = "";
  };

  // Current layer list to display
  const displayLayers = isStereo
    ? (activeChannel === "left" ? leftLayers : rightLayers)
    : layers;
  const maxDisplay = editorMode === "harmonic" ? 9 : MAX_LAYERS;
  const canAddLayer = editorMode === "free" && displayLayers.length < MAX_LAYERS;

  const openAuthModal = useAuthStore((s) => s.openAuthModal);

  if (!authLoading && !user) {
    return (
      <BareColumn>
      <div className="flex flex-col items-center justify-center gap-6 pt-24" style={{ animation: "fade-in 0.3s ease-out" }}>
        <div className="w-20 h-20 rounded-full bg-surface border border-surface-border flex items-center justify-center neu-raised">
          <Lock size={36} className="text-text-muted" strokeWidth={1.5} />
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-text-primary">{t("ログインが必要です", "Please log in")}</p>
          <p className="text-sm text-text-secondary mt-2">
            {t("合成器機能を利用するにはログインしてください", "Log in to use the synth.")}
          </p>
        </div>
        <button
          onClick={() => openAuthModal("login")}
          className="h-12 px-8 rounded-2xl bg-primary text-on-primary text-base font-bold active:scale-95 transition-all neu-raised neu-press"
        >
          {t("ログイン", "Log in")}
        </button>
        <button
          onClick={() => router.back()}
          className="text-sm text-text-muted underline active:opacity-70"
        >
          {t("戻る", "Back")}
        </button>
      </div>
      </BareColumn>
    );
  }

  if (roleLoaded && user && !isAdmin) {
    return (
      <BareColumn>
      <div className="flex flex-col items-center justify-center gap-6 pt-24" style={{ animation: "fade-in 0.3s ease-out" }}>
        <div className="w-20 h-20 rounded-full bg-surface border border-surface-border flex items-center justify-center neu-raised">
          <Lock size={36} className="text-text-muted" strokeWidth={1.5} />
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-text-primary">{t("権限がありません", "No access")}</p>
          <p className="text-sm text-text-secondary mt-2">
            {t("この機能は管理者のみ利用できます", "Only admins can use this feature.")}
          </p>
        </div>
        <button
          onClick={() => router.replace("/")}
          className="h-12 px-8 rounded-2xl bg-primary text-on-primary text-base font-bold active:scale-95 transition-all neu-raised neu-press"
        >
          {t("ホームへ", "Go to Home")}
        </button>
      </div>
      </BareColumn>
    );
  }

  return (
    <BareColumn>
    <div className="flex flex-col gap-6 pt-6 md:max-w-2xl md:mx-auto md:w-full" style={{ animation: "fade-in 0.3s ease-out" }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full bg-navy flex items-center justify-center text-text-secondary active:scale-95 neu-raised-sm"
          aria-label={t("戻る", "Back")}
        >
          <ChevronLeft size={20} strokeWidth={2} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            {isTimelineMode ? t("タイムライン作成", "Create a timeline") : t("カスタム合成器", "Custom synth")}
          </h1>
          <p className="text-sm text-text-secondary">
            {isTimelineMode
              ? t("時間で音が切り替わる音声を作成", "Make audio whose sound changes over time")
              : t("振荡器を重ねてオリジナル音を作成", "Layer oscillators to make your own sound")}
          </p>
        </div>
      </div>

      {/* Timeline segment strip */}
      {isTimelineMode && <SynthTimelineStrip />}

      {/* Mode selector + Stereo toggle */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          {(["free", "harmonic"] as const).map((m) => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                editorMode === m
                  ? "bg-navy-light text-primary neu-inset"
                  : "bg-navy text-text-secondary neu-raised-sm"
              }`}
            >
              {m === "free" ? "Free" : "Harmonic"}
            </button>
          ))}
        </div>

        {/* Stereo toggle */}
        <div className="flex items-center justify-between bg-surface border border-surface-border rounded-2xl px-4 py-3 neu-raised">
          <span className="text-sm text-text-primary font-medium">{t("ステレオ", "Stereo")}</span>
          <button
            onClick={handleStereoToggle}
            className={`w-11 h-6 rounded-full transition-colors relative neu-toggle-track ${
              isStereo ? "bg-primary" : "bg-navy-lighter"
            }`}
            aria-label={t("ステレオ切替", "Toggle stereo")}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform neu-raised-sm ${
                isStereo ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Harmonic base frequency input */}
      {editorMode === "harmonic" && (
        <div className="bg-surface border border-surface-border rounded-3xl p-4 flex flex-col gap-3 neu-raised">
          {isStereo ? (
            <>
              <label className="text-xs text-text-secondary">{t("基本周波数", "Base frequency")}</label>
              <div className="flex gap-2 items-center">
                <span className="w-7 text-xs text-accent font-bold tabular-nums">L</span>
                <input
                  type="number"
                  min={HARMONIC_BASE_MIN}
                  max={FREQ_MAX}
                  step={0.01}
                  value={baseFreqInputLeft}
                  onChange={(e) => setBaseFreqInputLeft(e.target.value)}
                  onKeyDown={handleBaseFreqKeyDown("left")}
                  className="flex-1 bg-navy rounded-xl px-4 py-3 text-base text-text-primary tabular-nums outline-none neu-inset focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-sm text-text-muted">Hz</span>
                <button
                  onClick={() => handleBaseFreqApply("left")}
                  className="px-4 py-3 rounded-xl bg-primary text-on-primary text-sm font-bold active:scale-95 neu-raised-sm"
                >
                  {t("生成", "Generate")}
                </button>
              </div>
              <div className="flex gap-2 items-center">
                <span className="w-7 text-xs text-accent font-bold tabular-nums">R</span>
                <input
                  type="number"
                  min={HARMONIC_BASE_MIN}
                  max={FREQ_MAX}
                  step={0.01}
                  value={baseFreqInputRight}
                  onChange={(e) => setBaseFreqInputRight(e.target.value)}
                  onKeyDown={handleBaseFreqKeyDown("right")}
                  className="flex-1 bg-navy rounded-xl px-4 py-3 text-base text-text-primary tabular-nums outline-none neu-inset focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-sm text-text-muted">Hz</span>
                <button
                  onClick={() => handleBaseFreqApply("right")}
                  className="px-4 py-3 rounded-xl bg-primary text-on-primary text-sm font-bold active:scale-95 neu-raised-sm"
                >
                  {t("生成", "Generate")}
                </button>
              </div>
              <p className="text-xs text-text-muted">
                {t(
                  "左右別に基本周波数を設定できます（1〜9倍音を生成）",
                  "Set a separate base frequency for left and right (generates harmonics 1–9)",
                )}
              </p>
            </>
          ) : (
            <>
              <label className="text-xs text-text-secondary">{t("基本周波数", "Base frequency")}</label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min={HARMONIC_BASE_MIN}
                  max={FREQ_MAX}
                  step={0.01}
                  value={baseFreqInput}
                  onChange={(e) => setBaseFreqInput(e.target.value)}
                  onKeyDown={handleBaseFreqKeyDown()}
                  className="flex-1 bg-navy rounded-xl px-4 py-3 text-base text-text-primary tabular-nums outline-none neu-inset focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-sm text-text-muted">Hz</span>
                <button
                  onClick={() => handleBaseFreqApply()}
                  className="px-4 py-3 rounded-xl bg-primary text-on-primary text-sm font-bold active:scale-95 neu-raised-sm"
                >
                  {t("生成", "Generate")}
                </button>
              </div>
              <p className="text-xs text-text-muted">
                {t("基本周波数の1〜9倍音を生成します", "Generates harmonics 1–9 of the base frequency")}
              </p>
            </>
          )}
        </div>
      )}

      {/* Playback */}
      {isTimelineMode ? (
        <div className="flex gap-2">
          <button
            onClick={handleSegmentPreview}
            className={`flex-1 min-h-[56px] rounded-2xl text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-all neu-raised-sm ${
              segmentPreviewPlaying ? "bg-accent text-on-accent" : "bg-navy text-text-primary"
            }`}
          >
            {segmentPreviewPlaying ? <Square size={18} fill="white" strokeWidth={0} /> : <Play size={18} fill="currentColor" strokeWidth={0} />}
            {t("この区間を試聴", "Preview segment")}
          </button>
          <button
            onClick={handleWholeTimeline}
            className={`flex-1 min-h-[56px] rounded-2xl text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-all neu-raised-sm ${
              wholeTimelinePlaying ? "bg-accent text-on-accent" : "bg-primary text-on-primary"
            }`}
          >
            {wholeTimelinePlaying ? <Square size={18} fill="white" strokeWidth={0} /> : <Play size={18} fill="white" strokeWidth={0} />}
            {t("全体を再生", "Play all")}
          </button>
        </div>
      ) : (
        <div className="flex justify-center">
          <SynthPlaybackButton />
        </div>
      )}

      {/* Global Vibrato */}
      <SynthVibratoPanel />

      {/* Stereo solo monitor */}
      {isStereo && (
        <div className="bg-surface border border-surface-border rounded-2xl px-3 py-2 neu-raised flex items-center gap-2">
          <span className="text-xs text-text-muted shrink-0">{t("モニター", "Monitor")}</span>
          <div className="flex gap-1 flex-1">
            {(["left", "both", "right"] as const).map((c) => (
              <button
                key={c}
                onClick={() => {
                  setMonitorChannel(c);
                  audioSetMonitor(c);
                }}
                aria-pressed={monitorChannel === c}
                className={`flex-1 min-h-[48px] rounded-xl text-sm font-bold transition-all active:scale-95 ${
                  monitorChannel === c
                    ? "bg-primary text-on-primary neu-inset"
                    : "bg-navy text-text-secondary neu-raised-sm"
                }`}
              >
                {c === "left" ? t("L のみ", "L only") : c === "right" ? t("R のみ", "R only") : t("両方", "Both")}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stereo channel tabs */}
      {isStereo && (
        <div className="flex gap-2">
          {(["left", "right"] as const).map((ch) => (
            <button
              key={ch}
              onClick={() => setActiveChannel(ch)}
              className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                activeChannel === ch
                  ? "bg-navy-light text-accent font-bold neu-inset"
                  : "bg-navy text-text-secondary neu-raised-sm"
              }`}
            >
              {ch === "left" ? t("L 左チャンネル", "L Left channel") : t("R 右チャンネル", "R Right channel")}
            </button>
          ))}
        </div>
      )}

      {/* Layer list */}
      <div className="flex flex-col gap-3">
        {isTimelineMode && (
          <p className="text-xs text-primary font-bold">
            {t(`編集中: セグメント ${activeSegmentIndex + 1}`, `Editing: Segment ${activeSegmentIndex + 1}`)}
            {timelineSegments[activeSegmentIndex]?.name
              ? t(
                  `「${timelineSegments[activeSegmentIndex].name}」`,
                  ` “${timelineSegments[activeSegmentIndex].name}”`,
                )
              : ""}
          </p>
        )}
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-secondary">
            {isStereo ? `${activeChannel === "left" ? "L" : "R"} ` : ""}
            {editorMode === "harmonic" ? t("倍音レイヤー", "Harmonic layers") : t("レイヤー", "Layers")}
          </p>
          <p className="text-xs text-text-muted">{displayLayers.length}/{maxDisplay}</p>
        </div>

        {displayLayers.map((layer, i) => (
          <SynthLayerCard
            key={layer.id}
            layer={layer}
            index={i}
            canDelete={displayLayers.length > 1}
            harmonicLabel={editorMode === "harmonic" ? `${i + 1}x` : undefined}
            stereoChannel={isStereo ? activeChannel : undefined}
          />
        ))}

        {canAddLayer && (
          <button
            onClick={() => isStereo ? handleAddStereoLayer(activeChannel) : handleAddLayer()}
            className="w-full py-3 rounded-2xl bg-navy text-text-secondary text-sm font-medium neu-raised-sm neu-press transition-transform flex items-center justify-center gap-2"
          >
            <Plus size={18} strokeWidth={2} />
            {t("レイヤーを追加", "Add layer")}
          </button>
        )}
      </div>

      {/* Export button (single-config only; timeline export is not supported yet) */}
      {!isTimelineMode && (
        <>
          <button
            onClick={() => setExportOpen(true)}
            className="w-full py-3 rounded-2xl bg-navy text-text-primary text-base font-bold flex items-center justify-center gap-2 neu-raised-sm neu-press transition-transform"
          >
            <Download size={20} strokeWidth={2} />
            {t("音声をエクスポート", "Export audio")}
          </button>

          <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} mode="synth" />
        </>
      )}

      {/* Save preset (single-config only) */}
      {!isTimelineMode && (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-text-secondary">{t("プリセット保存", "Save preset")}</p>

        {/* Overwrite existing preset */}
        {editingPresetName && (
          <button
            onClick={requestOverwritePreset}
            className="w-full py-3 rounded-xl bg-primary text-on-primary text-sm font-bold transition-opacity active:scale-95 neu-raised-sm"
          >
            {t(`「${editingPresetName}」を上書き保存`, `Overwrite “${editingPresetName}”`)}
          </button>
        )}

        {/* Save as new */}
        <div className="flex gap-2">
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder={editingPresetName ? t("新しいプリセット名を入力", "New preset name") : t("プリセット名を入力", "Preset name")}
            maxLength={30}
            className="flex-1 min-w-0 bg-navy rounded-xl px-4 py-3 text-base text-text-primary placeholder:text-text-muted outline-none neu-inset focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={requestSavePreset}
            disabled={!presetName.trim()}
            className={`px-5 py-3 rounded-xl text-sm font-bold disabled:opacity-40 transition-opacity active:scale-95 neu-raised-sm ${
              editingPresetName
                ? "bg-navy-light text-primary"
                : "bg-primary text-on-primary"
            }`}
          >
            {editingPresetName ? t("別名保存", "Save as new") : t("保存", "Save")}
          </button>
        </div>

        {presetMsg && (
          <p className="text-xs text-primary font-bold" role="status">{t(presetMsg)}</p>
        )}
      </div>
      )}

      {/* Preset Import/Export (single-config only) */}
      {!isTimelineMode && (
      <div className="flex gap-2">
        <button
          onClick={handleExportPresets}
          disabled={savedPresets.length === 0}
          className="flex-1 py-3 rounded-xl bg-navy text-text-primary text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 transition-opacity active:scale-95 neu-raised-sm"
        >
          <FileDown size={18} strokeWidth={2} />
          {t("エクスポート", "Export")}
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 py-3 rounded-xl bg-navy text-text-primary text-sm font-bold flex items-center justify-center gap-2 active:scale-95 neu-raised-sm"
        >
          <Upload size={18} strokeWidth={2} />
          {t("インポート", "Import")}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleImportPresets}
          className="hidden"
        />
      </div>
      )}

      {/* Save as program */}
      <div className="flex flex-col gap-2">
        <p className="text-sm text-text-secondary">
          {isTimelineMode ? t("タイムラインを保存", "Save timeline") : t("プログラムとして保存", "Save as program")}
        </p>
        {editingProgramId ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={programDesc}
              onChange={(e) => setProgramDesc(e.target.value)}
              placeholder={t("簡単な説明を入力（任意）", "Short description (optional)")}
              maxLength={100}
              rows={2}
              className="w-full bg-navy rounded-xl px-4 py-3 text-base text-text-primary placeholder:text-text-muted outline-none neu-inset focus:ring-1 focus:ring-accent resize-none"
            />

            {/* Overwrite the program that is open */}
            <button
              onClick={requestUpdateProgram}
              className="w-full py-3 rounded-xl bg-accent text-on-accent text-sm font-bold transition-opacity active:scale-95 neu-raised-sm"
            >
              <span className="block truncate px-2">
                {editingProgramName
                  ? t(`「${editingProgramName}」を更新`, `Update “${editingProgramName}”`)
                  : t("プログラムを更新", "Update program")}
              </span>
            </button>

            {/* Save a copy under a new name; the original stays in the list */}
            <div className="flex gap-2">
              <input
                type="text"
                value={programName}
                onChange={(e) => setProgramName(e.target.value)}
                placeholder={t("新しいプログラム名を入力", "New program name")}
                maxLength={30}
                className="flex-1 min-w-0 bg-navy rounded-xl px-4 py-3 text-base text-text-primary placeholder:text-text-muted outline-none neu-inset focus:ring-1 focus:ring-accent"
              />
              <button
                onClick={requestSaveAsNewProgram}
                disabled={!programName.trim()}
                className="px-5 py-3 rounded-xl bg-navy-light text-accent text-sm font-bold disabled:opacity-40 transition-opacity active:scale-95 neu-raised-sm whitespace-nowrap"
              >
                {t("別名保存", "Save as new")}
              </button>
            </div>
            <p className="text-xs text-text-muted">
              {editingProgramName
                ? t(
                    `別名保存すると「${editingProgramName}」はそのまま残り、新しいプログラムが追加されます`,
                    `Saving as new adds a new program and leaves “${editingProgramName}” as it is`,
                  )
                : t(
                    "別名保存すると元のプログラムはそのまま残り、新しいプログラムが追加されます",
                    "Saving as new adds a new program and leaves the original as it is",
                  )}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={programName}
                onChange={(e) => setProgramName(e.target.value)}
                placeholder={t("プログラム名を入力", "Program name")}
                maxLength={30}
                className="flex-1 bg-navy rounded-xl px-4 py-3 text-base text-text-primary placeholder:text-text-muted outline-none neu-inset focus:ring-1 focus:ring-accent"
              />
              <button
                onClick={requestSaveAsNewProgram}
                disabled={!programName.trim()}
                className="px-5 py-3 rounded-xl bg-accent text-on-accent text-sm font-bold disabled:opacity-40 transition-opacity active:scale-95 neu-raised-sm"
              >
                {t("保存", "Save")}
              </button>
            </div>
            <textarea
              value={programDesc}
              onChange={(e) => setProgramDesc(e.target.value)}
              placeholder={t("簡単な説明を入力（任意）", "Short description (optional)")}
              maxLength={100}
              rows={2}
              className="w-full bg-navy rounded-xl px-4 py-3 text-base text-text-primary placeholder:text-text-muted outline-none neu-inset focus:ring-1 focus:ring-accent resize-none"
            />
          </div>
        )}
        {programMsg && (
          <p className="text-xs text-primary font-bold" role="status">{t(programMsg)}</p>
        )}
        <p className="text-xs text-text-muted">{t("ホーム画面にカードとして表示されます", "Shows as a card on the Home screen")}</p>
      </div>

      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState ? t(confirmState.title) : ""}
        message={confirmState ? t(confirmState.message) : undefined}
        confirmLabel={confirmState ? t(confirmState.confirmLabel) : undefined}
        tone={confirmState?.tone}
        busy={confirmBusy}
        onConfirm={runConfirmed}
        onClose={() => setConfirmState(null)}
      />
    </div>
    </BareColumn>
  );
}
