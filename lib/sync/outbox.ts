import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import { useMindStore } from "@/store/useMindStore";
import { useBaselineStore } from "@/store/useBaselineStore";
import { useCloudSyncStore } from "@/store/useCloudSyncStore";
import { measurementFromSession } from "@/lib/mind/session-record";
import { upsertBrainMeasurement } from "./brain-profile";
import { deleteBaselineCheck, upsertBaselineCheck } from "./baseline-checks";
import { isCheckUploadable, isSessionUploadable, needsUpload, sessionRev } from "./cloud-mark";

/**
 * 端末に残した記録をアカウントへ送る係（送信箱）。
 *
 * 送るものは記録そのものに付いた印（lib/sync/cloud-mark.ts）で決まる——
 * 「どのアカウント宛てか」「どの版まで送ったか」。ここは印を見て、ログイン中の
 * ユーザー宛ての未送信分を1件ずつ送り、送れたら印を進めるだけ。印は記録と一緒に
 * localStorage に残るので、送る前にアプリを閉じても、次に開いたときに続きから送る。
 *
 * - 送る順：アカウントからの削除予約 → 10秒チェック → 測定セッション（それぞれ古い順）。
 *   削除を先にするのは、「送信中に消した」記録が送信の後で確実に消えるように
 *   （全部を1本の順番で流すので、送信と削除が入れ違わない）。
 * - 内容は送る時点のものを丸ごと書く（upsert）。測定後にメモを書くと記録の版が
 *   進み、もう一度送られる。
 * - 失敗したら間隔を空けて再試行（5秒→15秒→30秒→1分→以後5分おき）。
 *   オンラインに戻った・ログインした・記録が増えた、のどれでもすぐ再開する。
 *
 * 10秒チェックは Web・デスクトップのどちらで取っても載る。測定セッションに宛先を
 * 付けるのはデスクトップ測定アプリの自動保存だけなので、Web ではセッションは送らない
 * （/brain の「取り込む」は別経路：useImportSession）。
 */

const BACKOFF_MS = [5_000, 15_000, 30_000, 60_000, 300_000];
const DEBOUNCE_MS = 300;

let refs = 0;
let unsubs: Array<() => void> = [];
let running = false;
let again = false;
let attempt = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

interface Job {
  /** 1回の送信処理の中で同じ仕事を二度しないための目印。 */
  key: string;
  run: () => Promise<void>;
}

/** `uid` 宛ての次の仕事（無ければ null）。 */
function nextJob(uid: string): Job | null {
  const baseline = useBaselineStore.getState();

  const tomb = baseline.tombstones.find((t) => t.owner === uid);
  if (tomb) {
    return {
      key: `delete-check:${tomb.id}`,
      run: async () => {
        await deleteBaselineCheck(uid, tomb.id);
        useBaselineStore.getState().dropTombstone(tomb.id, uid);
      },
    };
  }

  // checks は古い→新しい。
  const check = baseline.checks.find((c) => isCheckUploadable(c) && needsUpload(c.cloud, 0, uid));
  if (check) {
    return {
      key: `check:${check.id}`,
      run: async () => {
        await upsertBaselineCheck(uid, check);
        // 送っている間に消されていたら何もしない（削除予約が次に消す）。
        useBaselineStore.getState().markCheckSaved(check.id, uid);
      },
    };
  }

  // sessions は新しい→古いなので後ろから（古い順に送ると、Web の「最新」が順に進む）。
  const sessions = useMindStore.getState().sessions;
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    const rev = sessionRev(s);
    if (!isSessionUploadable(s) || !needsUpload(s.cloud, rev, uid)) continue;
    const record = measurementFromSession(s);
    if (!record) continue;
    return {
      key: `session:${s.id}:${rev}`,
      run: async () => {
        await upsertBrainMeasurement(uid, record);
        // 送っている間にメモが書き換わっていたら、印は送った版まで——次の周で新しい版を送る。
        useMindStore.getState().markSessionSaved(s.id, uid, rev);
      },
    };
  }
  return null;
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

