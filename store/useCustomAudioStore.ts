import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createPerUserStorage } from "@/lib/sync/per-user-storage";
import {
  listAudios,
  uploadAudio,
  deleteAudio as deleteAudioCloud,
  type CustomAudioRemote,
} from "@/lib/sync/custom-audios";
import { saveAudio as idbSave, deleteAudio as idbDelete } from "@/lib/custom-audio-db";

export interface CustomAudioMeta {
  id: string;
  name: string;
  mimeType: string;
  /** Set once the file is in Supabase Storage; absent for legacy local entries. */
  storagePath?: string;
}

interface CustomAudioState {
  audios: CustomAudioMeta[];
  cloudUserId: string | null;
  /** Add an audio: write blob to IndexedDB locally, then upload to cloud (if logged in). */
  addAudio: (id: string, name: string, mimeType: string, blob: Blob) => Promise<void>;
  removeAudio: (id: string) => Promise<void>;
  loadFromCloud: (userId: string) => Promise<void>;
  clearForLogout: () => void;
}

function fromRemote(r: CustomAudioRemote): CustomAudioMeta {
  return { id: r.id, name: r.name, mimeType: r.mimeType, storagePath: r.storagePath };
}

export const useCustomAudioStore = create<CustomAudioState>()(
  persist(
    (set, get) => ({
      audios: [],
      cloudUserId: null,

      addAudio: async (id, name, mimeType, blob) => {
        const meta: CustomAudioMeta = { id, name, mimeType };
        const prevAudios = get().audios;
        // Local first: IndexedDB blob + optimistic store entry
        await idbSave({ id, name, mimeType, blob });
        set({ audios: [...prevAudios, meta] });

        const uid = get().cloudUserId;
        if (!uid) return;
        try {
          const remote = await uploadAudio(uid, id, blob, name, mimeType);
          // Replace local entry with cloud-aware version (carries storagePath)
          set((state) => ({
            audios: state.audios.map((a) => (a.id === id ? fromRemote(remote) : a)),
          }));
        } catch (err) {
          console.error("[custom-audio] upload failed:", err);
          // Roll back optimistic state + IndexedDB
          set({ audios: prevAudios });
          await idbDelete(id).catch(() => undefined);
          throw err;
        }
      },

      removeAudio: async (id) => {
        const prevAudios = get().audios;
        const target = prevAudios.find((a) => a.id === id);
        if (!target) return;
        // Optimistic remove
        set({ audios: prevAudios.filter((a) => a.id !== id) });
        // Always purge IndexedDB (it's local cache)
        await idbDelete(id).catch(() => undefined);

        const uid = get().cloudUserId;
        if (!uid || !target.storagePath) return;
        try {
          await deleteAudioCloud(uid, id, target.storagePath);
        } catch (err) {
          console.error("[custom-audio] delete failed:", err);
          set({ audios: prevAudios });
          throw err;
        }
      },

      loadFromCloud: async (userId) => {
        try {
          const cloud = await listAudios(userId);
          set({ audios: cloud.map(fromRemote), cloudUserId: userId });
        } catch (err) {
          console.error("[custom-audio] load failed:", err);
          set({ cloudUserId: userId });
        }
      },

      clearForLogout: () => {
        set({ audios: [], cloudUserId: null });
      },
    }),
    {
      name: "custom-audio-meta",
      storage: createPerUserStorage(),
      partialize: (state) => ({ audios: state.audios }),
    }
  )
);
