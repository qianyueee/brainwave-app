import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BrainProfile } from "@/lib/brain-profile";
import { createPerUserStorage } from "@/lib/sync/per-user-storage";
import {
  listBrainMeasurements,
  upsertBrainMeasurement,
  deleteBrainMeasurement,
  deleteAllBrainMeasurements,
  deleteLegacyBrainProfile,
} from "@/lib/sync/brain-profile";

interface BrainProfileState {
  /** Latest measurement — kept for the /profile chart & program personalization. */
  profile: BrainProfile | null;
  /** Full measurement history, oldest→newest (sorted by uploadedAt). */
  measurements: BrainProfile[];
  /** uploadedAt of a past measurement the user chose to view on /profile
   *  (from the log page). null = show the latest. Transient (not persisted). */
  viewingUploadedAt: string | null;
  cloudUserId: string | null;
  /** Adds a measurement, or replaces the one with the same uploadedAt. */
  addMeasurement: (profile: BrainProfile) => Promise<void>;
  deleteMeasurement: (uploadedAt: string) => Promise<void>;
  /** Set (or clear, with "") the memo on the measurement at `uploadedAt`. */
  setMeasurementNote: (uploadedAt: string, note: string) => Promise<void>;
  clearProfile: () => Promise<void>;
  loadFromCloud: (userId: string) => Promise<void>;
  /**
   * 他の端末（デスクトップ測定アプリなど）が足した記録を取り込み直す。ログイン中
   * だけ動き、`force` でなければ短い間隔の連打は間引く（タブに戻るたびに呼ばれる）。
   */
  refreshFromCloud: (opts?: { force?: boolean }) => Promise<void>;
  clearForLogout: () => void;
  setViewingMeasurement: (uploadedAt: string | null) => void;
}

const latest = (list: BrainProfile[]): BrainProfile | null =>
  list.length ? list[list.length - 1] : null;

/** Insert (or replace by uploadedAt) keeping the list sorted oldest→newest. */
function upsertSorted(list: BrainProfile[], m: BrainProfile): BrainProfile[] {
  const rest = list.filter((x) => x.uploadedAt !== m.uploadedAt);
  const at = rest.findIndex((x) => x.uploadedAt > m.uploadedAt);
  return at < 0 ? [...rest, m] : [...rest.slice(0, at), m, ...rest.slice(at)];
}

// ── クラウドとのやり取りの順序 ──
// 記録は1件1行で書く（lib/sync/brain-profile.ts）。書き込みは1本の Promise 鎖に
// 並べる——「追加してすぐメモ」のように同じ行へ続けて書いたとき、後の書き込みが
// 先に着いて古い内容で上書きされないように。読み直しも同じ鎖の後ろに並ぶので、
// 進行中の書き込みより古い一覧で画面を巻き戻さない。
let chain: Promise<unknown> = Promise.resolve();
function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const run = chain.then(op, op);
  chain = run.catch(() => {});
  return run;
}

// 画面側の変更（楽観更新・ロールバック・ログアウト）のたびに進める版番号。読み直しの
// 結果は、読んでいる間にこれが動いていたら捨てる——読み始めた時点の一覧で、その後に
// 足した記録を消してしまわないように。
let localVersion = 0;
let lastRefreshAt = 0;
const REFRESH_MIN_INTERVAL_MS = 15_000;

/** Cloud list for `userId`, or null when a local change raced the read. */
function pull(userId: string): Promise<BrainProfile[] | null> {
  return enqueue(async () => {
    const version = localVersion;
    const list = await listBrainMeasurements(userId);
    return version === localVersion ? list : null;
  });
}

