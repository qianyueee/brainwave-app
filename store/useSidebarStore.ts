import { create } from "zustand";

interface SidebarState {
  /** デスクトップの左レールが開いているか。 */
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
}

/**
 * デスクトップ左レールの開閉。**わざと persist していない**——仕様が
 * 「デフォルトは収納」なので、読み込みのたび必ず閉じた状態から始める。
 * サーバー描画も初回描画も open=false で一致するため hydration mismatch も
 * 起きない（クライアント遷移の間は開いたまま保たれる）。
 *
 * 読み手は SideNav（レール本体＋フローティング起動ボタン）、AppMain
 * （収納時にボタン用の左余白を空ける）、MiniPlayer（デスクトップ再生バーの
 * 左端）の3つ。幅 15rem / 240px という数値はこの3箇所で揃えること。
 */
export const useSidebarStore = create<SidebarState>((set) => ({
  open: false,
  setOpen: (v) => set({ open: v }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
