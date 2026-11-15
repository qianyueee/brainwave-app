# sync-partner（ホームの話し相手の窓口）

ホームの「Sync Partner」カード（シンク彼女・シンク彼氏・シンクペット）が呼ぶ Supabase Edge Function です。
画面から「どの役か・端末の時刻・気分・おすすめの候補・これまでの数往復・利用者のひと言」を受け取り、
プロンプトを組んで DeepSeek に問い合わせ、役の口調のひと言と、おすすめするプログラムの id を返します。

```json
{ "reply": "おはよう。…", "programId": "morning-tuning", "care": false, "remaining": 29 }
```

**会話はどこにも保存しません**（アカウントに残るのは1日の回数だけ）。DeepSeek の API キーは analyze-brain と
同じ `DEEPSEEK_API_KEY` を読みます——Secrets はプロジェクトで共用なので、新しく入れるものはありません。

このリポジトリには Supabase CLI の設定がないので、**Dashboard から手でデプロイ**します。

## 初回の手順

1. **SQL を流す** — Dashboard → SQL Editor で `supabase/migrations/008_partner_usage.sql` の中身を実行
   （表 `user_partner_usage` と関数 `claim_partner_message` ができる）。
2. **関数を作る** — Dashboard → Edge Functions →「Deploy a new function」→「Via Editor」。
   - 名前は **`sync-partner`**（画面はこの名前で呼ぶ）
   - エディタの中身を `index.ts` の全文で置き換えて Deploy
   - 関数の設定で **Verify JWT（JWT の検証）はオンのまま**
3. **Logs を確かめる** — `sync-partner` → Logs に `sync-partner: serving` が出れば待ち受けまで済んでいる。
4. **Web をデプロイ**（PR をマージ）。カードは初め**管理者にだけ**出ます。Android の APK・Windows の exe は
   作り直すとカードが出ます。

任意の Secrets（入れなければ analyze-brain と同じ設定で動く）：

- `PARTNER_MODEL` … この関数だけ別のモデルにする（既定は `DEEPSEEK_MODEL`、それも無ければ `deepseek-chat`）
- `PARTNER_API_URL`・`PARTNER_API_KEY` … DeepSeek 以外の OpenAI 互換の `chat/completions` に替えるとき

`SUPABASE_URL`・`SUPABASE_ANON_KEY`・`SUPABASE_SERVICE_ROLE_KEY` は Supabase が自動で渡します（新しい形式の
`sb_secret_…` キーでも動く。analyze-brain の README と同じ）。

順番を前後しても壊れません。008 か関数がまだ無い間、カードは用意してある決まった台詞で話します。

## 役の口調を変えるとき

`index.ts` の `PERSONAS` の、その役の文（日本語と英語）だけを書き換えて、全文を貼り直して Deploy。
3つの役に共通の決まり（長さ・医療ではない・恋愛の言葉を使わない…）は `commonRules`、時間帯ごとの
出だし（朝のあいさつと星のおすすめ・午後は気分を聞く・帰宅後の「おかえり」・22時からは眠り）は
`slotInstruction`。役の「例」にはプログラムの名前を入れない——入れると AI がそのプログラムばかり勧める
（`pnpm check:partner` が見張っている）。

## 更新するとき

**GitHub で PR をマージしても、この関数は変わりません**（変わるのは Web だけ）。`index.ts` を直したら、
Dashboard → Edge Functions → `sync-partner` → **Code** のエディタで中身を全部選んで消し、**全文を貼り直して
Deploy**。いちばん下に `Deno.serve(...)` と `console.log("sync-partner: serving")` があることを確かめてから
Deploy し、Logs に `sync-partner: serving` が出るのを確かめる。

関数の中の目録（`CATALOG`・星座の表）はアプリの目録（`lib/programs.ts`・`lib/zodiac.ts`）の写しです。
目録を変えたら `pnpm check:partner` が食い違いを表示するので、そのとおりに直して貼り直します。
画面が送る形（`lib/partner.ts` の `PartnerInput`）を変えたときは、こちらの `validateInput` も同じに直し、
両方の版（`PARTNER_INPUT_VERSION` / `INPUT_VERSION`）を上げて `pnpm check:partner`。

