"use client";

import { useState } from "react";
import { useSynthStore } from "@/store/useSynthStore";
import { useAudio } from "@/components/AudioProvider";

const RATE_MIN = 0.01;
const RATE_MAX = 20;
const DEPTH_MIN = 0;
const DEPTH_MAX = 100;

export default function SynthVibratoPanel() {
  const vibrato = useSynthStore((s) => s.vibrato);
  const updateVibrato = useSynthStore((s) => s.updateVibrato);
  const isSynthPlaying = useSynthStore((s) => s.isSynthPlaying);
  const { updateSynthVibrato } = useAudio();

  const [rateInput, setRateInput] = useState(vibrato.rate.toString());
  const [depthInput, setDepthInput] = useState(Math.round(vibrato.depth * 100).toString());

  const sync = (patch: Partial<typeof vibrato>) => {
    updateVibrato(patch);
    if (isSynthPlaying) {
      const next = { ...vibrato, ...patch };
      updateSynthVibrato(next);
    }
  };

  const handleToggle = () => {
    sync({ enabled: !vibrato.enabled });
  };

  const handleRateChange = (rate: number) => {
    const clamped = Math.round(Math.max(RATE_MIN, Math.min(RATE_MAX, rate)) * 100) / 100;
    sync({ rate: clamped });
  };

  const handleRateInputBlur = () => {
    const parsed = parseFloat(rateInput);
    if (isNaN(parsed)) {
      setRateInput(vibrato.rate.toString());
      return;
    }
    const clamped = Math.round(Math.max(RATE_MIN, Math.min(RATE_MAX, parsed)) * 100) / 100;
    setRateInput(clamped.toString());
    handleRateChange(clamped);
  };

  const handleDepthChange = (pct: number) => {
    const clamped = Math.max(DEPTH_MIN, Math.min(DEPTH_MAX, Math.round(pct)));
    sync({ depth: clamped / 100 });
  };

  const handleDepthInputBlur = () => {
    const parsed = parseInt(depthInput, 10);
    if (isNaN(parsed)) {
      setDepthInput(Math.round(vibrato.depth * 100).toString());
      return;
    }
    const clamped = Math.max(DEPTH_MIN, Math.min(DEPTH_MAX, parsed));
    setDepthInput(clamped.toString());
    handleDepthChange(clamped);
  };

  const blurOnEnter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  };

  const numInputClass =
    "w-16 bg-navy-lighter rounded-lg px-2 py-1 text-xs text-text-primary text-right tabular-nums outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

  return (
    <div className="bg-navy-light rounded-2xl p-4 flex flex-col gap-2">
      {/* Header + toggle */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-text-primary">ビブラート</p>
        <button
          onClick={handleToggle}
          className={`w-11 h-6 rounded-full transition-colors relative ${
            vibrato.enabled ? "bg-primary" : "bg-navy-lighter"
          }`}
          aria-label="ビブラート切替"
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
              vibrato.enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {vibrato.enabled && (
        <div className="flex flex-col gap-2">
          {/* Rate */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <label className="text-xs text-text-secondary">Rate</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={RATE_MIN}
                  max={RATE_MAX}
                  step={0.01}
                  value={rateInput}
                  onChange={(e) => setRateInput(e.target.value)}
                  onBlur={handleRateInputBlur}
                  onKeyDown={blurOnEnter}
                  className={numInputClass}
                />
                <span className="text-xs text-text-muted">Hz</span>
              </div>
            </div>
            <input
              type="range"
              min={RATE_MIN}
              max={RATE_MAX}
              step={0.01}
              value={vibrato.rate}
              onChange={(e) => {
                const v = Math.round(Number(e.target.value) * 100) / 100;
                setRateInput(v.toString());
                handleRateChange(v);
              }}
              className="w-full h-2 rounded-full appearance-none bg-navy-lighter accent-primary"
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
            <input
              type="range"
              min={DEPTH_MIN}
              max={DEPTH_MAX}
              step={1}
              value={Math.round(vibrato.depth * 100)}
              onChange={(e) => {
                const v = Number(e.target.value);
                setDepthInput(v.toString());
                handleDepthChange(v);
              }}
              className="w-full h-2 rounded-full appearance-none bg-navy-lighter accent-primary"
            />
          </div>
        </div>
      )}
    </div>
  );
}
