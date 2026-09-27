import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BaselineRateMethod } from "@/lib/mind/baseline";
import type { MindSourceKind } from "@/store/useMindStore";
import { isCheckUploadable, markOwner, needsUpload, type CloudMark } from "@/lib/sync/cloud-mark";
import { listBaselineChecks } from "@/lib/sync/baseline-checks";

/**
 * 10秒ベースラインチェックの記録。
 *
 * 端末の記録は素の localStorage が正（useSelfRatingStore / useZodiacStore と同じ
 * 方針）——設計書がこの機能に与えている役割は「毎朝・仕事前・退勤後に開いて
 * 10秒」という**習慣**なので、ログインを前提にしたら習慣として成立しない。
 *
 * そのうえで、ログイン中に取った実測はアカウントにも載せる（`cloud` の印を付けて
 * おき、同期処理 lib/sync/outbox.ts が送る）。デスクトップ測定アプリで取った
 * チェックを Web のヒストリーやホームで見られるように、Web はアカウントの分を
 * `cloudChecks`（メモリのみ）に読み、端末の分と id で重ねて見せる
 * （`useAllBaselineChecks`）。アカウントからの削除は `tombstones`（永続）に積んで
 * 同期処理が消す——オフラインで消しても、再起動をまたいで確実に届くように。
 */
export interface BaselineCheck {
  id: string;
  /** 記録時刻 (ISO) */
  recordedAt: string;
  rate: number | null;
  clarity: number | null;
  reset: number | null;
  /** Rate をどちらのロジックで出したか（Berger / 静止時可塑性）。 */
  method: BaselineRateMethod;
  /** T_α-rise（秒）。Berger で算出できたときのみ。 */
  alphaRiseSec: number | null;
  /** P_α(Close)/P_α(Open)。Berger で算出できたときのみ。 */
  alphaRatio: number | null;
  /** アーティファクト除去後に残った秒数（最大 10）。 */
  usableSec: number;
  /**
   * デモデータで取った計測か。デモは「動く画面」を見せるためのもので脳波では
   * ないので、実測と混ぜて推移を描くと嘘になる。必ず区別して保存する。
   * デスクトップの「合成データでテストする」で取った回も "demo"。
   */
  source: MindSourceKind;
  subjectId?: string;
  subjectName?: string;
  /**
   * アカウントへ保存するか・保存済みか（lib/sync/cloud-mark.ts）。端末ローカルの
   * 状態なのでクラウドには持っていかない。チェックは後から書き換えないので版は常に 0。
   */
  cloud?: CloudMark;
}

/** 端末に残す件数。1日2〜3回として3週間ぶん。未送信のものはこの外でも消さない。 */
const HISTORY_MAX = 60;

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** アカウントへ送り終えていないチェック（宛先の誰かにとって未送信）。 */
function awaitingUpload(c: BaselineCheck): boolean {
  const owner = markOwner(c.cloud);
  return owner !== null && needsUpload(c.cloud, 0, owner);
}

/** 古い→新しいの一覧を HISTORY_MAX 件に畳む（未送信は残す）。 */
function trimChecks(list: BaselineCheck[]): BaselineCheck[] {
  if (list.length <= HISTORY_MAX) return list;
  const cut = list.length - HISTORY_MAX;
  return [...list.slice(0, cut).filter(awaitingUpload), ...list.slice(cut)];
}

const byRecordedAt = (a: BaselineCheck, b: BaselineCheck) =>
  a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : 0;

// 読み直しの間引きと、読んでいる間の変更検知（useBrainProfileStore と同じ考え方）。
let cloudVersion = 0;
let lastCloudLoadAt = 0;
const REFRESH_MIN_INTERVAL_MS = 15_000;

/** アカウントから消す予約（同期処理が消し終えたら外す）。 */
export interface CheckTombstone {
  id: string;
  owner: string;
}

