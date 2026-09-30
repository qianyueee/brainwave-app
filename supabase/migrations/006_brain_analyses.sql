-- ============================================================
-- Migration: 脳特性の AI 分析（DeepSeek）を1測定1行で残す
-- ============================================================
--
-- Sync Report の大脳特性の下にある「AIで分析する」の結果。書くのは Edge Function
-- `analyze-brain`（supabase/functions/analyze-brain）だけで、service_role で書く。
-- クライアントには読む・消す許可しか無い——任意の文章を「AI の分析」として
-- 保存できないように。
--
--   user_brain_analyses  … 1測定1行（分析し直すと置き換わる）。測定の行を外部キーで
--                          参照し、測定を消せば（1件でも「すべて削除」でも）分析も
--                          DB が一緒に消す。
--   user_ai_usage        … 1人1日の回数（DeepSeek の利用料の上限）。数えるのは
--                          claim_ai_analysis() だけ、呼べるのは service_role だけ。
--
-- 適用順：このファイルを SQL Editor で実行 → Edge Function をデプロイして
-- DEEPSEEK_API_KEY を設定（supabase/functions/analyze-brain/README.md）→ Web を
-- デプロイ。先に Web が出ても、ボタンが「準備中」と言うだけ。
-- 何度実行しても安全（IF NOT EXISTS / DROP ... IF EXISTS / OR REPLACE）。

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_brain_analyses (
  user_id UUID NOT NULL,
  -- 測定のキー（user_brain_measurements.uploaded_at と同じ文字列）。
  uploaded_at TEXT NOT NULL,
  -- 分析を書いた言語（画面の表示言語）。
  locale TEXT NOT NULL,
  model TEXT NOT NULL,
  -- { summary, strengths[], cautions[], course|null, suggestions[] }（lib/brain-analysis.ts）。
  content JSONB NOT NULL,
  -- 送った数値の形の版（lib/brain-analysis.ts の ANALYSIS_INPUT_VERSION）。
  input_version INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, uploaded_at),
  CONSTRAINT user_brain_analyses_measurement FOREIGN KEY (user_id, uploaded_at)
    REFERENCES public.user_brain_measurements (user_id, uploaded_at) ON DELETE CASCADE,
  CONSTRAINT user_brain_analyses_locale CHECK (locale IN ('ja', 'en')),
  CONSTRAINT user_brain_analyses_content CHECK (
    COALESCE(jsonb_typeof(content) = 'object', false) AND pg_column_size(content) <= 16384
  )
);

COMMENT ON TABLE public.user_brain_analyses IS
  '脳特性の AI 分析（1測定1行）。書くのは Edge Function analyze-brain（service_role）だけ。';

-- ── RLS ──
-- 読むのは本人（管理者は全員——003 と同じ。クライアントは必ず user_id で絞る）、
-- 消すのは本人。INSERT / UPDATE のポリシーは作らない（service_role は RLS を通らない）。
ALTER TABLE public.user_brain_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own analyses" ON public.user_brain_analyses;
CREATE POLICY "Users select own analyses" ON public.user_brain_analyses
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS "Users delete own analyses" ON public.user_brain_analyses;
CREATE POLICY "Users delete own analyses" ON public.user_brain_analyses
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- ── 1日の回数 ──
CREATE TABLE IF NOT EXISTS public.user_ai_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 日本時間の暦日。
  day DATE NOT NULL,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

COMMENT ON TABLE public.user_ai_usage IS
  'AI 分析の1人1日の回数。claim_ai_analysis() だけが数える。';

-- ポリシーは作らない＝クライアントからは読めも書けもしない。
ALTER TABLE public.user_ai_usage ENABLE ROW LEVEL SECURITY;

-- 1回ぶん数える。上限に届いていれば数えずに false。1つの文で数えるので、同時に
-- 押されても上限を超えない。
CREATE OR REPLACE FUNCTION public.claim_ai_analysis(p_user_id UUID, p_limit INT)
RETURNS BOOLEAN
LANGUAGE sql
SET search_path = public
AS $$
  WITH claimed AS (
    INSERT INTO public.user_ai_usage AS u (user_id, day, count)
    VALUES (p_user_id, (now() AT TIME ZONE 'Asia/Tokyo')::date, 1)
    ON CONFLICT (user_id, day) DO UPDATE SET count = u.count + 1
      WHERE u.count < p_limit
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM claimed);
$$;

-- Supabase は public の関数に anon / authenticated の実行権を付けて作る。
-- p_user_id を好きに渡せると他人の回数を使い切れるので、service_role だけに絞る。
REVOKE ALL ON FUNCTION public.claim_ai_analysis(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_analysis(UUID, INT) TO service_role;

COMMIT;