function scheduleRetry(): void {
  if (retryTimer !== null) clearTimeout(retryTimer);
  const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
  attempt += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void drain();
  }, delay);
}

async function drain(): Promise<void> {
  if (refs === 0) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  again = false;
  const sync = useCloudSyncStore.getState();
  const done = new Set<string>();
  let failed = false;
  try {
    for (;;) {
      const uid = useAuthStore.getState().user?.id;
      if (!uid || !supabase) break;
      const job = nextJob(uid);
      // 同じ仕事がまた出てきたら（印が進まなかった）ここで止める——無限に回さない。
      if (!job || done.has(job.key)) break;
      done.add(job.key);
      sync.setPhase("syncing");
      await job.run();
      sync.markSaved();
      // 送っている間にアカウントが替わったら、続きは新しいアカウントで最初から。
      if (useAuthStore.getState().user?.id !== uid) {
        again = true;
        break;
      }
    }
    attempt = 0;
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    sync.setPhase("idle");
  } catch (err) {
    failed = true;
    console.error("[outbox] upload failed:", err);
    sync.setPhase("error", errorMessage(err));
    scheduleRetry();
  } finally {
    running = false;
  }
  if (again && !failed) kickCloudOutbox();
}

/** 近いうちに送信を試みる（連続した呼び出しはまとめる）。`resetBackoff` で待ちを捨てる。 */
export function kickCloudOutbox(opts?: { resetBackoff?: boolean }): void {
  if (refs === 0) return;
  if (opts?.resetBackoff) {
    attempt = 0;
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void drain();
  }, DEBOUNCE_MS);
}

/** ログインしたら「ログインして保存」の予約を、そのアカウント宛てに確定する。 */
function applyClaims(uid: string): void {
  const claims = useCloudSyncStore.getState().takeClaims();
  if (claims.sessions.length) useMindStore.getState().assignSessions(claims.sessions, uid);
  if (claims.checks.length) useBaselineStore.getState().assignChecks(claims.checks, uid);
}

function onOnline(): void {
  // 期限切れのトークンでオフライン起動していた場合、ここで更新を促す（成功すると
  // TOKEN_REFRESHED → user が戻り、下の購読から送信が始まる）。
  if (supabase && !useAuthStore.getState().user && useCloudSyncStore.getState().account) {
    supabase.auth.getSession().catch(() => {});
  }
  kickCloudOutbox({ resetBackoff: true });
}

function onVisible(): void {
  if (document.visibilityState === "visible") kickCloudOutbox();
}

/** 参照カウント式に起動する（AuthProvider から。StrictMode の二重実行でも1つ）。 */
export function ensureCloudOutbox(): void {
  refs += 1;
  if (refs > 1 || typeof window === "undefined" || !supabase) return;

  unsubs = [
    useAuthStore.subscribe((state, prev) => {
      const uid = state.user?.id ?? null;
      if (uid === (prev.user?.id ?? null)) return;
      if (uid) {
        applyClaims(uid);
        kickCloudOutbox({ resetBackoff: true });
      }
    }),
    // useMindStore は 1Hz で更新されるので、記録の一覧が変わったときだけ反応する。
    useMindStore.subscribe((state, prev) => {
      if (state.sessions !== prev.sessions) kickCloudOutbox();
    }),
    useBaselineStore.subscribe((state, prev) => {
      if (state.checks !== prev.checks || state.tombstones !== prev.tombstones) {
        kickCloudOutbox();
      }
    }),
  ];
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);

  const uid = useAuthStore.getState().user?.id;
  if (uid) applyClaims(uid);
  kickCloudOutbox();
}

export function releaseCloudOutbox(): void {
  refs = Math.max(0, refs - 1);
  if (refs > 0 || typeof window === "undefined") return;
  for (const u of unsubs) u();
  unsubs = [];
  window.removeEventListener("online", onOnline);
  document.removeEventListener("visibilitychange", onVisible);
  if (retryTimer !== null) clearTimeout(retryTimer);
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  retryTimer = null;
  debounceTimer = null;
  attempt = 0;
}
