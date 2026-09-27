-- ============================================================
-- Migration: Sync Tree（育樹）の出来事を1件1行で残す
-- ============================================================
--
-- 木の「状態」は保存しない。水やり・リスニング・植え替えの**出来事**を1件1行で
-- 残し、画面（lib/sync-tree.ts の foldTreeEvents）がそれを畳んで「いまの木」と
-- 「育てた木」を出す。木はログイン中だけの機能で、データはこの表にだけ置く
-- （端末には持たない）。
--
-- 1日の上限はキーの形で守る（003 が「1記録1行」にしたのと同じ考え方——書き手が
-- 複数の端末にいても、互いの行を上書きしない）：
--   water:YYYY-MM-DD           … 水やり。日付で決め打ちなので1日1行にしかならない
--   listen:YYYY-MM-DD:<乱数>   … プログラムを5分聴いた。端末ごとに聴いた分がどれも残る
--                                よう乱数入り。1日 +5（2+2+1）の上限は画面側で数える
--   replant:YYYY-MM-DD         … 完成した木を記録して植え替えた（1日1行）
-- 別の端末が同じ日に水やりしても同じキーなので、2行目は ON CONFLICT DO NOTHING で
-- 捨てられる（二重に育たない）。点数は持たない——ルールは lib/sync-tree.ts にある。
--
-- 行は書いたら変えない（UPDATE/DELETE のポリシーは作らない）。
--
-- 適用順：このファイルを SQL Editor で実行してから Web をデプロイする。先に Web が
-- 出ても、/tree が「読み込めませんでした」になるだけで、ほかの機能には響かない。
-- 何度実行しても安全（IF NOT EXISTS / DROP ... IF EXISTS）。

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_tree_events (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 上の3つの形のどれか。user_id と組で主キー。
  id TEXT NOT NULL,
  kind TEXT NOT NULL,
  -- その出来事を数えるローカル暦日（端末の日付）。1日の上限はこの日で数える。
  day DATE NOT NULL,
  -- 起きた時刻。木を畳む順番（植え替えの前か後か）はこれで決まる。
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id),
  CONSTRAINT user_tree_events_kind CHECK (kind IN ('water', 'listen', 'replant')),
  -- キーの形と日付の食い違い（壊れたクライアント）を入口で止める。これで
  -- 水やりは1日1行・植え替えは1日1行から外れようがない。
  CONSTRAINT user_tree_events_id_shape CHECK (
    CASE kind
      WHEN 'listen' THEN
        id LIKE 'listen:' || to_char(day, 'YYYY-MM-DD') || ':_%' AND length(id) <= 64
      ELSE
        id = kind || ':' || to_char(day, 'YYYY-MM-DD')
    END
  )
);

COMMENT ON TABLE public.user_tree_events IS
  'Sync Tree の出来事（水やり・リスニング・植え替え）。1件1行・追記のみ。状態は lib/sync-tree.ts が畳んで出す。';

-- ── RLS ──
-- 読むのは本人（管理者は全員——003 と同じ。クライアントは必ず user_id で絞る）、
-- 書くのは本人の行だけ。INSERT ... ON CONFLICT DO NOTHING は INSERT ポリシーだけで
-- 通る（UPDATE が要るのは DO UPDATE のとき）。auth.uid() を SELECT で包むのは
-- 行ごとの再評価を避けるため。
ALTER TABLE public.user_tree_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own tree events" ON public.user_tree_events;
CREATE POLICY "Users select own tree events" ON public.user_tree_events
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS "Users insert own tree events" ON public.user_tree_events;
CREATE POLICY "Users insert own tree events" ON public.user_tree_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

COMMIT;
