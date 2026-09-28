import { useMemo } from "react";
import type { Locale } from "@/lib/i18n";
import { useRecordView, useUserRecordsStore } from "@/store/useUserRecordsStore";
import { SELF_RATING_KEY, type StoredRecord } from "@/lib/sync/record-merge";

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

function record(values: { switching: number; clarity: number; rest: number }): void {
  const recordedAt = new Date().toISOString();
  useUserRecordsStore.getState().put(SELF_RATING_KEY, "self_rating", { ...values, recordedAt });
}

const isScore = (v: unknown): v is number => typeof v === "number" && v >= 0 && v <= 100;

function latestOf(rec: StoredRecord | undefined): SelfRating | null {
  if (!rec) return null;
  const { switching, clarity, rest, recordedAt } = rec.data;
  if (!isScore(switching) || !isScore(clarity) || !isScore(rest)) return null;
  if (typeof recordedAt !== "string" || !Number.isFinite(Date.parse(recordedAt))) return null;
  return { switching, clarity, rest, recordedAt };
}

/**
 * 置き場は store/useUserRecordsStore.ts（端末をまたいで同じにする記録。いちばん新しい
 * 1件だけ）。未ログインでも端末に残り——毎日の記録が続けられることがこの機能の
 * 前提——ログイン中はアカウントにも載る。以前は機能ごとの localStorage（`self-rating`、
 * v1＝いまの3軸）で、初回に移す（v0 のリラックス度／集中度／睡眠の質は**意味が違う**
 * 別の質問の答えなので移さない）。
 *
 * 形は以前の zustand ストアと同じ（`useSelfRatingStore((s) => s.latest)`）。
 */
export function useSelfRatingStore<T>(selector: (s: SelfRatingState) => T): T {
  // 記録のオブジェクトはほかの種類が変わっても同じ参照のまま（viewOf が拾い直すだけ）
  // なので、latest も内容が変わったときだけ作り直される。
  const rec = useRecordView()[SELF_RATING_KEY];
  const latest = useMemo(() => latestOf(rec), [rec]);
  return selector({ latest, record });
}

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
 *
 * 英語の画面は「9:43 PM」「Yesterday 9:40 PM」「8/9 9:40 PM」（月/日の順は同じ）。
 */
export function formatRecordedAt(iso: string, now: Date, locale: Locale = "ja"): string {
  const d = new Date(iso);
  const time =
    locale === "en"
      ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (isSameDay(iso, now)) return time;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(iso, yesterday)) return locale === "en" ? `Yesterday ${time}` : `昨日${time}`;

  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}
