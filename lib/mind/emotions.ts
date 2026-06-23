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
  x: number; // meditation axis, 0-100
  y: number; // attention axis, 0-100
}

export const EMOTION_ANCHORS: EmotionAnchor[] = [
  // 【第1象限】ポジティブ × エネルギー高（右上）
  { name: "熱狂・エキサイト", x: 85, y: 90 },
  { name: "喜び・ハッピー", x: 80, y: 65 },
  { name: "楽しい・ワクワク", x: 70, y: 75 },
  { name: "気持ちが軽い", x: 65, y: 55 },
  // 【第4象限】ポジティブ × エネルギー低（右下）
  { name: "平穏・ピースフル", x: 85, y: 30 },
  { name: "リラックス", x: 75, y: 40 },
  { name: "冷静・落ち着き", x: 60, y: 45 },
  // 【第2象限】ネガティブ × エネルギー高（左上）
  { name: "パニック・恐怖", x: 10, y: 90 },
  { name: "怒り・苦痛", x: 15, y: 80 },
  { name: "イライラ・焦り", x: 30, y: 70 },
  { name: "警戒・不安", x: 40, y: 60 },
  // 【第3象限】ネガティブ × エネルギー低（左下）
  { name: "絶望・不幸", x: 10, y: 15 },
  { name: "悲しい", x: 25, y: 30 },
  { name: "気持ちが重い", x: 30, y: 40 },
  { name: "無気力・だるい", x: 40, y: 20 },
];

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
