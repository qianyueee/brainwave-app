import { create } from "zustand";
import type { LocalizedText } from "@/lib/i18n";

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
  /** 失敗の案内。両方の言語で持ち、表示言語は AuthModal が描画時に選ぶ。 */
  message: LocalizedText | null;
  setWaiting: (url: string) => void;
  setExchanging: () => void;
  setError: (message: LocalizedText) => void;
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
