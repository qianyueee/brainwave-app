"use client";

import { useSynthStore } from "@/store/useSynthStore";
import { useAudio } from "@/components/AudioProvider";
import { formatTime } from "@/lib/utils";
import { Plus, ChevronUp, ChevronDown, Trash2 } from "lucide-react";

function Stepper({
  label,
  value,
  suffix,
  step,
  min,
  decimals = 0,
  onChange,
}: {
  label: string;
  value: number;
  suffix?: string;
  step: number;
  min: number;
  decimals?: number;
  onChange: (v: number) => void;
}) {
  const factor = 10 ** decimals;
  const round = (v: number) => (decimals > 0 ? Math.round(v * factor) / factor : Math.round(v));
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-text-secondary w-28 shrink-0">{label}</span>
      <button
        onClick={() => onChange(round(value - step))}
        className="w-11 h-11 shrink-0 rounded-xl bg-navy text-text-primary text-xl font-bold active:scale-95 neu-raised-sm"
        aria-label="減らす"
      >
        −
      </button>
      <input
        type="number"
        value={value}
        min={min}
        step={step}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(round(v));
        }}
        className="flex-1 min-w-0 bg-navy rounded-xl px-2 py-2.5 text-base text-text-primary text-center tabular-nums outline-none neu-inset focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        onClick={() => onChange(round(value + step))}
        className="w-11 h-11 shrink-0 rounded-xl bg-navy text-text-primary text-xl font-bold active:scale-95 neu-raised-sm"
        aria-label="増やす"
      >
        ＋
      </button>
      {suffix && <span className="text-xs text-text-muted shrink-0 w-16">{suffix}</span>}
    </div>
  );
}

/**
 * Timeline segment strip for the synth editor. The currently-selected (active)
 * segment is edited by the layer editor below; selecting another segment flushes
 * the editor buffer back into the current segment and hydrates from the new one.
 * Selecting/removing stops any running preview to keep the live buffer consistent.
 */
export default function SynthTimelineStrip() {
  const segments = useSynthStore((s) => s.timelineSegments);
  const activeIndex = useSynthStore((s) => s.activeSegmentIndex);
  const setActiveSegment = useSynthStore((s) => s.setActiveSegment);
  const addSegment = useSynthStore((s) => s.addSegment);
  const removeSegment = useSynthStore((s) => s.removeSegment);
  const reorderSegment = useSynthStore((s) => s.reorderSegment);
  const setSegmentDuration = useSynthStore((s) => s.setSegmentDuration);
  const setSegmentCrossfade = useSynthStore((s) => s.setSegmentCrossfade);
  const setSegmentName = useSynthStore((s) => s.setSegmentName);
  const { stopSynth, stopCustomProgram } = useAudio();

  const total = segments.reduce((sum, s) => sum + Math.max(1, s.durationSec), 0);

  const stopPreview = () => {
    stopSynth();
    stopCustomProgram();
  };

  const handleSelect = (i: number) => {
    if (i === activeIndex) return;
    stopPreview();
    setActiveSegment(i);
  };

  return (
    <div className="bg-surface border border-surface-border rounded-3xl p-4 flex flex-col gap-3 neu-raised">
      <div className="flex items-center justify-between">
        <p className="text-base text-text-primary font-bold">タイムライン</p>
        <p className="text-xs text-text-muted tabular-nums">
          合計 {formatTime(total)}（{segments.length}区間）
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {segments.map((seg, i) => {
          const isActive = i === activeIndex;
          return (
            <div
              key={seg.id}
              className={`rounded-2xl border transition-all ${
                isActive
                  ? "border-primary bg-navy-light neu-inset"
                  : "border-surface-border bg-navy neu-raised-sm"
              }`}
            >
              <button
                onClick={() => handleSelect(i)}
                className="w-full flex items-center gap-3 px-3 py-3 min-h-[56px] text-left"
              >
                <span
                  className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold tabular-nums ${
                    isActive ? "bg-primary text-white" : "bg-navy-lighter text-text-secondary"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="flex-1 text-base text-text-primary font-medium truncate">
                  {seg.name || `セグメント ${i + 1}`}
                </span>
                <span className="text-sm text-text-secondary tabular-nums shrink-0">
                  {formatTime(Math.max(1, seg.durationSec))}
                </span>
              </button>

              {isActive && (
                <div className="flex flex-col gap-3 px-3 pb-3">
                  <input
                    type="text"
                    value={seg.name ?? ""}
                    onChange={(e) => setSegmentName(i, e.target.value)}
                    placeholder={`セグメント ${i + 1}`}
                    maxLength={20}
                    className="w-full bg-navy rounded-xl px-3 py-2.5 text-base text-text-primary placeholder:text-text-muted outline-none neu-inset focus:ring-1 focus:ring-primary"
                  />

                  <Stepper
                    label="長さ"
                    value={seg.durationSec}
                    suffix={`秒 / ${formatTime(Math.max(1, seg.durationSec))}`}
                    step={5}
                    min={1}
                    onChange={(v) => setSegmentDuration(i, v)}
                  />

                  <Stepper
                    label={i === 0 ? "フェードイン" : "クロスフェード"}
                    value={seg.crossfadeSec}
                    suffix="秒"
                    step={0.5}
                    min={0}
                    decimals={1}
                    onChange={(v) => setSegmentCrossfade(i, v)}
                  />

                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        stopPreview();
                        reorderSegment(i, i - 1);
                      }}
                      disabled={i === 0}
                      className="flex-1 min-h-[48px] rounded-xl bg-navy text-text-secondary disabled:opacity-30 active:scale-95 neu-raised-sm flex items-center justify-center"
                      aria-label="上へ移動"
                    >
                      <ChevronUp size={20} />
                    </button>
                    <button
                      onClick={() => {
                        stopPreview();
                        reorderSegment(i, i + 1);
                      }}
                      disabled={i === segments.length - 1}
                      className="flex-1 min-h-[48px] rounded-xl bg-navy text-text-secondary disabled:opacity-30 active:scale-95 neu-raised-sm flex items-center justify-center"
                      aria-label="下へ移動"
                    >
                      <ChevronDown size={20} />
                    </button>
                    <button
                      onClick={() => {
                        stopPreview();
                        removeSegment(i);
                      }}
                      disabled={segments.length <= 1}
                      className="flex-1 min-h-[48px] rounded-xl bg-navy text-red-400 disabled:opacity-30 active:scale-95 neu-raised-sm flex items-center justify-center"
                      aria-label="削除"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={addSegment}
        className="w-full min-h-[48px] rounded-2xl bg-navy text-text-secondary text-sm font-medium neu-raised-sm neu-press transition-transform flex items-center justify-center gap-2"
      >
        <Plus size={18} strokeWidth={2} />
        セグメントを追加
      </button>
    </div>
  );
}
