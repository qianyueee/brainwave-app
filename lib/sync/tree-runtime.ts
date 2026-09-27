import { useAppStore } from "@/store/useAppStore";
import { useAuthStore } from "@/store/useAuthStore";
import { canCreditListen, flushTreeEvents, useSyncTreeStore } from "@/store/useSyncTreeStore";
import { LISTEN_TRACKER_START, trackListening, treeDayKey } from "@/lib/sync-tree";

/**
 * Sync Tree の常駐処理（AuthProvider が起動。/desktop では起動しない）。
 *
 * 1. リスニングの積算：再生中の経過秒（useAppStore の elapsed、AudioProvider が
 *    1秒ごとに書く）を lib/sync-tree.ts の trackListening に通し、5分たまるごとに
 *    木へ1回ぶん足す。AudioProvider には手を入れない——鳴っている番組と経過秒は
 *    ストアにすべて出ている。
 *    終わりのタイマーは最後の1秒ポーリングより先に鳴り、elapsed は満了の手前で
 *    0 に戻される。代わりに再生の記録（sessionLogs）が、停止より前・まだ
 *    playingProgramId がその番組のうちに届くので、その秒数で締める。
 * 2. 送信のやり直し：オンライン復帰・画面復帰・ログインで、送れていない出来事を
 *    すぐ送り直す（木だけの送信係。store/useSyncTreeStore.ts）。
 */
export function startSyncTreeRuntime(): () => void {
  let tracker = LISTEN_TRACKER_START;
  let seenLogs = useAppStore.getState().sessionLogs.length;

  const sample = () => {
    const app = useAppStore.getState();
    const logs = app.sessionLogs;
    let loggedSec: number | undefined;
    if (logs.length > seenLogs) {
      const last = logs[logs.length - 1];
      if (app.playingProgramId !== null && last.programId === app.playingProgramId) {
        loggedSec = last.duration;
      }
    }
    seenLogs = logs.length;

    const now = new Date();
    const r = trackListening(tracker, {
      programId: app.playingProgramId,
      elapsed: app.elapsed,
      loggedSec,
      day: treeDayKey(now),
      owner: useAuthStore.getState().user?.id ?? null,
      eligible: canCreditListen(now),
    });
    tracker = r.tracker;
    for (let i = 0; i < r.blocks; i++) {
      // 今日の枠が埋まった・完成した、ならそこで止まる（残りは捨てる）。
      if (!useSyncTreeStore.getState().creditListen()) break;
    }
  };

  const unsubApp = useAppStore.subscribe((s, prev) => {
    // set() は値が変わらなくても通知するので、見ている3つが動いたときだけ。
    if (
      s.playingProgramId === prev.playingProgramId &&
      s.elapsed === prev.elapsed &&
      s.sessionLogs === prev.sessionLogs
    ) {
      return;
    }
    sample();
  });

  const unsubAuth = useAuthStore.subscribe((s, prev) => {
    if ((s.user?.id ?? null) !== (prev.user?.id ?? null)) {
      void flushTreeEvents({ resetBackoff: true });
    }
  });

  const onOnline = () => void flushTreeEvents({ resetBackoff: true });
  const onVisible = () => {
    if (document.visibilityState === "visible") void flushTreeEvents();
  };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    unsubApp();
    unsubAuth();
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
