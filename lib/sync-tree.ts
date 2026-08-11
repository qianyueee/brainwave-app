// Sync Tree — 育樹プレースホルダ。
//
// 企画: ログイン・脳波測定・セッション再生でそれぞれ成長度が加算され、100%
// で1本完成、完成した木は累計本数として積み上がる。苗木から成木までの育ちが
// ひと目で分かること自体が目的の機能。
//
// 現段階では **見た目の置き場のみ**（インタラクションは後決め）。加算ルール・
// 永続化・完成日の記録はまだ実装していないので、値はここに置いた固定の
// プレースホルダを読む。実装時はこのファイルの PLACEHOLDER_TREE を差し替え、
// 表示側（SyncTreeCard / Sync History）はそのまま使えるようにしてある。

export type TreeStageKey = "sprout" | "sapling" | "young" | "mature";

export interface TreeStage {
  key: TreeStageKey;
  /** カード見出しに出る和名 */
  label: string;
  /** この段階に入る進捗の下限（%） */
  minProgress: number;
}

/** 苗木 → 中苗 → 若木 → 成木。しきい値は 25 / 50 / 75%。 */
export const TREE_STAGES: TreeStage[] = [
  { key: "sprout", label: "苗木", minProgress: 0 },
  { key: "sapling", label: "中苗", minProgress: 25 },
  { key: "young", label: "若木", minProgress: 50 },
  { key: "mature", label: "成木", minProgress: 75 },
];

export function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, progress));
}

/** 進捗（%）から現在の成長段階を引く。 */
export function treeStage(progress: number): TreeStage {
  const p = clampProgress(progress);
  // しきい値の降順に見て、最初に届いたものが現在の段階
  for (let i = TREE_STAGES.length - 1; i >= 0; i--) {
    if (p >= TREE_STAGES[i].minProgress) return TREE_STAGES[i];
  }
  return TREE_STAGES[0];
}

export interface TreeRecord {
  /** 何本目か（1 始まり） */
  index: number;
  /** 完成日 ISO (YYYY-MM-DD) */
  completedAt: string;
}

export interface SyncTreeState {
  /** 育成中の木の進捗（0-100） */
  progress: number;
  /** 完成して積み上がった木 */
  completed: TreeRecord[];
}

/**
 * 表示確認用の固定値。成長ロジックが入るまでは全画面がこれを読む
 * （ホームのバー・Sync History の統計タイルと記録カードで数字が一致する）。
 */
export const PLACEHOLDER_TREE: SyncTreeState = {
  progress: 62,
  completed: [
    { index: 1, completedAt: "2026-07-02" },
    { index: 2, completedAt: "2026-07-26" },
    { index: 3, completedAt: "2026-08-09" },
  ],
};

/** 「7/2」形式。記録カードの一覧用。 */
export function formatTreeDate(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}`;
}
