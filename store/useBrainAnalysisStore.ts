import { create } from "zustand";
import type { AnalysisErrorCode, BrainAnalysis, BrainAnalysisInput } from "@/lib/brain-analysis";
import {
  AnalysisError,
  fetchBrainAnalysis,
  requestBrainAnalysis,
} from "@/lib/sync/brain-analyses";

export interface AnalysisEntry {
  /** 保存済みの分析を読み終えたか（読めて「無い」も true）。 */
  loaded: boolean;
  analysis: BrainAnalysis | null;
  /** 読み込み中／分析中。 */
  busy: "loading" | "analyzing" | null;
  /** 直近の失敗。`phase` で「読めなかった」と「分析できなかった」を言い分ける。 */
  error: { code: AnalysisErrorCode; phase: "load" | "analyze" } | null;
}

export const EMPTY_ANALYSIS_ENTRY: AnalysisEntry = {
  loaded: false,
  analysis: null,
  busy: null,
  error: null,
};

interface BrainAnalysisState {
  /** `${userId}\u0000${uploadedAt}` → その測定の分析。 */
  byKey: Record<string, AnalysisEntry>;
  /** 表示する測定の分析を読む（読んだ・読んでいる最中なら何もしない）。 */
  load: (userId: string, uploadedAt: string) => Promise<void>;
  /** 分析を頼む（「AIで分析する」「もう一度分析する」）。 */
  analyze: (userId: string, input: BrainAnalysisInput) => Promise<void>;
  clear: () => void;
}

export const analysisKey = (userId: string, uploadedAt: string) => `${userId}\u0000${uploadedAt}`;

/**
 * AI 分析（Sync Report の大脳特性の下）。**わざと persist していない**——正は
 * アカウント（user_brain_analyses）で、表示する測定の分だけその場で読む。
 * キーにユーザー id を含むので、共用の端末で別の人がログインしても前の人の
 * 分析は出ない。ログアウトでも捨てる（AuthProvider の clearAllForLogout）。
 */
export const useBrainAnalysisStore = create<BrainAnalysisState>((set, get) => {
  const patch = (key: string, next: Partial<AnalysisEntry>) =>
    set((s) => ({
      byKey: { ...s.byKey, [key]: { ...(s.byKey[key] ?? EMPTY_ANALYSIS_ENTRY), ...next } },
    }));

  return {
    byKey: {},

    load: async (userId, uploadedAt) => {
      const key = analysisKey(userId, uploadedAt);
      const cur = get().byKey[key];
      if (cur && (cur.loaded || cur.busy)) return;
      patch(key, { busy: "loading", error: null });
      try {
        const analysis = await fetchBrainAnalysis(userId, uploadedAt);
        // 読んでいる間に分析が済んでいたら、そちらが新しい。
        if (get().byKey[key]?.busy !== "loading") return;
        patch(key, { loaded: true, analysis, busy: null });
      } catch (err) {
        if (!(err instanceof AnalysisError)) console.error(err);
        if (get().byKey[key]?.busy !== "loading") return;
        patch(key, {
          busy: null,
          error: {
            code: err instanceof AnalysisError ? err.code : "network",
            phase: "load",
          },
        });
      }
    },

    analyze: async (userId, input) => {
      const key = analysisKey(userId, input.uploadedAt);
      if (get().byKey[key]?.busy === "analyzing") return;
      patch(key, { busy: "analyzing", error: null });
      try {
        const analysis = await requestBrainAnalysis(input);
        patch(key, { loaded: true, analysis, busy: null });
      } catch (err) {
        // 断られた理由（回数・準備中…）は画面が言葉で伝える。想定外のものだけ残す。
        if (!(err instanceof AnalysisError)) console.error(err);
        patch(key, {
          busy: null,
          error: {
            code: err instanceof AnalysisError ? err.code : "network",
            phase: "analyze",
          },
        });
      }
    },

    clear: () => set({ byKey: {} }),
  };
});
