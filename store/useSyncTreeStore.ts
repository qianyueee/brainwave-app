import { useMemo, useSyncExternalStore } from "react";
import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/useAuthStore";
import { insertTreeEvent, listTreeEvents } from "@/lib/sync/tree-events";
import {
  foldTreeEvents,
  isTreeComplete,
  listenEventId,
  replantEventId,
  treeDayKey,
  treeDayStatus,
  waterEventId,
  type TreeDayStatus,
  type TreeEvent,
  type TreeFold,
} from "@/lib/sync-tree";

/**
 * Sync Tree の出来事（ログイン中のアカウントのぶん）。
 *
 * **persist しない**——木はログイン中だけの機能で、データはアカウントにだけ置く
 * （lib/sync/tree-events.ts）。ログインのたびに AuthProvider が読み込み、
 * ログアウトで捨てる。永続化しないので、初回描画はサーバ描画と同じ「空」から
 * 始まる（hydrated ガードは要らない）。
 *
 * - 読み直しは **手元 ∪ サーバ**（id で重ねる）。行は追記のみで消えないので和集合が
 *   常に正しい——読んでいる間に足した行・送れたばかりの行を古い一覧で消さない
 * - 水やり・リスニング・植え替えは、まず手元に `pending` 付きで足して（画面はすぐ
 *   育つ）、専用の送信係が1件ずつアカウントへ送る。共通の送信箱
 *   （lib/sync/outbox.ts）に乗せないのは、あちらは1件失敗するとそこで止まり、
 *   状態表示（phase）も10秒チェックと共用だから——004 を流す前に Web が出ても、
 *   木の失敗で測定の保存を巻き込まない
 * - ログアウト（clear）では送れていない分も捨てる。アカウントにだけ保存する、の帰結
 */

export type TreeLoadStatus = "idle" | "loading" | "ready" | "error";

export interface StoredTreeEvent extends TreeEvent {
  /** まだアカウントに届いていない（送信待ち） */
  pending?: boolean;
}

export type WaterResult = "ok" | "already" | "complete" | "unavailable";

interface SyncTreeState {
  /** 読み込んでいる木の持ち主（null＝未読込・ログアウト） */
  userId: string | null;
  status: TreeLoadStatus;
  events: StoredTreeEvent[];
  /** 送信に失敗して再試行を待っている（「まだ保存できていない」表示用） */
  saveError: string | null;
  /** ログイン時（AuthProvider）。reject しない・同じ人の読み込み中なら相乗りする。 */
  loadForUser: (userId: string) => Promise<void>;
  /** 他の端末で増えた分を読み直す（短い間隔の連打は間引く。`force` で間引かない）。 */
  refresh: (opts?: { force?: boolean }) => Promise<void>;
  /** ログアウト。 */
  clear: () => void;
  water: () => WaterResult;
  /** リスニング1回ぶん（5分）。足せたら true。 */
  creditListen: () => boolean;
  /** 完成した木を記録して植え替える。できたら true。 */
  replant: () => boolean;
}

const REFRESH_MIN_INTERVAL_MS = 15_000;
const BACKOFF_MS = [5_000, 15_000, 30_000, 60_000, 300_000];
/**
 * 送り直しても通らない失敗（CHECK・NOT NULL 違反、型、権限）。その1件は捨てて
 * 画面から戻す——いつまでも「保存できていない」を出し続けないように。
 */
const PERMANENT_CODES = new Set(["23514", "23502", "22P02", "42501"]);

// ログアウト・別の人への切り替えのたびに進める代。読み込みや送信の結果は、
// 始めたときと代が違えば捨てる。
let generation = 0;
let inflight: { userId: string; promise: Promise<void> } | null = null;
let lastLoadAt = 0;

// ── 畳んだ結果（events の配列ごとに1回だけ計算する） ──

const foldCache = new WeakMap<readonly StoredTreeEvent[], TreeFold>();

export function foldOf(events: readonly StoredTreeEvent[]): TreeFold {
  let f = foldCache.get(events);
  if (!f) {
    f = foldTreeEvents(events);
    foldCache.set(events, f);
  }
  return f;
}

function sameEvent(a: StoredTreeEvent, b: StoredTreeEvent): boolean {
  return (
    a.id === b.id &&
    a.kind === b.kind &&
    a.day === b.day &&
    a.occurredAt === b.occurredAt &&
    !!a.pending === !!b.pending
  );
}

/** 手元 ∪ サーバ。同じ id はサーバ側を採る（＝送信待ちの印が外れる）。 */
function mergeEvents(
  local: StoredTreeEvent[],
  server: readonly TreeEvent[]
): StoredTreeEvent[] {
  const byId = new Map<string, StoredTreeEvent>();
  for (const e of local) byId.set(e.id, e);
  let changed = false;
  for (const e of server) {
    const cur = byId.get(e.id);
    if (!cur || !sameEvent(cur, e)) changed = true;
    byId.set(e.id, e);
  }
  // 何も変わらなければ同じ配列を返す（裏の読み直しのたびに画面を描き直さない）。
  return changed ? [...byId.values()] : local;
}

