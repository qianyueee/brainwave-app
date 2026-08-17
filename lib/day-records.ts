import type { BrainProfile } from "./brain-profile";
import type { SessionLog } from "@/store/useAppStore";
import type { BaselineCheck } from "@/store/useBaselineStore";
import { compositeScore } from "./brain-measurements";
import { rateMethodLabel } from "./mind/baseline";
import { formatTime } from "./utils";

/**
 * カレンダーの「その日に何があったか」を組むところ。
 *
 * 3つの出どころ（再生ログ／取り込んだ脳波測定／10秒チェック）を1本の時系列に
 * 畳む。UI から切り出してあるのは、脳波測定がログイン必須のストアに載っていて
 * ブラウザ経由では仕込めないため——ここが純関数なら3種類すべてを実データの
 * コードで検証できる。表示（アイコン・色・遷移）は components/SimpleCalendar。
 */

export type DayRecordKind = "session" | "measurement" | "check";

export interface DayRecord {
  id: string;
  kind: DayRecordKind;
  /** 並べ替え用のエポックms。 */
  at: number;
  title: string;
  detail: string;
  /** 総合スコア（脳波測定のみ）。 */
  score?: number;
  /** レポートを開く鍵（脳波測定のみ）。 */
  uploadedAt?: string;
}

/** ローカル暦日のキー。同じ日付の判定はすべてこれを通す。 */
export function dayKeyOf(v: Date | string | number): string {
  const d = v instanceof Date ? v : new Date(v);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export interface DayRecordSources {
  sessionLogs: SessionLog[];
  measurements: BrainProfile[];
  checks: BaselineCheck[];
}

/**
 * 指定日の記録を時刻順（古い→新しい）で返す。空配列 = その日は何も無い。
 *
 * 脳波測定の見出しはメモ優先（一覧の扱いと揃える）。メモを見出しに使ったときは
 * sessionTag を detail から落とす——同じ文字列が2度出るのを避けるためで、
 * 日付はカレンダー側が見出しに持っているので失われない。
 */
export function buildDayRecords(
  { sessionLogs, measurements, checks }: DayRecordSources,
  key: string
): DayRecord[] {
  const out: DayRecord[] = [];

  for (const log of sessionLogs) {
    if (dayKeyOf(log.date) !== key) continue;
    out.push({
      id: `s-${log.id}`,
      kind: "session",
      at: new Date(log.date).getTime(),
      title: log.programName,
      detail: [formatTime(log.duration), log.mood].filter(Boolean).join("・"),
    });
  }

  for (const m of measurements) {
    if (dayKeyOf(m.uploadedAt) !== key) continue;
    const note = m.note?.trim();
    out.push({
      id: `m-${m.uploadedAt}`,
      kind: "measurement",
      at: new Date(m.uploadedAt).getTime(),
      title: note || "脳波測定",
      detail:
        [m.subject, note ? null : m.sessionTag].filter(Boolean).join("・") ||
        "脳特性チャート",
      score: compositeScore(m.indicators),
      uploadedAt: m.uploadedAt,
    });
  }

  for (const c of checks) {
    if (dayKeyOf(c.recordedAt) !== key) continue;
    const scores = [
      c.rate != null ? `Rate ${c.rate}` : null,
      c.clarity != null ? `Clarity ${c.clarity}` : null,
      c.reset != null ? `Reset ${c.reset}` : null,
    ].filter(Boolean);
    out.push({
      id: `c-${c.id}`,
      kind: "check",
      at: new Date(c.recordedAt).getTime(),
      // デモで取った回は必ずそう見せる（実測と並ぶ場所なので、区別が消えると
      // 「この日はこうだった」の読みが狂う）。
      title: `10秒チェック${c.source === "demo" ? "（デモ）" : ""}`,
      detail: [scores.join("・"), rateMethodLabel(c.method)]
        .filter(Boolean)
        .join(" / "),
    });
  }

  return out.sort((a, b) => a.at - b.at);
}

/** 記録がある日のキー集合。カレンダーのドット用。 */
export function recordedDayKeys(sources: DayRecordSources): {
  session: Set<string>;
  brain: Set<string>;
} {
  const session = new Set<string>();
  const brain = new Set<string>();
  for (const log of sources.sessionLogs) session.add(dayKeyOf(log.date));
  // 脳波の記録がある日 = 取り込んだ測定 or 保存した10秒チェック。
  for (const m of sources.measurements) brain.add(dayKeyOf(m.uploadedAt));
  for (const c of sources.checks) brain.add(dayKeyOf(c.recordedAt));
  return { session, brain };
}
