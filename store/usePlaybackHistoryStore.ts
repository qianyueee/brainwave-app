import { useMemo } from "react";
import { useRecordView, useUserRecordsStore } from "@/store/useUserRecordsStore";
import { playbackKey, type RecordMap, type StoredRecord } from "@/lib/sync/record-merge";
import type { SessionLog } from "@/store/useAppStore";

/**
 * 再生の記録（ヒストリーのカレンダーと「セッション」「合計（分）」）。
 *
 * 置き場は store/useUserRecordsStore.ts（端末をまたいで同じにする記録、1回1件）。
 * 以前は useAppStore.sessionLogs（メモリだけ）で、再読み込みのたびに消えていた——
 * いまは端末に残り、ログイン中はアカウントにも載って、どの端末で聴いた分も同じ
 * ヒストリーに並ぶ。
 *
 * useAppStore.sessionLogs は**そのまま残す**：lib/sync/tree-runtime.ts が「いま届いた
 * 最後の1件」で Sync Tree のリスニングを締めるのに使う、この起動のあいだだけの流れ。
 * アカウントから読んだ過去の記録をそちらに混ぜると、聴いていない分まで数えてしまう。
 */

/** AudioProvider が1回の再生を記録する（useAppStore.addSessionLog と同じ1件）。 */
export function recordPlayback(log: SessionLog): void {
  useUserRecordsStore.getState().put(playbackKey(log.id), "playback", {
    programId: log.programId,
    programName: log.programName,
    date: log.date,
    duration: log.duration,
    mood: log.mood,
  });
}

const logCache = new WeakMap<StoredRecord, SessionLog | null>();

function logOf(key: string, r: StoredRecord): SessionLog | null {
  if (logCache.has(r)) return logCache.get(r)!;
  const { programId, programName, date, duration, mood } = r.data;
  const log =
    typeof programId === "string" &&
    typeof programName === "string" &&
    typeof date === "string" &&
    Number.isFinite(Date.parse(date)) &&
    typeof duration === "number" &&
    Number.isFinite(duration)
      ? {
          id: key.slice(key.indexOf(":") + 1),
          programId,
          programName,
          date,
          duration,
          mood: typeof mood === "string" ? mood : "",
        }
      : null;
  logCache.set(r, log);
  return log;
}

function logsOf(view: RecordMap): SessionLog[] {
  const out: SessionLog[] = [];
  for (const [key, r] of Object.entries(view)) {
    if (r.kind !== "playback") continue;
    const log = logOf(key, r);
    if (log) out.push(log);
  }
  return out.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

/** 再生の記録（古い→新しい）。persist 由来なので、描くのは mount 後に。 */
export function usePlaybackHistory(): SessionLog[] {
  const view = useRecordView();
  return useMemo(() => logsOf(view), [view]);
}
