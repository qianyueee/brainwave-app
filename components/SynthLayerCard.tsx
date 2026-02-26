"use client";

import { useState } from "react";
import { SynthLayer, ToneType, TremoloMode } from "@/lib/synth-engine";
import { useSynthStore, StereoChannel } from "@/store/useSynthStore";
import { useAudio } from "@/components/AudioProvider";
import { X } from "lucide-react";
import RangeSlider from "@/components/RangeSlider";

const FREQ_MIN = 20;
const FREQ_MAX = 10000;
const TREM_RATE_MIN = 0.01;
const TREM_RATE_MAX = 40;
const DEPTH_MIN = 0;
const DEPTH_MAX = 100;

interface SynthLayerCardProps {
  layer: SynthLayer;
  index: number;
  canDelete: boolean;
  harmonicLabel?: string;
  stereoChannel?: StereoChannel;
}

export default function SynthLayerCard({ layer, index, canDelete, harmonicLabel, stereoChannel }: SynthLayerCardProps) {
  const updateLayer = useSynthStore((s) => s.updateLayer);
  const updateLayerTremolo = useSynthStore((s) => s.updateLayerTremolo);
  const removeLayer = useSynthStore((s) => s.removeLayer);
  const updateStereoLayer = useSynthStore((s) => s.updateStereoLayer);
  const updateStereoLayerTremolo = useSynthStore((s) => s.updateStereoLayerTremolo);
  const removeStereoLayer = useSynthStore((s) => s.removeStereoLayer);
  const isSynthPlaying = useSynthStore((s) => s.isSynthPlaying);
  const { updateSynthLayer, updateSynthLayerTremolo, getSynth } = useAudio();
  const [freqInput, setFreqInput] = useState(layer.frequency.toString());
  const [tremRateInput, setTremRateInput] = useState(layer.tremolo.rate.toString());
  const [depthInput, setDepthInput] = useState(Math.round(layer.tremolo.depth * 100).toString());

  // Dispatch to correct store action based on stereo or not
  const storeUpdateLayer = (id: string, patch: Partial<Pick<SynthLayer, "frequency" | "volume" | "tone">>) => {
    if (stereoChannel) {
      updateStereoLayer(stereoChannel, id, patch);
    } else {
      updateLayer(id, patch);
    }
  };
  const storeUpdateTremolo = (id: string, patch: Partial<SynthLayer["tremolo"]>) => {
    if (stereoChannel) {
      updateStereoLayerTremolo(stereoChannel, id, patch);
    } else {
      updateLayerTremolo(id, patch);
    }
  };
  const storeRemoveLayer = (id: string) => {
    if (stereoChannel) {
      removeStereoLayer(stereoChannel, id);
    } else {
      removeLayer(id);
    }
  };

  // --- Frequency ---
  const handleFrequencyChange = (freq: number) => {
    const clamped = Math.round(freq * 100) / 100;
    storeUpdateLayer(layer.id, { frequency: clamped });
    if (isSynthPlaying) {
      updateSynthLayer(layer.id, { frequency: clamped });
    }
  };

  const handleFreqInputBlur = () => {
    const parsed = parseFloat(freqInput);
    if (isNaN(parsed)) {
      setFreqInput(layer.frequency.toString());
      return;
    }
    const clamped = Math.round(Math.max(FREQ_MIN, Math.min(FREQ_MAX, parsed)) * 100) / 100;
    setFreqInput(clamped.toString());
    handleFrequencyChange(clamped);
  };

  // --- Volume ---
  const handleVolumeChange = (vol: number) => {
    storeUpdateLayer(layer.id, { volume: vol });
    if (isSynthPlaying) {
      updateSynthLayer(layer.id, { volume: vol });
    }
  };

  // --- Tone ---
  const handleToneChange = (tone: ToneType) => {
    if (tone === layer.tone) return;
    storeUpdateLayer(layer.id, { tone });
    if (isSynthPlaying) {
      updateSynthLayer(layer.id, { tone });
    }
  };

  // --- Tremolo ---
  const syncTremolo = (patch: Partial<typeof layer.tremolo>) => {
    storeUpdateTremolo(layer.id, patch);
    if (isSynthPlaying) {
      const next = { ...layer.tremolo, ...patch };
      updateSynthLayerTremolo(layer.id, next);
    }
  };

  const handleTremoloToggle = () => {
    syncTremolo({ enabled: !layer.tremolo.enabled });
  };

  const handleTremoloMode = (mode: TremoloMode) => {
    if (mode === layer.tremolo.mode) return;
    syncTremolo({ mode });
  };

  const handleTremRateChange = (rate: number) => {
    const clamped = Math.round(Math.max(TREM_RATE_MIN, Math.min(TREM_RATE_MAX, rate)) * 100) / 100;
    syncTremolo({ rate: clamped });
  };

  const handleTremRateInputBlur = () => {
    const parsed = parseFloat(tremRateInput);
    if (isNaN(parsed)) {
      setTremRateInput(layer.tremolo.rate.toString());
      return;
    }
    const clamped = Math.round(Math.max(TREM_RATE_MIN, Math.min(TREM_RATE_MAX, parsed)) * 100) / 100;
    setTremRateInput(clamped.toString());
    handleTremRateChange(clamped);
  };

  const handleDepthChange = (pct: number) => {
    const clamped = Math.max(DEPTH_MIN, Math.min(DEPTH_MAX, Math.round(pct)));
    syncTremolo({ depth: clamped / 100 });
  };

  const handleDepthInputBlur = () => {
    const parsed = parseInt(depthInput, 10);
    if (isNaN(parsed)) {
      setDepthInput(Math.round(layer.tremolo.depth * 100).toString());
      return;
    }
    const clamped = Math.max(DEPTH_MIN, Math.min(DEPTH_MAX, parsed));
    setDepthInput(clamped.toString());
    handleDepthChange(clamped);
  };

  const blurOnEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  };

  // --- Remove ---
  const handleRemove = () => {
    if (isSynthPlaying) {
      getSynth()?.removeLayer(layer.id);
    }
    storeRemoveLayer(layer.id);
  };

  const numInputClass =
    "w-16 bg-navy rounded-xl px-2 py-1 text-xs text-text-primary text-right tabular-nums outline-none neu-inset focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <div className="bg-surface border border-surface-border rounded-3xl p-4 flex flex-col gap-3 neu-raised">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-text-primary">
          {harmonicLabel
            ? `${harmonicLabel} (${harmonicLabel === "1x" ? "基音" : "倍音"})`
            : `レイヤー ${index + 1}`}
        </p>
        <button
          onClick={handleRemove}
          disabled={!canDelete}
          className="w-8 h-8 rounded-full bg-navy neu-raised-sm flex items-center justify-center text-text-muted disabled:opacity-30 transition-opacity active:scale-95"
          aria-label="削除"
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>

      {/* Frequency */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-xs text-text-secondary">周波数</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={FREQ_MIN}
              max={FREQ_MAX}
              step={0.01}
              value={freqInput}
              onChange={(e) => setFreqInput(e.target.value)}
              onBlur={handleFreqInputBlur}
              onKeyDown={blurOnEnter}
              className="w-24 bg-navy rounded-xl px-2 py-1 text-xs text-text-primary text-right tabular-nums outline-none neu-inset focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-xs text-text-muted">Hz</span>
          </div>
        </div>
        <RangeSlider
          min={FREQ_MIN}
          max={FREQ_MAX}
          step={0.01}
          value={layer.frequency}
          onChange={(e) => {
            const v = Math.round(Number(e.target.value) * 100) / 100;
            setFreqInput(v.toString());
            handleFrequencyChange(v);
          }}
          className="w-full"
        />
      </div>

      {/* Volume */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label className="text-xs text-text-secondary">音量</label>
          <span className="text-xs text-text-muted tabular-nums">{Math.round(layer.volume * 100)}%</span>
        </div>
        <RangeSlider
          min={0}
          max={100}
          step={1}
          value={Math.round(layer.volume * 100)}
          onChange={(e) => handleVolumeChange(Number(e.target.value) / 100)}
          className="w-full"
        />
      </div>

      {/* Tone */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-text-secondary">音色</label>
        <div className="flex gap-2">
          {(["soft", "bright"] as const).map((t) => (
            <button
              key={t}
              onClick={() => handleToneChange(t)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all active:scale-95 ${
                layer.tone === t
                  ? "bg-navy-light text-primary font-bold neu-inset"
                  : "bg-navy text-text-secondary neu-raised-sm"
              }`}
            >
              {t === "soft" ? "Soft" : "Bright"}
            </button>
          ))}
        </div>
      </div>

      {/* Tremolo */}
      <div className="flex flex-col gap-2 border-t border-navy-lighter pt-3">
        <div className="flex items-center justify-between">
          <label className="text-xs text-text-secondary">トレモロ</label>
          <button
            onClick={handleTremoloToggle}
            className={`w-11 h-6 rounded-full transition-colors relative neu-toggle-track ${
              layer.tremolo.enabled ? "bg-primary" : "bg-navy-lighter"
            }`}
            aria-label="トレモロ切替"
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform neu-raised-sm ${
                layer.tremolo.enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {layer.tremolo.enabled && (
          <div className="flex flex-col gap-2 pl-1">
            {/* Mode */}
            <div className="flex gap-2">
              {(["sine", "decay"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => handleTremoloMode(m)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all active:scale-95 ${
                    layer.tremolo.mode === m
                      ? "bg-navy-light text-primary font-bold neu-inset"
                      : "bg-navy text-text-secondary neu-raised-sm"
                  }`}
                >
                  {m === "sine" ? "Sine" : "Decay"}
                </button>
              ))}
            </div>

            {/* Rate */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-text-secondary">Rate</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={TREM_RATE_MIN}
                    max={TREM_RATE_MAX}
                    step={0.01}
                    value={tremRateInput}
                    onChange={(e) => setTremRateInput(e.target.value)}
                    onBlur={handleTremRateInputBlur}
                    onKeyDown={blurOnEnter}
                    className={numInputClass}
                  />
                  <span className="text-xs text-text-muted">Hz</span>
                </div>
              </div>
              <RangeSlider
                min={TREM_RATE_MIN}
                max={TREM_RATE_MAX}
                step={0.01}
                value={layer.tremolo.rate}
                onChange={(e) => {
                  const v = Math.round(Number(e.target.value) * 100) / 100;
                  setTremRateInput(v.toString());
                  handleTremRateChange(v);
                }}
                className="w-full"
              />
            </div>

            {/* Depth */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-xs text-text-secondary">Depth</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={DEPTH_MIN}
                    max={DEPTH_MAX}
                    step={1}
                    value={depthInput}
                    onChange={(e) => setDepthInput(e.target.value)}
                    onBlur={handleDepthInputBlur}
                    onKeyDown={blurOnEnter}
                    className={numInputClass}
                  />
                  <span className="text-xs text-text-muted">%</span>
                </div>
              </div>
              <RangeSlider
                min={DEPTH_MIN}
                max={DEPTH_MAX}
                step={1}
                value={Math.round(layer.tremolo.depth * 100)}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setDepthInput(v.toString());
                  handleDepthChange(v);
                }}
                className="w-full"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
