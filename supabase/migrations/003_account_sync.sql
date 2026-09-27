-- ============================================================
-- Migration: アカウント同期を「1記録1行」にする（脳波測定・10秒チェック）
-- ============================================================
--
-- 002 の user_brain_profile は「1ユーザー1行・全履歴を JSONB 1個」で、書き込みの
-- たびに配列を丸ごと置き換える。書き手が Web だけのうちは成り立っていたが、
-- デスクトップ測定アプリがログインして自動保存するようになると書き手が2つになり、
-- 古い配列を持った側の書き込みが、もう一方が足したばかりの記録を消す。
-- そこで1記録1行に分ける——各書き込みは自分の行しか触らないので、並行しても
-- 互いを消さない。10秒チェックも同じ理由で同じ形にする。
--
-- 適用順：このファイルを SQL Editor で実行し、続けて Web をデプロイする。
-- 実行〜デプロイの間、古い Web は脳波測定を保存できない（旧表への書き込みを
-- 止めるため。下の 3 参照）——エラーになるだけで、再読み込み後にやり直せる。
-- 何度実行しても安全（IF NOT EXISTS / DROP ... IF EXISTS / ON CONFLICT DO NOTHING）。

BEGIN;

-- ============================================================
-- 1. user_brain_measurements（脳波測定。1測定1行）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_brain_measurements (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- BrainProfile.uploadedAt（toISOString() 形式の ISO 8601）。記録の同一性キーで、
  -- 削除・メモ編集・再取り込みの重複排除はすべてこれで引く。timestamptz にしない
  -- のは、クライアントが文字列の完全一致で照合しているから（型を変えると返る表記が
  -- 変わって一致しなくなる）。書式が揃っているので辞書順＝時刻順。
  uploaded_at TEXT NOT NULL,
  -- BrainProfile そのもの（indicators / bands / spectrum / note / subject …）。
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, uploaded_at),
  -- キーと中身の食い違い（壊れたクライアント）を入口で止める。CHECK は式が NULL だと
  -- 通ってしまうので、キーや indicators が欠けた行も COALESCE で false にして弾く。
  CONSTRAINT user_brain_measurements_key_matches
    CHECK (COALESCE(data ->> 'uploadedAt' = uploaded_at, false)),
  CONSTRAINT user_brain_measurements_has_indicators
    CHECK (COALESCE(jsonb_typeof(data -> 'indicators') = 'object', false))
);

DROP TRIGGER IF EXISTS trg_user_brain_measurements_updated_at ON public.user_brain_measurements;
CREATE TRIGGER trg_user_brain_measurements_updated_at
  BEFORE UPDATE ON public.user_brain_measurements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 2. user_baseline_checks（10秒チェック。1回1行）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_baseline_checks (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- BaselineCheck.id（端末側で採番。HTTP 環境では UUID でないこともある）。
  id TEXT NOT NULL,
  -- BaselineCheck.recordedAt。並べ替え・集計用で、表示は data 側の値を使う。
  recorded_at TIMESTAMPTZ NOT NULL,
  -- BaselineCheck そのもの（端末ローカルの保存状態 `cloud` は含めない）。
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  CONSTRAINT user_baseline_checks_key_matches CHECK (COALESCE(data ->> 'id' = id, false))
);

DROP TRIGGER IF EXISTS trg_user_baseline_checks_updated_at ON public.user_baseline_checks;
CREATE TRIGGER trg_user_baseline_checks_updated_at
  BEFORE UPDATE ON public.user_baseline_checks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS（2表共通） ──
-- upsert（INSERT ... ON CONFLICT DO UPDATE）には SELECT・INSERT・UPDATE の3つが
-- 揃って要る。管理者は全員の行を読める（002 と同じ）ので、クライアントの一覧取得は
-- 必ず user_id で絞る。auth.uid() を SELECT で包むのは行ごとの再評価を避けるため。
ALTER TABLE public.user_brain_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_baseline_checks ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_brain_measurements', 'user_baseline_checks'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Users select own rows" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Users select own rows" ON public.%I FOR SELECT TO authenticated '
      'USING (user_id = (SELECT auth.uid()) OR public.is_admin())', t);
    EXECUTE format('DROP POLICY IF EXISTS "Users insert own rows" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Users insert own rows" ON public.%I FOR INSERT TO authenticated '
      'WITH CHECK (user_id = (SELECT auth.uid()))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Users update own rows" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Users update own rows" ON public.%I FOR UPDATE TO authenticated '
      'USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()))', t);
    EXECUTE format('DROP POLICY IF EXISTS "Users delete own rows" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Users delete own rows" ON public.%I FOR DELETE TO authenticated '
      'USING (user_id = (SELECT auth.uid()))', t);
  END LOOP;
END $$;

-- ============================================================
-- 3. 既存データの移し替え（user_brain_profile → 1測定1行）
-- ============================================================
-- data は現行の BrainProfile[] のほか、初期の「単体オブジェクト」の行もある
-- （lib/brain-measurements.ts の normalizeMeasurements と同じ許容範囲）。
-- indicators を持つ要素だけを記録とみなす。uploadedAt が無い要素は行の更新時刻で
-- 補い、同じ uploadedAt が配列内で重複していたら後ろ（＝後から書かれた方）を採る。
WITH legacy AS (
  SELECT
    p.user_id,
    p.updated_at,
    e.item,
    e.ord
  FROM public.user_brain_profile p
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE jsonb_typeof(p.data)
      WHEN 'array' THEN p.data
      WHEN 'object' THEN jsonb_build_array(p.data)
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY AS e(item, ord)
  WHERE jsonb_typeof(e.item) = 'object'
    AND jsonb_typeof(e.item -> 'indicators') = 'object'
),
keyed AS (
  SELECT
    user_id,
    COALESCE(
      NULLIF(item ->> 'uploadedAt', ''),
      to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ) AS uploaded_at,
    item,
    ord
  FROM legacy
)
INSERT INTO public.user_brain_measurements (user_id, uploaded_at, data)
SELECT DISTINCT ON (user_id, uploaded_at)
  user_id,
  uploaded_at,
  jsonb_set(item, '{uploadedAt}', to_jsonb(uploaded_at))
FROM keyed
ORDER BY user_id, uploaded_at, ord DESC
ON CONFLICT (user_id, uploaded_at) DO NOTHING;

-- 旧表は「読み取りと削除だけ」のバックアップにする。開いたままの古い画面が
-- 配列を丸ごと旧表へ書き続けると、その記録はもうどこにも表示されない——黙って
-- 消えるより、保存エラーとして見える方がよい。削除は残す（脳特性の「すべて削除」が
-- 旧表の控えも消すため）。移行を確認できたら表ごと DROP してよい。
DROP POLICY IF EXISTS "Users insert own brain profile" ON public.user_brain_profile;
DROP POLICY IF EXISTS "Users update own brain profile" ON public.user_brain_profile;
COMMENT ON TABLE public.user_brain_profile IS
  '003 以降は未使用（user_brain_measurements へ移行済みのバックアップ。読み取りと削除のみ）。';

COMMIT;

-- ── 確認用：旧表の件数と移した行数（row_count が legacy_count より少ないのは
--    重複・壊れた要素を落とした分） ──
SELECT
  p.user_id,
  CASE jsonb_typeof(p.data)
    WHEN 'array' THEN jsonb_array_length(p.data)
    WHEN 'object' THEN 1
    ELSE 0
  END AS legacy_count,
  (SELECT count(*) FROM public.user_brain_measurements m WHERE m.user_id = p.user_id) AS row_count
FROM public.user_brain_profile p
ORDER BY p.user_id;
