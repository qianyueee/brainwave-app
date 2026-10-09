import { create } from "zustand";

interface CompareSelectionState {
  /** 選んだ測定者（subjectGroups のキー／ALL_SUBJECTS）。null＝既定。 */
  subjectKey: string | null;
  /**
   * 選んだ測定（uploadedAt、最大3件）。[0]＝「測定データを選択」の1件、[1]・[2]＝
   * 並べて比べる測定。空＝その測定者の最新1件。
   */
  ids: string[];
  /** 測定者を替えると、選んでいた測定は外す（別の人の記録なので）。 */
  setSubjectKey: (key: string | null) => void;
  setIds: (ids: string[]) => void;
}

/**
 * Sync Report「測定の比較」で選んでいるもの——測定者 → 測定データ（＋比べる測定）。
 * ページの useState に置くと、ホームや Sync Brain へ行って戻るたびに最新へ
 * 飛ばされる——戻ってきたら同じ比較が開いたままであってほしいので、ページの外に
 * 持つ（以前 Sync History の脳波の記録が同じことをしていた）。
 *
 * **わざと persist していない**：残したいのはクライアント遷移の間だけで、
 * 読み込み直せば最新から始まる。サーバー描画も初回描画も空で一致するので
 * hydration mismatch も起きない。消えた記録・別のアカウントの id が残っていても、
 * 画面側が「見つからなければ外す／最新」に落とすので害は無い。
 */
export const useCompareSelectionStore = create<CompareSelectionState>((set) => ({
  subjectKey: null,
  ids: [],
  setSubjectKey: (key) => set({ subjectKey: key, ids: [] }),
  setIds: (ids) => set({ ids: ids.slice(0, 3) }),
}));
