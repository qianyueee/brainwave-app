/**
 * その日の振り返り（日誌）。カレンダーで日付を選んで、一言の評価と気づきを
 * 残す——アプリが自動で残す記録（再生ログ・脳波測定・10秒チェック）とは別の、
 * **本人が書く**ぶんの記録。
 *
 * 数字だけ並んでも「なぜその日そうだったか」は思い出せない。逆に文章だけでも
 * 後から見返すときに手掛かりが無い。だから5段階の調子と自由記述の両方を持つ
 * ——調子はカレンダー上で一目で追える印になり、文章がその理由を持つ。
 */

/** 自由記述の上限。カレンダーの明細に収まる長さ。 */
export const JOURNAL_TEXT_MAX = 500;

export interface MoodStep {
  /** 1（わるい）〜5（よい）。 */
  value: number;
  emoji: string;
  label: string;
}

/**
 * 5段階の調子。両端の言葉が「どちら寄りか」を担う（ホームの自己評価スライダーと
 * 同じ考え方）。絵文字だけに意味を持たせない——50〜60代の利用者には表情の
 * 描き分けが読み取りにくいことがあるので、必ず言葉を添える。
 */
export const MOOD_SCALE: readonly MoodStep[] = [
  { value: 1, emoji: "😞", label: "つらい" },
  { value: 2, emoji: "😐", label: "いまひとつ" },
  { value: 3, emoji: "🙂", label: "ふつう" },
  { value: 4, emoji: "😊", label: "よい" },
  { value: 5, emoji: "🤩", label: "とても良い" },
] as const;

export function moodStep(value: number | null | undefined): MoodStep | null {
  if (value == null) return null;
  return MOOD_SCALE.find((m) => m.value === value) ?? null;
}

/**
 * 調子に対応する色。カレンダーの印と見出しで使う。token を返す——
 * 直接の色名はテーマ4種のどれかで必ず浮く。
 */
export function moodColor(value: number | null | undefined): string {
  if (value == null) return "var(--dyn-text-secondary)";
  if (value >= 4) return "var(--dyn-success)";
  if (value === 3) return "var(--dyn-text-secondary)";
  return "var(--dyn-warning)";
}