export const useBrainProfileStore = create<BrainProfileState>()(
  persist(
    (set, get) => {
      /**
       * Put one record back the way it was after a failed cloud write, then
       * re-read the account: only that record is rolled back (not the whole
       * list, which may have changed since), and the re-read settles anything
       * a rollback cannot know about — e.g. a later write to the same record
       * that did go through.
       */
      const restore = (uploadedAt: string, before: BrainProfile | undefined) => {
        localVersion += 1;
        set((state) => {
          const list = before
            ? upsertSorted(state.measurements, before)
            : state.measurements.filter((m) => m.uploadedAt !== uploadedAt);
          return { measurements: list, profile: latest(list) };
        });
        void get().refreshFromCloud({ force: true });
      };

      return {
        profile: null,
        measurements: [],
        viewingUploadedAt: null,
        cloudUserId: null,

        addMeasurement: async (profile) => {
          const before = get().measurements.find((m) => m.uploadedAt === profile.uploadedAt);
          const next = upsertSorted(get().measurements, profile);
          localVersion += 1;
          // A fresh import shows the new latest, not a previously-viewed record.
          set({ measurements: next, profile: latest(next), viewingUploadedAt: null });
          const uid = get().cloudUserId;
          if (!uid) return;
          try {
            await enqueue(() => upsertBrainMeasurement(uid, profile));
          } catch (err) {
            console.error("[brain-profile] upsert failed:", err);
            restore(profile.uploadedAt, before);
            throw err;
          }
        },

        deleteMeasurement: async (uploadedAt) => {
          const before = get().measurements.find((m) => m.uploadedAt === uploadedAt);
          if (!before) return; // nothing matched
          const next = get().measurements.filter((m) => m.uploadedAt !== uploadedAt);
          localVersion += 1;
          set({ measurements: next, profile: latest(next) });
          const uid = get().cloudUserId;
          if (!uid) return;
          try {
            await enqueue(() => deleteBrainMeasurement(uid, uploadedAt));
          } catch (err) {
            console.error("[brain-profile] delete failed:", err);
            restore(uploadedAt, before);
            throw err;
          }
        },

        setMeasurementNote: async (uploadedAt, note) => {
          const before = get().measurements.find((m) => m.uploadedAt === uploadedAt);
          if (!before) return;
          const nextNote = note.trim() || undefined;
          if (before.note === nextNote) return;
          const updated: BrainProfile = { ...before, note: nextNote };
          const next = get().measurements.map((m) => (m.uploadedAt === uploadedAt ? updated : m));
          localVersion += 1;
          set({ measurements: next, profile: latest(next) });
          const uid = get().cloudUserId;
          if (!uid) return;
          try {
            await enqueue(() => upsertBrainMeasurement(uid, updated));
          } catch (err) {
            console.error("[brain-profile] note upsert failed:", err);
            restore(uploadedAt, before);
            throw err;
          }
        },

        clearProfile: async () => {
          const prev = get().measurements;
          localVersion += 1;
          set({ measurements: [], profile: null, viewingUploadedAt: null });
          const uid = get().cloudUserId;
          if (!uid) return;
          try {
            await enqueue(async () => {
              await deleteAllBrainMeasurements(uid);
              // 移行元の控え（旧表）も消す——「すべて削除」の後に控えだけ残らないように。
              await deleteLegacyBrainProfile(uid);
            });
          } catch (err) {
            console.error("[brain-profile] delete-all failed:", err);
            localVersion += 1;
            set({ measurements: prev, profile: latest(prev) });
            throw err;
          }
        },

        loadFromCloud: async (userId) => {
          lastRefreshAt = Date.now();
          try {
            // A local change during the read makes the result stale; read again
            // (it is queued behind that change's write, so the retry includes it).
            let cloud = await pull(userId);
            if (cloud === null) cloud = await pull(userId);
            if (cloud === null) {
              set({ cloudUserId: userId });
              return;
            }
            set({ measurements: cloud, profile: latest(cloud), cloudUserId: userId });
          } catch (err) {
            console.error("[brain-profile] load failed:", err);
            // Safe now that every write touches only its own row: a later add
            // can no longer replace the account's history with this empty list.
            set({ cloudUserId: userId });
          }
        },

        refreshFromCloud: async (opts) => {
          const uid = get().cloudUserId;
          if (!uid) return;
          const now = Date.now();
          if (!opts?.force && now - lastRefreshAt < REFRESH_MIN_INTERVAL_MS) return;
          lastRefreshAt = now;
          try {
            const list = await pull(uid);
            // Discard if a local change raced the read or the account changed meanwhile.
            if (list === null || get().cloudUserId !== uid) return;
            set({ measurements: list, profile: latest(list) });
          } catch (err) {
            console.error("[brain-profile] refresh failed:", err);
          }
        },

        clearForLogout: () => {
          localVersion += 1;
          set({ profile: null, measurements: [], cloudUserId: null, viewingUploadedAt: null });
        },

        setViewingMeasurement: (uploadedAt) => set({ viewingUploadedAt: uploadedAt }),
      };
    },
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
