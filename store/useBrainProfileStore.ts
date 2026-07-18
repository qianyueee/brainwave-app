import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BrainProfile } from "@/lib/brain-profile";
import { createPerUserStorage } from "@/lib/sync/per-user-storage";
import {
  getBrainMeasurements,
  upsertBrainMeasurements,
  deleteBrainProfile,
} from "@/lib/sync/brain-profile";

interface BrainProfileState {
  /** Latest measurement — kept for the /profile chart & program personalization. */
  profile: BrainProfile | null;
  /** Full measurement history, oldest→newest. */
  measurements: BrainProfile[];
  /** uploadedAt of a past measurement the user chose to view on /profile
   *  (from the log page). null = show the latest. Transient (not persisted). */
  viewingUploadedAt: string | null;
  cloudUserId: string | null;
  addMeasurement: (profile: BrainProfile) => Promise<void>;
  deleteMeasurement: (uploadedAt: string) => Promise<void>;
  /** Set (or clear, with "") the memo on the measurement at `uploadedAt`. */
  setMeasurementNote: (uploadedAt: string, note: string) => Promise<void>;
  clearProfile: () => Promise<void>;
  loadFromCloud: (userId: string) => Promise<void>;
  clearForLogout: () => void;
  setViewingMeasurement: (uploadedAt: string | null) => void;
}

const latest = (list: BrainProfile[]): BrainProfile | null =>
  list.length ? list[list.length - 1] : null;

export const useBrainProfileStore = create<BrainProfileState>()(
  persist(
    (set, get) => ({
      profile: null,
      measurements: [],
      viewingUploadedAt: null,
      cloudUserId: null,

      addMeasurement: async (profile) => {
        const prev = get().measurements;
        const next = [...prev, profile];
        // A fresh import shows the new latest, not a previously-viewed record.
        set({ measurements: next, profile: latest(next), viewingUploadedAt: null });
        const uid = get().cloudUserId;
        if (!uid) return;
        try {
          await upsertBrainMeasurements(uid, next);
        } catch (err) {
          console.error("[brain-profile] upsert failed:", err);
          set({ measurements: prev, profile: latest(prev) });
          throw err;
        }
      },

      deleteMeasurement: async (uploadedAt) => {
        const prev = get().measurements;
        const next = prev.filter((m) => m.uploadedAt !== uploadedAt);
        if (next.length === prev.length) return; // nothing matched
        set({ measurements: next, profile: latest(next) });
        const uid = get().cloudUserId;
        if (!uid) return;
        try {
          await upsertBrainMeasurements(uid, next);
        } catch (err) {
          console.error("[brain-profile] delete (upsert) failed:", err);
          set({ measurements: prev, profile: latest(prev) });
          throw err;
        }
      },

      setMeasurementNote: async (uploadedAt, note) => {
        const prev = get().measurements;
        const trimmed = note.trim();
        let changed = false;
        const next = prev.map((m) => {
          if (m.uploadedAt !== uploadedAt) return m;
          const nextNote = trimmed || undefined;
          if (m.note === nextNote) return m;
          changed = true;
          return { ...m, note: nextNote };
        });
        if (!changed) return;
        set({ measurements: next, profile: latest(next) });
        const uid = get().cloudUserId;
        if (!uid) return;
        try {
          await upsertBrainMeasurements(uid, next);
        } catch (err) {
          console.error("[brain-profile] note upsert failed:", err);
          set({ measurements: prev, profile: latest(prev) });
          throw err;
        }
      },

      clearProfile: async () => {
        const prev = get().measurements;
        set({ measurements: [], profile: null, viewingUploadedAt: null });
        const uid = get().cloudUserId;
        if (!uid) return;
        try {
          await deleteBrainProfile(uid);
        } catch (err) {
          console.error("[brain-profile] delete failed:", err);
          set({ measurements: prev, profile: latest(prev) });
          throw err;
        }
      },

      loadFromCloud: async (userId) => {
        try {
          const cloud = await getBrainMeasurements(userId);
          set({ measurements: cloud, profile: latest(cloud), cloudUserId: userId });
        } catch (err) {
          console.error("[brain-profile] load failed:", err);
          set({ cloudUserId: userId });
        }
      },

      clearForLogout: () => {
        set({ profile: null, measurements: [], cloudUserId: null, viewingUploadedAt: null });
      },

      setViewingMeasurement: (uploadedAt) => set({ viewingUploadedAt: uploadedAt }),
    }),
    {
      name: "brain-profile",
      storage: createPerUserStorage(),
      partialize: (state) => ({
        profile: state.profile,
        measurements: state.measurements,
      }),
      version: 1,
      // v0 stored only a single `profile`; seed the history from it.
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as {
          profile?: BrainProfile | null;
          measurements?: BrainProfile[];
        };
        if (version >= 1) {
          return { profile: p.profile ?? null, measurements: p.measurements ?? [] };
        }
        const measurements =
          p.measurements && p.measurements.length
            ? p.measurements
            : p.profile
              ? [p.profile]
              : [];
        return { profile: latest(measurements), measurements };
      },
    }
  )
);
