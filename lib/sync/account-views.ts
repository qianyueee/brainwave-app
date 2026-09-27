"use client";

import { useEffect } from "react";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { useBaselineStore } from "@/store/useBaselineStore";

/**
 * Web で表示しているアカウントの記録（脳波測定・10秒チェック）を読み直す。
 * デスクトップ測定アプリで測った記録は別の端末からアカウントに入ってくるので、
 * 開いたままのタブはこれを呼ばないと気付けない。どちらのストアもログイン中
 * だけ動き、短い間隔の連打は間引く（`force` で間引かない）。
 */
export function refreshAccountViews(opts?: { force?: boolean }): void {
  void useBrainProfileStore.getState().refreshFromCloud(opts);
  void useBaselineStore.getState().refreshCloudChecks(opts);
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
