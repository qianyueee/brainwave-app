import { create } from "zustand";

interface HistorySelectionState {
  /** 脳波の記録で選んだ測定者（subjectGroups のキー／ALL_SUBJECTS）。null＝既定。 */
  subjectKey: string | null;
  /** 選んだ測定（uploadedAt）。null＝その測定者の最新。 */
  recordId: string | null;
  setSubjectKey: (key: string | null) => void;
  setRecordId: (id: string | null) => void;
  /** 測定者と記録をまとめて決める（「レポートで見る」でいま見ている1件を固定する）。 */
  pin: (subjectKey: string | null, recordId: string | null) => void;
  /** カレンダーの表示中の月。0 = 今月、-1 = 先月。 */
  calendarMonthOffset: number;
  /** カレンダーで開いている日（dayKeyOf の形）。null＝閉じている。 */
  calendarDayKey: string | null;
  setCalendarMonthOffset: (offset: number) => void;
  setCalendarDayKey: (key: string | null) => void;
}

/**
 * Sync History で選んでいるもの——脳波の記録の「測定者 → 測定データ」と、
 * カレンダーの月・開いている日。ページの useState に置くと「レポートで見る」で
 * /report へ行って戻るたびに消え、見ていた記録から最新（カレンダーは今月・
 * 閉じた状態）へ飛ばされる——戻ってきたら同じ記録が開いたままであってほしい
 * ので、ページの外に持つ。
 *
 * **わざと persist していない**：残したいのはクライアント遷移の間だけで、
 * 読み込み直せば従来どおり最新から始まる。サーバー描画も初回描画も null で一致
 * するので hydration mismatch も起きない。消えた記録・別のアカウントの id が
 * 残っていても、ページ側が「見つからなければ最新」に落とすので害は無い。
 */
export const useHistorySelectionStore = create<HistorySelectionState>((set) => ({
  subjectKey: null,
  recordId: null,
  setSubjectKey: (key) => set({ subjectKey: key }),
  setRecordId: (id) => set({ recordId: id }),
  pin: (subjectKey, recordId) => set({ subjectKey, recordId }),
  calendarMonthOffset: 0,
  calendarDayKey: null,
  setCalendarMonthOffset: (offset) => set({ calendarMonthOffset: offset }),
  setCalendarDayKey: (key) => set({ calendarDayKey: key }),
}));
