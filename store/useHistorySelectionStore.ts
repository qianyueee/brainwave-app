import { create } from "zustand";

interface HistorySelectionState {
  /** カレンダーの表示中の月。0 = 今月、-1 = 先月。 */
  calendarMonthOffset: number;
  /** カレンダーで開いている日（dayKeyOf の形）。null＝閉じている。 */
  calendarDayKey: string | null;
  setCalendarMonthOffset: (offset: number) => void;
  setCalendarDayKey: (key: string | null) => void;
}

/**
 * Sync History で選んでいるもの——カレンダーの月・開いている日。ページの
 * useState に置くと、当日の明細の「レポートで見る」で /report へ行って戻るたびに
 * 消え、今月・閉じた状態へ飛ばされる——戻ってきたら同じ日が開いたままであって
 * ほしいので、ページの外に持つ。（測定者 → 測定データの選択は Sync Report の
 * 「測定の比較」へ移った＝useCompareSelectionStore。）
 *
 * **わざと persist していない**：残したいのはクライアント遷移の間だけで、
 * 読み込み直せば従来どおり今月から始まる。サーバー描画も初回描画も同じ値で一致
 * するので hydration mismatch も起きない。
 */
export const useHistorySelectionStore = create<HistorySelectionState>((set) => ({
  calendarMonthOffset: 0,
  calendarDayKey: null,
  setCalendarMonthOffset: (offset) => set({ calendarMonthOffset: offset }),
  setCalendarDayKey: (key) => set({ calendarDayKey: key }),
}));