## 決まりごと

- **受け取るのは決まった語彙と数**、それに利用者のひと言（200 字まで）と直前の会話（6 つ・各 400 字まで）
  だけ。プロンプトはこの関数が組み、利用者の言葉は json の値としてだけ渡します（指示として読ませない）。
  プログラムの名前も画面からは受け取らず、id からこの関数の表で引きます。
- **勧められるのは**、画面の決まりが選んだ候補（最大 3 件。朝は星空カードと同じ今日の星のプログラム）と、
  目録のデフォルト・Target・Energy（59 件）。AI が知らない id を返したら、返事に名前が出ているプログラム、
  それも無ければ候補の先頭に置き換えます。返事の文が名前を1つだけ挙げているのに id が違えば、文のほうに
  合わせます（カードに出るプログラムが文と食い違わないように）。
- **つらい気持ち**：「死にたい」などはっきりした言葉には AI に聞かず、決まった文（よりそいホットライン
  0120-279-338、24時間・無料）で答え、回数にも数えません。窓口や番号を変えるときは `CARE_REPLY`。
  遠回しな言い方は拾えないので、プロンプトでも同じことを頼んであります。
- **回数**：1人1日（日本時間）30 回。開口一番のひと言も1回。2 秒以内の連投は断ります。DeepSeek に
  問い合わせる前に数えるので、失敗した回も1回です。AI 分析の 1日 20 回とは別に数えます。
- **返事の長さ**：日本語は約 90 字（英語は約 45 語）と頼み、160 字（英語 400 字）を超えた分は文の
  終わりで切ります。
- **会話は残さない**：保存もしないし、Logs にも利用者の言葉は出しません。

## うまく動かないとき（Logs の見方）

Dashboard → Edge Functions → `sync-partner` → **Logs**（呼ばれた記録は Invocations）。

| Logs / Invocations に出るもの | 意味 | すること |
|---|---|---|
| `booted` の後に `sync-partner: serving` が**出ない** | 関数は起動したが待ち受けていない（途中までしか貼れていない） | `index.ts` を**全文**貼り直し、最後の行まであるのを確かめて Deploy |
| POST が **503** | 008 を流していない、または Secrets に DeepSeek のキーが無い | 008 を実行する。AI 分析が動いていればキーはある |
| POST が **401** | ログインのトークンを受け付けていない | ログインし直す。続くなら Verify JWT をオフにしてよい（関数自身が `/auth/v1/user` で本人確認する） |
| `deepseek 401` / `deepseek 402` など | DeepSeek に断られた（キーの誤り・残高不足） | Secrets の `DEEPSEEK_API_KEY`・DeepSeek の残高を確かめる |
| `sync-partner: unreadable reply` | DeepSeek の返事を読めなかった | 続くならモデルの設定（`PARTNER_MODEL`・`DEEPSEEK_MODEL`）を確かめる |
| `sync-partner: unexpected error` と例外の中身 | 関数の中で想定外の失敗 | その行をそのまま開発者へ |

## 返すエラー

| error | HTTP | 画面 |
|---|---|---|
| `not_configured` | 503（関数が無いときは 404） | 決まった台詞で話す |
| `unauthorized` | 401 | 決まった台詞で話す（ログインし直すと AI に戻る） |
| `bad_input` | 400 / 405 | 決まった台詞で話す |
| `daily_limit` | 429 | 「今日はここまで」の決まった台詞。入力欄を閉じる（明日また話せる） |
| `too_fast` | 429 | 少し待ってから送り直す |
| `upstream` | 502（想定外の例外は 500） | 決まった台詞で話す |

失敗には受け付ける本文の版 `"v"` が付きます（例：`{"error": "daily_limit", "v": 1}`）。
