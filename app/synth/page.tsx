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
import { ChevronLeft, Plus, Download, Upload, FileDown, Lock, Play, Square } from "lucide-react";
import { downloadBlob } from "@/lib/audio-export";
import { SynthPreset } from "@/lib/synth-engine";
import { useAuthStore } from "@/store/useAuthStore";
import { useAdminStore } from "@/store/useAdminStore";

const MAX_LAYERS = 8;
const FREQ_MIN = 20;
const FREQ_MAX = 10000;
const HARMONIC_BASE_MIN = 1;

export default function SynthPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const isAdmin = useAdminStore((s) => s.isAdmin);
  const roleLoaded = useAdminStore((s) => s.roleLoaded);

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
  const [programName, setProgramName] = useState("");
  const [programDesc, setProgramDesc] = useState("");
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

  const handleSave = () => {
    const name = presetName.trim();
    if (!name) return;
    savePreset(name);
    setPresetName("");
  };

  const handleOverwriteSave = () => {
    if (!editingPresetId) return;
    updatePreset(editingPresetId);
  };

  const editingPresetName = editingPresetId
    ? savedPresets.find((p) => p.id === editingPresetId)?.name
    : null;

  const handleSaveAsProgram = () => {
    if (editingProgramId) {
      // updateProgram is timeline-aware (branches on isTimelineMode internally).
      updateProgram(editingProgramId, programDesc);
    } else {
      const name = programName.trim();
      if (!name) return;
      if (isTimelineMode) {
        saveAsTimelineProgram(name, programDesc);
      } else {
        saveAsProgram(name, programDesc);
      }
      setProgramName("");
      setProgramDesc("");
    }
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
      <div className="flex flex-col items-center justify-center gap-6 pt-24" style={{ animation: "fade-in 0.3s ease-out" }}>
        <div className="w-20 h-20 rounded-full bg-surface border border-surface-border flex items-center justify-center neu-raised">
          <Lock size={36} className="text-text-muted" strokeWidth={1.5} />
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-text-primary">ログインが必要です</p>
          <p className="text-sm text-text-secondary mt-2">
            合成器機能を利用するにはログインしてください
          </p>
        </div>
        <button
          onClick={() => openAuthModal("login")}
          className="h-12 px-8 rounded-2xl bg-primary text-white text-base font-bold active:scale-95 transition-all neu-raised neu-press"
        >
          ログイン
        </button>
        <button
          onClick={() => router.back()}
          className="text-sm text-text-muted underline active:opacity-70"
        >
          戻る
        </button>
      </div>
    );
  }

  if (roleLoaded && user && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 pt-24" style={{ animation: "fade-in 0.3s ease-out" }}>
        <div className="w-20 h-20 rounded-full bg-surface border border-surface-border flex items-center justify-center neu-raised">
          <Lock size={36} className="text-text-muted" strokeWidth={1.5} />
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-text-primary">権限がありません</p>
          <p className="text-sm text-text-secondary mt-2">
            この機能は管理者のみ利用できます
          </p>
        </div>
        <button
          onClick={() => router.replace("/")}
          className="h-12 px-8 rounded-2xl bg-primary text-white text-base font-bold active:scale-95 transition-all neu-raised neu-press"
        >
          ホームへ
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pt-6 md:max-w-2xl md:mx-auto md:w-full" style={{ animation: "fade-in 0.3s ease-out" }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 rounded-full bg-navy flex items-center justify-center text-text-secondary active:scale-95 neu-raised-sm"
          aria-label="戻る"
        >
          <ChevronLeft size={20} strokeWidth={2} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-text-primary">
            {isTimelineMode ? "タイムライン作成" : "カスタム合成器"}
          </h1>
          <p className="text-sm text-text-secondary">
            {isTimelineMode
              ? "時間で音が切り替わる音声を作成"
              : "振荡器を重ねてオリジナル音を作成"}
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
          <span className="text-sm text-text-primary font-medium">ステレオ</span>
          <button
            onClick={handleStereoToggle}
            className={`w-11 h-6 rounded-full transition-colors relative neu-toggle-track ${
              isStereo ? "bg-primary" : "bg-navy-lighter"
            }`}
            aria-label="ステレオ切替"
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
              <label className="text-xs text-text-secondary">基本周波数</label>
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
                  className="px-4 py-3 rounded-xl bg-primary text-white text-sm font-bold active:scale-95 neu-raised-sm"
                >
                  生成
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
                  className="px-4 py-3 rounded-xl bg-primary text-white text-sm font-bold active:scale-95 neu-raised-sm"
                >
                  生成
                </button>
              </div>
              <p className="text-xs text-text-muted">
                左右別に基本周波数を設定できます（1〜9倍音を生成）
              </p>
            </>
          ) : (
            <>
              <label className="text-xs text-text-secondary">基本周波数</label>
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
                  className="px-4 py-3 rounded-xl bg-primary text-white text-sm font-bold active:scale-95 neu-raised-sm"
                >
                  生成
                </button>
              </div>
              <p className="text-xs text-text-muted">
                基本周波数の1〜9倍音を生成します
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
              segmentPreviewPlaying ? "bg-accent text-white" : "bg-navy text-text-primary"
            }`}
          >
            {segmentPreviewPlaying ? <Square size={18} fill="white" strokeWidth={0} /> : <Play size={18} fill="currentColor" strokeWidth={0} />}
            この区間を試聴
          </button>
          <button
            onClick={handleWholeTimeline}
            className={`flex-1 min-h-[56px] rounded-2xl text-sm font-bold flex items-center justify-center gap-2 active:scale-95 transition-all neu-raised-sm ${
              wholeTimelinePlaying ? "bg-accent text-white" : "bg-primary text-white"
            }`}
          >
            {wholeTimelinePlaying ? <Square size={18} fill="white" strokeWidth={0} /> : <Play size={18} fill="white" strokeWidth={0} />}
            全体を再生
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
          <span className="text-xs text-text-muted shrink-0">モニター</span>
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
                    ? "bg-primary text-white neu-inset"
                    : "bg-navy text-text-secondary neu-raised-sm"
                }`}
              >
                {c === "left" ? "L のみ" : c === "right" ? "R のみ" : "両方"}
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
              {ch === "left" ? "L 左チャンネル" : "R 右チャンネル"}
            </button>
          ))}
        </div>
      )}

      {/* Layer list */}
      <div className="flex flex-col gap-3">
        {isTimelineMode && (
          <p className="text-xs text-primary font-bold">
            編集中: セグメント {activeSegmentIndex + 1}
            {timelineSegments[activeSegmentIndex]?.name
              ? `「${timelineSegments[activeSegmentIndex].name}」`
              : ""}
          </p>
        )}
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-secondary">
            {isStereo ? `${activeChannel === "left" ? "L" : "R"} ` : ""}
            {editorMode === "harmonic" ? "倍音レイヤー" : "レイヤー"}
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
            レイヤーを追加
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
            音声をエクスポート
          </button>

          <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} mode="synth" />
        </>
      )}

      {/* Save preset (single-config only) */}
      {!isTimelineMode && (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-text-secondary">プリセット保存</p>

        {/* Overwrite existing preset */}
        {editingPresetName && (
          <button
            onClick={handleOverwriteSave}
            className="w-full py-3 rounded-xl bg-primary text-white text-sm font-bold transition-opacity active:scale-95 neu-raised-sm"
          >
            「{editingPresetName}」を上書き保存
          </button>
        )}

        {/* Save as new */}
        <div className="flex gap-2">
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder={editingPresetName ? "新しいプリセット名を入力" : "プリセット名を入力"}
            maxLength={30}
            className="flex-1 bg-navy rounded-xl px-4 py-3 text-base text-text-primary placeholder:text-text-muted outline-none neu-inset focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={handleSave}
            disabled={!presetName.trim()}
            className={`px-5 py-3 rounded-xl text-sm font-bold disabled:opacity-40 transition-opacity active:scale-95 neu-raised-sm ${
              editingPresetName
                ? "bg-navy-light text-primary"
                : "bg-primary text-white"
            }`}
          >
            {editingPresetName ? "別名保存" : "保存"}
          </button>
        </div>
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
          エクスポート
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 py-3 rounded-xl bg-navy text-text-primary text-sm font-bold flex items-center justify-center gap-2 active:scale-95 neu-raised-sm"
        >
          <Upload size={18} strokeWidth={2} />
          インポート
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
          {isTimelineMode ? "タイムラインを保存" : "プログラムとして保存"}
        </p>
        {editingProgramId ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={programDesc}
              onChange={(e) => setProgramDesc(e.target.value)}
              placeholder="簡単な説明を入力（任意）"
              maxLength={100}
              rows={2}
              className="w-full bg-navy rounded-xl px-4 py-3 text-base text-text-primary placeholder:text-text-muted outline-none neu-inset focus:ring-1 focus:ring-accent resize-none"
            />
            <button
              onClick={handleSaveAsProgram}
              className="w-full py-3 rounded-xl bg-accent text-white text-sm font-bold transition-opacity active:scale-95 neu-raised-sm"
            >
              プログラムを更新
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={programName}
                onChange={(e) => setProgramName(e.target.value)}
                placeholder="プログラム名を入力"
                maxLength={30}
                className="flex-1 bg-navy rounded-xl px-4 py-3 text-base text-text-primary placeholder:text-text-muted outline-none neu-inset focus:ring-1 focus:ring-accent"
              />
              <button
                onClick={handleSaveAsProgram}
                disabled={!programName.trim()}
                className="px-5 py-3 rounded-xl bg-accent text-white text-sm font-bold disabled:opacity-40 transition-opacity active:scale-95 neu-raised-sm"
              >
                保存
              </button>
            </div>
            <textarea
              value={programDesc}
              onChange={(e) => setProgramDesc(e.target.value)}
              placeholder="簡単な説明を入力（任意）"
              maxLength={100}
              rows={2}
              className="w-full bg-navy rounded-xl px-4 py-3 text-base text-text-primary placeholder:text-text-muted outline-none neu-inset focus:ring-1 focus:ring-accent resize-none"
            />
          </div>
        )}
        <p className="text-xs text-text-muted">ホーム画面にカードとして表示されます</p>
      </div>
    </div>
  );
}
