"use client";

import { useEffect } from "react";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { useBaselineStore } from "@/store/useBaselineStore";
import { useSyncTreeStore } from "@/store/useSyncTreeStore";

/**
 * Web で表示しているアカウントの記録（脳波測定・10秒チェック・Sync Tree）を
 * 読み直す。デスクトップ測定アプリで測った記録や、別の端末でした水やりは
 * 別の端末からアカウントに入ってくるので、開いたままのタブはこれを呼ばないと
 * 気付けない。どのストアもログイン中だけ動き、短い間隔の連打は間引く
 * （`force` で間引かない）。
 */
export function refreshAccountViews(opts?: { force?: boolean }): void {
  void useBrainProfileStore.getState().refreshFromCloud(opts);
  void useBaselineStore.getState().refreshCloudChecks(opts);
  void useSyncTreeStore.getState().refresh(opts);
}

/**
 * 記録を読むページ（ホーム・レポート・ヒストリー）用：開いたときに読み直す。
 * タブに戻ったときの読み直しは AuthProvider が受け持つので、ここはアプリ内の
 * ページ移動のぶん。
 */
export function useRefreshAccountViewsOnMount(): void {
  useEffect(() => {
    refreshAccountViews();
  }, []);
}
