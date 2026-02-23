"use client";

import { useAppStore } from "@/store/useAppStore";
import { useAudio } from "@/components/AudioProvider";
import { NATURE_SOUNDS } from "@/lib/audio-engine";
import { isCustomProgramId } from "@/lib/programs";

export default function Mixer() {
  const beatVolume = useAppStore((s) => s.beatVolume);
  const setBeatVolume = useAppStore((s) => s.setBeatVolume);
  const natureVolume = useAppStore((s) => s.natureVolume);
  const setNatureVolumeStore = useAppStore((s) => s.setNatureVolume);
  const natureSoundId = useAppStore((s) => s.natureSoundId);
  const setNatureSoundId = useAppStore((s) => s.setNatureSoundId);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const programId = useAppStore((s) => s.selectedProgramId);
  const { getSession, playNatureSound, stopNatureSound, setNatureVolume, setSynthVolume } = useAudio();

  const isCustom = isCustomProgramId(programId);

  const handleBeatVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setBeatVolume(v);
    if (isCustom) {
      setSynthVolume(v);
    } else {
      getSession()?.setVolume(v);
    }
  };

  const handleNatureVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setNatureVolumeStore(v);
    setNatureVolume(v);
  };

  const handleNatureSelect = (id: string) => {
    if (natureSoundId === id) {
      setNatureSoundId("");
      stopNatureSound();
    } else {
      setNatureSoundId(id);
      if (isPlaying) {
        playNatureSound(id, natureVolume);
      }
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Beat volume */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-text-secondary">
            {isCustom ? "合成音量" : "バイノーラルビート"}
          </span>
          <span className="text-sm text-text-muted tabular-nums">
            {Math.round(beatVolume * 100)}%
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={beatVolume}
          onChange={handleBeatVolume}
          className="w-full h-2 rounded-full appearance-none bg-navy-lighter accent-primary"
        />
      </div>

      {/* Nature sound selector */}
      <div className="flex flex-col gap-2">
        <span className="text-sm text-text-secondary">自然音</span>
        <div className="flex gap-2">
          {NATURE_SOUNDS.map((sound) => (
            <button
              key={sound.id}
              onClick={() => handleNatureSelect(sound.id)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                natureSoundId === sound.id
                  ? "bg-accent text-white"
                  : "bg-navy-lighter text-text-secondary"
              } ${!isPlaying && natureSoundId !== sound.id ? "opacity-50" : ""}`}
            >
              {sound.name}
            </button>
          ))}
        </div>
      </div>

      {/* Nature volume */}
      <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-text-secondary">自然音ボリューム</span>
          <span className="text-sm text-text-muted tabular-nums">
            {Math.round(natureVolume * 100)}%
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={natureVolume}
          onChange={handleNatureVolume}
          disabled={!natureSoundId}
          className="w-full h-2 rounded-full appearance-none bg-navy-lighter accent-accent disabled:opacity-30"
        />
      </div>
    </div>
  );
}
