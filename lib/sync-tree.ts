// Sync Tree — 育樹の成長モデル（16段階）。
//
// 企画: ログイン・脳波測定・セッション再生でそれぞれ成長度が加算され、100%
// で1本完成、完成した木は累計本数として積み上がる。1本＝100% を 6.25% 刻みの
// 16段階に分け、段階が上がるごとに「手描きの光の樹」（components/SyncTreeArt）
// の絵柄が育つ。段階名・しきい値はデザインハンドオフ（16 Growth Stages）準拠。
//
// 加算ルール（ログイン+2%/測定+3%/セッション+5% 案）はプロダクト側で未確定の
// ため、永続化・完成日の記録ともに未実装。値はここに置いた固定のプレース
// ホルダを読む。実装時は PLACEHOLDER_TREE を差し替えれば、表示側（ホームの
// シーンカード / /tree ギャラリー / Sync History）はそのまま使える。

/** 1本の木を構成する段階数。進捗はこの数で等分される（各6.25%）。 */
export const TREE_STAGE_COUNT = 16;

/** 1段階ぶんの進捗幅（%）。 */
export const TREE_STAGE_STEP = 100 / TREE_STAGE_COUNT;

export interface TreeStage {
  /** 段階番号（1始まり、01〜16） */
  num: number;
  /** 段階名（星の種 → 大樹） */
  name: string;
  /** 属する成長期（ギャラリーのチップ表示に使う） */
  phase: string;
}

/** 6つの成長期 × 16段階。並びはデザインハンドオフの表のまま。 */
export const TREE_STAGES: TreeStage[] = [
  { num: 1, name: "星の種", phase: "種期" },
  { num: 2, name: "発芽", phase: "種期" },
  { num: 3, name: "双葉", phase: "種期" },
  { num: 4, name: "本葉", phase: "苗期" },
  { num: 5, name: "苗立ち", phase: "苗期" },
  { num: 6, name: "若苗", phase: "苗期" },
  { num: 7, name: "幼木", phase: "幼木期" },
  { num: 8, name: "枝分かれ", phase: "幼木期" },
  { num: 9, name: "葉茂り", phase: "幼木期" },
  { num: 10, name: "若木", phase: "若木期" },
  { num: 11, name: "枝張り", phase: "若木期" },
  { num: 12, name: "樹冠形成", phase: "若木期" },
  { num: 13, name: "成木", phase: "成木期" },
  { num: 14, name: "開花", phase: "成木期" },
  { num: 15, name: "結実", phase: "成木期" },
  { num: 16, name: "大樹", phase: "大樹" },
];

/** ギャラリー見出しのチップ。最後の「大樹」だけアクセント色で描く。 */
export const TREE_PHASES: { name: string; stages: string }[] = [
  { name: "種期", stages: "1–3" },
  { name: "苗期", stages: "4–6" },
  { name: "幼木期", stages: "7–9" },
  { name: "若木期", stages: "10–12" },
  { name: "成木期", stages: "13–15" },
  { name: "大樹", stages: "16" },
];

export function clampProgress(progress: number): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.max(0, Math.min(100, progress));
}

/** 進捗（%）→ 0始まりの段階インデックス。100% は最終段階（15）に丸める。 */
export function treeStageIndex(progress: number): number {
  return Math.min(
    TREE_STAGE_COUNT - 1,
    Math.floor(clampProgress(progress) / TREE_STAGE_STEP)
  );
}

/** 進捗（%）から現在の成長段階を引く。 */
export function treeStage(progress: number): TreeStage {
  return TREE_STAGES[treeStageIndex(progress)];
}

/**
 * 段階の受け持ち範囲「56〜63%」表示。6.25 刻みの端数はハンドオフの表記に
 * 合わせて四捨五入する（0〜6 / 6〜13 / … / 94〜100）。
 */
export function treeStageRangeLabel(index: number): string {
  const from = Math.round(index * TREE_STAGE_STEP);
  const to = Math.round((index + 1) * TREE_STAGE_STEP);
  return `${from}〜${to}%`;
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
 * （ホームのシーンカード・/tree・Sync History で数字が一致する）。
 * 62% はハンドオフのホーム例と同じ「10 若木」。
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
