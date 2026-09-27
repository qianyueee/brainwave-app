import { create } from "zustand";

/**
 * デスクトップ測定アプリの Google ログインの進み具合（永続しない）。
 * 手順は lib/mind/desktop-google-auth.ts、表示は AuthModal。
 *
 * - waiting    … 既定のブラウザで Google ログイン中（アプリは戻りを待っている）
 * - exchanging … 戻ってきた code をセッションに引き換え中
 * - error      … 失敗・キャンセル・時間切れ（message を出す）
 */
export type DesktopLoginStatus = "idle" | "waiting" | "exchanging" | "error";

interface DesktopLoginState {
  status: DesktopLoginStatus;
  /** 開いたログインページ（ブラウザが開かなかったとき手で開くリンク用）。 */
  url: string | null;
  startedAt: number | null;
  message: string | null;
  setWaiting: (url: string) => void;
  setExchanging: () => void;
  setError: (message: string) => void;
  reset: () => void;
}

export const useDesktopLoginStore = create<DesktopLoginState>()((set) => ({
  status: "idle",
  url: null,
  startedAt: null,
  message: null,
  setWaiting: (url) => set({ status: "waiting", url, startedAt: Date.now(), message: null }),
  setExchanging: () => set({ status: "exchanging", message: null }),
  setError: (message) => set({ status: "error", message }),
  reset: () => set({ status: "idle", url: null, startedAt: null, message: null }),
}));
