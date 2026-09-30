# analyze-brain（AI 分析の窓口）

Sync Report の大脳特性の下にある「AIで分析する」ボタンが呼ぶ Supabase Edge Function です。
画面から測定の**数値だけ**を受け取り、DeepSeek に問い合わせて、結果を `user_brain_analyses`
に保存して返します。DeepSeek の API キーはこの関数の Secrets にだけ置きます（画面側に置くと
誰にでも見えてしまうため）。

このリポジトリには Supabase CLI の設定がないので、**Dashboard から手でデプロイ**します。

## 初回の手順

1. **SQL を流す** — Dashboard → SQL Editor で `supabase/migrations/006_brain_analyses.sql`
   の中身を実行（表 `user_brain_analyses`・`user_ai_usage` と関数 `claim_ai_analysis` ができる）。
2. **関数を作る** — Dashboard → Edge Functions → 「Deploy a new function」→「Via Editor」。
   - 名前は **`analyze-brain`**（画面はこの名前で呼ぶ）
   - エディタの中身を `index.ts` の全文で置き換えて Deploy
   - 関数の設定で **Verify JWT（JWT の検証）はオンのまま**
3. **API キーを入れる** — Dashboard → Edge Functions → Secrets（Manage secrets）で追加：
   - `DEEPSEEK_API_KEY` … DeepSeek の API キー（必須）
   - `DEEPSEEK_MODEL` … 使うモデル（任意。既定は `deepseek-chat`）
4. **Web をデプロイ**（Android の APK・Windows の exe は作り直すとボタンが出る）。

`SUPABASE_URL`・`SUPABASE_ANON_KEY`・`SUPABASE_SERVICE_ROLE_KEY` は Supabase が自動で渡すので
設定は要りません。プロジェクトで従来のキー（anon / service_role）を無効にしている場合だけ、
Secrets に同じ名前で新しい publishable key（`sb_publishable_…`）と secret key（`sb_secret_…`）
を入れてください。

順番を前後しても壊れません。Web が先に出ると、ボタンは「準備中」と表示するだけです。

## 更新するとき

`index.ts` を直したら、Dashboard → Edge Functions → `analyze-brain` → **Code** のエディタに
**全文を貼り直して Deploy**（Web のデプロイとは別。貼り直さない限り古い関数が動き続ける）。
Deploy したら Logs に `analyze-brain: serving` が出ることを確かめる。
送る数値の形（`lib/brain-analysis.ts` の `BrainAnalysisInput`）を変えたときは、
こちらの `validateInput` も同じに直し、両方の版（`ANALYSIS_INPUT_VERSION` / `INPUT_VERSION`）を上げます。
直したら `pnpm check:analysis` で確かめます（node でこのファイルの検査・プロンプト・流れを通す）。

## 決まりごと

- **受け取るのは数値だけ**。形を厳密に確かめ、プロンプトはこの関数が組みます——文章を受け取ると、
  ログインした人なら誰でも DeepSeek を自由に使える窓口になってしまうため。メモ・測定者名は受け取りません。
- **保存はこの関数だけ**（service_role）。利用者は自分の分析を読む・消すことしかできません。
  測定を消すと分析も一緒に消えます（外部キーの ON DELETE CASCADE）。
- **回数の上限**：1人1日（日本時間）20回、同じ測定の分析し直しは 30 秒あける。
  DeepSeek に問い合わせる前に数えるので、失敗した回も1回と数えます。

## うまく動かないとき（Logs の見方）

Dashboard → Edge Functions → `analyze-brain` → **Logs**（呼ばれた記録は Invocations）。

| Logs / Invocations に出るもの | 意味 | すること |
|---|---|---|
| `booted` の後に `analyze-brain: serving` が**出ない**、OPTIONS が 150 秒かかって **546** | 関数は起動したが待ち受けていない（古い `index.ts` のまま） | 最新の `index.ts` を貼り直して Deploy |
| POST が **401** | ログインのトークンを受け付けていない | ログインし直す。続くなら Verify JWT をオフにしてよい（関数自身が `/auth/v1/user` で本人確認する） |
| `analyze-brain: unexpected error` と例外の中身 | 関数の中で想定外の失敗 | その行をそのまま開発者へ |
| `deepseek 401` / `deepseek 402` など | DeepSeek に断られた（キーの誤り・残高不足） | Secrets の `DEEPSEEK_API_KEY`・DeepSeek の残高を確かめる |

画面の「AIの窓口から応答がありませんでした」は、返事を読めなかった（オンラインなのに関数が答えない・
実行環境に打ち切られた）ときの表示。上の表で原因を探す。

⚠ **待ち受けはトップレベルで素の `Deno.serve(...)` を呼ぶ**（`typeof Deno` で囲むだけ）。
`globalThis` 経由で呼ぶと、Supabase の実行環境では起動はしても待ち受けが登録されない（実際に起きた）。
`pnpm check:analysis` がこの書き方を見張っている。

## 返すエラー

| error | HTTP | 画面の表示 |
|---|---|---|
| `not_configured` | 503（関数が無いときは 404） | 準備中 |
| `unauthorized` | 401 | ログインし直してください |
| `bad_input` | 400 | 通信エラー（アプリの更新を促す） |
| `not_saved` | 409 | まだアカウントに保存されていない |
| `rate_limited` | 429 | しばらくしてから |
| `upstream` | 502（想定外の例外は 500） | AI に届かなかった・読めない返事 |
| （返事を読めない） | — | オフラインなら `network`（接続を確かめて）、オンラインなら `unreachable`（窓口が応答しない） |
