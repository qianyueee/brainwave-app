import { useMemo } from "react";
import { useRecordView, useUserRecordsStore } from "@/store/useUserRecordsStore";
import { dayKeyOfJournalKey, journalKey, type RecordMap } from "@/lib/sync/record-merge";

/**
 * その日の振り返り（日誌）。1日につき1件で、書き直すと上書きされる。
 *
 * 置き場は store/useUserRecordsStore.ts（端末をまたいで同じにする記録）。ログイン
 * していなくても端末に残り（振り返りは毎日の**習慣**として続いてこそ意味がある）、
 * ログイン中はアカウントにも載って、Web・Android・Windows のどれで開いても同じ
 * 振り返りが見える。以前は機能ごとの localStorage（`sync-journal`）で、初回に移す。
 *
 * 日付ごとに1件なのは、これが「その日どうだったか」の評価だから。時刻を持つ
 * 出来事の記録（再生ログ・測定）は lib/day-records.ts 側の担当で、そちらは
 * 1日に何件でも並ぶ。
 *
 * 形は以前の zustand ストアと同じ（`useJournalStore((s) => s.entries)`）。
 */
export interface JournalEntry {
  /** lib/day-records.ts の dayKeyOf() が返すローカル暦日のキー。 */
  dayKey: string;
  /** 自由記述。空文字は「文章なし」（調子だけ残すこともできる）。 */
  text: string;
  /** その日の調子 1〜5。未選択は null。 */
  mood: number | null;
  /** 最終更新 (ISO)。 */
  updatedAt: string;
}

interface JournalState {
  /** dayKey → その日の1件。 */
  entries: Record<string, JournalEntry>;
  saveEntry: (dayKey: string, input: { text: string; mood: number | null }) => void;
  removeEntry: (dayKey: string) => void;
}

function saveEntry(dayKey: string, { text, mood }: { text: string; mood: number | null }): void {
  const key = journalKey(dayKey);
  if (!key) return;
  const trimmed = text.trim();
  // 文章も調子も無いものは「書いていない」と同じ。残すとカレンダーに中身の無い
  // 印だけが付いて、押しても何も出てこない日ができる。
  if (trimmed === "" && mood == null) {
    useUserRecordsStore.getState().remove(key);
    return;
  }
  useUserRecordsStore.getState().put(key, "journal", { text: trimmed, mood });
}

function removeEntry(dayKey: string): void {
  const key = journalKey(dayKey);
  if (key) useUserRecordsStore.getState().remove(key);
}

function entriesOf(view: RecordMap): Record<string, JournalEntry> {
  const out: Record<string, JournalEntry> = {};
  for (const [key, r] of Object.entries(view)) {
    if (r.kind !== "journal") continue;
    const dayKey = dayKeyOfJournalKey(key);
    if (!dayKey) continue;
    const text = typeof r.data.text === "string" ? r.data.text : "";
    const mood = typeof r.data.mood === "number" ? r.data.mood : null;
    if (text === "" && mood == null) continue;
    out[dayKey] = { dayKey, text, mood, updatedAt: r.updatedAt };
  }
  return out;
}

export function useJournalStore<T>(selector: (s: JournalState) => T): T {
  const view = useRecordView();
  const entries = useMemo(() => entriesOf(view), [view]);
  return selector({ entries, saveEntry, removeEntry });
}
