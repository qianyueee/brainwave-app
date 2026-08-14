"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, TreeDeciduous } from "lucide-react";
import {
  PLACEHOLDER_TREE,
  TREE_PHASES,
  TREE_STAGES,
  clampProgress,
  treeStageIndex,
  treeStageRangeLabel,
} from "@/lib/sync-tree";
import { SyncTreeStageTile } from "@/components/SyncTreeArt";

/**
 * Sync Tree の16段階ギャラリー／詳細。ホームのシーンカード（文字なし）から
 * タップで入る先で、段階名・進捗％・育てた木数はこの画面が受け持つ。
 *
 * タイルはハンドオフどおり固定の深宇宙背景（テーマで変わらないアート面——
 * 星空カードと同じ扱い）。現在段階だけミント（#7ff0d8）の枠で光らせる。
 * メニュー外ページ（/settings・/player と同じ立て付け）で、戻るはホームへ。
 */

/** ハンドオフのタイル仕様（深い星空タイル）そのままの固定色。 */
const TILE_BG = "radial-gradient(circle at 50% 28%, #16294f 0%, #0a1428 72%)";
const TILE_BORDER = "rgba(140,160,255,0.18)";
const TILE_LABEL = "#e8ecff";
const TILE_RANGE = "#8fa0c8";
const TILE_GOLD = "#ffe9a8";
const TILE_CURRENT = "#7ff0d8";

export default function TreePage() {
  const router = useRouter();
  const progress = clampProgress(PLACEHOLDER_TREE.progress);
  const current = treeStageIndex(progress);
  const stage = TREE_STAGES[current];
  const grown = PLACEHOLDER_TREE.completed.length;

  return (
    <div
      className="flex flex-col gap-6 pt-6 md:max-w-2xl"
      style={{ animation: "fade-in 0.3s ease-out" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/")}
          aria-label="ホームへ戻る"
          className="w-12 h-12 rounded-xl bg-navy neu-raised-sm flex items-center justify-center text-text-secondary active:scale-95 shrink-0"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Sync Tree</h1>
          <p className="text-sm text-text-secondary mt-1">
            育てる木｜16段階の成長ギャラリー
          </p>
        </div>
      </div>

      {/* いまの木 — 段階名・進捗・育てた木数はこの画面だけが出す */}
      <div className="bg-surface border border-surface-border rounded-3xl p-5 flex items-center gap-4 neu-raised">
        <div
          className="w-20 shrink-0 rounded-2xl overflow-hidden"
          style={{ background: TILE_BG, border: `1px solid ${TILE_BORDER}` }}
        >
          <SyncTreeStageTile stage={current} className="block w-full" />
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">
          <p className="text-sm text-text-secondary">いまの木</p>
          <p className="text-lg font-bold text-text-primary">
            {String(stage.num).padStart(2, "0")} {stage.name}
            <span className="ml-2 text-base font-mono font-bold tabular-nums text-accent">
              {progress}%
            </span>
          </p>
          <div
            className="h-1.5 rounded-full bg-navy-lighter overflow-hidden"
            style={{ boxShadow: "inset 2px 2px 4px var(--shadow-neu-dark)" }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`いまの木の成長 ${stage.name} ${progress}%`}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${progress}%`,
                background:
                  "linear-gradient(to right, var(--dyn-accent-dark), var(--dyn-accent))",
              }}
            />
          </div>
          <p className="flex items-center gap-1.5 text-xs text-text-muted">
            <TreeDeciduous size={16} strokeWidth={1.5} className="text-accent" />
            育てた木 {grown}本 — 100%で完成、翌日から次の1本
          </p>
        </div>
      </div>

      {/* 成長期チップ（種期 1–3 〜 大樹 16。最後だけアクセント） */}
      <div className="flex flex-wrap gap-2">
        {TREE_PHASES.map((phase, i) => {
          const last = i === TREE_PHASES.length - 1;
          return (
            <span
              key={phase.name}
              className={`text-xs rounded-full border px-3 py-1 ${
                last
                  ? "text-accent border-accent"
                  : "text-text-secondary border-surface-border bg-surface"
              }`}
            >
              {phase.name} {phase.stages}
            </span>
          );
        })}
      </div>

      {/* 16段階ギャラリー */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
        {TREE_STAGES.map((s, i) => {
          const isCurrent = i === current;
          const grand = i === TREE_STAGES.length - 1;
          return (
            <div
              key={s.num}
              className="rounded-2xl px-1.5 pt-2 pb-2.5 flex flex-col items-center gap-1"
              style={{
                background: TILE_BG,
                border: isCurrent
                  ? `1.5px solid ${TILE_CURRENT}`
                  : `1px solid ${TILE_BORDER}`,
              }}
              aria-current={isCurrent ? "true" : undefined}
            >
              <SyncTreeStageTile stage={i} className="block w-full" />
              <span
                className="text-sm font-bold"
                style={{ color: grand ? TILE_GOLD : TILE_LABEL }}
              >
                {String(s.num).padStart(2, "0")} {s.name}
              </span>
              <span className="text-xs" style={{ color: TILE_RANGE }}>
                {treeStageRangeLabel(i)}
                {grand ? " 完成" : ""}
              </span>
              {isCurrent && (
                <span
                  className="text-xs rounded-full border px-2"
                  style={{ color: TILE_CURRENT, borderColor: TILE_CURRENT }}
                >
                  いまここ {progress}%
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* 成長ルールはプロダクト側で調整中（lib/sync-tree.ts 参照） */}
      <p className="text-xs text-text-muted">
        毎日のログイン・脳波測定・セッション再生で少しずつ育ちます（加算ルールは
        調整中）。完成した木の記録は Sync History にも並びます。
      </p>
    </div>
  );
}
