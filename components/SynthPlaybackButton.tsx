"use client";

import { useAudio } from "@/components/AudioProvider";
import { useSynthStore } from "@/store/useSynthStore";

export default function SynthPlaybackButton() {
  const { startSynth, stopSynth } = useAudio();
  const layers = useSynthStore((s) => s.layers);
  const isSynthPlaying = useSynthStore((s) => s.isSynthPlaying);

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
      className={`w-20 h-20 rounded-full flex items-center justify-center transition-all active:scale-95 ${
        isSynthPlaying
          ? "bg-accent border-2 border-accent-dark"
          : "bg-primary border-2 border-primary-dark"
      }`}
      aria-label={isSynthPlaying ? "停止" : "再生"}
    >
      {isSynthPlaying ? (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="white">
          <rect x="4" y="4" width="20" height="20" rx="2" />
        </svg>
      ) : (
        <svg width="28" height="28" viewBox="0 0 28 28" fill="white">
          <path d="M8 4l16 10-16 10V4z" />
        </svg>
      )}
    </button>
  );
}
