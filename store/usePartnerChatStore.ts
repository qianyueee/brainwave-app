import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PartnerMood, PartnerPhase, PartnerRole, SleepyChoice } from "@/lib/partner";

/**
 * Sync Partner の会話（ホームの components/SyncPartnerCard）。**端末にだけ、その日のぶんだけ**
 * 残す（persist key `partner-chat`、素の localStorage）。関数も DB も会話を残さない。
 *
 * 残すのは、ホームを離れて戻ったとき（プログラムを押してプレーヤーへ行き、戻ったときなど）に
 * 会話が続いているように——そして開くたびに挨拶を頼み直して1日の回数を使わないように。
 *
 *   - 会話は「会話のひとまとまり（朝・午後・帰宅後・眠る前＝partnerPhase）× 役」ごと。
 *     時間帯が替わると新しい挨拶から始まり、役を替えて戻ると前の会話が残っている
 *   - 1日（朝 5:00〜翌朝 4:59＝partnerDayKey）が替わるか、端末の持ち主（ログインした
 *     アカウント、未ログインは "anon"）が替われば全部捨てる。共用の端末で前の人の会話は
 *     見えない（画面は持ち主と日が合っているときだけ読む）
 *   - 返事が届く前に日・持ち主が替わったら、その返事は捨てる（scope が合わない）
 */

export interface PartnerMessage {
  id: string;
  from: "partner" | "user";
  text: string;
  /** 勧めたプログラム（役のひと言だけ）。 */
  programId: string | null;
  /** つらい気持ちへの決まった文。 */
  care: boolean;
  /** ai＝関数の返事／fixed＝決まった台詞（lib/partner-lines.ts）／user＝利用者 */
  source: "ai" | "fixed" | "user";
}

export interface PartnerThread {
  messages: PartnerMessage[];
  /** 午後に選んだ気分（まだなら null）。 */
  mood: PartnerMood | null;
  /** 「眠い」の続きで選んだもの。 */
  sleepy: SleepyChoice | null;
}

export const EMPTY_THREAD: PartnerThread = { messages: [], mood: null, sleepy: null };

/** 会話を残す相手と日。返事を足すときに、頼んだときと同じかを確かめる。 */
export interface PartnerScope {
  owner: string;
  day: string;
}

export function partnerThreadKey(phase: PartnerPhase, role: PartnerRole): string {
  return `${phase}:${role}`;
}

/** 1つの会話に残す数。古いものから捨てる（AI に渡すのは最後の 6 つだけ）。 */
const THREAD_MAX = 60;

interface PartnerChatState {
  owner: string | null;
  day: string | null;
  threads: Record<string, PartnerThread>;
  /** 1日の回数を使い切った暦日（calendarDayKey）。関数は日本時間の暦日で数える。 */
  cappedOn: string | null;
  /** 関数が最後に知らせた、その日の残りの回数。 */
  remaining: number | null;
  /** 返事を待っている会話（`${owner}|${day}|${key}`、永続しない）。一度に1つだけ頼む。 */
  busy: string | null;

  /** 持ち主か日が替わっていれば、会話を捨てて始め直す。 */
  begin: (scope: PartnerScope) => void;
  /** 1つ足す。頼んだ後に持ち主・日が替わっていれば何もしない（false）。 */
  append: (scope: PartnerScope, key: string, message: PartnerMessage) => boolean;
  patchThread: (scope: PartnerScope, key: string, patch: Partial<Pick<PartnerThread, "mood" | "sleepy">>) => void;
  setRemaining: (scope: PartnerScope, remaining: number | null) => void;
  setCapped: (scope: PartnerScope, calendarDay: string) => void;
  setBusy: (busy: string | null) => void;
}

const sameScope = (s: Pick<PartnerChatState, "owner" | "day">, scope: PartnerScope) =>
  s.owner === scope.owner && s.day === scope.day;

export function busyKeyOf(scope: PartnerScope, key: string): string {
  return `${scope.owner}|${scope.day}|${key}`;
}

/** 会話の id（端末の中で見分けられれば足りる）。 */
export function newPartnerMessageId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export const usePartnerChatStore = create<PartnerChatState>()(
  persist(
    (set) => ({
      owner: null,
      day: null,
      threads: {},
      cappedOn: null,
      remaining: null,
      busy: null,

      begin: (scope) =>
        set((s) => {
          if (sameScope(s, scope)) return s;
          return {
            owner: scope.owner,
            day: scope.day,
            threads: {},
            remaining: null,
            // 使い切った印は暦日で見るので、日が替わっても残してよい。持ち主が替われば別の人。
            cappedOn: s.owner === scope.owner ? s.cappedOn : null,
          };
        }),

      append: (scope, key, message) => {
        let added = false;
        set((s) => {
          if (!sameScope(s, scope)) return s;
          added = true;
          const thread = s.threads[key] ?? EMPTY_THREAD;
          return {
            threads: {
              ...s.threads,
              [key]: { ...thread, messages: [...thread.messages, message].slice(-THREAD_MAX) },
            },
          };
        });
        return added;
      },

      patchThread: (scope, key, patch) =>
        set((s) => {
          if (!sameScope(s, scope)) return s;
          const thread = s.threads[key] ?? EMPTY_THREAD;
          return { threads: { ...s.threads, [key]: { ...thread, ...patch } } };
        }),

      setRemaining: (scope, remaining) => set((s) => (sameScope(s, scope) ? { remaining } : s)),

      setCapped: (scope, calendarDay) =>
        set((s) => (sameScope(s, scope) ? { cappedOn: calendarDay, remaining: 0 } : s)),

      setBusy: (busy) => set({ busy }),
    }),
    {
      name: "partner-chat",
      version: 1,
      partialize: (s) => ({
        owner: s.owner,
        day: s.day,
        threads: s.threads,
        cappedOn: s.cappedOn,
        remaining: s.remaining,
      }),
    }
  )
);
