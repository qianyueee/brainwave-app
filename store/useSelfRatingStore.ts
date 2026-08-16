import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * 「感コンディション」＝ユーザーが自分で入れる主観の3指標。
 *
 * 軸は脳波測定の Rate / Clarity / Reset と**同じ3つ**を、日常語に言い換えた
 * もの（⚡切り替え・💡明晰さ・🌙休息）。以前の リラックス度／集中度／睡眠の質
 * は測定側と軸がずれていて、主観と客観を並べても何と何を比べているのか
 * 分からなかった。同じ軸に揃えたことで「自分ではスムーズなつもりだったが
 * Rate は低い」といった読み方ができるようになる。
 *
 * 算出経路は交わらない（あちらは脳波から自動算出、こちらは手入力）。同じ
 * 0-100 スケールに揃えてあるのは、突き合わせて比べるため。
 */
export interface SelfRating {
  /** ⚡ スイッチ力（脳のメリハリ感）: 0 ガチガチ ⇄ 100 スムーズ */
  switching: number;
  /** 💡 ひらめき度（頭の透明感）: 0 モヤモヤ ⇄ 100 クリア */
  clarity: number;
  /** 🌙 休息度（脳のゆとり感）: 0 疲れ ⇄ 100 リフレッシュ */
  rest: number;
  /** 記録した時刻 (ISO) */
  recordedAt: string;
}

interface SelfRatingState {
  /** 直近に記録した自己評価。null = まだ一度も記録していない。 */
  latest: SelfRating | null;
  record: (values: { switching: number; clarity: number; rest: number }) => void;
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
      /**
       * v0 は リラックス度／集中度／睡眠の質 の3軸だった。新しい3軸とは
       * **意味が違う**（リラックス度は「スイッチ力」ではない）ので、値を
       * 引き継ぐと古い回答を別の質問の答えとして表示することになる。
       * 移行せず捨てる——手入力1件ぶんなので、入れ直してもらう方が正しい。
       */
      version: 1,
      migrate: () => ({ latest: null }),
    }
  )
);

/** 同じ暦日か（formatRecordedAt が「今日／昨日」を出し分けるのに使う）。 */
function isSameDay(iso: string, now: Date): boolean {
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
