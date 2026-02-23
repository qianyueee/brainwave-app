import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BrainProfile } from "@/lib/brain-profile";

interface BrainProfileState {
  profile: BrainProfile | null;
  setProfile: (profile: BrainProfile) => void;
  clearProfile: () => void;
}

export const useBrainProfileStore = create<BrainProfileState>()(
  persist(
    (set) => ({
      profile: null,
      setProfile: (profile) => set({ profile }),
      clearProfile: () => set({ profile: null }),
    }),
    {
      name: "brain-profile",
      partialize: (state) => ({ profile: state.profile }),
    }
  )
);
