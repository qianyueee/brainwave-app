import type { ProgramCategory } from "../programs";
import type { Locale } from "../i18n";

export interface CategoryMeta {
  key: ProgramCategory;
  /** タブに出る名前。素材フォルダの呼び名をそのまま使う。 */
  label: string;
  /** タブの下に1行で出る説明。何が並ぶタブなのかを日本語で言う。 */
  description: string;
  /** 英語の画面のタブ名・説明。 */
  labelEn: string;
  descriptionEn: string;
}

/** Sync Session のタブ順。デフォルトを先頭に、あとは素材の量が少ない順。 */
export const CATEGORIES: readonly CategoryMeta[] = [
  {
    key: "default",
    label: "デフォルト",
    description: "まずはここから。基本の4節目",
    labelEn: "Default",
    descriptionEn: "Start here: the 4 core programs",
  },
  {
    key: "target",
    label: "Target",
    description: "悩み・目的から選ぶ（仕事、睡眠、緊張、からだ、くらし）",
    labelEn: "Target",
    descriptionEn: "Choose by need or goal (work, sleep, stress, body, daily life)",
  },
  {
    key: "energy",
    label: "Energy",
    description: "第0〜第12チャクラに対応した13節目",
    labelEn: "Energy",
    descriptionEn: "13 programs for chakras 0 to 12",
  },
  {
    key: "astro",
    label: "Astro",
    description: "12星座の載波 × 誘導ビート",
    labelEn: "Astro",
    descriptionEn: "Carrier tones of the 12 zodiac signs × guiding beats",
  },
] as const;

export const CATEGORY_LABEL: Record<ProgramCategory, string> = {
  default: "デフォルト",
  target: "Target",
  energy: "Energy",
  astro: "Astro",
};

export const CATEGORY_LABEL_EN: Record<ProgramCategory, string> = {
  default: "Default",
  target: "Target",
  energy: "Energy",
  astro: "Astro",
};

export function categoryLabel(meta: CategoryMeta, locale: Locale): string {
  return locale === "en" ? meta.labelEn : meta.label;
}

export function categoryDescription(meta: CategoryMeta, locale: Locale): string {
  return locale === "en" ? meta.descriptionEn : meta.description;
}
