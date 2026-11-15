-- ============================================================
-- Migration: Sync Partner（ホームの話し相手）の1日の回数
-- ============================================================
--
-- ホームの「Sync Partner」カード（シンク彼女・シンク彼氏・シンクペット）の返事は
-- Edge Function `sync-partner`（supabase/functions/sync-partner）が DeepSeek に書かせる。
-- ここにあるのは、その利用料の上限を守るための回数だけ——会話の中身はどこにも
-- 保存しない。
--
--   user_partner_usage       … 1人1日（日本時間）の回数と、最後に数えた時刻。
--   claim_partner_message()  … 1回ぶん数える。呼べるのは service_role（関数）だけ。
--
-- AI 分析の回数（006 の user_ai_usage）とは別に数える——話し相手と話したせいで分析が
-- できなくなることも、その逆も無い。
--
-- 適用順：このファイルを SQL Editor で実行 → Edge Function sync-partner をデプロイ
-- （supabase/functions/sync-partner/README.md。Secrets は増えない）→ Web をデプロイ。
-- 先に Web が出ても、カードが決まった台詞で話すだけ。
-- 何度実行しても安全（IF NOT EXISTS / OR REPLACE）。

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_partner_usage (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 日本時間の暦日。
  day DATE NOT NULL,
  count INT NOT NULL DEFAULT 0,
  -- 最後に数えた時刻（連投よけ）。
  last_at TIMESTAMPTZ NOT NULL DEFAULT 'epoch',
  PRIMARY KEY (user_id, day)
);

COMMENT ON TABLE public.user_partner_usage IS
  'Sync Partner（ホームの話し相手）の1人1日の回数。claim_partner_message() だけが数える。';

-- ポリシーは作らない＝クライアントからは読めも書けもしない。
ALTER TABLE public.user_partner_usage ENABLE ROW LEVEL SECURITY;

-- 数えるのは Edge Function（service_role）。プロジェクトの既定で付く権限に頼らず、
-- 要るものをここで付けておく（RLS は service_role を通す）。
GRANT SELECT, INSERT, UPDATE ON public.user_partner_usage TO service_role;

-- 1回ぶん数えて、数えた後のその日の回数（1〜）を返す。数えなかったときは
--    0 … その日の上限（p_limit）に届いている
--   -1 … 前の1回から p_min_gap_ms ミリ秒たっていない（二度押し・連打）
-- その日の行を FOR UPDATE で押さえてから数えるので、同時に呼ばれても上限を超えない。
CREATE OR REPLACE FUNCTION public.claim_partner_message(p_user_id UUID, p_limit INT, p_min_gap_ms INT)
RETURNS INT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_day DATE := (now() AT TIME ZONE 'Asia/Tokyo')::date;
  v_count INT;
  v_last TIMESTAMPTZ;
BEGIN
  INSERT INTO public.user_partner_usage (user_id, day)
  VALUES (p_user_id, v_day)
  ON CONFLICT (user_id, day) DO NOTHING;

  SELECT u.count, u.last_at INTO v_count, v_last
  FROM public.user_partner_usage AS u
  WHERE u.user_id = p_user_id AND u.day = v_day
  FOR UPDATE;

  IF v_count >= p_limit THEN
    RETURN 0;
  END IF;
  -- 待たされた呼び出しも正しく測れるよう、取引の開始時刻（now）ではなくいまの時刻で比べる。
  IF clock_timestamp() - v_last < p_min_gap_ms * INTERVAL '1 millisecond' THEN
    RETURN -1;
  END IF;

  UPDATE public.user_partner_usage AS u
  SET count = v_count + 1, last_at = clock_timestamp()
  WHERE u.user_id = p_user_id AND u.day = v_day;
  RETURN v_count + 1;
END;
$$;

-- Supabase は public の関数に anon / authenticated の実行権を付けて作る。
-- p_user_id を好きに渡せると他人の回数を使い切れるので、service_role だけに絞る。
REVOKE ALL ON FUNCTION public.claim_partner_message(UUID, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_partner_message(UUID, INT, INT) TO service_role;

COMMIT;
