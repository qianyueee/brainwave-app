"use client";

import { useId } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  PLACEHOLDER_TREE,
  clampProgress,
  treeStage,
  treeStageIndex,
} from "@/lib/sync-tree";
import { SyncTreeFigure, TREE_SPARKLE_PATH } from "@/components/SyncTreeArt";

/**
 * Sync Tree — ホームのシーンカード。
 *
 * 昼夜の空に現在段階の樹が立つ静かな風景で、成長は絵柄が段階替わりすることで
 * 伝える。文字は四隅の3点だけ——左上のラベル、右上の進捗％、右下の矢印。
 * 段階名・育てた木数・16段階の一覧といった読みものは遷移先の /tree が受け
 * 持つので、ここには持ち込まない（％だけは、樹の絵の差が微妙な隣接段階でも
 * 「昨日から進んだ」ことが分かる唯一の手がかりなので残している）。
 * カード全体がタップ領域。
 *
 * 背景はアプリの4テーマを昼／夜の2状態に畳んだ --tree-* 変数（lib/theme.ts）：
 * day・afternoon は白日の空、midnight・evening は星空。樹のアート自体は
 * テーマで変わらない。
 *
 * 樹の足もと（オーラ・地面の線・盛り土）は、ハンドオフのモバイル値
 * （340×170、樹 transform translate(85.5,-13.6) scale(1.42)）をその
 * transform の逆写像で樹空間（120×140）に戻した定数で持ち、まとめて
 * ブレークポイントごとの transform で包む。きらめき3つはハンドオフ同様
 * シーン座標（カードの空）に置く。カード縦寸と樹スケールはハンドオフ原案
 * （170/150・1.42/1.26）からフィードバックで調整済み（SCENE 参照）。
 */

/** variant ごとのシーン寸法。transform は「幹の接地が高さの95%」から算出。
    h はカードのページ内占有を決め、scale は樹のカード内占有を決める——
    「カードはより大きく、樹の見た目はハンドオフ準拠のまま」の分担。 */
const SCENE = {
  mobile: { h: 232, scale: 1.5 },
  desktop: { h: 212, scale: 1.35 },
} as const;

const SCENE_W = 340;
/** 樹空間（120×140）での接地線の y。 */
const GROUND_Y = 124;

function sceneTransform(variant: "mobile" | "desktop"): string {
  const { h, scale } = SCENE[variant];
  const tx = (SCENE_W - 120 * scale) / 2;
  const ty = h * 0.95 - GROUND_Y * scale;
  return `translate(${tx.toFixed(1)},${ty.toFixed(1)}) scale(${scale})`;
}

/** シーン1枚。viewBox と樹 transform だけが variant で変わる。 */
function TreeScene({
  variant,
  stage,
  className,
}: {
  variant: "mobile" | "desktop";
  stage: number;
  className?: string;
}) {
  // オーラのぼかしフィルタ id はインスタンスごとに一意に
  const glowId = `tree-glow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      viewBox={`0 0 ${SCENE_W} ${SCENE[variant].h}`}
      className={className}
      aria-hidden="true"
    >
      <defs>
        {/* 平塗り楕円のフチが（特に昼の空で）唐突だったので輪郭を羽化させる。
            ぼかしがフィルタ領域で切れないよう余白を広めに取る */}
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation={7} />
        </filter>
      </defs>
      <g transform={sceneTransform(variant)}>
        {/* 樹のうしろのやわらかな光 */}
        <ellipse
          cx={59.5}
          cy={77.2}
          rx={54.9}
          ry={40.8}
          fill="var(--tree-glow)"
          opacity={0.55}
          filter={`url(#${glowId})`}
        />
        {/* うねる地面のひと筆と盛り土 */}
        <path
          d="M-1.1,119.4 Q28.5,113.8 59.5,115.9 Q93.3,119.4 120.1,114.5"
          fill="none"
          stroke="var(--tree-ink)"
          opacity={0.35}
          strokeWidth={1.06}
          strokeLinecap="round"
        />
        <path
          d="M18.7,119.4 Q59.5,109.6 100.4,119.4 Z"
          fill="var(--tree-ink)"
          opacity={0.08}
        />
        <SyncTreeFigure stage={stage} />
      </g>
      {/* 手描きのきらめき3つ — ハンドオフ同様シーン側の空に散らす（樹では
          なくカードに属する）。位置は幅は絶対値・高さは h 比で、カードを
          縦に伸ばしても空の上のほうに残る */}
      <path
        d={TREE_SPARKLE_PATH}
        transform={`translate(272,${(0.235 * SCENE[variant].h).toFixed(1)}) scale(0.85)`}
        fill="var(--tree-ink)"
        opacity={0.7}
      />
      <path
        d={TREE_SPARKLE_PATH}
        transform={`translate(62,${(0.32 * SCENE[variant].h).toFixed(1)}) scale(0.69)`}
        fill="var(--tree-ink)"
        opacity={0.5}
      />
      <path
        d={TREE_SPARKLE_PATH}
        transform={`translate(296,${(0.63 * SCENE[variant].h).toFixed(1)}) scale(0.58)`}
        fill="var(--tree-ink)"
        opacity={0.45}
      />
    </svg>
  );
}

export default function SyncTreeCard() {
  const progress = clampProgress(PLACEHOLDER_TREE.progress);
  const stage = treeStageIndex(progress);
  const stageName = treeStage(progress).name;

  return (
    <Link
      href="/tree"
      aria-label={`Sync Tree：いまは「${stageName}」${Math.round(progress)}%。16段階の成長と進捗を見る`}
      className="relative block rounded-3xl overflow-hidden border active:scale-[0.99] transition-transform"
      style={{
        background:
          "radial-gradient(130% 130% at 30% 15%, var(--tree-a) 0%, var(--tree-b) 45%, var(--tree-c) 100%)",
        borderColor: "var(--tree-border)",
        boxShadow: "0 10px 30px var(--tree-shadow)",
      }}
    >
      <TreeScene variant="mobile" stage={stage} className="block w-full md:hidden" />
      <TreeScene variant="desktop" stage={stage} className="hidden w-full md:block" />

      {/* 文字は空の上に重ねる（樹の位置とカード高さを動かさないため）。色は
          地面線・きらめきと同じ --tree-ink で、昼夜どちらの空でもコントラスト
          が確保される。段階名は出さない——それは遷移先の /tree の役割。 */}
      <span
        className="absolute top-0 left-0 right-0 p-5 flex items-baseline justify-between gap-2 text-sm font-medium"
        style={{ color: "var(--tree-ink)" }}
      >
        Sync Tree
        <span className="text-lg font-bold tabular-nums">{Math.round(progress)}%</span>
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
