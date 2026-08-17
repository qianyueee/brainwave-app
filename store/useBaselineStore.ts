import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { BaselineRateMethod } from "@/lib/mind/baseline";
import type { MindSourceKind } from "@/store/useMindStore";

/**
 * 10秒ベースラインチェックの記録。
 *
 * 素の localStorage に持たせる（useSelfRatingStore / useZodiacStore と同じ方針）
 * ——設計書がこの機能に与えている役割は「毎朝・仕事前・退勤後に開いて10秒」と
 * いう**習慣**なので、ログインを前提にしたら習慣として成立しない。クラウド同期は
 * セッション由来の脳特性（useBrainProfileStore）が受け持つ。
 */
export interface BaselineCheck {
  id: string;
  /** 記録時刻 (ISO) */
  recordedAt: string;
  rate: number | null;
  clarity: number | null;
  reset: number | null;
  /** Rate をどのロジックで出したか（引き込み / Berger / 静止時可塑性）。 */
  method: BaselineRateMethod;
  /**
   * 計測前に入力した誘導周波数（Hz、0.1刻み）。Rate をこれを基準に出している
   * ので、数字だけ残して Hz を捨てると後から読めなくなる。指定せずに測った回と、
   * この項目より前に取った回は undefined／null。
   */
  targetHz?: number | null;
  /** T_lock（秒）。誘導周波数へ引き込めたときのみ。 */
  lockSec?: number | null;
  /** 目標周波数の局所突出比のピーク。引き込みで算出できたときのみ。 */
  peakRatio?: number | null;
  /** T_α-rise（秒）。Berger で算出できたときのみ。 */
  alphaRiseSec: number | null;
  /** P_α(Close)/P_α(Open)。Berger で算出できたときのみ。 */
  alphaRatio: number | null;
  /** アーティファクト除去後に残った秒数（最大 10）。 */
  usableSec: number;
  /**
   * デモデータで取った計測か。デモは「動く画面」を見せるためのもので脳波では
   * ないので、実測と混ぜて推移を描くと嘘になる。必ず区別して保存する。
   */
  source: MindSourceKind;
  subjectId?: string;
  subjectName?: string;
}

/** 保持する件数。1日2〜3回として3週間ぶん。 */
const HISTORY_MAX = 60;

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

interface BaselineState {
  /** 古い→新しい。 */
  checks: BaselineCheck[];
  /**
   * ホームの「10秒 脳波測定をはじめる」から遷移してきたか。true なら
   * Sync Brain 側が計測ダイアログを自動で開く。
   *
   * 永続化しない（partialize が checks だけを拾う）——次に起動したときに
   * 勝手に計測が始まったら事故。URL クエリではなく状態にしたのは、静的
   * 書き出し（output: "export"）だと useSearchParams が Suspense 境界を
   * 要求するのに対し、これは一度きりの受け渡しで済むため。
   */
  autoOpenCheck: boolean;
  /**
   * 前回入力した誘導周波数。毎回 40.0 に戻ると、同じ音で続けている人が毎朝
   * 打ち直すことになる（10秒で終わるのが取り柄の機能なので、入力の手間が
   * そのまま習慣の障害になる）。永続化する。
   */
  lastTargetHz: number | null;
  requestCheck: () => void;
  consumeCheckRequest: () => void;
  setLastTargetHz: (hz: number | null) => void;
  record: (input: Omit<BaselineCheck, "id" | "recordedAt">) => BaselineCheck;
  deleteCheck: (id: string) => void;
}

export const useBaselineStore = create<BaselineState>()(
  persist(
    (set) => ({
      checks: [],
      autoOpenCheck: false,
      lastTargetHz: null,

      requestCheck: () => set({ autoOpenCheck: true }),
      consumeCheckRequest: () => set({ autoOpenCheck: false }),
      setLastTargetHz: (hz) => set({ lastTargetHz: hz }),

      record: (input) => {
        const check: BaselineCheck = {
          ...input,
          id: generateId(),
          recordedAt: new Date().toISOString(),
        };
        set((s) => ({ checks: [...s.checks, check].slice(-HISTORY_MAX) }));
        return check;
      },

      deleteCheck: (id) =>
        set((s) => ({ checks: s.checks.filter((c) => c.id !== id) })),
    }),
    {
      name: "baseline-checks",
      partialize: (s) => ({ checks: s.checks, lastTargetHz: s.lastTargetHz }),
    }
  )
);

/** 最新の1件（無ければ null）。 */
export const latestCheck = (s: BaselineState): BaselineCheck | null =>
  s.checks.length ? s.checks[s.checks.length - 1] : null;

/**
 * 実測だけの最新1件。ホームの3指標に出すのはこちら——デモで取った値を
 * 「あなたの脳コンディション」として見せてはいけない。
 */
export const latestRealCheck = (s: BaselineState): BaselineCheck | null => {
  for (let i = s.checks.length - 1; i >= 0; i--) {
    if (s.checks[i].source === "realtime") return s.checks[i];
  }
  return null;
};
