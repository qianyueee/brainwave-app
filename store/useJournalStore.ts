import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * その日の振り返り（日誌）。1日につき1件で、書き直すと上書きされる。
 *
 * 素の localStorage に持たせる（useBaselineStore / useZodiacStore と同じ方針）
 * ——振り返りは毎日の**習慣**として続いてこそ意味があるので、ログインを前提に
 * したら続かない。クラウド同期はセッション由来の脳特性
 * （useBrainProfileStore）が受け持つ。
 *
 * 日付ごとに1件なのは、これが「その日どうだったか」の評価だから。時刻を持つ
 * 出来事の記録（再生ログ・測定）は lib/day-records.ts 側の担当で、そちらは
 * 1日に何件でも並ぶ。
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

export const useJournalStore = create<JournalState>()(
  persist(
    (set) => ({
      entries: {},

      saveEntry: (dayKey, { text, mood }) =>
        set((s) => {
          const trimmed = text.trim();
          // 文章も調子も無いものは「書いていない」と同じ。残すとカレンダーに
          // 中身の無い印だけが付いて、押しても何も出てこない日ができる。
          if (trimmed === "" && mood == null) {
            const next = { ...s.entries };
            delete next[dayKey];
            return { entries: next };
          }
          return {
            entries: {
              ...s.entries,
              [dayKey]: { dayKey, text: trimmed, mood, updatedAt: new Date().toISOString() },
            },
          };
        }),

      removeEntry: (dayKey) =>
        set((s) => {
          const next = { ...s.entries };
          delete next[dayKey];
          return { entries: next };
        }),
    }),
    {
      name: "sync-journal",
      partialize: (s) => ({ entries: s.entries }),
    }
  )
);
