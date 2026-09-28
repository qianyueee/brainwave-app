import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useCloudSyncStore } from "@/store/useCloudSyncStore";
import {
  ANON_SCOPE,
  applyPull,
  claimAnon,
  EPOCH,
  fillGaps,
  isNewer,
  journalKey,
  markPushed,
  normalizeSubjectName,
  pruneToDirty,
  putRecord,
  removeRecord,
  SELF_RATING_KEY,
  skipAnon,
  subjectKey,
  viewOf,
  ZODIAC_KEY,
  type RecordData,
  type RecordKind,
  type RecordMap,
  type RemoteRecord,
} from "@/lib/sync/record-merge";

/**
 * 端末をまたいで同じにする小さな記録（振り返り・再生の記録・感コンディション・
 * 測定者・マイ星座）の、端末側の置き場（素の localStorage、key `user-records`）。
 *
 * 記録は**スコープ**ごとに分けて持つ（lib/sync/record-merge.ts）：
 * - `anon`＝ログインしていない間に書いたもの。どこへも送らない。ログインしたら
 *   「このアカウントに保存しますか？」（AccountSaveBanner）で移すかどうかを尋ねる
 * - `<userId>`＝そのアカウントのもの。書いたら送信待ちになり、lib/sync/record-sender.ts
 *   が送る。アカウントから読んだ分もここに重ねる
 *
 * いまのスコープは「この端末が結びついているアカウント」（useCloudSyncStore.account、
 * 明示的なログアウトでだけ外れる）で決める——オフラインで起動してトークンを更新
 * できない間も、自分の記録が見え、書いたものは自分の宛てになる。
 *
 * 画面に出すのは、ログイン中＝アカウントの分と anon を種類ごとのきまりで重ねたもの、
 * ログアウト中＝anon だけ（useRecordView、lib/sync/record-merge.ts の viewOf）。
 * ログインしても端末に残る記録が消えて見えることはない。アカウントがこの端末から
 * ログアウトしたら、そのスコープは送信待ちだけ残して捨てる——共用の端末で次の人に
 * 前の人の記録が見えず、端末にも残らない（記録はアカウントにある）。
 *
 * 振り返り・感コンディション・マイ星座・測定者は、以前は機能ごとの素の localStorage
 * だった。旧キーが残っていれば anon へ移して消す（importLegacy。何度走っても同じ）。
 * 機能ごとの API（useJournalStore ほか）は形を変えずにこちらを読む。
 */

interface UserRecordsState {
  /** スコープ（"anon" | userId）→ 記録。 */
  scopes: Record<string, RecordMap>;
  /** いま書き込み・表示に使うスコープ（永続しない。useCloudSyncStore.account から）。 */
  scope: string;
  /** 書く（アカウントのスコープなら送信待ちになる）。 */
  put: (key: string, kind: RecordKind, data: RecordData) => void;
  /**
   * 既定値の種を置く（最初からある「自分」）。時刻は EPOCH——本当の書き換え・削除には
   * 必ず負ける。すでに何か（墓標を含む）があれば何もしない。
   */
  seed: (key: string, kind: RecordKind, data: RecordData) => void;
  /** 消す。anon に同じキーがあればそれも落とす（和集合から透けて見えないように）。 */
  remove: (key: string) => void;
  /** アカウントから読んだ一覧を重ねる（lib/sync/record-sender.ts）。 */
  applyPull: (userId: string, remote: readonly RemoteRecord[]) => void;
  /** 送れた記録の送信待ちを外す（lib/sync/record-sender.ts）。 */
  markPushed: (userId: string, sent: readonly RemoteRecord[]) => void;
  /** anon の記録を `userId` のアカウントへ移す（「このアカウントに保存する」）。 */
  claimAnon: (userId: string) => void;
  /** anon の記録を「この端末だけ」にする（「保存しない」）。 */
  skipAnon: () => void;
}

const EMPTY: RecordMap = Object.freeze({});

