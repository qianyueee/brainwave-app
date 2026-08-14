"use client";

import { useId } from "react";
import Link from "next/link";
import {
  PLACEHOLDER_TREE,
  clampProgress,
  treeStage,
  treeStageIndex,
} from "@/lib/sync-tree";
import { SyncTreeFigure, TREE_SPARKLE_PATH } from "@/components/SyncTreeArt";

/**
 * Sync Tree — ホームのシーンカード（ハンドオフ 9c「pure scene」確定版）。
 *
 * 文字・％・プログレスバーは置かない：昼夜の空に現在段階の樹が立つだけの
 * 静かな風景で、成長は絵柄が段階替わりすることでのみ伝える。カード全体が
 * タップ領域で、段階名・進捗・育てた木数は遷移先の /tree（16段階ギャラリー）
 * が受け持つ。
 *
 * 背景はアプリの4テーマを昼／夜の2状態に畳んだ --tree-* 変数（lib/theme.ts）：
 * day・afternoon は白日の空、midnight・evening は星空。樹のアート自体は
 * テーマで変わらない。
 *
 * シーンの構成要素（オーラ・地面の線・盛り土・きらめき3つ）は、ハンドオフの
 * モバイル値（340×170、樹 transform translate(85.5,-13.6) scale(1.42)）を
 * その transform の逆写像で樹空間（120×140）に戻した定数で持ち、全体を
 * ブレークポイントごとの transform で包む。カードの縦寸と樹スケールは
 * ハンドオフ原案（170/150・1.42/1.26）からフィードバックを受けて縦に
 * 伸ばした値——構図（接地位置・きらめき配置の相対関係）はそのまま。
 */

/** variant ごとのシーン寸法。transform は「幹の接地が高さの95%」から算出。 */
const SCENE = {
  mobile: { h: 204, scale: 1.68 },
  desktop: { h: 184, scale: 1.52 },
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
        {/* 手描きのきらめき3つ */}
        <path
          d={TREE_SPARKLE_PATH}
          transform="translate(131.3,37.7) scale(0.563)"
          fill="var(--tree-ink)"
          opacity={0.7}
        />
        <path
          d={TREE_SPARKLE_PATH}
          transform="translate(-16.5,32.1) scale(0.458)"
          fill="var(--tree-ink)"
          opacity={0.5}
        />
        <path
          d={TREE_SPARKLE_PATH}
          transform="translate(148.2,87) scale(0.387)"
          fill="var(--tree-ink)"
          opacity={0.45}
        />
      </g>
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
      aria-label={`Sync Tree：いまは「${stageName}」。16段階の成長と進捗を見る`}
      className="block rounded-3xl overflow-hidden border active:scale-[0.99] transition-transform"
      style={{
        background:
          "radial-gradient(130% 130% at 30% 15%, var(--tree-a) 0%, var(--tree-b) 45%, var(--tree-c) 100%)",
        borderColor: "var(--tree-border)",
        boxShadow: "0 10px 30px var(--tree-shadow)",
      }}
    >
      <TreeScene variant="mobile" stage={stage} className="block w-full md:hidden" />
      <TreeScene variant="desktop" stage={stage} className="hidden w-full md:block" />
    </Link>
  );
}
