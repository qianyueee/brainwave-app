# analyze-brain（AI 分析の窓口）

Sync Report の「AIで分析する」（大脳特性の下）と「AIで比較分析する」（「測定の比較」で2〜3件を
選んだとき）が呼ぶ Supabase Edge Function です。画面から測定の**数値だけ**を受け取り、DeepSeek に
問い合わせて、結果を `user_brain_analyses`（比較分析は `user_brain_comparisons`）に保存して返します。
2つの依頼は本文の `kind` で見分けます（比較分析だけ `"kind": "compare"`）。DeepSeek の API キーはこの関数の Secrets にだけ置きます（画面側に置くと
誰にでも見えてしまうため）。

このリポジトリには Supabase CLI の設定がないので、**Dashboard から手でデプロイ**します。

## 初回の手順

1. **SQL を流す** — Dashboard → SQL Editor で `supabase/migrations/006_brain_analyses.sql`、
   続けて `007_brain_comparisons.sql` の中身を実行（表 `user_brain_analyses`・`user_ai_usage`・
   `user_brain_comparisons` と関数 `claim_ai_analysis` ができる）。
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

## 比較分析を足すとき（006 まで済んでいる場合）

1. **SQL を流す** — SQL Editor で `supabase/migrations/007_brain_comparisons.sql` を実行
   （表 `user_brain_comparisons` ができる）。
2. **関数を更新する** — 下の「更新するとき」のとおり `index.ts` を**全文**貼り直して Deploy。
   Secrets は増えません。

どちらを先にしても壊れません。両方済むまでは比較分析のボタンが「準備中」と表示するだけで、
1件の分析はそのまま使えます。Android の APK・Windows の exe は作り直すとボタンが出ます。

## 更新するとき

**GitHub で PR をマージしても、この関数は変わりません**（変わるのは Web だけ）。
`index.ts` を直したら、Dashboard → Edge Functions → `analyze-brain` → **Code** のエディタで
中身を全部選んで消し、**`index.ts` の全文を貼り直して Deploy**。貼り終えたら、エディタの
いちばん下に `Deno.serve(...)` と `console.log("analyze-brain: serving")` があることを
確かめてから Deploy する（途中までしか貼れていないと、起動はしても何も答えない）。
Deploy したら Logs に `analyze-brain: serving` が出ることを確かめる。
送る数値の形（`lib/brain-analysis.ts` の `BrainAnalysisInput`）を変えたときは、
こちらの `validateInput` も同じに直し、両方の版（`ANALYSIS_INPUT_VERSION` / `INPUT_VERSION`）を上げます。
比較分析の形（`BrainComparisonInput`）なら `validateCompareInput` と
`COMPARISON_INPUT_VERSION` / `COMPARE_INPUT_VERSION`。
直したら `pnpm check:analysis` で確かめます（node でこのファイルの検査・プロンプト・流れを通す）。

## 決まりごと

- **受け取るのは数値だけ**。形を厳密に確かめ、プロンプトはこの関数が組みます——文章を受け取ると、
  ログインした人なら誰でも DeepSeek を自由に使える窓口になってしまうため。メモ・測定者名は受け取りません。
- **保存はこの関数だけ**（service_role）。利用者は自分の分析を読む・消すことしかできません。
  測定を消すと分析も一緒に消えます（外部キーの ON DELETE CASCADE）。比較分析は、比べた測定の
  どれか1件を消すとその組の分析が消えます。
- **比較分析は、比べる測定がすべてアカウントに保存済みのときだけ**（まだなら `not_saved`）。
  比べる組は古い順に並べて1行にするので、同じ測定の組を選び直せば、選んだ順番や端末が違っても
  同じ分析が出ます。
- **回数の上限**：1人1日（日本時間）20回で、1件の分析と比較分析の合計。同じ測定（比較分析は同じ組）
  の分析し直しは 30 秒あける。DeepSeek に問い合わせる前に数えるので、失敗した回も1回と数えます。

## うまく動かないとき（Logs の見方）

Dashboard → Edge Functions → `analyze-brain` → **Logs**（呼ばれた記録は Invocations）。

| Logs / Invocations に出るもの | 意味 | すること |
|---|---|---|
| `booted` の後に `analyze-brain: serving` が**出ない**、OPTIONS が 150 秒かかって **546** | 関数は起動したが待ち受けていない（古い `index.ts` のまま、または途中までしか貼れていない） | 最新の `index.ts` を**全文**貼り直し、最後の行まであるのを確かめて Deploy |
| POST が **401** | ログインのトークンを受け付けていない | ログインし直す。続くなら Verify JWT をオフにしてよい（関数自身が `/auth/v1/user` で本人確認する） |
| `analyze-brain: unexpected error` と例外の中身 | 関数の中で想定外の失敗 | その行をそのまま開発者へ |
| 1件の分析は動くのに、比較分析のボタンだけ「準備中」 | 007 を流していない、または関数が比較分析より前の `index.ts` のまま | 007 を実行し、`index.ts` を全文貼り直して Deploy |
| `deepseek 401` / `deepseek 402` など | DeepSeek に断られた（キーの誤り・残高不足） | Secrets の `DEEPSEEK_API_KEY`・DeepSeek の残高を確かめる |

画面の「AIの窓口から応答がありませんでした」は、返事を読めなかった（オンラインなのに関数が答えない・
実行環境に打ち切られた）ときの表示。上の表で原因を探す。

**待ち受けはトップレベルで素の `Deno.serve(...)` を呼ぶ**（`typeof Deno` で囲むだけ）——Supabase の
文書どおりの書き方で、`pnpm check:analysis` が見張っている。上の表の「OPTIONS が 546」は実際に
起きたが、原因は関数がこのファイルの最新・全文になっていなかったことで、全文を貼り直したら直った。

## 返すエラー

| error | HTTP | 画面の表示 |
|---|---|---|
| `not_configured` | 503（関数が無いときは 404。比較分析は 007 が無いときも） | 準備中 |
| `unauthorized` | 401 | ログインし直してください |
| `bad_input` | 400 | 通信エラー（アプリの更新を促す） |
| `not_saved` | 409 | まだアカウントに保存されていない |
| `rate_limited` | 429 | しばらくしてから |
| `upstream` | 502（想定外の例外は 500） | AI に届かなかった・読めない返事 |
| （返事を読めない） | — | オフラインなら `network`（接続を確かめて）、オンラインなら `unreachable`（窓口が応答しない） |

比較分析の失敗には `"kind": "compare"` が付きます（例：`{"error": "not_saved", "kind": "compare"}`）。
比較分析を知らない古い関数は、比較の依頼を（見知らぬ項目 `kind` があるので）kind の無い `bad_input` で
断ります。画面はそれを「準備中」と読むので、関数を貼り直す前に Web が出ても「アプリが古い」とは言いません。