interface BaselineState {
  /** この端末で取った記録。古い→新しい。 */
  checks: BaselineCheck[];
  /** ログイン中のアカウントに載っている記録（Web 表示用、メモリのみ）。 */
  cloudChecks: BaselineCheck[];
  /** cloudChecks がどのアカウントのものか（null＝未読込）。 */
  cloudChecksUserId: string | null;
  /** cloudChecks を読み始めた時刻（ISO）。これより前に保存したのに一覧に無い
   *  端末の記録＝別の端末で消されたもの、と判断するのに使う。 */
  cloudLoadedAt: string | null;
  /** アカウントから消す予約（永続）。 */
  tombstones: CheckTombstone[];
  /**
   * ホームの「10秒 脳波測定をはじめる」から遷移してきたか。true なら
   * Sync Brain 側が計測ダイアログを自動で開く。
   *
   * 永続化しない（partialize が拾うのは checks と tombstones だけ）——次に起動したときに
   * 勝手に計測が始まったら事故。URL クエリではなく状態にしたのは、静的
   * 書き出し（output: "export"）だと useSearchParams が Suspense 境界を
   * 要求するのに対し、これは一度きりの受け渡しで済むため。
   */
  autoOpenCheck: boolean;
  requestCheck: () => void;
  consumeCheckRequest: () => void;
  /**
   * 保存。`cloudOwner` を渡すと、載せてよい実測ならそのアカウントへの保存を
   * 予約する（ログイン中に取ったもの）。
   */
  record: (
    input: Omit<BaselineCheck, "id" | "recordedAt" | "cloud">,
    opts?: { cloudOwner?: string }
  ) => BaselineCheck;
  /** 端末から消し、アカウントに載っていた（載せる予定だった）ならそちらも消す予約をする。 */
  deleteCheck: (id: string) => void;
  /** アカウントからの削除が済んだ（同期処理が呼ぶ）。 */
  dropTombstone: (id: string, owner: string) => void;
  /** アカウントへ保存できた（同期処理が呼ぶ）。 */
  markCheckSaved: (id: string, owner: string) => void;
  /** 宛先未定のチェックを `owner` のアカウントへ保存する予約にする。 */
  assignChecks: (ids: readonly string[], owner: string) => void;
  /** 宛先未定のチェックを「この端末だけに残す」にする。 */
  markChecksLocalOnly: (ids: readonly string[]) => void;
  /** アカウントの記録を読み込む（ログイン時）。 */
  loadCloudChecks: (userId: string) => Promise<void>;
  /** 他の端末が足した分を読み直す（タブに戻ったとき。短い間隔の連打は間引く）。 */
  refreshCloudChecks: (opts?: { force?: boolean }) => Promise<void>;
  clearCloudChecks: () => void;
}

export const useBaselineStore = create<BaselineState>()(
  persist(
    (set, get) => ({
      checks: [],
      cloudChecks: [],
      cloudChecksUserId: null,
      cloudLoadedAt: null,
      tombstones: [],
      autoOpenCheck: false,

      requestCheck: () => set({ autoOpenCheck: true }),
      consumeCheckRequest: () => set({ autoOpenCheck: false }),

      record: (input, opts) => {
        const check: BaselineCheck = {
          ...input,
          id: generateId(),
          recordedAt: new Date().toISOString(),
        };
        if (opts?.cloudOwner && isCheckUploadable(check)) {
          check.cloud = { owner: opts.cloudOwner };
        }
        set((s) => ({ checks: trimChecks([...s.checks, check]) }));
        return check;
      },

      deleteCheck: (id) => {
        const local = get().checks.find((c) => c.id === id);
        const fromCloud = get().cloudChecks.some((c) => c.id === id);
        // アカウントに載っている（載る予定の）宛先。送信中に消されても、同期処理は
        // 1本の順番で動くので「送る→消す」の順に届き、復活しない。
        const owner = markOwner(local?.cloud) ?? (fromCloud ? get().cloudChecksUserId : null);
        cloudVersion += 1;
        set((s) => ({
          checks: s.checks.filter((c) => c.id !== id),
          cloudChecks: s.cloudChecks.filter((c) => c.id !== id),
          tombstones:
            owner && !s.tombstones.some((t) => t.id === id && t.owner === owner)
              ? [...s.tombstones, { id, owner }]
              : s.tombstones,
        }));
      },

      dropTombstone: (id, owner) =>
        set((s) => ({
          tombstones: s.tombstones.filter((t) => !(t.id === id && t.owner === owner)),
        })),

      markCheckSaved: (id, owner) =>
        set((s) => ({
          checks: s.checks.map((c) =>
            c.id === id && markOwner(c.cloud) === owner
              ? { ...c, cloud: { owner, savedRev: 0, savedAt: new Date().toISOString() } }
              : c
          ),
        })),

      assignChecks: (ids, owner) => {
        const pick = new Set(ids);
        set((s) => ({
          checks: s.checks.map((c) =>
            pick.has(c.id) && c.cloud === undefined && isCheckUploadable(c)
              ? { ...c, cloud: { owner } }
              : c
          ),
        }));
      },

      markChecksLocalOnly: (ids) => {
        const pick = new Set(ids);
        set((s) => ({
          checks: s.checks.map((c) =>
            pick.has(c.id) && c.cloud === undefined ? { ...c, cloud: { localOnly: true } } : c
          ),
        }));
      },

      loadCloudChecks: async (userId) => {
        lastCloudLoadAt = Date.now();
        const startedAt = new Date().toISOString();
        const version = cloudVersion;
        try {
          const list = await listBaselineChecks(userId);
          // 読んでいる間に削除・ログアウトがあったら、古い一覧で上書きしない。
          if (version !== cloudVersion) return;
          set({ cloudChecks: list, cloudChecksUserId: userId, cloudLoadedAt: startedAt });
        } catch (err) {
          console.error("[baseline] cloud load failed:", err);
        }
      },

      refreshCloudChecks: async (opts) => {
        const uid = get().cloudChecksUserId;
        if (!uid) return;
        if (!opts?.force && Date.now() - lastCloudLoadAt < REFRESH_MIN_INTERVAL_MS) return;
        await get().loadCloudChecks(uid);
      },

      clearCloudChecks: () => {
        cloudVersion += 1;
        set({ cloudChecks: [], cloudChecksUserId: null, cloudLoadedAt: null });
      },
    }),
    {
      name: "baseline-checks",
      partialize: (s) => ({ checks: s.checks, tombstones: s.tombstones }),
    }
  )
);

