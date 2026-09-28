"use client";

import { useAudio } from "@/components/AudioProvider";
import { useSynthStore } from "@/store/useSynthStore";
import { Play, Square } from "lucide-react";
import { useT } from "@/lib/i18n";

export default function SynthPlaybackButton() {
  const { startSynth, stopSynth } = useAudio();
  const layers = useSynthStore((s) => s.layers);
  const isSynthPlaying = useSynthStore((s) => s.isSynthPlaying);
  const t = useT();

  const handleToggle = () => {
    if (isSynthPlaying) {
      stopSynth();
    } else {
      startSynth(layers);
    }
  };

  return (
    <button
      onClick={handleToggle}
      className={`w-20 h-20 rounded-full flex items-center justify-center transition-all active:scale-95 neu-raised-lg ${
        isSynthPlaying
          ? "bg-accent text-on-accent"
          : "bg-primary text-on-primary"
      }`}
      aria-label={isSynthPlaying ? t("停止", "Stop") : t("再生", "Play")}
    >
      {isSynthPlaying ? (
        <Square size={28} fill="white" strokeWidth={0} />
      ) : (
        <Play size={28} fill="white" strokeWidth={0} className="ml-1" />
      )}
    </button>
  );
}
