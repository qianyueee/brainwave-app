import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import {
  normalizeAnalysis,
  normalizeComparison,
  toAnalysisErrorCode,
  type AnalysisErrorCode,
  type BrainAnalysis,
  type BrainAnalysisInput,
  type BrainComparison,
  type BrainComparisonInput,
} from "@/lib/brain-analysis";

/**
 * AI 分析のアカウント保存。どちらも書くのは Edge Function `analyze-brain` だけ
 * （RLS に INSERT/UPDATE の許可が無い）。ここから直接できるのは読むことだけ——
 * 削除は測定の削除に連なって DB が消す（外部キーの ON DELETE CASCADE）。
 *
 *   user_brain_analyses     … 1件の分析。1測定1行、PK は user_id + uploaded_at
 *                             （supabase/migrations/006_brain_analyses.sql）
 *   user_brain_comparisons  … 比較分析。比べた測定の組ごとに1行。測定のキーを古い順に
 *                             uploaded_a / b / c に持つ（c は2件の比較では NULL。
 *                             supabase/migrations/007_brain_comparisons.sql）
 */
const TABLE = "user_brain_analyses";
const COMPARE_TABLE = "user_brain_comparisons";
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

/** 表がまだ無い（006 / 007 を流す前）。「まだ分析していない」と同じに見せる——
 *  ボタンを押せば関数の側で準備中と分かる。 */
const isMissingTable = (code: string | undefined) => code === "42P01" || code === "PGRST205";

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
    if (isMissingTable(error.code)) return null;
    throw error;
  }
  return data ? normalizeAnalysis(data) : null;
}

/**
 * 保存済みの比較分析（無ければ null）。`keys` は比べる測定のキーを古い順に
 * （comparisonKeys）——保存の並びと同じなので、組は1行に決まる。管理者は RLS 上
 * だれの行でも読めるので、user_id の絞り込みは外さないこと。
 */
export async function fetchBrainComparison(
  userId: string,
  keys: readonly string[]
): Promise<BrainComparison | null> {
  const sb = assertClient();
  const query = sb
    .from(COMPARE_TABLE)
    .select("uploaded_a, uploaded_b, uploaded_c, locale, model, created_at, content")
    .eq("user_id", userId)
    .eq("uploaded_a", keys[0])
    .eq("uploaded_b", keys[1]);
  const { data, error } = await (keys[2] === undefined
    ? query.is("uploaded_c", null)
    : query.eq("uploaded_c", keys[2])
  ).maybeSingle();
  if (error) {
    if (isMissingTable(error.code)) return null;
    throw error;
  }
  return data ? normalizeComparison(data) : null;
}

/**
 * 関数を呼んで返事の本文を返す。失敗は AnalysisError（code は画面の文言を選ぶため
 * のもの）。
 */
async function invokeAnalyzeBrain(
  body: BrainAnalysisInput | BrainComparisonInput,
  compare: boolean
): Promise<unknown> {
  const sb = assertClient();
  const { data, error } = await sb.functions.invoke(FUNCTION, {
    body,
    timeout: INVOKE_TIMEOUT_MS,
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response;
      // 関数がまだ無い（デプロイ前）は 404。
      if (res.status === 404) throw new AnalysisError("not_configured");
      let reply: { error?: unknown; kind?: unknown } | null;
      try {
        reply = (await res.json()) as { error?: unknown; kind?: unknown } | null;
      } catch {
        reply = null;
      }
      const code = reply?.error;
      // 比較分析を知らない（貼り直す前の）関数は、比較の本文を見知らぬ項目 kind の
      // せいで bad_input と断る。比較を知っている関数の比較の返事には必ず
      // kind:"compare" が付くので、付いていない bad_input は「比較の窓口はまだ準備中」。
      if (compare && code === "bad_input" && reply?.kind !== "compare") {
        throw new AnalysisError("not_configured");
      }
      throw new AnalysisError(
        code !== undefined ? toAnalysisErrorCode(code) : res.status === 401 ? "unauthorized" : "upstream"
      );
    }
    // 返事を読めなかった（オフライン・タイムアウト・中継の失敗・CORS の無い 5xx）。
    // 理由はブラウザが隠すので、調べる人のためにコンソールへ残す。
    console.warn("analyze-brain: no readable response", error.name, error.message);
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    throw new AnalysisError(offline ? "network" : "unreachable");
  }
  return data;
}

/** 分析を頼む。関数が DeepSeek に問い合わせ、保存した行を返す。 */
export async function requestBrainAnalysis(input: BrainAnalysisInput): Promise<BrainAnalysis> {
  const data = await invokeAnalyzeBrain(input, false);
  const analysis = normalizeAnalysis((data as { analysis?: unknown } | null)?.analysis);
  if (!analysis) throw new AnalysisError("upstream");
  return analysis;
}

/** 比較分析を頼む。関数が DeepSeek に問い合わせ、保存した行を返す。 */
export async function requestBrainComparison(input: BrainComparisonInput): Promise<BrainComparison> {
  const data = await invokeAnalyzeBrain(input, true);
  const comparison = normalizeComparison((data as { comparison?: unknown } | null)?.comparison);
  if (!comparison) throw new AnalysisError("upstream");
  return comparison;
}
