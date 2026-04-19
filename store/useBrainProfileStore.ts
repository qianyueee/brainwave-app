import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BrainProfile } from "@/lib/brain-profile";
import { createPerUserStorage } from "@/lib/sync/per-user-storage";
import {
  getBrainProfile,
  upsertBrainProfile,
  deleteBrainProfile,
} from "@/lib/sync/brain-profile";

interface BrainProfileState {
  profile: BrainProfile | null;
  cloudUserId: string | null;
  setProfile: (profile: BrainProfile) => Promise<void>;
  clearProfile: () => Promise<void>;
  loadFromCloud: (userId: string) => Promise<void>;
  clearForLogout: () => void;
}

export const useBrainProfileStore = create<BrainProfileState>()(
  persist(
    (set, get) => ({
      profile: null,
      cloudUserId: null,

      setProfile: async (profile) => {
        const prev = get().profile;
        set({ profile });
        const uid = get().cloudUserId;
        if (!uid) return;
        try {
          await upsertBrainProfile(uid, profile);
        } catch (err) {
          console.error("[brain-profile] upsert failed:", err);
          set({ profile: prev });
          throw err;
        }
      },

      clearProfile: async () => {
        const prev = get().profile;
        set({ profile: null });
        const uid = get().cloudUserId;
        if (!uid) return;
        try {
          await deleteBrainProfile(uid);
        } catch (err) {
          console.error("[brain-profile] delete failed:", err);
          set({ profile: prev });
          throw err;
        }
      },

      loadFromCloud: async (userId) => {
        try {
          const cloud = await getBrainProfile(userId);
          set({ profile: cloud, cloudUserId: userId });
        } catch (err) {
          console.error("[brain-profile] load failed:", err);
          set({ cloudUserId: userId });
        }
      },

      clearForLogout: () => {
        set({ profile: null, cloudUserId: null });
      },
    }),
    {
      name: "brain-profile",
      storage: createPerUserStorage(),
      partialize: (state) => ({ profile: state.profile }),
    }
  )
);
