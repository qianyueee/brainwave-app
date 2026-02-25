import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CustomAudioMeta {
  id: string;
  name: string;
  mimeType: string;
}

interface CustomAudioState {
  audios: CustomAudioMeta[];
  addAudio: (meta: CustomAudioMeta) => void;
  removeAudio: (id: string) => void;
}

export const useCustomAudioStore = create<CustomAudioState>()(
  persist(
    (set) => ({
      audios: [],
      addAudio: (meta) =>
        set((state) => ({ audios: [...state.audios, meta] })),
      removeAudio: (id) =>
        set((state) => ({ audios: state.audios.filter((a) => a.id !== id) })),
    }),
    {
      name: "custom-audio-meta",
      partialize: (state) => ({ audios: state.audios }),
    }
  )
);
