import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import { useUserRecordsStore } from "@/store/useUserRecordsStore";
import { dirtyRecords, type RemoteRecord } from "./record-merge";
import { listUserRecords, upsertUserRecords } from "./records";

/**
 * 端末をまたぐ小さな記録（store/useUserRecordsStore.ts）の送信係と読み直し。
 *
 * 共通の送信箱（lib/sync/outbox.ts）に乗せないのは Sync Tree と同じ理由——あちらは
 * 1件失敗するとそこで止まり、状態表示（phase）も10秒チェックと共用。005 を流す前に
 * Web が出ても、ここの失敗で測定の保存を巻き込まない。
 *
 * - 送る：ログインしている人のスコープの送信待ちを、まとめて upsert（新しい方が勝つのは
 *   アカウント側のトリガ）。失敗は 5秒→15秒→30秒→1分→以後5分おきに再試行。書き換え・
 *   オンライン復帰・画面復帰・ログインですぐやり直す
 * - 読む：ログイン時（AuthProvider）と、画面に戻ったとき（refreshAccountViews）。
 *   auth-js はタブに戻るたびに SIGNED_IN を出し直すので、同じ人の読み込みは 15 秒に
 *   1回に間引く
 */

const REFRESH_MIN_INTERVAL_MS = 15_000;
const BACKOFF_MS = [5_000, 15_000, 30_000, 60_000, 300_000];
/** 送り直しても通らない失敗（CHECK・NOT NULL 違反、型）。その1件は諦める（端末には残る）。 */
const PERMANENT_CODES = new Set(["23514", "23502", "22P02"]);

let inflight: { userId: string; promise: Promise<void> } | null = null;
let lastLoad: { userId: string; at: number } | null = null;
/** 送れるたびに進める。読んでいる間に送ったら、その読み込みは古いかもしれない。 */
let pushEpoch = 0;

/** アカウントの記録を読んで手元（その人のスコープ）に重ね、送れていない分を送る。 */
export function loadUserRecords(userId: string, opts?: { force?: boolean }): Promise<void> {
  if (!supabase) return Promise.resolve();
  if (inflight?.userId === userId) return inflight.promise;
  if (
    !opts?.force &&
    lastLoad?.userId === userId &&
    Date.now() - lastLoad.at < REFRESH_MIN_INTERVAL_MS
  ) {
    return Promise.resolve();
  }
  lastLoad = { userId, at: Date.now() };
  const run = async () => {
    try {
      // 読んでいる間に送れた記録があれば、読んだ一覧はその前の版かもしれない——
      // 重ねると一瞬古い内容に戻るので、1回だけ読み直す。
      for (let tries = 0; tries < 2; tries++) {
        const epoch = pushEpoch;
        const remote = await listUserRecords(userId);
        if (epoch !== pushEpoch && tries === 0) continue;
        useUserRecordsStore.getState().applyPull(userId, remote);
        break;
      }
      void flushUserRecords();
    } catch (err) {
      console.error("[user-records] load failed:", err);
    }
  };
  const promise = run().finally(() => {
    if (inflight?.promise === promise) inflight = null;
  });
  inflight = { userId, promise };
  return promise;
}

/** いまログインしている人の分を読み直す（refreshAccountViews から。15 秒に1回）。 */
export function refreshUserRecords(opts?: { force?: boolean }): Promise<void> {
  const uid = useAuthStore.getState().user?.id;
  return uid ? loadUserRecords(uid, opts) : Promise.resolve();
}

// ── 送信 ──

let flushing = false;
let flushAgain = false;
let attempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function clearRetry(): void {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function scheduleRetry(): void {
  clearRetry();
  const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
  attempt += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushUserRecords();
  }, delay);
}

function errorCode(err: unknown): string {
  return err && typeof err === "object" && "code" in err
    ? String((err as { code: unknown }).code)
    : "";
}

class AccountChanged extends Error {}

async function push(userId: string, records: readonly RemoteRecord[]): Promise<void> {
  const markSent = (sent: readonly RemoteRecord[]) => {
    pushEpoch += 1;
    useUserRecordsStore.getState().markPushed(userId, sent);
  };
  try {
    await upsertUserRecords(userId, records);
    markSent(records);
    return;
  } catch (err) {
    // 送っている間に別の人に切り替わった（トークンが変わり RLS で弾かれた）なら、
    // 前の人の記録は送信待ちのまま残す——その人が次にログインしたときに送る。
    if (useAuthStore.getState().user?.id !== userId) throw new AccountChanged();
    if (!PERMANENT_CODES.has(errorCode(err))) throw err;
  }
  // どれかが入口の決まり（CHECK など）で弾かれた：1件ずつ送り直し、通らないものだけ諦める。
  for (const r of records) {
    try {
      await upsertUserRecords(userId, [r]);
    } catch (err) {
      if (useAuthStore.getState().user?.id !== userId) throw new AccountChanged();
      if (!PERMANENT_CODES.has(errorCode(err))) throw err;
      console.error("[user-records] the account refused a record; keeping it on this device only:", r.key, err);
    }
    markSent([r]);
  }
}

/**
 * ログインしている人の送信待ちを送る。送るのは「いまのトークンの持ち主」のスコープ
 * だけ——オフライン起動中（トークン未更新）や別の人のスコープは、その人がログイン
 * してから。
 */
export async function flushUserRecords(opts?: { resetBackoff?: boolean }): Promise<void> {
  if (opts?.resetBackoff) {
    attempt = 0;
    clearRetry();
  }
  if (flushing) {
    flushAgain = true;
    return;
  }
  if (!supabase) return;
  const uid = useAuthStore.getState().user?.id;
  if (!uid) return;
  const map = useUserRecordsStore.getState().scopes[uid];
  const pending = map ? dirtyRecords(map) : [];
  if (pending.length === 0) return;

  flushing = true;
  flushAgain = false;
  let failed = false;
  try {
    await push(uid, pending);
    attempt = 0;
    clearRetry();
  } catch (err) {
    if (!(err instanceof AccountChanged)) {
      failed = true;
      console.error("[user-records] upload failed:", err);
      scheduleRetry();
    }
  } finally {
    flushing = false;
  }
  if (flushAgain && !failed) {
    flushAgain = false;
    void flushUserRecords();
  }
}

/**
 * 常駐処理（AuthProvider が起動）：書き換え・ログインの切り替え・オンライン復帰・
 * 画面復帰で送信をやり直す。
 */
export function startUserRecordsSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const kick = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void flushUserRecords({ resetBackoff: true });
    }, 300);
  };

  const unsubStore = useUserRecordsStore.subscribe((s, prev) => {
    if (s.scopes !== prev.scopes) kick();
  });
  const unsubAuth = useAuthStore.subscribe((s, prev) => {
    if ((s.user?.id ?? null) !== (prev.user?.id ?? null)) kick();
  });
  const onOnline = () => void flushUserRecords({ resetBackoff: true });
  const onVisible = () => {
    if (document.visibilityState === "visible") void flushUserRecords();
  };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  kick();

  return () => {
    if (timer !== null) clearTimeout(timer);
    unsubStore();
    unsubAuth();
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
