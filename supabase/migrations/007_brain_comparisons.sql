-- ============================================================
-- Migration: 「測定の比較」の AI 比較分析（DeepSeek）を、比べた組ごとに1行で残す
-- ============================================================
--
-- Sync Report「測定の比較」の「AIで比較分析する」の結果。書くのは Edge Function
-- `analyze-brain`（006 の1件の分析と同じ関数。本文の kind:"compare" で見分ける）
-- だけで、service_role で書く。クライアントには読む・消す許可しか無い——任意の
-- 文章を「AI の分析」として保存できないように（006 と同じ）。
--
--   user_brain_comparisons … 比べた測定の組（2〜3件）ごとに1行。分析し直すと置き換わる。
--                            比べた測定をそれぞれ外部キーで参照し、どれか1件を消せば
--                            （1件でも「すべて削除」でも）その組の分析も DB が一緒に消す。
--
-- 1日の回数は 006 の user_ai_usage / claim_ai_analysis() を1件の分析と分け合う
-- （DeepSeek の利用料の上限は1つ）。
--
-- 適用順：006 の後。このファイルを SQL Editor で実行 → analyze-brain に最新の
-- index.ts を全文貼り直して Deploy（supabase/functions/analyze-brain/README.md）。
-- Web が先に出ても、比較分析のボタンが「準備中」と言うだけ。
-- 何度実行しても安全（IF NOT EXISTS / DROP ... IF EXISTS）。

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_brain_comparisons (
  user_id UUID NOT NULL,
  -- 組のキー：比べた測定のキーを古い順に半角空白でつないだもの（主キーのための列。
  -- 3件目の無い組では uploaded_c が NULL になり、主キーに入れられないため）。
  -- 中身は下の3列と必ず同じ（CHECK）。
  combo TEXT NOT NULL,
  -- 比べた測定のキー（user_brain_measurements.uploaded_at と同じ文字列）を古い順に。
  -- 2件の比較では uploaded_c が NULL。
  uploaded_a TEXT NOT NULL,
  uploaded_b TEXT NOT NULL,
  uploaded_c TEXT,
  -- 分析を書いた言語（画面の表示言語）。
  locale TEXT NOT NULL,
  model TEXT NOT NULL,
  -- { summary, differences[], strengths[], cautions[], suggestions[] }（lib/brain-analysis.ts）。
  content JSONB NOT NULL,
  -- 送った数値の形の版（lib/brain-analysis.ts の COMPARISON_INPUT_VERSION）。
  input_version INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, combo),
  -- 外部キーは既定の MATCH SIMPLE：uploaded_c が NULL（2件の比較）なら c は確かめない。
  CONSTRAINT user_brain_comparisons_a FOREIGN KEY (user_id, uploaded_a)
    REFERENCES public.user_brain_measurements (user_id, uploaded_at) ON DELETE CASCADE,
  CONSTRAINT user_brain_comparisons_b FOREIGN KEY (user_id, uploaded_b)
    REFERENCES public.user_brain_measurements (user_id, uploaded_at) ON DELETE CASCADE,
  CONSTRAINT user_brain_comparisons_c FOREIGN KEY (user_id, uploaded_c)
    REFERENCES public.user_brain_measurements (user_id, uploaded_at) ON DELETE CASCADE,
  -- 古い順・重複なし。キーは toISOString の書式なので、バイト順（COLLATE "C"）＝時刻順。
  -- 同じ測定の組が並べ方の違いで2行にならないように。
  CONSTRAINT user_brain_comparisons_order CHECK (
    uploaded_a COLLATE "C" < uploaded_b
    AND (uploaded_c IS NULL OR uploaded_b COLLATE "C" < uploaded_c)
  ),
  CONSTRAINT user_brain_comparisons_combo CHECK (
    combo = uploaded_a || ' ' || uploaded_b || COALESCE(' ' || uploaded_c, '')
  ),
  CONSTRAINT user_brain_comparisons_locale CHECK (locale IN ('ja', 'en')),
  CONSTRAINT user_brain_comparisons_content CHECK (
    COALESCE(jsonb_typeof(content) = 'object', false) AND pg_column_size(content) <= 16384
  )
);

COMMENT ON TABLE public.user_brain_comparisons IS
  '「測定の比較」の AI 比較分析（比べた測定の組ごとに1行）。書くのは Edge Function analyze-brain（service_role）だけ。';

-- ── RLS ──
-- 読むのは本人（管理者は全員——003・006 と同じ。クライアントは必ず user_id で絞る）、
-- 消すのは本人。INSERT / UPDATE のポリシーは作らない（service_role は RLS を通らない）。
ALTER TABLE public.user_brain_comparisons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own comparisons" ON public.user_brain_comparisons;
CREATE POLICY "Users select own comparisons" ON public.user_brain_comparisons
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS "Users delete own comparisons" ON public.user_brain_comparisons;
CREATE POLICY "Users delete own comparisons" ON public.user_brain_comparisons
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

COMMIT;
