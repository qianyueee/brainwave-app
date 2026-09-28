import type { Locale } from "../i18n";

/**
 * Russell circumplex emotion anchors (ラッセル円環モデル).
 *
 * Coordinates are on the same 0-100 axes as the mind map:
 *   x = valence / relaxation axis  (= meditation: left ネガティブ, right ポジティブ)
 *   y = arousal / energy axis      (= attention:  bottom エネルギー低, top エネルギー高)
 *
 * The live status text shows the anchor nearest the current (boosted) position.
 */
export interface EmotionAnchor {
  name: string;
  /** English display name (the English UI); `name` stays the Japanese one. */
  nameEn: string;
  x: number; // meditation axis, 0-100
  y: number; // attention axis, 0-100
}

export const EMOTION_ANCHORS: EmotionAnchor[] = [
  // 【第1象限】ポジティブ × エネルギー高（右上）
  { name: "熱狂・エキサイト", nameEn: "Thrilled & excited", x: 85, y: 90 },
  { name: "喜び・ハッピー", nameEn: "Joyful & happy", x: 80, y: 65 },
  { name: "楽しい・ワクワク", nameEn: "Cheerful & eager", x: 70, y: 75 },
  { name: "気持ちが軽い", nameEn: "Feeling light", x: 65, y: 55 },
  // 【第4象限】ポジティブ × エネルギー低（右下）
  { name: "平穏・ピースフル", nameEn: "Serene & peaceful", x: 85, y: 30 },
  { name: "リラックス", nameEn: "Relaxed", x: 75, y: 40 },
  { name: "冷静・落ち着き", nameEn: "Calm & composed", x: 60, y: 45 },
  // 【第2象限】ネガティブ × エネルギー高（左上）
  { name: "パニック・恐怖", nameEn: "Panicked & afraid", x: 10, y: 90 },
  { name: "怒り・苦痛", nameEn: "Angry & distressed", x: 15, y: 80 },
  { name: "イライラ・焦り", nameEn: "Irritated & impatient", x: 30, y: 70 },
  { name: "警戒・不安", nameEn: "Wary & uneasy", x: 40, y: 60 },
  // 【第3象限】ネガティブ × エネルギー低（左下）
  { name: "絶望・不幸", nameEn: "Hopeless & unhappy", x: 10, y: 15 },
  { name: "悲しい", nameEn: "Sad", x: 25, y: 30 },
  { name: "気持ちが重い", nameEn: "Feeling heavy", x: 30, y: 40 },
  { name: "無気力・だるい", nameEn: "Listless & sluggish", x: 40, y: 20 },
];

/** The anchor's name in the display language. */
export function emotionName(e: EmotionAnchor, locale: Locale): string {
  return locale === "en" ? e.nameEn : e.name;
}

/**
 * Nearest emotion anchor to the current position (Euclidean distance).
 * meditation maps to the x axis, attention to the y axis.
 */
export function nearestEmotion(attention: number, meditation: number): EmotionAnchor {
  let best = EMOTION_ANCHORS[0];
  let bestDist = Infinity;
  for (const e of EMOTION_ANCHORS) {
    const dx = meditation - e.x;
    const dy = attention - e.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = e;
    }
  }
  return best;
}
