import type { LocalizedText } from "@/lib/i18n";
import type { TreeDayStatus } from "@/lib/sync-tree";

/**
 * 今日のおせわ（水やり・リスニング）の具合と、画面に出す言葉。/tree の
 * 「今日のおせわ」とホームの状態バーが同じものを読む——片方だけ言い回しが
 * 変わると、同じ日の同じ状態が2つの画面で違って見える。
 *
 * 加算量やポイントは出さない（lib/sync-tree.ts）。具合だけを言葉にする。
 * 言葉は両方の言語で持ち、描画するときに useT() で選ぶ。
 */

/** done＝今日のぶんは済んだ / partial＝少し進んだ / todo＝まだ */
export type CareTone = "done" | "partial" | "todo";

export interface CareStatus {
  tone: CareTone;
  /** 「済み」「まだ」など、状態のひと言 */
  label: LocalizedText;
}

/** 具合の色。token だけを使う（生の色名はテーマ4種のどれかで必ず浮く）。 */
export const CARE_TONE_CLASS: Record<CareTone, string> = {
  done: "text-success",
  partial: "text-accent",
  todo: "text-text-muted",
};

export function waterCare(day: TreeDayStatus): CareStatus {
  return day.watered
    ? { tone: "done", label: { ja: "済み", en: "Done" } }
    : { tone: "todo", label: { ja: "まだ", en: "Not yet" } };
}

export function listenCare(day: TreeDayStatus): CareStatus {
  if (day.listenCapped) return { tone: "done", label: { ja: "今日はたっぷり", en: "Plenty today" } };
  if (day.listenCount > 0) return { tone: "partial", label: { ja: "育っています", en: "Growing" } };
  return { tone: "todo", label: { ja: "まだ", en: "Not yet" } };
}
