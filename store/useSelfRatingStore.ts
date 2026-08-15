import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * 毎日の自己評価（リラックス度／集中度／睡眠の質）。
 *
 * 脳コンディションの Rate/Clarity/Reset とは**別物**：あちらは脳波測定から
 * 自動算出、こちらはユーザーが毎日スライダーで入力する主観値。数値を突き合わ
 * せて比べられるよう同じ 0-100 スケールに揃えてあるが、算出経路は交わらない。
 */
export interface SelfRating {
  relax: number;
  focus: number;
  sleep: number;
  /** 記録した時刻 (ISO) */
  recordedAt: string;
}

interface SelfRatingState {
  /** 直近に記録した自己評価。null = まだ一度も記録していない。 */
  latest: SelfRating | null;
  record: (values: { relax: number; focus: number; sleep: number }) => void;
}

/**
 * 素の localStorage に持たせる（useZodiacStore と同じ方針）— 未ログインでも
 * 毎日の記録が続けられることが、この機能の前提なので。
 */
export const useSelfRatingStore = create<SelfRatingState>()(
  persist(
    (set) => ({
      latest: null,
      record: (values) =>
        set({ latest: { ...values, recordedAt: new Date().toISOString() } }),
    }),
    {
      name: "self-rating",
      partialize: (s) => ({ latest: s.latest }),
    }
  )
);

/** 同じ暦日か（「今日はもう記録済み」の判定用）。 */
export function isSameDay(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

/**
 * 「21:43」「昨日21:40」「8/9 21:40」。
 *
 * 同じ日なら時刻だけ返す——呼び出し側（ホームの「前回：」）は「今日のコンディ
 * ションを更新する」ボタンの真下にあり、日付は文脈で決まっているので、そこに
 * 「今日」と書くと同じことを二度言うことになる。
 */
export function formatRecordedAt(iso: string, now: Date): string {
  const d = new Date(iso);
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (isSameDay(iso, now)) return time;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(iso, yesterday)) return `昨日${time}`;

  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}