/**
 * 端末の記録とアカウントの記録を id で重ねた一覧（古い→新しい）。同じ記録が
 * 両方にあれば端末側を採る。ヒストリー・カレンダー・ホームはこれを読む。
 *
 * 見せないもの：
 * - 削除予約（tombstones）に載っている記録——アカウント側がまだ消えていなくても。
 * - このアカウントへ保存済みなのに、その後に読んだアカウントの一覧に無い端末の
 *   記録——別の端末で消されたもの。保存が読み込みより後なら（読んだ一覧に
 *   まだ載っていないだけなので）消さない。
 */
export function mergeChecks(input: {
  local: readonly BaselineCheck[];
  cloud: readonly BaselineCheck[];
  cloudUserId: string | null;
  cloudLoadedAt: string | null;
  tombstones: readonly CheckTombstone[];
}): BaselineCheck[] {
  const { local, cloud, cloudUserId, cloudLoadedAt, tombstones } = input;
  const dead = new Set(tombstones.map((t) => t.id));
  const inCloud = new Set(cloud.map((c) => c.id));
  const deletedElsewhere = (c: BaselineCheck): boolean => {
    if (!cloudUserId || !cloudLoadedAt || inCloud.has(c.id)) return false;
    const m = c.cloud;
    return !!m && "owner" in m && m.owner === cloudUserId && !!m.savedAt && m.savedAt < cloudLoadedAt;
  };
  const shownLocal = local.filter((c) => !dead.has(c.id) && !deletedElsewhere(c));
  const seen = new Set(shownLocal.map((c) => c.id));
  const extra = cloud.filter((c) => !seen.has(c.id) && !dead.has(c.id));
  return extra.length ? [...shownLocal, ...extra].sort(byRecordedAt) : shownLocal;
}

/**
 * mergeChecks を購読する形。zustand v5 のセレクタは毎回新しい配列を返すと無限
 * 再描画になるので、材料を別々に購読して useMemo で重ねる。
 */
export function useAllBaselineChecks(): BaselineCheck[] {
  const local = useBaselineStore((s) => s.checks);
  const cloud = useBaselineStore((s) => s.cloudChecks);
  const cloudUserId = useBaselineStore((s) => s.cloudChecksUserId);
  const cloudLoadedAt = useBaselineStore((s) => s.cloudLoadedAt);
  const tombstones = useBaselineStore((s) => s.tombstones);
  return useMemo(
    () => mergeChecks({ local, cloud, cloudUserId, cloudLoadedAt, tombstones }),
    [local, cloud, cloudUserId, cloudLoadedAt, tombstones]
  );
}

/** 最新の1件（無ければ null）。 */
export const latestCheck = (checks: readonly BaselineCheck[]): BaselineCheck | null =>
  checks.length ? checks[checks.length - 1] : null;

/**
 * 実測だけの最新1件。ホームの3指標に出すのはこちら——デモで取った値を
 * 「あなたの脳コンディション」として見せてはいけない。
 */
export function latestRealCheck(checks: readonly BaselineCheck[]): BaselineCheck | null {
  for (let i = checks.length - 1; i >= 0; i--) {
    if (checks[i].source === "realtime") return checks[i];
  }
  return null;
}
