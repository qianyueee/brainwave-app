"use client";

import { Sprout } from "lucide-react";
import {
  PLACEHOLDER_TREE,
  clampProgress,
  treeStage,
} from "@/lib/sync-tree";

/**
 * Sync Tree — ホーム最下段の育樹バー（プレースホルダ）。
 *
 * 破線ボーダーは「まだ中身が決まっていない置き場」であることの合図で、
 * 実装が入ったら実線に変える。値は lib/sync-tree.ts の固定値。
 */
export default function SyncTreeCard() {
  const progress = clampProgress(PLACEHOLDER_TREE.progress);
  const stage = treeStage(progress);
  const grown = PLACEHOLDER_TREE.completed.length;

  return (
    <div className="bg-surface border-[1.5px] border-dashed border-surface-border rounded-3xl px-5 py-4 flex items-center gap-4 neu-raised">
      {/* 成長ビジュアルの枠 — 段階に応じた図はインタラクション確定後に差し替え */}
      <div className="w-14 h-14 shrink-0 rounded-full bg-navy neu-inset flex items-center justify-center">
        <Sprout size={28} strokeWidth={1.5} className="text-accent" />
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-bold text-text-primary">
            Sync Tree：{stage.label}
          </span>
          <span className="text-xs font-mono font-bold tabular-nums text-accent">
            {progress}%
          </span>
        </div>

        <div
          className="h-1.5 rounded-full bg-navy-lighter overflow-hidden"
          style={{
            boxShadow: "inset 2px 2px 4px var(--shadow-neu-dark)",
          }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Sync Tree の成長 ${stage.label}`}
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

        <span className="text-xs text-text-muted">
          ログイン・測定・セッションで育つ（準備中）
        </span>
      </div>

      <div className="shrink-0 text-center">
        <div className="text-xl font-mono font-bold tabular-nums text-text-primary leading-none">
          {grown}
        </div>
        <div className="text-xs text-text-muted mt-0.5">育てた木</div>
      </div>
    </div>
  );
}
