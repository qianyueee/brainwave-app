"use client";

import { useRef, useState, useEffect } from "react";
import { Plus, X } from "lucide-react";
import { saveAudio, deleteAudio } from "@/lib/custom-audio-db";
import { useCustomAudioStore, CustomAudioMeta } from "@/store/useCustomAudioStore";
import { useAppStore } from "@/store/useAppStore";
import { useAudio } from "@/components/AudioProvider";

const MAX_COUNT = 3;

function generateId(): string {
  return "custom-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function trimFileName(name: string): string {
  // Remove extension and truncate
  const base = name.replace(/\.[^.]+$/, "");
  return base.length > 20 ? base.slice(0, 20) + "…" : base;
}

export default function CustomAudioSection() {
  const audios = useCustomAudioStore((s) => s.audios);
  const addAudioMeta = useCustomAudioStore((s) => s.addAudio);
  const removeAudioMeta = useCustomAudioStore((s) => s.removeAudio);

  const natureSoundId = useAppStore((s) => s.natureSoundId);
  const setNatureSoundId = useAppStore((s) => s.setNatureSoundId);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const natureVolume = useAppStore((s) => s.natureVolume);

  const { playNatureSound, stopNatureSound } = useAudio();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");

  // Hydration guard for persisted store
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError("");
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be re-selected
    e.target.value = "";

    if (audios.length >= MAX_COUNT) {
      setError(`最大${MAX_COUNT}個までです`);
      return;
    }

    const id = generateId();
    const name = trimFileName(file.name);
    const meta: CustomAudioMeta = { id, name, mimeType: file.type };

    try {
      await saveAudio({ id, name, mimeType: file.type, blob: file });
      addAudioMeta(meta);
    } catch {
      setError("保存に失敗しました");
    }
  };

  const handleDelete = async (id: string) => {
    // If currently playing this audio, stop it
    if (natureSoundId === id) {
      stopNatureSound();
      setNatureSoundId("");
    }

    try {
      await deleteAudio(id);
      removeAudioMeta(id);
    } catch {
      setError("削除に失敗しました");
    }
  };

  const handleSelect = (id: string) => {
    if (natureSoundId === id) {
      // Deselect
      setNatureSoundId("");
      stopNatureSound();
    } else {
      // Select custom audio (deselects any built-in sound via store)
      setNatureSoundId(id);
      if (isPlaying) {
        playNatureSound(id, natureVolume);
      }
    }
  };

  if (!hydrated) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center">
        <span className="text-sm text-text-secondary">
          マイ音声 ({audios.length}/{MAX_COUNT})
        </span>
        {audios.length < MAX_COUNT && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-navy text-text-secondary neu-raised-sm neu-press"
            aria-label="音声ファイルを追加"
          >
            <Plus size={16} />
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={handleUpload}
          className="hidden"
        />
      </div>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {audios.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {audios.map((audio) => {
            const isSelected = natureSoundId === audio.id;
            return (
              <div
                key={audio.id}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all ${
                  isSelected
                    ? "neu-inset text-accent font-bold"
                    : "neu-raised-sm neu-press text-text-secondary"
                } ${!isPlaying && !isSelected ? "opacity-50" : ""}`}
              >
                <button
                  className="flex-1 text-left truncate min-w-0"
                  onClick={() => handleSelect(audio.id)}
                >
                  {audio.name}
                </button>
                <button
                  onClick={() => handleDelete(audio.id)}
                  className="ml-2 w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-red-400 transition-colors flex-shrink-0"
                  aria-label={`${audio.name}を削除`}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
