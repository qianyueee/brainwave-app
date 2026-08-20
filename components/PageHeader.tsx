"use client";

import type { ReactNode } from "react";
import { usePageColumnClass } from "@/components/PageColumn";

interface PageHeaderProps {
  /** 英名（Sync Brain など）。ホームだけ「Home」。 */
  title: string;
  /** 日本語リード。1行に収まる短さで。 */
  subtitle?: string;
  /**
   * タイトルの上に小さく載る行（ホームのブランド名など）。スクロールしても
   * 一緒に残るので、常に見えていてほしいものだけを渡す。
   */
  eyebrow?: ReactNode;
  /** 見出しの右に並べる操作（ホームのログイン・設定）。 */
  actions?: ReactNode;
  /** 見出しの左に置く要素（メニュー外のページの「戻る」など）。 */
  leading?: ReactNode;
}

/**
 * 全ページ共通の見出し。**スクロールしても上に残る**（sticky top-0）ので、
 * 長いページを下まで送っても「いまどの画面か」が消えない。
 *
 * ■ 横幅 — 帯は端まで、中身はカラムに揃える
 * 帯（すりガラスの地）は `<main>` の幅そのまま＝画面の端まで。デスクトップで
 * レールが開いているときはレールの右端から画面右端まで。中身（見出し・操作・
 * リード）だけを `usePageColumnClass()` に入れて、下に続くカードと左端を
 * 揃える。カラム幅の帯にすると、左右に大きな余白を抱えた棒が浮いて見える。
 *
 * ■ 地 — すりガラス（薄い tint ＋ 40px の backdrop-blur）
 * 不透明な `bg-navy` は使えない：背景の WaveBackground は `fixed` の層で、
 * `--dyn-navy` の上に明るい波の帯を重ねている。つまり見えている地色は場所に
 * よって違い、波が横切る位置では不透明な帯だけが暗い矩形として浮いてしまう
 * （デスクトップでこれが露骨に出た）。blur なら背後の波の色をそのまま拾うので、
 * 帯は周囲と同じ色みになる。
 *
 * blur は 40px と強め。12px では下を流れる本文の輪郭が残り、グラフの目盛りが
 * 読めてしまった——大きく散らせば文字は完全に潰れ、波のような大きな色面だけが
 * 残る。tint はその上で文字のコントラストを確保するぶんだけ足している。
 *
 * 文字サイズは `text-xl`（20px）。ページ内の見出し（`text-lg`=18px）を下回ら
 * ない範囲でいちばん小さく、常時居座るヘッダーとして高さを取らない。帯の上下
 * パディングも文字が縮んだぶん詰めてある（pt-4/pb-2）——高さを据え置くと、
 * 小さくなった見出しが広い帯の中で浮いて見える。
 */
export default function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  leading,
}: PageHeaderProps) {
  const columnClass = usePageColumnClass();
  return (
    <div className="sticky top-0 z-30 pt-4 pb-2 bg-navy/70 backdrop-blur-2xl">
      <div className={columnClass}>
        <div className="flex items-center gap-3">
          {leading}
          <div className="min-w-0 flex-1">
            {eyebrow}
            <h1 className="text-xl font-bold text-text-primary leading-tight truncate">
              {title}
            </h1>
          </div>
          {actions && (
            <div className="flex items-center gap-2 shrink-0">{actions}</div>
          )}
        </div>
        {/* リードは操作ボタンの下、帯の幅いっぱいに置く。見出しと同じ行に入れると
            ホームではログイン＋設定に幅を取られて「今日の星空・宇宙周波…」と
            切れてしまう——1行下げるだけで全文入り、帯の高さは変わらない
            （右の 48px ボタンが見出し行の高さを決めているので）。 */}
        {subtitle && (
          <p className="text-xs text-text-secondary mt-0.5 truncate">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
