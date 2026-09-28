"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { treeStage, treeStageIndex } from "@/lib/sync-tree";
import { SyncTreeFigure, SyncTreeScene } from "@/components/SyncTreeArt";
import { useSyncTreeView } from "@/store/useSyncTreeStore";

/**
 * Sync Tree — ホームのシーンカード。
 *
 * 昼夜の空に現在段階の樹が立つ静かな風景で、成長は絵柄が段階替わりすることで
 * 伝える。文字は四隅の3点だけ——左上のラベル、右上の段階名、右下の矢印。
 * **数値は出さない**（進捗％・ポイントは内部だけ。lib/sync-tree.ts）——育ち具合は
 * 絵と段階名で伝え、細かい読みもの（育てた木数・今日の水やり）は遷移先の
 * /tree が受け持つ。カード全体がタップ領域。
 *
 * 木はログイン中だけの機能（データはアカウントにだけある。store/useSyncTreeStore）：
 * - 読み込めた … いまの段階の樹＋段階名（ふわっと出す——空だけの状態から現れるので）
 * - 未ログイン … 星の種＋右上に「ログインで育てる」
 * - 読み込み中・読めなかった … 空だけ（種を出すと「木がリセットされた」に見える）
 *
 * 背景は時間帯ごとの --tree-* 変数（lib/theme.ts）：朝・昼・宵はページ
 * （淡桃・ミント・淡紫）の延長の空、真夜中だけが星空。樹のアート自体は
 * テーマで変わらない。
 *
 * カード縦寸と樹スケールはハンドオフ原案（170/150・1.42/1.26）からフィード
 * バックで調整済み——「カードはより大きく、樹の見た目はハンドオフ準拠のまま」
 * の分担（h がカードのページ内占有を、scale が樹のカード内占有を決める）。
 */
const SCENE = {
  mobile: { h: 232, scale: 1.5 },
  desktop: { h: 212, scale: 1.35 },
} as const;

export default function SyncTreeCard() {
  const { view, fold } = useSyncTreeView();
  const ready = view === "ready";
  const stage = ready ? treeStageIndex(fold.points) : 0;
  const showTree = ready || view === "logged-out";
  const stageName = treeStage(fold.points).name;

  const label = ready
    ? `Sync Tree：いまは「${stageName}」。水やりとリスニングで育てる木を見る`
    : view === "logged-out"
      ? "Sync Tree：ログインすると、水やりとリスニングで木を育てられます"
      : "Sync Tree：育てている木を見る";

  const tree = showTree ? (
    // 読み込めて初めて現れる樹なので、空だけの状態からふわっと出す。
    <g className="tree-fade-in">
      <SyncTreeFigure stage={stage} />
    </g>
  ) : null;

  return (
    <Link
      href="/tree"
      aria-label={label}
      className="relative block rounded-3xl overflow-hidden border active:scale-[0.99] transition-transform"
      style={{
        background:
          "radial-gradient(130% 130% at 30% 15%, var(--tree-a) 0%, var(--tree-b) 45%, var(--tree-c) 100%)",
        borderColor: "var(--tree-border)",
        boxShadow: "0 10px 30px var(--tree-shadow)",
      }}
    >
      <SyncTreeScene {...SCENE.mobile} className="block w-full md:hidden">
        {tree}
      </SyncTreeScene>
      <SyncTreeScene {...SCENE.desktop} className="hidden w-full md:block">
        {tree}
      </SyncTreeScene>

      {/* 文字は空の上に重ねる（樹の位置とカード高さを動かさないため）。色は
          地面線・きらめきと同じ --tree-ink で、昼夜どちらの空でもコントラスト
          が確保される。 */}
      <span
        className="absolute top-0 left-0 right-0 p-5 flex items-baseline justify-between gap-2 text-sm font-medium"
        style={{ color: "var(--tree-ink)" }}
      >
        Sync Tree
        {ready && <span className="text-base font-bold">{stageName}</span>}
        {view === "logged-out" && <span className="text-sm font-bold">ログインで育てる</span>}
      </span>

      {/* 押せることの合図。カード内に文字を増やさずに済む向き記号ひとつ。 */}
      <ArrowRight
        size={20}
        strokeWidth={2}
        aria-hidden="true"
        className="absolute bottom-4 right-4 opacity-70"
        style={{ color: "var(--tree-ink)" }}
      />
    </Link>
  );
}
