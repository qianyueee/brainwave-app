"use client";

import { useEffect } from "react";
import { useBrainProfileStore } from "@/store/useBrainProfileStore";
import { useBaselineStore } from "@/store/useBaselineStore";
import { useSyncTreeStore } from "@/store/useSyncTreeStore";
import { refreshUserRecords } from "./record-sender";

/**
 * 表示しているアカウントの記録（脳波測定・10秒チェック・Sync Tree・振り返りなどの
 * 小さな記録）を読み直す。別の端末（Web・Android・Windows）で書いた記録は別の端末から
 * アカウントに入ってくるので、開いたままの画面はこれを呼ばないと気付けない。どの
 * ストアもログイン中だけ動き、短い間隔の連打は間引く（`force` で間引かない）。
 */
export function refreshAccountViews(opts?: { force?: boolean }): void {
  void useBrainProfileStore.getState().refreshFromCloud(opts);
  void useBaselineStore.getState().refreshCloudChecks(opts);
  void useSyncTreeStore.getState().refresh(opts);
  void refreshUserRecords(opts);
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