function nonce(): string {
  // crypto.randomUUID は HTTP では使えないことがある（CLAUDE.md）。
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().slice(0, 12);
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** ログイン中の人の木を読み込み済みで、いま手を入れてよいか。 */
function isWritable(s: SyncTreeState): boolean {
  return (
    s.status === "ready" &&
    s.userId !== null &&
    s.userId === useAuthStore.getState().user?.id
  );
}

export const useSyncTreeStore = create<SyncTreeState>()((set, get) => {
  const pull = (userId: string): Promise<void> => {
    const gen = generation;
    lastLoadAt = Date.now();
    const run = async () => {
      try {
        const rows = await listTreeEvents(userId);
        if (gen !== generation || get().userId !== userId) return;
        set((s) => ({ events: mergeEvents(s.events, rows), status: "ready" }));
        // 前回送れずに残っていた分があれば、読み込めたついでに送る。
        void flushTreeEvents();
      } catch (err) {
        console.error("[sync-tree] load failed:", err);
        if (gen !== generation || get().userId !== userId) return;
        // 読み込み済みの木は、裏の読み直しが失敗しても表示したままにする。
        if (get().status !== "ready") set({ status: "error" });
      }
    };
    const promise = run().finally(() => {
      if (inflight?.promise === promise) inflight = null;
    });
    inflight = { userId, promise };
    return promise;
  };

  const append = (e: TreeEvent) => {
    set((s) => ({ events: [...s.events, { ...e, pending: true }] }));
    void flushTreeEvents({ resetBackoff: true });
  };

  return {
    userId: null,
    status: "idle",
    events: [],
    saveError: null,

    loadForUser: (userId) => {
      if (inflight && inflight.userId === userId) return inflight.promise;
      const s = get();
      if (s.userId === userId && s.status === "ready") return get().refresh();
      if (s.userId !== userId) {
        generation += 1;
        resetUploader();
        set({ userId, status: "loading", events: [], saveError: null });
      } else {
        set({ status: "loading" });
      }
      return pull(userId);
    },

    refresh: async (opts) => {
      const uid = get().userId;
      if (!uid) return;
      if (inflight && inflight.userId === uid) return inflight.promise;
      if (!opts?.force && Date.now() - lastLoadAt < REFRESH_MIN_INTERVAL_MS) return;
      return pull(uid);
    },

    clear: () => {
      generation += 1;
      inflight = null;
      lastLoadAt = 0;
      resetUploader();
      set({ userId: null, status: "idle", events: [], saveError: null });
    },

    water: () => {
      const s = get();
      if (!isWritable(s)) return "unavailable";
      const now = new Date();
      const day = treeDayKey(now);
      const id = waterEventId(day);
      if (s.events.some((e) => e.id === id)) return "already";
      if (isTreeComplete(foldOf(s.events).points)) return "complete";
      append({ id, kind: "water", day, occurredAt: now.toISOString() });
      return "ok";
    },

    creditListen: () => {
      const s = get();
      if (!isWritable(s)) return false;
      const now = new Date();
      const day = treeDayKey(now);
      if (treeDayStatus(s.events, day).listenCapped) return false;
      if (isTreeComplete(foldOf(s.events).points)) return false;
      append({ id: listenEventId(day, nonce()), kind: "listen", day, occurredAt: now.toISOString() });
      return true;
    },

    replant: () => {
      const s = get();
      if (!isWritable(s)) return false;
      if (!isTreeComplete(foldOf(s.events).points)) return false;
      const now = new Date();
      const day = treeDayKey(now);
      const id = replantEventId(day);
      // 完成まで最短でも34日かかるので、同じ日に2本目を植えることは起きない。
      if (s.events.some((e) => e.id === id)) return false;
      append({ id, kind: "replant", day, occurredAt: now.toISOString() });
      return true;
    },
  };
});

/**
 * リスニングを数えてよいか（lib/sync/tree-runtime.ts の積算が毎秒聞く）：
 * ログイン中の人の木を読み込み済み・完成していない・今日の枠が残っている。
 */
export function canCreditListen(now: Date = new Date()): boolean {
  const s = useSyncTreeStore.getState();
  if (!isWritable(s)) return false;
  if (isTreeComplete(foldOf(s.events).points)) return false;
  return !treeDayStatus(s.events, treeDayKey(now)).listenCapped;
}

// ── 送信係（木だけの。1件ずつ・古い順ではなく足した順） ──

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

function resetUploader(): void {
  attempt = 0;
  flushAgain = false;
  clearRetry();
}

function errorCode(err: unknown): string {
  return err && typeof err === "object" && "code" in err
    ? String((err as { code: unknown }).code)
    : "";
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

function scheduleRetry(): void {
  clearRetry();
  const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
  attempt += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushTreeEvents();
  }, delay);
}

const withoutPending = ({ id, kind, day, occurredAt }: StoredTreeEvent): TreeEvent => ({
  id,
  kind,
  day,
  occurredAt,
});

