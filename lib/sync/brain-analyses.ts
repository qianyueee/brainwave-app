import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  normalizeAnalysis,
  toAnalysisErrorCode,
  type AnalysisErrorCode,
  type BrainAnalysis,
  type BrainAnalysisInput,
} from "@/lib/brain-analysis";

/**
 * AI 分析のアカウント保存（`user_brain_analyses`、1測定1行、PK は user_id +
 * uploaded_at。supabase/migrations/006_brain_analyses.sql）。
 *
 * 書くのは Edge Function `analyze-brain` だけ（RLS に INSERT/UPDATE の許可が
 * 無い）。ここから直接できるのは読むことだけ——削除は測定の削除に連なって
 * DB が消す（外部キーの ON DELETE CASCADE）。
 */
const TABLE = "user_brain_analyses";
const FUNCTION = "analyze-brain";

/** DeepSeek の返事を待つ上限。関数側は 60 秒で打ち切るので、少し長めに。 */
const INVOKE_TIMEOUT_MS = 90_000;

export class AnalysisError extends Error {
  constructor(public code: AnalysisErrorCode) {
    super(code);
    this.name = "AnalysisError";
  }
}

function assertClient() {
  if (!supabase) throw new AnalysisError("not_configured");
  return supabase;
}

/**
 * 保存済みの分析（無ければ null）。管理者は RLS 上だれの行でも読めるので、
 * user_id の絞り込みは外さないこと。
 */
export async function fetchBrainAnalysis(
  userId: string,
  uploadedAt: string
): Promise<BrainAnalysis | null> {
  const sb = assertClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("uploaded_at, locale, model, created_at, content")
    .eq("user_id", userId)
    .eq("uploaded_at", uploadedAt)
    .maybeSingle();
  if (error) {
    // 006 を流す前（表が無い）は「まだ分析していない」と同じに見せる——ボタンを
    // 押せば関数の側で準備中と分かる。
    if (error.code === "42P01" || error.code === "PGRST205") return null;
    throw error;
  }
  return data ? normalizeAnalysis(data) : null;
}

/**
 * 分析を頼む。関数が DeepSeek に問い合わせ、保存した行を返す。失敗は
 * AnalysisError（code は画面の文言を選ぶためのもの）。
 */
export async function requestBrainAnalysis(input: BrainAnalysisInput): Promise<BrainAnalysis> {
  const sb = assertClient();
  const { data, error } = await sb.functions.invoke(FUNCTION, {
    body: input,
    timeout: INVOKE_TIMEOUT_MS,
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response;
      // 関数がまだ無い（デプロイ前）は 404。
      if (res.status === 404) throw new AnalysisError("not_configured");
      let code: unknown;
      try {
        code = ((await res.json()) as { error?: unknown }).error;
      } catch {
        code = undefined;
      }
      throw new AnalysisError(
        code !== undefined ? toAnalysisErrorCode(code) : res.status === 401 ? "unauthorized" : "upstream"
      );
    }
    // 届かなかった（オフライン・タイムアウト・中継の失敗）。
    throw new AnalysisError("network");
  }
  const analysis = normalizeAnalysis((data as { analysis?: unknown } | null)?.analysis);
  if (!analysis) throw new AnalysisError("upstream");
  return analysis;
}
