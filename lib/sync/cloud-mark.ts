import type { MindSessionSummary } from "@/store/useMindStore";
import type { BaselineCheck } from "@/store/useBaselineStore";

/**
 * 端末に残る記録（測定セッション・10秒チェック）が「どのアカウントに保存するか／
 * もう保存したか」の印。記録そのものに持たせる（別表にしない）——測定の直後に
 * アプリを閉じても、次に開いたとき何が未送信かを記録だけから判断できるように。
 *
 * - undefined … 宛先未定。未ログインで測った回・この機能より前の回・/brain の回。
 *   デスクトップ測定アプリはログイン後にまとめて「保存する／しない」を尋ねる。
 * - owner     … そのアカウントに保存する。`savedRev` が記録の版（rev）に追いつけば
 *   保存済み。測定後にメモを書くと版が進むので、もう一度送り直される。
 * - localOnly … 「保存しない」と答えた。以後は尋ねない。
 *
 * 宛先をログイン中のユーザーではなく記録の側に焼き込むのは、共用 PC で別の人が
 * ログインし直したときに、前の人の測定がその人のアカウントへ流れ込まないため。
 *
 * このファイルは型だけを import する（実行時の依存なし）——判定を UI や同期処理の
 * 外で単体に確かめられるように。
 */
export type CloudMark =
  | { owner: string; savedRev?: number; savedAt?: string }
  | { localOnly: true };

/** 宛先アカウントの id（未定・保存しない なら null）。 */
export function markOwner(mark: CloudMark | undefined): string | null {
  return mark && "owner" in mark ? mark.owner : null;
}

/** 宛先がまだ決まっていない。 */
export function isUnassigned(mark: CloudMark | undefined): boolean {
  return mark === undefined;
}

/** 版 `rev` の内容が、宛先アカウントに保存済みか。 */
export function isSaved(mark: CloudMark | undefined, rev: number): boolean {
  return !!mark && "owner" in mark && mark.savedRev === rev;
}

/** `uid` のアカウントへ送る必要がある（未送信、または送った後に内容が変わった）。 */
export function needsUpload(mark: CloudMark | undefined, rev: number, uid: string): boolean {
  return !!mark && "owner" in mark && mark.owner === uid && mark.savedRev !== rev;
}

/** 測定セッションの版（メモを書き換えるたびに進む）。 */
export const sessionRev = (s: Pick<MindSessionSummary, "rev">): number => s.rev ?? 0;

/**
 * アカウントに載せてよい測定か：実測（デモ・合成データでない）で、ヘッドセットが
 * 読めた秒があり、6指標が計算済み。デモを載せると脳特性の推移が作り物になる。
 */
export function isSessionUploadable(s: MindSessionSummary): boolean {
  const usable = s.usableSec ?? s.durationSec;
  return s.source === "realtime" && usable > 0 && !!s.indicators && !!s.bands;
}

/** アカウントに載せてよい10秒チェックか（実測で、使えた秒がある）。 */
export function isCheckUploadable(c: BaselineCheck): boolean {
  return c.source === "realtime" && c.usableSec > 0;
}

/** 送信待ち（`uid` 宛てで未保存）の件数。 */
export function pendingCount(
  sessions: readonly MindSessionSummary[],
  checks: readonly BaselineCheck[],
  uid: string
): number {
  let n = 0;
  for (const s of sessions) if (needsUpload(s.cloud, sessionRev(s), uid)) n += 1;
  for (const c of checks) if (needsUpload(c.cloud, 0, uid)) n += 1;
  return n;
}

/** 宛先未定で、載せてよい記録（ログイン後の「保存しますか？」の対象）。 */
export function unassignedRecords(
  sessions: readonly MindSessionSummary[],
  checks: readonly BaselineCheck[]
): { sessionIds: string[]; checkIds: string[] } {
  return {
    sessionIds: sessions
      .filter((s) => isUnassigned(s.cloud) && isSessionUploadable(s))
      .map((s) => s.id),
    checkIds: checks
      .filter((c) => isUnassigned(c.cloud) && isCheckUploadable(c))
      .map((c) => c.id),
  };
}
