"use client";

import type { CSSProperties, ReactNode } from "react";
import { useSidebarStore } from "@/store/useSidebarStore";

/**
 * ページの内容カラム — 最大幅と左右パディングの**唯一の持ち主**。
 *
 * 以前は `AppMain`（＝`<main>`）がこの役をしていたが、ページ見出しを画面の横
 * いっぱいに伸ばすためにここへ移した。`<main>` が横いっぱいになったので、
 * `PageHeader` の帯も端まで届き、その帯の**中身**だけがこのカラムに揃う。
 *
 * 帯の中の見出しと、その下のカードの左端は同じ値で揃える必要がある。ズレると
 * 見出しがカードから外れて浮くので、両方ともここを通す。
 *
 * 左パディングはサイドバーの開閉で変わる——収納時は左上に浮くランチャー
 * ボタンがページ見出しに重ならないよう 5rem の溝を空ける。
 */
export function usePageColumnClass(): string {
  const sidebarOpen = useSidebarStore((s) => s.open);
  return `mx-auto w-full max-w-[480px] md:max-w-5xl px-4 transition-[padding] duration-300 ease-out motion-reduce:transition-none ${
    sidebarOpen ? "md:pl-8 md:pr-8" : "md:pl-20 md:pr-8"
  }`;
}

/**
 * ページ本文。カラムの中でブロックを 24px 間隔に積む（従来ページ直下にあった
 * `flex flex-col gap-6` がここへ移ってきた形）。上の 24px は見出しの帯との間隔
 * ——以前は見出しと本文が同じ `gap-6` の列に並んでいたぶんの代わり。
 */
export default function PageColumn({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  /** ページ固有の追加クラス（/tree の `md:max-w-2xl` など）。 */
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={usePageColumnClass()}>
      <div className={`flex flex-col gap-6 pt-6 ${className}`} style={style}>
        {children}
      </div>
    </div>
  );
}

/**
 * カラムの枠だけ。中の積み方（gap や上下パディング）はページ側が持つ。
 *
 * `PageColumn` の `gap-6 pt-6` と衝突する値を使うページ用——Tailwind は同じ
 * プロパティのクラスを並べても「後に書いたほうが勝つ」わけではない（勝つのは
 * 生成された CSS の順）ので、`gap-4` を足して上書きするのは当てにできない。
 */
export function BareColumn({ children }: { children: ReactNode }) {
  return <div className={usePageColumnClass()}>{children}</div>;
}
