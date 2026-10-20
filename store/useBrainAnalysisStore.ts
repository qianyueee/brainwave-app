import { create } from "zustand";
import type {
  AnalysisErrorCode,
  BrainAnalysis,
  BrainAnalysisInput,
  BrainComparison,
  BrainComparisonInput,
} from "@/lib/brain-analysis";
import {
  AnalysisError,
  fetchBrainAnalysis,
  fetchBrainComparison,
  requestBrainAnalysis,
  requestBrainComparison,
} from "@/lib/sync/brain-analyses";

/** 1つの分析（1件の分析・比較分析）の読み込みと依頼の状態。 */
export interface AiEntry<T> {
  /** 保存済みの分析を読み終えたか（読めて「無い」も true）。 */
  loaded: boolean;
  result: T | null;
  /** 読み込み中／分析中。 */
  busy: "loading" | "analyzing" | null;
  /** 直近の失敗。`phase` で「読めなかった」と「分析できなかった」を言い分ける。 */
  error: { code: AnalysisErrorCode; phase: "load" | "analyze" } | null;
}

export type AnalysisEntry = AiEntry<BrainAnalysis>;
export type ComparisonEntry = AiEntry<BrainComparison>;

export const EMPTY_AI_ENTRY: AiEntry<never> = {
  loaded: false,
  result: null,
  busy: null,
  error: null,
};

interface BrainAnalysisState {
  /** `${userId}\u0000${uploadedAt}` → その測定の分析。 */
  byKey: Record<string, AnalysisEntry>;
  /** `${userId}\u0000${キー}\u0000${キー}…`（古い順）→ その組の比較分析。 */
  comparisons: Record<string, ComparisonEntry>;
  /** 表示する測定の分析を読む（読んだ・読んでいる最中なら何もしない）。 */
  load: (userId: string, uploadedAt: string) => Promise<void>;
  /** 分析を頼む（「AIで分析する」「もう一度分析する」）。 */
  analyze: (userId: string, input: BrainAnalysisInput) => Promise<void>;
  /** 選んでいる組の比較分析を読む。`keys` は古い順（comparisonKeys）。 */
  loadComparison: (userId: string, keys: readonly string[]) => Promise<void>;
  /** 比較分析を頼む（「AIで比較分析する」「もう一度分析する」）。 */
  compare: (userId: string, input: BrainComparisonInput) => Promise<void>;
  clear: () => void;
}

export const analysisKey = (userId: string, uploadedAt: string) => `${userId}\u0000${uploadedAt}`;
export const comparisonKey = (userId: string, keys: readonly string[]) =>
  [userId, ...keys].join("\u0000");

/** 2つの表（1件の分析・比較分析）のどちらか。中身の形は result の型だけが違う。 */
type EntryMap = "byKey" | "comparisons";
type AnyEntry = AiEntry<BrainAnalysis | BrainComparison>;

/**
 * AI 分析（Sync Report の大脳特性の下）と比較分析（「測定の比較」）。**わざと
 * persist していない**——正はアカウント（user_brain_analyses / user_brain_comparisons）
 * で、表示する測定（組）の分だけその場で読む。キーにユーザー id を含むので、共用の
 * 端末で別の人がログインしても前の人の分析は出ない。ログアウトでも捨てる
 * （AuthProvider の clearAllForLogout）。
 */
export const useBrainAnalysisStore = create<BrainAnalysisState>((set, get) => {
  const entryOf = (map: EntryMap, key: string): AnyEntry | undefined =>
    (get()[map] as Record<string, AnyEntry>)[key];

  // 型は下の4つの入口が組を守る（byKey には分析、comparisons には比較分析）。
  const patch = (map: EntryMap, key: string, next: Partial<AnyEntry>) =>
    set((s) => {
      const entries = s[map] as Record<string, AnyEntry>;
      return {
        [map]: { ...entries, [key]: { ...(entries[key] ?? EMPTY_AI_ENTRY), ...next } },
      } as Partial<BrainAnalysisState>;
    });

  const errorOf = (err: unknown, phase: "load" | "analyze"): AnyEntry["error"] => ({
    code: err instanceof AnalysisError ? err.code : "network",
    phase,
  });

  /** 保存済みを読む（読んだ・読んでいる最中・分析中なら何もしない）。 */
  async function loadInto(
    map: EntryMap,
    key: string,
    fetchSaved: () => Promise<BrainAnalysis | BrainComparison | null>
  ) {
    const cur = entryOf(map, key);
    if (cur && (cur.loaded || cur.busy)) return;
    patch(map, key, { busy: "loading", error: null });
    try {
      const result = await fetchSaved();
      // 読んでいる間に分析が済んでいたら、そちらが新しい。
      if (entryOf(map, key)?.busy !== "loading") return;
      patch(map, key, { loaded: true, result, busy: null });
    } catch (err) {
      if (!(err instanceof AnalysisError)) console.error(err);
      if (entryOf(map, key)?.busy !== "loading") return;
      patch(map, key, { busy: null, error: errorOf(err, "load") });
    }
  }

  /** 分析を頼む（同じものを分析中なら何もしない）。 */
  async function runInto(
    map: EntryMap,
    key: string,
    request: () => Promise<BrainAnalysis | BrainComparison>
  ) {
    if (entryOf(map, key)?.busy === "analyzing") return;
    patch(map, key, { busy: "analyzing", error: null });
    try {
      const result = await request();
      patch(map, key, { loaded: true, result, busy: null });
    } catch (err) {
      // 断られた理由（回数・準備中…）は画面が言葉で伝える。想定外のものだけ残す。
      if (!(err instanceof AnalysisError)) console.error(err);
      patch(map, key, { busy: null, error: errorOf(err, "analyze") });
    }
  }

  return {
    byKey: {},
    comparisons: {},

    load: (userId, uploadedAt) =>
      loadInto("byKey", analysisKey(userId, uploadedAt), () => fetchBrainAnalysis(userId, uploadedAt)),

    analyze: (userId, input) =>
      runInto("byKey", analysisKey(userId, input.uploadedAt), () => requestBrainAnalysis(input)),

    loadComparison: (userId, keys) =>
      loadInto("comparisons", comparisonKey(userId, keys), () => fetchBrainComparison(userId, keys)),

    compare: (userId, input) =>
      runInto(
        "comparisons",
        comparisonKey(userId, input.measurements.map((m) => m.uploadedAt)),
        () => requestBrainComparison(input)
      ),

    clear: () => set({ byKey: {}, comparisons: {} }),
  };
});