export const useUserRecordsStore = create<UserRecordsState>()(
  persist(
    (set, get) => ({
      scopes: {},
      scope: ANON_SCOPE,

      put: (key, kind, data) => {
        const { scopes, scope } = get();
        const next = putRecord(scopes[scope] ?? EMPTY, key, kind, data, {
          now: new Date(),
          dirty: scope !== ANON_SCOPE,
        });
        set({ scopes: { ...scopes, [scope]: next } });
      },

      seed: (key, kind, data) => {
        const { scopes, scope } = get();
        if (scopes[scope]?.[key] || scopes[ANON_SCOPE]?.[key]) return;
        const next = putRecord(scopes[scope] ?? EMPTY, key, kind, data, {
          now: new Date(),
          dirty: scope !== ANON_SCOPE,
          at: EPOCH,
        });
        set({ scopes: { ...scopes, [scope]: next } });
      },

      remove: (key) => {
        const { scopes, scope } = get();
        const now = new Date();
        const nextScopes = { ...scopes };
        const cur = scopes[scope] ?? EMPTY;
        nextScopes[scope] = removeRecord(cur, key, { now, tombstone: scope !== ANON_SCOPE });
        if (scope !== ANON_SCOPE && scopes[ANON_SCOPE]?.[key]) {
          nextScopes[ANON_SCOPE] = removeRecord(scopes[ANON_SCOPE], key, { now, tombstone: false });
        }
        set({ scopes: nextScopes });
      },

      applyPull: (userId, remote) => {
        const { scopes, scope } = get();
        const cur = scopes[userId] ?? EMPTY;
        let user = applyPull(cur, remote);
        let anon = scopes[ANON_SCOPE] ?? EMPTY;
        // アカウントを読み終えたので、尋ねない種類（星座・感コンディション・測定者）で
        // アカウントにまだ無いものを端末から引き継げる（読む前だと取り違える）。
        // いまこの端末に結びついている人のときだけ——別の人の読み込みに引き継がない。
        if (scope === userId) {
          const r = fillGaps(user, anon);
          user = r.user;
          anon = r.anon;
        }
        if (user === cur && anon === scopes[ANON_SCOPE]) return;
        set({ scopes: { ...scopes, [userId]: user, [ANON_SCOPE]: anon } });
      },

      markPushed: (userId, sent) => {
        const { scopes } = get();
        const cur = scopes[userId];
        if (!cur) return;
        const next = markPushed(cur, sent);
        if (next !== cur) set({ scopes: { ...scopes, [userId]: next } });
      },

      claimAnon: (userId) => {
        const { scopes } = get();
        const r = claimAnon(scopes[userId] ?? EMPTY, scopes[ANON_SCOPE] ?? EMPTY);
        set({ scopes: { ...scopes, [userId]: r.user, [ANON_SCOPE]: r.anon } });
      },

      skipAnon: () => {
        const { scopes } = get();
        const cur = scopes[ANON_SCOPE] ?? EMPTY;
        const next = skipAnon(cur);
        if (next !== cur) set({ scopes: { ...scopes, [ANON_SCOPE]: next } });
      },
    }),
    {
      name: "user-records",
      version: 1,
      partialize: (s) => ({ scopes: s.scopes }),
    }
  )
);

/**
 * 画面に出す記録（ログイン中＝アカウントの分 ∪ anon、ログアウト中＝anon）。zustand v5 は
 * 毎回新しいオブジェクトを返すセレクタで無限に描き直すので、材料を別々に購読して
 * useMemo で重ねる（useAllBaselineChecks と同じ）。
 */
export function useRecordView(): RecordMap {
  const scope = useUserRecordsStore((s) => s.scope);
  const user = useUserRecordsStore((s) => (s.scope === ANON_SCOPE ? undefined : s.scopes[s.scope]));
  const anon = useUserRecordsStore((s) => s.scopes[ANON_SCOPE]);
  return useMemo(
    () => (scope === ANON_SCOPE ? viewOf(undefined, anon) : viewOf(user, anon)),
    [scope, user, anon]
  );
}

// ── 以前の機能ごとの localStorage から移す ──

const LEGACY_KEYS = {
  journal: "sync-journal",
  selfRating: "self-rating",
  zodiac: "zodiac-sign",
  subjects: "mind-subjects",
} as const;

/**
 * いま選んでいる測定者（名前）の置き場。store/useSubjectStore.ts が persist する
 * キーと同じ——旧 `mind-subjects` の「選んでいた人」（端末の id）を名前に直して
 * ここへ書く。このモジュールは useSubjectStore より先に評価される（あちらが
 * こちらを import する）ので、あちらが読む前に書き終わっている。
 */
export const ACTIVE_SUBJECT_KEY = "mind-subject-active";

type Envelope = { state?: Record<string, unknown>; version?: number };

function readEnvelope(key: string): Envelope | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Envelope) : null;
  } catch {
    return null;
  }
}

const isIso = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));
const isScore = (v: unknown): v is number => typeof v === "number" && v >= 0 && v <= 100;

/**
 * 旧キーが残っていれば anon へ移して消す。フラグは持たない——キーが無ければ何も
 * しないので何度走っても同じで、古い版に戻して旧キーが書かれても、次に新しい版が
 * 開いたときにまた移る。同じキーがすでにあれば新しい方を残す。
 */
