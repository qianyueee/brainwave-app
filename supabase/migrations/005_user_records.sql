-- ============================================================
-- Migration: 端末ごとに分かれていた小さな記録を、アカウントで1つにする
-- ============================================================
--
-- Web・Android アプリ・Windows アプリのどれで開いても同じ記録が見えるように、
-- これまで端末（ブラウザの保存領域）の中にしか無かった記録をアカウントに置く：
--   journal:YYYY-MM-DD   … その日の振り返り（1日1件。書き直すと上書き）
--   playback:<id>        … 再生の記録（1回1行。ヒストリーのカレンダーと統計）
--   self_rating:latest   … 感コンディション（いちばん新しい1件だけ）
--   subject:<名前>       … 測定者（名前で1行。どの端末の「自分」も同じ1行になる）
--   setting:zodiac       … マイ星座
-- どれも小さく、本人しか読まず、サーバで集計もしない記録なので、種類ごとに表を
-- 作らず1つの表に kind で並べる。中身は data（jsonb）。
--
-- 同期のきまり（クライアントは lib/sync/records.ts と store/useUserRecordsStore.ts）：
-- - **新しい方が勝つ**（last-writer-wins）。どの端末もふつうに upsert するだけでよく、
--   下のトリガが「いまの行より古い書き込み」を捨てる。比べるのは、その記録を
--   書き換えた端末の時刻 updated_at。未来の時刻は now()+5分に丸める——時計の狂った
--   端末がこの先ずっと勝ち続けないように。
-- - **消すときも行は消さず deleted = true にする**（DELETE のポリシーは作らない）。
--   消した事実が行として残るので、オフラインだった別の端末にも届き、その端末が
--   古い記録を送り直しても（古いので）復活しない。中身は空（{}）で送るので、消した
--   振り返りの本文はアカウントに残らない。
--
-- 確かめ方（SQL Editor。自分の uid で）：同じ id に updated_at を 10:00 → 11:00 → 09:00 の
-- 順で upsert すると、中身は 11:00 のまま（09:00 の書き込みは捨てられる）。
--
-- 適用順：このファイルを SQL Editor で実行してから Web をデプロイする。先に Web が
-- 出ても、送信が失敗して端末に残り、あとで送り直すだけ（記録は失われない）。
-- 何度実行しても安全（IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS）。

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_records (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 種類を頭に付けたキー（上の5つの形）。user_id と組で主キー。
  id TEXT NOT NULL,
  kind TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted BOOLEAN NOT NULL DEFAULT false,
  -- 端末でその記録を書き換えた時刻。「新しい方が勝つ」はこれで比べる。
  updated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  -- 種類は名前の形だけ決める（一覧で縛らない）：新しい種類を足すたびに SQL を先に流す
  -- 必要が無いように。知らない種類はクライアントが読むときに無視する。
  CONSTRAINT user_records_kind CHECK (kind ~ '^[a-z_]{1,32}$'),
  -- キーは「種類:中身」。種類とキーの頭の食い違い（壊れたクライアント）を入口で止める。
  CONSTRAINT user_records_id_shape CHECK (
    left(id, length(kind) + 1) = kind || ':'
    AND length(id) > length(kind) + 1
    AND length(id) <= 128
  ),
  CONSTRAINT user_records_data_object CHECK (jsonb_typeof(data) = 'object'),
  -- 1件が大きくなりすぎない（振り返りの本文でも数 KB）。
  CONSTRAINT user_records_data_size CHECK (pg_column_size(data) <= 16384)
);

COMMENT ON TABLE public.user_records IS
  '端末をまたいで同じにする小さな記録（振り返り・再生の記録・感コンディション・測定者・マイ星座）。新しい方が勝つ・削除は deleted。';

-- ── 新しい方が勝つ ──
-- UPDATE で届いた書き込みが、いまの行より古ければ捨てる（NULL を返すとその行の
-- 更新は行われない。INSERT ... ON CONFLICT DO UPDATE もここを通る）。同じ時刻は
-- 受け入れる（同じ内容の送り直し）。
CREATE OR REPLACE FUNCTION public.user_records_keep_newer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.updated_at > now() + interval '5 minutes' THEN
    NEW.updated_at := now() + interval '5 minutes';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.updated_at < OLD.updated_at THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_user_records_keep_newer ON public.user_records;
CREATE TRIGGER trg_user_records_keep_newer
  BEFORE INSERT OR UPDATE ON public.user_records
  FOR EACH ROW EXECUTE FUNCTION public.user_records_keep_newer();

-- ── RLS ──
-- 読むのも書くのも本人の行だけ（振り返りは個人的な記録なので、管理者にも読ませない）。
-- upsert（INSERT ... ON CONFLICT DO UPDATE）には SELECT・INSERT・UPDATE の3つが要る。
-- DELETE は作らない（上のとおり削除は deleted = true）。auth.uid() を SELECT で包むのは
-- 行ごとの再評価を避けるため（003・004 と同じ）。
ALTER TABLE public.user_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own records" ON public.user_records;
CREATE POLICY "Users select own records" ON public.user_records
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users insert own records" ON public.user_records;
CREATE POLICY "Users insert own records" ON public.user_records
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users update own records" ON public.user_records;
CREATE POLICY "Users update own records" ON public.user_records
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

COMMIT;
