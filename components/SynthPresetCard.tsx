"use client";

import { useRouter } from "next/navigation";
import { SynthPreset } from "@/lib/synth-engine";
import { useSynthStore } from "@/store/useSynthStore";

interface SynthPresetCardProps {
  preset: SynthPreset;
}

export default function SynthPresetCard({ preset }: SynthPresetCardProps) {
  const router = useRouter();
  const loadPreset = useSynthStore((s) => s.loadPreset);
  const deletePreset = useSynthStore((s) => s.deletePreset);

  const handleClick = () => {
    loadPreset(preset);
    router.push("/synth");
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deletePreset(preset.id);
  };

  return (
    <button
      onClick={handleClick}
      className="w-full bg-navy-light rounded-2xl p-4 flex items-center gap-4 text-left transition-colors active:bg-navy-lighter"
    >
      <div className="w-14 h-14 rounded-xl bg-navy-lighter flex items-center justify-center text-2xl shrink-0">
        🎹
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-text-primary truncate">{preset.name}</p>
        <p className="text-xs text-text-muted mt-1">
          {preset.layers.length}レイヤー
        </p>
      </div>
      <div
        onClick={handleDelete}
        role="button"
        tabIndex={0}
        className="w-10 h-10 rounded-full bg-navy-lighter flex items-center justify-center text-text-muted shrink-0 active:scale-95 hover:text-red-400 transition-colors"
        aria-label="削除"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </div>
    </button>
  );
}
