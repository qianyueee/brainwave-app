import { create } from "zustand";
import { persist } from "zustand/middleware";

/** この端末が結びついているアカウント。 */
export interface CloudAccount {
  id: string;
  email: string | null;
}

export type CloudSyncPhase = "idle" | "syncing" | "error";

interface CloudSyncState {
  /**
   * この端末が結びついているアカウント（永続、key `cloud-account`）。ログインの
   * たびに書き、**明示的なログアウト（SIGNED_OUT）でだけ消す**。
   *
   * `useAuthStore.user` と別に持つのは、オフラインで起動したときのため：保存済みの
   * トークンが期限切れだと、更新できるまで supabase-js はセッション無し（user=null）
   * を返す。それをログアウトと取り違えると、その間に測った記録の宛先が決まらない。
   * 記録の宛先はこちらで決め、送信は user が戻ってから（lib/sync/outbox.ts）。
   */
  account: CloudAccount | null;
  /** 同期処理の状態（永続しない）。 */
  phase: CloudSyncPhase;
  lastError: string | null;
  lastSavedAt: string | null;
  /**
   * 「ログインして保存」の予約（永続しない）：ログインしたら、ここに載せた
   * 記録の宛先をそのアカウントにする。
   */
  claimOnLogin: { sessions: string[]; checks: string[] };
  setAccount: (account: CloudAccount | null) => void;
  setPhase: (phase: CloudSyncPhase, error?: string | null) => void;
  markSaved: () => void;
  requestClaimOnLogin: (kind: "session" | "check", id: string) => void;
  /** 予約を取り出して空にする。 */
  takeClaims: () => { sessions: string[]; checks: string[] };
}

export const useCloudSyncStore = create<CloudSyncState>()(
  persist(
    (set, get) => ({
      account: null,
      phase: "idle",
      lastError: null,
      lastSavedAt: null,
      claimOnLogin: { sessions: [], checks: [] },

      setAccount: (account) => {
        const cur = get().account;
        if (cur?.id === account?.id && cur?.email === account?.email) return;
        set({ account });
      },

      setPhase: (phase, error = null) => set({ phase, lastError: error }),

      markSaved: () => set({ lastSavedAt: new Date().toISOString() }),

      requestClaimOnLogin: (kind, id) =>
        set((s) => {
          const key = kind === "session" ? "sessions" : "checks";
          if (s.claimOnLogin[key].includes(id)) return s;
          return { claimOnLogin: { ...s.claimOnLogin, [key]: [...s.claimOnLogin[key], id] } };
        }),

      takeClaims: () => {
        const claims = get().claimOnLogin;
        if (claims.sessions.length || claims.checks.length) {
          set({ claimOnLogin: { sessions: [], checks: [] } });
        }
        return claims;
      },
    }),
    {
      name: "cloud-account",
      partialize: (s) => ({ account: s.account }),
    }
  )
);
