# NeuroSync Android アプリ

Web 版（GitHub Pages）と**同じ画面・同じ操作**の Android アプリです。中身は Web 版の
静的書き出しそのもの（[Capacitor](https://capacitorjs.com/) 8 で APK に入れている）なので、
画面を直せばアプリも同じに直ります。違うのは次の1点だけ：

- **Sync Brain が Bluetooth で BrainLink に直接つながる**（PC のブリッジが要らない）。
  Web 版の Sync Brain は今までどおり PC ブリッジ＋ペアリングコード。

```
Web 版:     BrainLink ──Bluetooth──> PC ブリッジ ──インターネット──> スマホのブラウザ（Sync Brain）
アプリ:     BrainLink ──Bluetooth（SPP）──> NeuroSync アプリ（読取・解析・表示・保存）
```

アプリは解析もブリッジと同じにしてあります（`lib/mind/thinkgear.ts` は
`bridge/thinkgear.py` の移植で、`pnpm check:thinkgear` が同じバイト列を両方に通して一致を
確かめる）。PC で測った記録とアプリで測った記録は、同じ物差しで比べられます。

ログインすると、記録（取り込んだ測定・10秒チェック・その日の振り返り・再生の記録・
感コンディション・測定者・マイ星座・Sync Tree）は**アカウントで Web 版・Windows アプリ
（`bridge/README.md`）と揃います**。どの端末で書いた記録も、ほかの端末で同じに見えます。

---

## ブラウザではなくアプリだから、裏でしていること

画面は同じでも、スマホの Chrome がしてくれていることを WebView は自分でしないので、
アプリの側で補っています（どれも画面の見た目は変えない）。

| Chrome がしていること | アプリでの補い方 |
|---|---|
| 再生中の通知・ロック画面の再生／一時停止、画面を消しても止まらない | 前面サービス（`NowPlayingService`）。着信・他アプリの再生で一時停止、イヤホンが抜けたら一時停止も Chrome と同じ |
| ダウンロード（WAV/MP3 の書き出し・プリセット） | 端末の「ダウンロード」フォルダへ保存して知らせる（`DownloadsPlugin`） |
| Google ログイン | Custom Tab で開き、アプリに戻す（PKCE。デスクトップ測定アプリと同じ仕組み） |
| ステータスバーの色（theme-color） | 時間帯のパレットに合わせて塗る |
| 端末の文字サイズ・ピンチで拡大 | 追従する・拡大できる |
| alert / confirm のボタンの言語 | 端末の言語（日本語なら「キャンセル」） |
| 戻るボタン＝履歴を戻る | 同じ。最初の画面では閉じずに裏へ（再生を止めない） |

音源（約300MB の曲）は APK に入れず、Web 版から取ります（スマホのブラウザと同じで、
初めて鳴らすときに通信が要る。通信が無くてもビートは鳴る）。

---

## 配布（APK を直接渡す）

### 1. 署名鍵を作る（最初に一度だけ）

**上書き更新は「同じ鍵で署名した APK」でしか通りません。** 鍵を失うと、利用者はアプリを
消して入れ直すしかなくなり、そのとき**端末の中だけにある記録（ログインしていない間の
10秒チェック・振り返り・測定一覧など）が消えます**。鍵とパスワードは必ず複数の場所に
保管してください。

```bash
keytool -genkeypair -v -keystore neurosync-release.jks -alias neurosync \
  -keyalg RSA -keysize 4096 -validity 36500
base64 -w0 neurosync-release.jks > neurosync-release.jks.b64   # macOS は base64 -i … -o …
```

GitHub のリポジトリ → Settings → Secrets and variables → Actions → **Secrets** に4つ登録：

| 名前 | 中身 |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `neurosync-release.jks.b64` の中身 |
| `ANDROID_KEYSTORE_PASSWORD` | keytool で決めたキーストアのパスワード |
| `ANDROID_KEY_ALIAS` | `neurosync`（上の `-alias`） |
| `ANDROID_KEY_PASSWORD` | 鍵のパスワード（聞かれなければキーストアと同じ） |

Supabase の URL / anon key は Web 版と同じ **Variables**（`NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY`）をそのまま使います。

### 2. Supabase に戻り先を登録する（最初に一度だけ）

Supabase ダッシュボード → Authentication → URL Configuration → **Redirect URLs** に追加：

```
io.github.qianyueee.neurosync://auth/callback
```

これが無いと、アプリの「Google でログイン」はブラウザで Web 版が開いてしまい、
アプリに戻ってきません（メール＋パスワードのログインは影響なし）。

アカウント同期の表（`supabase/migrations/` の 003〜005）は Web 版と共通です。まだ流して
いないものがあれば、APK を配る前に SQL Editor で番号順に実行し、Web 版をデプロイしておきます。

### 3. リリースする

```bash
git tag android-v1.0.0
git push origin android-v1.0.0
```

「Build Android App (APK)」が走り、署名済みの `NeuroSync-1.0.0.apk` が Release に付きます
（Actions タブから手動で走らせることもできる）。版を上げるたびにタグの番号を上げてください
（内部の versionCode は実行番号で自動的に増える）。

### 4. 利用者の端末に入れる

1. APK をスマホに送る（メール・LINE・Google ドライブなど）か、Release のページを
   スマホのブラウザで開いてダウンロードする
2. 開くと「提供元不明のアプリ」の許可を聞かれるので、そのアプリ（ファイル・Chrome など）に
   許可する
3. 次の版からは同じ手順で上書きインストールできる（記録はそのまま）

必要な Android は 7.0 以上。画面の表示に「Android System WebView」（Chromium 111 以上）を
使うので、古い端末では Play ストアで WebView を更新するよう案内が出ます。

---

## 開発

### ビルド

```bash
pnpm install
pnpm build:android        # 画面を書き出して android/ へ同期（cap sync まで）
pnpm check:thinkgear      # ThinkGear パーサの Python との突き合わせ（python3 が要る）
```

APK は Android Studio で `android/` を開いてビルドするか、`cd android && ./gradlew assembleDebug`
（Android SDK・JDK 21 が要る）。CI も同じ手順（`.github/workflows/build-android.yml`）。
依存（`@capacitor/*`）を上げたら、Gradle の前に必ず `pnpm build:android`
（`android/capacitor.settings.gradle` を作り直す）。

### ブラウザで Android 版の画面を触る

```bash
NEXT_PUBLIC_APP_PLATFORM=android pnpm dev
```

Sync Brain の「接続する」は**脳波計の替え玉**（`lib/native/brainlink-web.ts`）につながり、
合成の脳波が流れます（そこからの測定は合成データ扱いで、保存・送信されない）。
いろいろな状態は開発者ツールで設定して再読み込み：

```js
localStorage.setItem("brainlink-mock", JSON.stringify({ adapter: "off" }))        // Bluetooth オフ
localStorage.setItem("brainlink-mock", JSON.stringify({ connect: "denied" }))     // 許可を恒久拒否
localStorage.setItem("brainlink-mock", JSON.stringify({ dropAfterSec: 10 }))      // 10秒で切断→再接続
localStorage.setItem("brainlink-mock", JSON.stringify({ rawRate: 481 }))          // 481Hz の個体
```

実機の画面は、USB デバッグをオンにした端末を PC につなぎ、Chrome の
`chrome://inspect` から開ける（debug ビルドのとき）。

### 置き場所

| 何を | どこ |
|---|---|
| アプリの設定（appId・origin・最低 WebView） | `capacitor.config.ts` |
| 書き出し（空 basePath・Android フラグ・音源の取り先） | `scripts/build-android.mjs` |
| Android ビルドかどうか（**ビルド時の定数**） | `lib/platform.ts` の `IS_ANDROID_APP` |
| Capacitor を呼ぶコード（**ここ以外で静的 import しない**、ESLint が見張る） | `lib/native/` |
| ネイティブ（Java） | `android/app/src/main/java/io/github/qianyueee/neurosync/` |
| BrainLink の接続・解析 | `lib/mind/bluetooth-link.ts`・`bluetooth-source.ts`・`thinkgear.ts` |
| 接続の画面 | `components/mind/BluetoothSourceDialog.tsx` |

### 変えてはいけないもの

- **appId**（`io.github.qianyueee.neurosync`）と**署名鍵**：変えると上書き更新できない
- **`server.androidScheme` / `hostname`**（`https` / `localhost`）：アプリの中の Web の
  origin そのもの。変えると端末の中の記録が全部見えなくなる（デスクトップ測定アプリの
  ポート 17860 と同じ理由）
- 戻り先の URL（`io.github.qianyueee.neurosync://auth/callback`）：Supabase の設定・
  `AndroidManifest.xml`・`lib/mind/desktop-google-auth.ts` の3か所で対

---

## 端末での確認リスト（リリース前）

- [ ] ホーム・セッション・レポート・ヒストリーが、同じ端末の Chrome で開いた Web 版と同じに見える
- [ ] 端末の文字サイズを大きくすると同じだけ大きくなる／ピンチで拡大できる
- [ ] ナイトリカバリー（30分）を再生して画面を消す → 最後まで鳴り、ヒストリーに記録が残る
- [ ] ロック画面・通知の一時停止／再開、イヤホンのボタンが効く。イヤホンを抜くと止まる。着信で止まり、切ると戻る
- [ ] 星座の曲・番組の曲が鳴る（通信あり）。機内モードでもビートは鳴る
- [ ] メール＋パスワード・Google でログインできる（Google はブラウザのタブが開いて、終わるとアプリに戻る）
- [ ] Sync Brain：「接続する」→ 許可 → BrainLink をペアリング → 接続 → マインドマップが動く
- [ ] 5分測って「取り込む」→ レポートにスペクトルが出る。同じ人を PC ブリッジで測った記録と重ねて、ピークの位置が揃う
- [ ] 測定中に脳波計の電源を切る → 「再接続中…」→ 入れ直すと自動で戻る
- [ ] ホームの「10秒 脳波測定をはじめる」→ Sync Brain で自動的につながり、10秒チェックができる
- [ ] 書き出し（WAV / MP3）→ 端末の「ダウンロード」に入る
- [ ] ホームで戻るボタン → アプリが裏へ（再生は続く）
- [ ] 同じアカウントで、アプリで書いた振り返り・変えたマイ星座が Web 版（と Windows アプリ）に出る。逆向きも
- [ ] ログインする前に書いた振り返りがあると、ログイン後のホームで「このアカウントに保存しますか？」と一度だけ尋ねられる

## 既知の差（プラットフォームによるもの）

- キーボードを出すと画面がキーボードの上まで縮むので、入力中は下のナビがキーボードの上に見える（Chrome はキーボードの後ろに隠れる）
- 書き出したファイルは「ダウンロード」に入り、Android の通知（トースト）で知らせる（Chrome はダウンロードバー）
- 初めて開いたときは、端末の中の記録は空から始まる（ブラウザとは別の保存場所。ログインすればアカウントの記録は出る）
- アプリの Sync Brain には PC ブリッジ（ペアリングコード）での接続が無い（Bluetooth 直結のみ。Web 版には残っている）
