"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSynthStore, EditorMode, StereoChannel } from "@/store/useSynthStore";
import { useAudio } from "@/components/AudioProvider";
import SynthLayerCard from "@/components/SynthLayerCard";
import SynthPlaybackButton from "@/components/SynthPlaybackButton";
import SynthVibratoPanel from "@/components/SynthVibratoPanel";
import ExportDialog from "@/components/ExportDialog";
import { ChevronLeft, Plus, Download, Upload, FileDown } from "lucide-react";
import { downloadBlob } from "@/lib/audio-export";
import { SynthPreset } from "@/lib/synth-engine";

const MAX_LAYERS = 8;
const FREQ_MIN = 20;
const FREQ_MAX = 10000;
const HARMONIC_BASE_MIN = 1;

export default function SynthPage() {
  const router = useRouter();
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
  const setEditorMode = useSynthStore((s) => s.setEditorMode);
  const setIsStereo = useSynthStore((s) => s.setIsStereo);
  const generateHarmonics = useSynthStore((s) => s.generateHarmonics);
  const { getSynth, stopSynth } = useAudio();

  const updatePreset = useSynthStore((s) => s.updatePreset);
  const editingPresetId = useSynthStore((s) => s.editingPresetId);
  const savedPresets = useSynthStore((s) => s.savedPresets);
  const importPresets = useSynthStore((s) => s.importPresets);
  const saveAsProgram = useSynthStore((s) => s.saveAsProgram);
  const updateProgram = useSynthStore((s) => s.updateProgram);
  const editingProgramId = useSynthStore((s) => s.editingProgramId);

  const [presetName, setPresetName] = useState("");
  const [programName, setProgramName] = useState("");
  const [programDesc, setProgramDesc] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [baseFreqInput, setBaseFreqInput] = useState(harmonicBaseFreq.toString());
  const [activeChannel, setActiveChannel] = useState<StereoChannel>("left");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleModeChange = (mode: EditorMode) => {
    if (mode === editorMode) return;
    if (isSynthPlaying) stopSynth();
    setEditorMode(mode);
    if (mode === "harmonic") {
      setBaseFreqInput(useSynthStore.getState().harmonicBaseFreq.toString());
    }
  };

  const handleStereoToggle = () => {
    if (isSynthPlaying) stopSynth();
    setIsStereo(!isStereo);
  };

  const handleBaseFreqApply = () => {
    const parsed = parseFloat(baseFreqInput);
    if (isNaN(parsed)) {
      setBaseFreqInput(harmonicBaseFreq.toString());
      return;
    }
    const clamped = Math.round(Math.max(HARMONIC_BASE_MIN, Math.min(FREQ_MAX, parsed)) * 100) / 100;
    setBaseFreqInput(clamped.toString());
    if (isSynthPlaying) stopSynth();
    generateHarmonics(clamped);
  };

  const handleBaseFreqKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleBaseFreqApply();
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
      updateProgram(editingProgramId, programDesc);
    } else {
      const name = programName.trim();
      if (!name) return;
      saveAsProgram(name, programDesc);
      setProgramName("");
      setProgramDesc("");
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

  return (
    <div className="flex flex-col gap-6 pt-6" style={{ animation: "fade-in 0.3s ease-out" }}>
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
          <h1 className="text-xl font-bold text-text-primary">カスタム合成器</h1>
          <p className="text-sm text-text-secondary">振荡器を重ねてオリジナル音を作成</p>
        </div>
      </div>

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
        <div className="bg-surface border border-surface-border rounded-3xl p-4 flex flex-col gap-2 neu-raised">
          <label className="text-xs text-text-secondary">基本周波数</label>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              min={HARMONIC_BASE_MIN}
              max={FREQ_MAX}
              step={0.01}
              value={baseFreqInput}
              onChange={(e) => setBaseFreqInput(e.target.value)}
              onKeyDown={handleBaseFreqKeyDown}
              className="flex-1 bg-navy rounded-xl px-4 py-3 text-base text-text-primary tabular-nums outline-none neu-inset focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-sm text-text-muted">Hz</span>
            <button
              onClick={handleBaseFreqApply}
              className="px-4 py-3 rounded-xl bg-primary text-white text-sm font-bold active:scale-95 neu-raised-sm"
            >
              生成
            </button>
          </div>
          <p className="text-xs text-text-muted">
            基本周波数の1〜9倍音を生成します{isStereo ? "（両チャンネル）" : ""}
          </p>
        </div>
      )}

      {/* Playback */}
      <div className="flex justify-center">
        <SynthPlaybackButton />
      </div>

      {/* Global Vibrato */}
      <SynthVibratoPanel />

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

      {/* Export button */}
      <button
        onClick={() => setExportOpen(true)}
        className="w-full py-3 rounded-2xl bg-navy text-text-primary text-base font-bold flex items-center justify-center gap-2 neu-raised-sm neu-press transition-transform"
      >
        <Download size={20} strokeWidth={2} />
        音声をエクスポート
      </button>

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} mode="synth" />

      {/* Save preset */}
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

      {/* Preset Import/Export */}
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

      {/* Save as program */}
      <div className="flex flex-col gap-2">
        <p className="text-sm text-text-secondary">プログラムとして保存</p>
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