function importLegacy(): void {
  const present = Object.values(LEGACY_KEYS).filter((k) => {
    try {
      return localStorage.getItem(k) !== null;
    } catch {
      return false;
    }
  });
  if (present.length === 0) return;

  let anon: RecordMap = useUserRecordsStore.getState().scopes[ANON_SCOPE] ?? EMPTY;
  const add = (key: string | null, kind: RecordKind, data: RecordData, updatedAt: string) => {
    if (!key) return;
    const cur = anon[key];
    if (cur && !isNewer(updatedAt, cur.updatedAt)) return;
    anon = { ...anon, [key]: { kind, data, updatedAt } };
  };

  // 振り返り（dayKey → { text, mood, updatedAt }）
  const journal = readEnvelope(LEGACY_KEYS.journal)?.state?.entries;
  if (journal && typeof journal === "object") {
    for (const e of Object.values(journal as Record<string, unknown>)) {
      if (!e || typeof e !== "object") continue;
      const { dayKey, text, mood, updatedAt } = e as Record<string, unknown>;
      if (typeof dayKey !== "string" || !isIso(updatedAt)) continue;
      add(
        journalKey(dayKey),
        "journal",
        {
          text: typeof text === "string" ? text : "",
          mood: typeof mood === "number" ? mood : null,
        },
        updatedAt
      );
    }
  }

  // 感コンディション（v1＝いまの3軸だけ。v0 は別の質問への答えなので移さない）
  const rating = readEnvelope(LEGACY_KEYS.selfRating);
  const latest = rating?.version === 1 ? rating.state?.latest : null;
  if (latest && typeof latest === "object") {
    const { switching, clarity, rest, recordedAt } = latest as Record<string, unknown>;
    if (isScore(switching) && isScore(clarity) && isScore(rest) && isIso(recordedAt)) {
      add(SELF_RATING_KEY, "self_rating", { switching, clarity, rest, recordedAt }, recordedAt);
    }
  }

  // マイ星座（いつ決めたか分からないので EPOCH：アカウントに値があればそちらが勝つ）
  const sign = readEnvelope(LEGACY_KEYS.zodiac)?.state?.selectedSign;
  if (typeof sign === "string" && sign) add(ZODIAC_KEY, "setting", { sign }, EPOCH);

  // 測定者（名前で1件。「自分」も含めて移す——最初からある名前なので時刻は EPOCH）。
  // 端末の id で覚えていた「いま選んでいる人」は名前に直して ACTIVE_SUBJECT_KEY へ。
  const legacySubjects = readEnvelope(LEGACY_KEYS.subjects)?.state;
  const subjects = legacySubjects?.subjects;
  if (Array.isArray(subjects)) {
    for (const s of subjects) {
      if (!s || typeof s !== "object") continue;
      const { id, name, createdAt } = s as Record<string, unknown>;
      if (typeof name !== "string") continue;
      const n = normalizeSubjectName(name);
      const at = n === "自分" ? EPOCH : isIso(createdAt) ? createdAt : EPOCH;
      add(subjectKey(n), "subject", { name: n, createdAt: isIso(createdAt) ? createdAt : EPOCH }, at);
      if (id === legacySubjects?.activeSubjectId) {
        try {
          localStorage.setItem(
            ACTIVE_SUBJECT_KEY,
            JSON.stringify({ state: { activeSubjectId: n }, version: 0 })
          );
        } catch {
          // 選択は移せなくても、最初の測定者に落ちるだけ
        }
      }
    }
  }

  useUserRecordsStore.setState((s) => ({ scopes: { ...s.scopes, [ANON_SCOPE]: anon } }));
  for (const k of present) {
    try {
      localStorage.removeItem(k);
    } catch {
      // 消せなければ次回また移す（新しい方を残すので同じ結果になる）
    }
  }
}

// ── スコープの追従（ブラウザでだけ） ──

if (typeof window !== "undefined") {
  let linked = useCloudSyncStore.getState().account?.id ?? null;
  const followAccount = () => {
    const now = useCloudSyncStore.getState().account?.id ?? null;
    const scope = now ?? ANON_SCOPE;
    const s = useUserRecordsStore.getState();
    // 結びついていたアカウントが外れた（ログアウト・別の人のログイン）：その人の記録は
    // 送信待ちだけ残して捨てる。次にその人がログインしたらアカウントから読み直す。
    if (linked !== null && linked !== now && s.scopes[linked]) {
      useUserRecordsStore.setState({
        scopes: { ...s.scopes, [linked]: pruneToDirty(s.scopes[linked]) },
      });
    }
    linked = now;
    if (useUserRecordsStore.getState().scope !== scope) useUserRecordsStore.setState({ scope });
  };
  followAccount();
  useCloudSyncStore.subscribe(followAccount);
  importLegacy();
}
