"use client";

import { ReactNode } from "react";
import { useMiniPlayerVisible } from "@/components/MiniPlayer";

/**
 * ページの器。**横幅は制限しない**——中身の最大幅と左右パディングは
 * `PageColumn` が持つ（`usePageColumnClass`）。
 *
 * ここでカラムを作らないのは、`PageHeader` の帯を画面の端まで伸ばすため。
 * `<main>` 側で `mx-auto max-w-5xl` を掛けると、その中にいる sticky な見出しは
 * どうやってもカラム幅どまりで、左右に大きな余白を抱えた「浮いた棒」に見えて
 * しまう。負マージンで逃がすこともできない：`mx-auto` が作る左右の余白は
 * 画面幅とレールの開閉で変わるので、CSS で打ち消せる固定値が無い。
 *
 * 下パディングはミニプレイヤーが出ている間だけ広げる（モバイル：下ナビ 64px
 * ＋バー 72px／デスクトップ：据え置きバー 88px）ので、長いページでも最後まで
 * スクロールできる。初回描画は常に狭いほう（再生は false 始まり）なので
 * hydration mismatch は起きない。
 */
export default function AppMain({ children }: { children: ReactNode }) {
  const miniPlayerVisible = useMiniPlayerVisible();
  return (
    <main
      className={`w-full min-h-screen ${
        miniPlayerVisible ? "pb-36 md:pb-32" : "pb-20 md:pb-10"
      }`}
    >
      {children}
    </main>
  );
}
