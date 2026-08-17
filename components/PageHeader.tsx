import type { ReactNode } from "react";

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
 * 地は**不透明**（`bg-navy` ＝ページの地色そのもの）。半透明＋blur を試したが、
 * 85% でも 95% でも下を流れる本文がぼやけた影として帯の中に残り、グラフの
 * 目盛りなどが読めてしまった。地色と同色なので静止時は境目が見えず、
 * スクロール時だけ下端のヘアラインが「ここから下がスクロール領域」を示す。
 *
 * 横方向は `-mx-4 px-4` でモバイルの左右パディングぶんまで伸ばし、画面端まで
 * 帯にする（本文が縁からはみ出して見えないように）。デスクトップは
 * AppMain の左パディングがサイドバーの開閉で変わる（`md:pl-8` ⇄ `md:pl-20`）
 * ので、負マージンを合わせに行かず素直にコンテンツ幅で止める——ガター側には
 * スクロールする要素が無いので、帯を伸ばす必要がない。
 *
 * 文字サイズは本文より一段だけ上（22px）。ページ内の見出し（`text-lg`=20px）
 * を下回らない範囲でいちばん小さく、常時居座るヘッダーとして高さを取らない。
 */
export default function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  leading,
}: PageHeaderProps) {
  return (
    <div className="sticky top-0 z-30 -mx-4 px-4 md:mx-0 md:px-0 pt-5 pb-2.5 bg-navy border-b border-surface-border">
      <div className="flex items-center gap-3">
        {leading}
        <div className="min-w-0 flex-1">
          {eyebrow}
          <h1 className="text-xl font-bold text-text-primary leading-tight truncate">
            {title}
          </h1>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {/* リードは操作ボタンの下、帯の幅いっぱいに置く。見出しと同じ行に入れると
          ホームではログイン＋設定に幅を取られて「今日の星空・宇宙周波…」と
          切れてしまう——1行下げるだけで全文入り、帯の高さは変わらない
          （右の 48px ボタンが見出し行の高さを決めているので）。 */}
      {subtitle && (
        <p className="text-xs text-text-secondary mt-0.5 truncate">{subtitle}</p>
      )}
    </div>
  );
}
