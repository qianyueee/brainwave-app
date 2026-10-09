import { create } from "zustand";

interface HistorySelectionState {
  /**
   * 脳波の記録に表示している測定（uploadedAt）。カレンダーで選ぶ——日付をタップ
   * すればその日の最新、当日の明細の測定をタップすればその1件。null＝最新。
   */
  recordId: string | null;
  setRecordId: (id: string | null) => void;
  /** カレンダーの表示中の月。0 = 今月、-1 = 先月。 */
  calendarMonthOffset: number;
  /** カレンダーで開いている日（dayKeyOf の形）。null＝閉じている。 */
  calendarDayKey: string | null;
  setCalendarMonthOffset: (offset: number) => void;
  setCalendarDayKey: (key: string | null) => void;
}

/**
 * Sync History で選んでいるもの——脳波の記録に表示している測定と、カレンダーの
 * 月・開いている日。ページの useState に置くと「レポートで見る」で /report へ
 * 行って戻るたびに消え、見ていた記録から最新（カレンダーは今月・閉じた状態）へ
 * 飛ばされる——戻ってきたら同じ記録・同じ日が開いたままであってほしいので、
 * ページの外に持つ。（測定者 → 測定データの下拉は Sync Report の「測定の比較」へ
 * 移した＝useCompareSelectionStore。ヒストリーではカレンダーが選ぶ。）
 *
 * **わざと persist していない**：残したいのはクライアント遷移の間だけで、
 * 読み込み直せば従来どおり最新から始まる。サーバー描画も初回描画も null で一致
 * するので hydration mismatch も起きない。消えた記録・別のアカウントの id が
 * 残っていても、ページ側が「見つからなければ最新」に落とすので害は無い。
 */
export const useHistorySelectionStore = create<HistorySelectionState>((set) => ({
  recordId: null,
  setRecordId: (id) => set({ recordId: id }),
  calendarMonthOffset: 0,
  calendarDayKey: null,
  setCalendarMonthOffset: (offset) => set({ calendarMonthOffset: offset }),
  setCalendarDayKey: (key) => set({ calendarDayKey: key }),
}));
