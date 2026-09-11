import type { ProgramCategory } from "../programs";

export interface CategoryMeta {
  key: ProgramCategory;
  /** タブに出る名前。素材フォルダの呼び名をそのまま使う。 */
  label: string;
  /** タブの下に1行で出る説明。何が並ぶタブなのかを日本語で言う。 */
  description: string;
}

/** Sync Session のタブ順。デフォルトを先頭に、あとは素材の量が少ない順。 */
export const CATEGORIES: readonly CategoryMeta[] = [
  {
    key: "default",
    label: "デフォルト",
    description: "まずはここから。基本の4節目",
  },
  {
    key: "target",
    label: "Target",
    description: "悩み・目的から選ぶ（仕事、睡眠、緊張、からだ、くらし）",
  },
  {
    key: "energy",
    label: "Energy",
    description: "第0〜第12チャクラに対応した13節目",
  },
  {
    key: "astro",
    label: "Astro",
    description: "12星座の載波 × 誘導ビート",
  },
] as const;

export const CATEGORY_LABEL: Record<ProgramCategory, string> = {
  default: "デフォルト",
  target: "Target",
  energy: "Energy",
  astro: "Astro",
};
