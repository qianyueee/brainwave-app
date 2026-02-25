"use client";

import { useRouter } from "next/navigation";
import { SynthPreset } from "@/lib/synth-engine";
import { useSynthStore } from "@/store/useSynthStore";
import { Piano, X } from "lucide-react";

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
      className="w-full bg-navy rounded-3xl p-4 flex items-center gap-4 text-left neu-raised neu-press transition-transform"
    >
      <div className="w-14 h-14 rounded-2xl bg-navy neu-inset flex items-center justify-center shrink-0">
        <Piano size={26} className="text-primary" strokeWidth={1.5} />
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
        className="w-10 h-10 rounded-full bg-navy neu-raised-sm flex items-center justify-center text-text-muted shrink-0 active:scale-95 hover:text-red-400 transition-colors"
        aria-label="削除"
      >
        <X size={18} strokeWidth={2} />
      </div>
    </button>
  );
}