/**
 * 送信待ちの出来事をアカウントへ送る。送るのは「いまログインしている人の木」
 * だけ——ログアウトや別の人への切り替えの後に、前の人の行を新しい人の
 * トークンで送らない（権限で弾かれて再試行が回り続ける）。
 * 失敗したら 5秒→15秒→30秒→1分→以後5分おきに再試行。オンライン復帰・
 * 画面復帰・ログイン（tree-runtime）と、新しい出来事で即座にやり直す。
 */
export async function flushTreeEvents(opts?: { resetBackoff?: boolean }): Promise<void> {
  if (opts?.resetBackoff) {
    attempt = 0;
    clearRetry();
  }
  if (flushing) {
    flushAgain = true;
    return;
  }
  if (!supabase) return;
  flushing = true;
  flushAgain = false;
  const gen = generation;
  const sent = new Set<string>();
  let failed = false;
  try {
    for (;;) {
      const s = useSyncTreeStore.getState();
      const uid = useAuthStore.getState().user?.id;
      if (!uid || s.userId !== uid || gen !== generation) break;
      const next = s.events.find((e) => e.pending && !sent.has(e.id));
      if (!next) break;
      sent.add(next.id);
      try {
        await insertTreeEvent(uid, withoutPending(next));
      } catch (err) {
        if (!PERMANENT_CODES.has(errorCode(err))) throw err;
        console.error("[sync-tree] the account refused an event, dropping it:", next.id, err);
        if (gen === generation) {
          useSyncTreeStore.setState((st) => ({
            events: st.events.filter((e) => !(e.id === next.id && e.pending)),
          }));
        }
        continue;
      }
      if (gen !== generation) break;
      useSyncTreeStore.setState((st) => ({
        events: st.events.map((e) => (e.id === next.id && e.pending ? withoutPending(e) : e)),
      }));
    }
    attempt = 0;
    clearRetry();
    if (gen === generation && useSyncTreeStore.getState().saveError !== null) {
      useSyncTreeStore.setState({ saveError: null });
    }
  } catch (err) {
    failed = true;
    console.error("[sync-tree] upload failed:", err);
    if (gen === generation) useSyncTreeStore.setState({ saveError: errorMessage(err) });
    scheduleRetry();
  } finally {
    flushing = false;
  }
  if (flushAgain && !failed) {
    flushAgain = false;
    void flushTreeEvents();
  }
}

// ── 画面用 ──

function subscribeToday(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const arm = () => {
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    timer = setTimeout(() => {
      onChange();
      arm();
    }, nextMidnight.getTime() - now.getTime());
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") onChange();
  };
  arm();
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  return () => {
    if (timer !== null) clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
  };
}

const todaySnapshot = (): string => treeDayKey(new Date());
const serverToday = (): null => null;

/**
 * 今日（ローカル暦日 YYYY-MM-DD）。日付が変わると自分で切り替わる——/tree を
 * 開いたまま夜中を越えても「今日の水やり」が昨日のまま残らない。サーバ描画では
 * null（日付は端末のものなので、描画の食い違いを作らない）。
 */
export function useTreeToday(): string | null {
  return useSyncExternalStore(subscribeToday, todaySnapshot, serverToday);
}

/**
 * - unavailable … アカウント機能の無いビルド（Supabase 未設定）
 * - loading     … ログイン確認中・木の読み込み中
 * - logged-out  … 未ログイン（木はログイン中だけの機能）
 * - error       … 読み込めなかった（004 を流す前など）
 * - ready       … 表示できる
 */
export type SyncTreeView = "unavailable" | "loading" | "logged-out" | "error" | "ready";

export interface SyncTreeViewState {
  view: SyncTreeView;
  fold: TreeFold;
  events: readonly StoredTreeEvent[];
  /** 今日（サーバ描画中は null） */
  today: string | null;
  /** 今日の水やり・リスニングの状況（today が無ければ null） */
  day: TreeDayStatus | null;
  /** 送れていない出来事があり、送信が失敗している */
  unsaved: boolean;
}

/**
 * 画面が読む形。zustand v5 は毎回新しいオブジェクトを返すセレクタで無限に
 * 描き直すので、材料を別々に購読して useMemo で組む（useAllBaselineChecks と同じ）。
 */
export function useSyncTreeView(): SyncTreeViewState {
  const user = useAuthStore((s) => s.user);
  const authLoading = useAuthStore((s) => s.loading);
  const userId = useSyncTreeStore((s) => s.userId);
  const status = useSyncTreeStore((s) => s.status);
  const events = useSyncTreeStore((s) => s.events);
  const saveError = useSyncTreeStore((s) => s.saveError);
  const today = useTreeToday();

  const fold = useMemo(() => foldOf(events), [events]);
  const day = useMemo(() => (today ? treeDayStatus(events, today) : null), [events, today]);
  const unsaved = useMemo(
    () => saveError !== null && events.some((e) => e.pending),
    [saveError, events]
  );

  let view: SyncTreeView;
  if (!supabase) view = "unavailable";
  else if (authLoading) view = "loading";
  else if (!user) view = "logged-out";
  else if (userId !== user.id || status === "idle" || status === "loading") view = "loading";
  else if (status === "error") view = "error";
  else view = "ready";

  return { view, fold, events, today, day, unsaved };
}
