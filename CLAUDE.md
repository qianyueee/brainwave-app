# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NeuroSync（ニューロシンク）— 基于个人脑波数据的移动端 Web 应用，通过 Web Audio API 实时生成个性化双耳节拍（Binaural Beats）及自定义合成器音频。产品副标题：〜 音波×光波×脳波シンクロ誘導 ＆ 脳コンディション管理 〜

**功能需求和音频参数的完整设计请参考项目根目录下的 `脳波チューニンク__アフ_リ設計.docx`，该文档为本项目的唯一需求来源。** 包括三大程序的频率配置、时间轴、UI 规格、发注仕様等均以该文档为准。

## Tech Stack

- Framework: Next.js 16 (App Router, `output: "export"` 静态导出) + TypeScript (strict)
- Styling: Tailwind CSS
- Audio: Web Audio API（纯前端实时合成，不依赖后端）
- State: Zustand (`useAppStore` persists playback prefs only〔下の「关键设计决策」〕; `useSynthStore` with persist for presets)
- Charts: Recharts
- AI 分析: DeepSeek（Supabase Edge Function `analyze-brain` 経由。キーは関数の Secrets にだけ。下の「AI 分析（DeepSeek）」）
- Astronomy: astronomy-engine（太陽/月星座计算；仅在 `lib/zodiac.ts` 的 `getTodaySky` 内动态 import → 独立懒加载 chunk，禁止顶层静态 import）
- Package Manager: pnpm
- Android: Capacitor 8（同じ静的書き出しを APK に入れる。`android/`・`capacitor.config.ts`。規則は下の「Android アプリ（Capacitor）」、配布手順は android/README.md）
- Windows: pywebview（WebView2）＋ PyInstaller（同じ静的書き出しを NeuroSync.exe に入れ、Python が 127.0.0.1 で配る。`bridge/`。規則は下の「Windows アプリ（完全版）」、配布手順は bridge/README.md）
- 三端（Web・Android・Windows）の記録はアカウントで揃う（下の「アカウント同期」）

## Development Commands

```bash
pnpm install          # 安装依赖
pnpm dev              # 启动开发服务器
pnpm build            # 构建生产版本
pnpm start            # 本地预览
pnpm tsc --noEmit     # 类型检查
pnpm lint             # Lint
pnpm build:android    # Android 版の書き出し → android-web/ → cap sync（APK は android/ で Gradle）
pnpm build:desktop    # Windows アプリ版の書き出し → bridge/web/（exe は bridge/ で `pyinstaller NeuroSync.spec`）
pnpm check:thinkgear  # ThinkGear パーサ（TS）と bridge/thinkgear.py の突き合わせ（python3 が要る）
pnpm check:records    # 端末をまたぐ小さな記録（user_records）の合わせ方の自己点検（node だけ。3台の収束・時計のずれ・墓標）
pnpm check:analysis   # AI 分析の Edge Function（supabase/functions/analyze-brain）の自己点検（node だけ。受け取る形・プロンプト・返事の読み取り・流れ）
pnpm check:programs   # プログラム一覧（docs/program-lists/*.xlsx）と鳴らす周波数（lib/catalog/program-list.ts・星座マスタ）の突き合わせ（node だけ）
```

## Architecture

### 目录结构

```
brainwave-app/
├── app/
│   ├── layout.tsx              # 全局布局 + 双导航挂载 + AudioContext 生命周期
│   ├── page.tsx                # Home 首页（品牌行〔NeuroSync® のみ・`text-base`=16px。ページ見出し 20px を超えない範囲でいちばん大きく〕→ 「Home / 今日の星空・宇宙周波数で即座に調律」页面见出し → Sync Tree 状態バー（components/SyncTreeCard。**木の絵は出さない**小さなカード：1行目＝ラベル＋段階名、2行目＝今日の水やり・リスニングの具合〔/tree の「今日のおせわ」と同じ言葉＝components/tree-care.ts。幅 360 の画面でちょうど1行に収まる幅しかないので、ラベルは「聴く」——「リスニング」だと「今日はたっぷり」の日に折り返す〕、育ちきったら水やりの代わりに「育ちきりました」。**数値は出さない**、整卡点击进 /tree。表示できない間〔未ログイン・読み込み中・読めなかった〕は段階名を出さず2行目をひと言に置き換え、どの状態でも2行のまま〕→ 脳コンディションカード → 星座卡；右上角設定入口。桌面端左列＝Tree＋コンディション、右列＝星座卡）
│   ├── session/page.tsx        # Sync Session（上段＝Water Mandala 水マンダラ英雄卡〔当日星座频率+播放〕｜所属グループへの配信プログラム／未ログイン CTA。**配信プログラムはデスクトップでは左の英雄卡と同じ高さの枠**（`md:absolute md:inset-0`＝行の高さの計算から外し、行は英雄卡だけで決まる）に入れ、中の沈んだ面だけが `.scroll-thin`〔globals.css、6px・矢印無しの細いスクロールバー〕でスクロールする。カードの呼吸は止める〔`PublishedProgramCard` の `breathe={false}`——膨らんだ分が枠で切れる〕。スマホは枠を `contents` で消して従来どおり全部並べる〔枠を重ねると 390px 幅で文字の欄が 1/4 狭くなり、入れ子のスクロールは指の当たった場所で動く方が変わる〕。下段＝幅いっぱいの `CatalogSection`：デフォルト・Target・Energy・Astro の4タブ＋全カテゴリ横断の検索。一覧を上段2列グリッドの片側に入れないのは、169 件を半分の幅に押し込むとカードが縦に続く筒になるから。※音源制作・公開などの管理操作は置かない——管理面板「音源」タブへ移設済み）
│   ├── brain/page.tsx          # Sync Brain（脳波同期・測定：接続する＋測定者チップ → 誘導周波数〔**手入力なし**：流しているセッションの誘導周波数、無ければ既定の 40Hz＝components/mind/InductionTargetLine・lib/mind/session-target.ts〕 → 測定を開始 → 出どころ1行 → 左列＝マインドマップ＋脳波バランス／右列＝ブレインアート＋推移。**「いま」だけを映すページ**——過去の測定一覧は置かない〔記録の閲覧は /report と /history〕。Android アプリでは源が BluetoothSource、「接続する」が BluetoothSourceDialog〔Bluetooth で BrainLink に直結〕。Windows アプリでは源が LocalSource、「接続する」が DesktopSourceDialog〔同じ PC の Python が COM ポートを読む〕。どちらも測り終えたら Web と同じく「取り込む」）
│   ├── report/page.tsx         # Sync Report（大见出し直下のタブで2ページ切替：「脳特性チャート」＝分析＋3指標タイル＋大脳特性〔その真下に **AI 分析**＝components/BrainAiAnalysis、下の「AI 分析（DeepSeek）」〕＋8種類の脳波バランス＋周波数スペクトル〔**デスクトップは 2×2 のグリッド**：1段目＝大脳特性｜脳波バランス（同じ段なので2枚は同じ高さ・見出しの行は両方 48px、中身は段の真ん中）、2段目＝AI 分析｜スペクトル＋アップロード。左右を別々の縦列にすると隣り合う2枚の高さが中身しだいでずれる。並べ替えは `md:col-start/row-start` だけで DOM 順は変えない＝モバイルは従来どおり 大脳特性→AI→記録へ→脳波バランス→スペクトル〕〔スペクトルは**1〜50Hz だけ描く**＝lib/mind/types の SPECTRUM_DISPLAY_MAX_HZ・displayedSpectrum（AI 分析に送るのも同じ範囲）。記録は 64 ビンまで持つが 50Hz より上は電源ノイズを見るためのもの〕 ／「測定の比較」＝components/MeasurementCompare。**記録を選ぶ場所もここ**（以前 Sync History にあった「脳波の記録」を移した）：測定者を選択 → 測定データを選択 → 比較する測定データ（任意）→ 3件目（任意）の **SelectDropdown の段**。1件で6指標＆脳波バランス・2〜3件で並べて比較、その下に推移グラフ（選んだ測定者の記録だけ）と選んだ1件のカード（メモ・「レポートで見る」＝その1件を脳特性チャートで開く〔同じページのタブ切替〕・削除）。脳波バランスは components/BrainBandCompare＝**横＝8種の波・縦＝%のグループ棒グラフ**〔値は円グラフと同じ `bands`、色は6指標レーダーと同じ compareSeriesColors、1件なら棒の上に値・複数ならタップでツールチップ〕。`bands` の無い記録も選べる（6指標だけに出て、棒グラフからは外れる）。選択は useCompareSelectionStore。デスクトップは左＝選択＋選んだ1件、右＝比較＋推移〔`md:row-span-2`〕。脳特性チャートの「全 N 件の測定記録を見る・比べる →」はこのタブへ。既定は脳特性チャート）
│   ├── history/page.tsx        # Sync History（**振り返りはカレンダーから**：日历〔日付タップで当日の明細＝再生・脳波測定・10秒チェック＋**その日の振り返り**を書く；脳波測定の「レポートで見る」→/report〕/ セッション統計 / Sync Tree の記録 / 10秒チェックの記録〔認証ゲートの外＝未ログインでも見える〕。測定者→測定データで記録を選ぶ「脳波の記録」は Sync Report の「測定の比較」へ移した。**カレンダーの月と日は useHistorySelectionStore に持つ**＝/report から戻っても今月に飛ばず、見ていた日が開いたまま）
│   ├── settings/page.tsx       # Settings（账号〔下部に**表示言語**＝LanguageSwitch、未ログインでも切替可〕/ 管理入口 / 应用信息；菜单外，从首页齿轮进入）
│   ├── tree/page.tsx           # Sync Tree：いまの木が**1本だけ大きく**立つ毎日のチェックイン画面（16段階ギャラリーは廃止）。大きな木＝components/SyncTreeWaterScene（**ダブルタップで水やり**：1回目で「もう一度タップで水やり」を出して 1.5 秒待ち、その間の2回目で水やり——350ms の厳密判定は 50〜60代の指に速すぎ、iOS は dblclick を安定して出さず VoiceOver の実行も1クリックで届くため。Enter/Space は1回で水やり。しずく・立ちのぼるきらめき・揺れ・段階替わりの「育つ」は CSS の1回きりアニメ）→ 育ち具合（目盛りの無い帯＋growthLevel で選ぶ言葉「育ちはじめました／すくすく／もうすぐ」・育てた木）→ 今日のおせわ（水やり 済み／まだ・リスニング まだ／育っています／今日はたっぷり。言葉と色は components/tree-care.ts でホームの状態バーと共有）→ 完成したら「新しい木を育てる」（ConfirmDialog）。**画面に数値を出さない**（プロダクト判断：％・ポイント・「+1」のような加算量・段階の番号は内部だけ。出す数字は育てた木の本数と「1日1回」「5分」という使い方だけ）。**ログイン中だけ**使える（未ログインはログイン誘導）。育てた木数はここだけ、段階名はホーム树卡と両方；菜单外，从首页树卡进入
│   ├── player/page.tsx         # Sync Sound 播放页（可视化 / 混音〔先頭に**聴き方**＝components/BeatChannelToggle：ステレオ＝バイノーラル／モノラル＝2音を混ぜたモノラルビート、再生中でも切替・端末に保存・書き出しも従う。lib/beat-graph.ts〕 / 定时器〔5・10・20・30分・**無制限**＝lib/session-length.ts〕；菜单外，从节目卡进入。左上「戻る」＝履歴を1つ戻る〔来た画面へ〕、直接開いて戻り先が無いときは /session）
│   ├── synth/page.tsx          # 合成器编辑页（仅管理员；多层振荡器 / 颤音 / 预设保存）
│   ├── admin/page.tsx          # 管理面板（仅管理员／4 タブ：ユーザー・グループ・音源〔AudioStudio：新規作成/タイムライン・カスタムプログラム・シンセプリセット・配信中の取り下げ〕・配信〔ProgramAssigner：グループ割当〕）
│   ├── desktop/page.tsx        # **旧い**デスクトップ測定アプリ（NeuroSyncMeasure.exe）が開いていた**単体画面**。Windows アプリ（完全版、NeuroSync.exe）はもう開かない（`/` から始まり、測定は /brain）——旧路由として残してあるだけ。中身は /brain と同構成、違いは3点：源が LocalSource（ローカルWS）／接続ダイアログが DesktopSourceDialog（配对码→COMポート選択）／取り込みを尋ねず**自動保存**（MindRecorder mode="autoSave"＋右上 DesktopAccountButton でログイン、下の「アカウント同期」参照）。ナビ・MiniPlayer 等の chrome は isDesktopRoute（lib/desktop.ts）守卫で全消し。导航に載せない（Pages 版にも無リンクで存在するが無害）
│   └── mind|profile|log|compare/ # 旧路由跳转桩（客户端 redirect → session/brain/history/report）
├── components/                 # UI 组件（AudioProvider, Mixer, Visualizer, Synth*, mind/* 等）
│   ├── PageHeader.tsx          # 全ページ共通の見出し。**sticky top-0** でスクロールしても上に残る（長いページでも「いまどの画面か」が消えない）。**帯は横いっぱい**（`<main>` の幅そのまま＝画面端まで／デスクトップはレールの右端から右端まで）、中身だけ `usePageColumnClass()` に入れて下のカードと左端を揃える。地は**すりガラス**（`bg-navy/70` ＋ `backdrop-blur-2xl`＝40px）。不透明な `bg-navy` は不可——WaveBackground は `fixed` で `--dyn-navy` の上に明るい波を重ねているので、見えている地色は場所によって違い、波が横切る位置では不透明な帯だけが暗い矩形として浮く（デスクトップで露骨に出た）。blur なら背後の波の色を拾って周囲と同じ色みになる。blur は 12px では下を流れるグラフの目盛りが読めてしまうので 40px、tint は明るいアート（ブレインアート等）の滲み出しを抑えるのに 70% 必要。文字は `text-xl`/`text-xs`＝20px/12px（ページ内見出し `text-lg`=18px を下回らない範囲で最小）。帯の上下は pt-4/pb-2——文字の縮小に合わせて詰めてある（高さを据え置くと小さくなった見出しが広い帯の中で浮く）。リードは操作ボタンの**下の行**に置く（同じ行だとホームでログイン＋設定に幅を取られて切れる）。スロット：`eyebrow`（ホームのブランド名）/ `actions`（ログイン・設定）/ `leading`（/tree の戻る）
│   ├── PageColumn.tsx          # 内容カラム（最大幅＋左右パディング）の**唯一の持ち主**＝`usePageColumnClass()`。`PageHeader` の帯と本文が同じ値を使う（ズレると見出しがカードから外れて浮く）。`PageColumn`＝カラム＋`flex flex-col gap-6 pt-6`（見出しページ用）、`BareColumn`＝カラムだけ（gap/padding が違う /player・/synth・/admin・旧路由スタブ用——Tailwind は同プロパティのクラスを並べても「後に書いたほう」が勝つとは限らないので上書きに頼らない）
│   ├── AppMain.tsx             # `<main>`。**横幅は制限しない**（カラムは PageColumn 側）——ここで `mx-auto max-w-5xl` を掛けると sticky な見出しがカラム幅どまりで「浮いた棒」になり、`mx-auto` の余白は画面幅×レール開閉で変わるので負マージンでも逃がせない。持つのはミニプレイヤー分の下パディングだけ
│   ├── AndroidAppShell.tsx     # Android アプリだけの常駐処理の入口（何も描かない。本体は lib/native/android-shell.ts：システムバーを theme-color に合わせる・戻るキー・Google ログインの戻り）。Web 版では空
│   ├── DesktopAppShell.tsx     # Windows アプリだけの常駐処理（何も描かない）：測定アプリとのローカル WS をアプリ全体で保つ（接続ダイアログのポート一覧も Google ログインの戻り先もこれで届く）・Google ログインの戻りをどの画面でも引き換える・完全版で初めて開いた時刻を覚える（モジュール評価時＝最初の描画より前）。Web 版では空
│   ├── AccountSaveBanner.tsx   # 「この端末に、まだアカウントに保存していない記録があります」（ホームとヒストリーの上、三端共通）。対象＝anon の振り返り・再生の記録（KIND_RULES の adopt "ask"）＋宛先未定の実測10秒チェック＋（Windows アプリだけ）完全版より前に旧い測定アプリが溜めた宛先未定の測定。保存する＝claimAnon＋assign／保存しない＝skipAnon＋localOnly、どちらも以後は尋ねない。旧 /desktop の CloudSaveBanner はそのページだけに残る
│   ├── nav-tabs.ts             # 双导航（BottomNav / SideNav）唯一的标签配置来源（5 项）
│   ├── LanguageSwitch.tsx      # 表示言語の切替：`LanguageSwitch`（設定のアカウント欄、2択）／`LanguageToggleButton`（/desktop の見出し帯、押すともう一方へ）。見出しは言語に関係なく「表示言語 / Language」
│   └── LocaleSync.tsx          # `<html lang>` と document.title を表示言語に合わせる（layout に1つ）
├── lib/
│   ├── i18n.ts                 # 表示言語（ja/en、既定 ja、端末ごとに localStorage `app-locale`）。`useT()`→`t("日本語", "English")`／`useLocale()`／`translator(locale)`／`getLocale()`（描画外専用）／`intlLocale()`。下の「表示言語」参照
│   ├── audio-engine.ts         # 【核心】BinauralSession class + AudioContext 单例 (getAudioContext)
│   ├── beat-graph.ts           # 誘導ビートの音の組み立て（BinauralSession と書き出し renderBinauralOffline が共用）：左右のバス→送り先4つのゲイン→ChannelMerger。ステレオ⇄モノラル（BeatChannelMode）はゲインを動かすだけ＝オシレーターを作り直さない。layers（2つ目のビート）と、基音⇄高八度の逆向きトレモロもここ
│   ├── synth-engine.ts         # SynthSession class（多层振荡器合成 + 颤音 / 颤振）
│   ├── programs.ts             # 基础程序频率参数（从设计文档映射）+ ZODIAC_PROGRAMS（12星座节目，工厂生成，id 前缀 `zodiac-`，不并入 PROGRAMS）+ 跨分类的 ALL_PROGRAMS / programsByCategory / searchPrograms。`getProgramById` 是**全链路唯一收口**（player/Timer/Visualizer/MiniPlayer/ExportDialog/英雄卡全走它），已改为 Map 查表——总数 169，卡片每张都经 getAdjustedProgram 叫它一次，线性扫描会让搜索框每敲一个字产生数万次比较；优先顺 PROGRAMS→ZODIAC→CATALOG 以先勝ち保持
│   ├── catalog/                # Sync Session 目录（Target 42／Energy 13）。**`lib/programs.ts` からは値として import しない**——向きは常に programs.ts → catalog の一方通行（型だけ `import type`）。逆向きの値 import を1本でも入れると ALL_PROGRAMS の組み立てが `undefined.map` で死に、型エラーではなく真っ白な画面になる
│   │   ├── target.ts           # 42 件／5小分類（仕事・勉強・睡眠・リズム・緊張・精神・身体・不調・生活・環境）。名前・よみ・小分類・長さだけ（周波数は program-list.ts）。`kana` は漢字のよみ（検索の正規化はカタカナ→ひらがなまでしか畳めないので手で足す）
│   │   ├── energy.ts           # 第0〜第12 チャクラの 13 件
│   │   ├── factory.ts          # 行 → ProgramConfig。周波数は program-list.ts の写しから（一覧に鳴らせる値が無い行だけ paramsProvisional）。`playableCarrier`＝1000Hz を超えるキャリアは1オクターブずつ下げる
│   │   ├── phases.ts           # `planTimeline(plan, min, outro)`：一覧の鳴らし方（steady／layered／sweep／wave／path）→ 相位列・尺・誘導周波数。**phases と duration を必ず同じ計算から返す**——ズレると全カードに嘘の「パーソナライズ済み」バッジが出る（下の理由参照）。睡眠系は outro "hold" で下げたまま終える
│   │   ├── search.ts           # NFKC＋小文字化＋カタカナ→ひらがな＋記号落とし。クエリは空白区切りの全トークン一致（AND）
│   │   ├── categories.ts       # タブの名前・順・説明
│   │   ├── invariants.ts       # 開発時のみ走る自己点検（相位名「導入」／duration 一致／id 重複／載波上限〔layers も〕／ビート ≥0／一覧の写しの有無／暫定ビートの語彙）。テストランナーが無いのでここが唯一の番人
│   │   ├── music.ts            # Target/Energy の曲の表（id → brainwave-sounds 内のパス。ファイル名は納品時のまま＝id から導けないので1件ずつ）。値だけ・import なし
│   │   └── program-list.ts     # **一覧 xlsx の写し**（Target 42・Energy 13・Morning Tuning 1）：原文（名前・周波数・脳波誘導波）＋鳴らし方（BeatPlan）＋note。値だけ・import なし（node が直接読む）。一覧が変わったらここを直して `pnpm check:programs`
│   ├── zodiac.ts               # 12星座マスタ + 太陽/月星座計算（getTodaySky，动态 import astronomy-engine）+ isNightNow（6/18时昼夜界）+ dailyRecommendation（モジュール合成：載波=自星座固定、差频按四标签×情境可变——活性=太阳40/月20Hz、フロー=太阳12/月10Hz、バランス=平日14/休日夜间7.83Hz、回復=傍晚6/深夜4/月在魚座2Hz；48条 §6 メッセージ模板；优先级 healing→activation→flow→balance，火×地/風×水归紧张）
│   ├── zodiac-constellations.ts # 12星座点线星图数据（0-100 归一化坐标，ZodiacConstellation 组件绘制，emoji 不再使用）
│   ├── music-intro.ts          # セッションの始まり：ビートを曲の立ち上がりに合わせて一緒に強くする（**純関数・import なし**）。measureIntro＝曲の頭の盛り上がり（本体の音量に対する振幅比、累積最大）／beatStartCurve＝曲の聞こえ方（盛り上がり×音量の立ち上げ START_FADE_SEC=4 秒の二乗カーブ）をなぞるビートの曲線、MAX_FOLLOW_SEC=10 秒で必ず満量／MUSIC_WAIT_MS=2.5 秒＝ビートが曲を待つ上限。使い手は下の「星座音乐」参照
│   ├── zodiac-audio.ts         # 音乐床垫映射（program id → brainwave-sounds 内のパス → `musicUrl`。星座＝`Astroプログラム/<星座> (<載波>Hz)_<TAG>_<beat>Hz.mp3`〔納品時の名前、空白の有無まで星座ごとに違うので表で持つ〕、デフォルト4＝表、Target/Energy＝`lib/catalog/music.ts`；缺失差频就近取用）。曲の無い id は `musicBedUrl` が null＝`hasMusicBed` が**嘘をつかない**——Mixer の音楽スライダーは出ず、カードに「ビートのみ」が付く
│   ├── sync-tree.ts            # Sync Tree の成長モデル（**純関数・import なし**＝node で直接確かめられる）。ルール：水やり 1日1回 +1／プログラムを5分聴くごとに +2・1日 +5 まで（2+2+1）＝1日最大 +6／13 で次の段階（16段階、大樹＝195）／大樹から 7（計 202）で完成→植え替えで育てた木 +1。**状態は保存せず出来事（水やり・リスニング・植え替え）を畳む**（foldTreeEvents：時刻順・202 で頭打ち・植え替えは 202 のときだけ数える、完成日＝202 に届いた日。並べ替えは Date.parse——端末の `…Z` と DB の `…+00:00` が混ざる）。日付は treeDayKey（ローカル YYYY-MM-DD。dayKeyOf の0始まり月とは別物）。リスニング積算 trackListening（新しい再生の最初のサンプルは起点・巻き戻りは数えない・数えてよくない間は積まない・持ち主が替われば端数を捨てる）。growthLevel＝いまの区間（次の段階まで／大樹から完成まで）の進み具合を early/middle/near の3つにぼかす——画面は数値の代わりにこれで言葉を選ぶ。**点数は行に持たずここで決める**——定数を変えると過去の木も数え直される。绘画在 components/SyncTreeArt.tsx（SyncTreeFigure＝樹本体／SyncTreeScene＝空に立つ樹の風景、/tree の大きな木が使う／treeCanopy＝しずくを落とす樹冠，手描きの光の樹）；/tree の大きな木の背景为四态 --tree-* 变量（lib/theme.ts 的 TREE_SKY_SUNRISE/NOON/DUSK/NIGHT：day=日の出の淡桃〜珊瑚、afternoon=真昼のミント、evening=宵の淡紫、midnight=星空。明るい3つは**ページの色相をそのまま**借り、中間の b をページ地に近い明るさに置く＝カードが地から生えて見える。朝と昼は明るさの段（0.91→0.5前後）も共通——差は色相だけが語る；宵はページ地そのものが一段暗いので段ごと下げる（0.80→0.42）。深い星空は真夜中だけ——ページも暗い時間帯なので、カードの明暗が替わるのはページと同じ 0時・6時。树本体配色不随主题变）
│   ├── brain-measurements.ts   # 测定记录纯函数辅助（compositeScore / scoreColor / measurementLabel）
│   ├── brain-analysis.ts       # AI 分析の送る形と返る形：buildAnalysisInput（記録→**数値だけ**の束。メモ・測定者名・sessionTag は送らない）／BrainAnalysisContent／normalizeAnalysis。形は supabase/functions/analyze-brain の validateInput と同じに保つ（変えたら両方と版を上げる）
│   ├── journal.ts              # その日の振り返り（日誌）の語彙：5段階の調子 MOOD_SCALE（絵文字＋**必ず言葉も**——50〜60代には表情の描き分けが読み取りにくい）/ moodColor（token を返す。生の色名はテーマ4種のどれかで必ず浮く）/ JOURNAL_TEXT_MAX
│   ├── day-records.ts          # カレンダーの当日明細（buildDayRecords / recordedDayKeys / dayKeyOf）。再生ログ＋取り込んだ脳波測定＋10秒チェックの3出どころを時刻順に1本へ畳む純関数。UI から切り出してあるのは脳波測定がログイン必須ストア（per-user persist）でブラウザから仕込めないため——純関数なら3種すべて実コードで検証できる。描画は components/SimpleCalendar
│   ├── brain-metrics.ts        # 脳コンディション3指標（Rate/Clarity/Reset，副标题为日文说明，数据不足为 null）。**セッション由来**＝computeBrainConditionMetrics（入定速度×共鳴率）／**非セッション由来**＝computeBaselineConditionMetrics（下の baseline.ts が算出済みの値を変換するだけ）。共鳴率を見る周波数は**その測定の誘導周波数**（`BrainProfile.targetHz`＝測定中に流していたセッションの誘導周波数）、無ければ既定の 40Hz＝`DEFAULT_TARGET_HZ`（従来と同じ判定）
│   ├── mind/baseline.ts        # 10秒ベースラインチェック（非セッション時の3指標）。ターゲット周波数が無い平常時は引き込み速度が測れないので別ロジックへ：パターン1 Berger効果（開眼5秒⇄閉眼5秒のα波立ち上がり速度＋メリハリ比）を既定、成立しなければパターン2 静止時可塑性（スペクトル・エントロピー×帯域間移動度）へフォールバック。Clarity=(40Hzγ+高α)/高β、Reset=(δ+θ)比×ゆらぎ。係数は BASELINE_CONFIG に集約（**暫定値**、実測が貯まったら再標定）。⚠ サンプルは1Hzなので T_α-rise の分解能は1秒
│   ├── mind/resonance.ts       # 「その周波数だけ周りより立っているか」＝局所突出比（目標Hzの値 ÷ ±5Hz近傍〔±1Hzは山なので除外〕の平均）＋誘導周波数の範囲（`TARGET_HZ_MIN/MAX`＝1〜45Hz、0.01Hz に丸める、`DEFAULT_TARGET_HZ`=40、normalize/format）。ビンは1Hz刻みなので 0.01Hz 指定は前後を線形補間する
│   ├── mind/session-target.ts  # 測定の誘導周波数を再生状態から決める（手入力は無い）：流している節目の targetBeatFreq（1〜45Hz の外・0Hz・カスタム節目は既定の 40Hz）、流していない／一時停止中は既定。録音中は1秒ごとに数え、**いちばん長く流れていた**周波数を測定に記録（useMindStore の recordingTargetSeconds）
│   ├── mind/desktop-bridge.ts  # Windows アプリ（と旧 /desktop）のローカル WS クライアント（シングルトン・参照カウント・?ws= でポート受取＝最初のページにしか付かないので sessionStorage `desktop-ws-port` に控える・0.5→5s バックオフ再接続）＋プロトコル型（DesktopBridgeState / DesktopCommand / DesktopAuthCallback）。`auth_callback` は subscribeDesktopAuthCallbacks へ。**プロトコルの正は bridge/local_server.py のコメント**
│   ├── mind/desktop-google-auth.ts # デスクトップの Google ログイン（既定のブラウザ＋ループバック＋PKCE、RFC 8252）。WebView 内のログインは Google が拒むので window.open（pywebview が既定のブラウザへ回す）→ Supabase → `state.authCallbackUrl`（Python の /auth/callback）→ WS `auth_callback` → verifier と引き換え（`/auth/v1/token?grant_type=pkce`）→ setSession。**全体の supabase クライアントは implicit のまま**（Web の Google ログイン・確認メールを変えない）。verifier は1回きり・待っていない code は捨てる。flow state は /authorize から5分
│   ├── mind/session-record.ts  # 測定セッション → 脳特性記録（BrainProfile）の唯一の写像（measurementFromSession / sessionLabel / measurementKey）。/brain の取り込みとデスクトップの自動保存が同じ1本を通る
│   ├── mind/local-source.ts    # LocalSource＝MindDataSource 第三の実装（Windows アプリの /brain と旧 /desktop 用）。WS 接続→onStatus("connected")、装置パイプライン稼働→onBridgeOnline——canReceiveData が /brain と同義で機能する写像
│   ├── mind/thinkgear.ts       # ThinkGear（BrainLink）のバイト列 → EegSample。**bridge/thinkgear.py の1行ずつの移植**（分帧・payload を読み切ってから組む・実測率・去趨勢＋Hann＋整数 Hz の DFT・Python の round まで同じ）。**片方を直したら必ずもう片方も**——`pnpm check:thinkgear` が乱れた列を含む同じバイト列を両方に通して一致を確かめる。型以外 import しない（node で直接動く）
│   ├── mind/thinkgear-synth.ts # 決定的な ThinkGear の列（512/481Hz の個体・装着なし）。突き合わせと、ブラウザ開発用の脳波計の替え玉が使う
│   ├── mind/bluetooth-link.ts  # Android アプリ：BrainLink との Bluetooth 接続の単一の係（ネイティブから受けたバイトを ThinkGearParser に通して配る・意図せず切れたら Sync Brain を開いている間5秒ごとに再接続〔ブリッジと同じ〕・ページを離れても接続は保つ・繋がっている間は画面を消さない・ts は必ず前より大きく）。状態は useBluetoothStore。許可/Bluetooth オンのダイアログは画面のボタンからだけ
│   ├── mind/bluetooth-source.ts # BluetoothSource＝MindDataSource 第四の実装（Android の /brain 用）。繋がっている→onStatus("connected")、6秒以内にサンプル→onBridgeOnline——LocalSource と同じ写し方
│   ├── desktop.ts              # isDesktopRoute()：/desktop で BottomNav・SideNav・MiniPlayer・ランチャー溝（PageColumn）を消す**唯一の判定**。ビルドフラグでなく pathname なので dev/Pages/同梱ビルドで挙動が同じ。WEB_APP_URL（「Web版で記録を見る」の先、NEXT_PUBLIC_WEB_APP_URL で上書き可）。desktopFullAppSince（Windows アプリが完全版として初めて開いた時刻、素の localStorage `desktop-full-app-since`。これより前の宛先未定の測定＝旧い測定アプリの自動保存の約束で溜まった分だけを AccountSaveBanner が尋ねる）
│   ├── platform.ts             # IS_ANDROID_APP / IS_DESKTOP_APP：Android アプリ／Windows アプリのビルドか（**ビルド時の定数**、NEXT_PUBLIC_APP_PLATFORM=android|desktop を build-android.mjs / build-desktop.mjs だけが焼き込む）。静的 HTML もこれで描かれるのでハイドレーションが一致する
│   ├── sounds.ts               # 音源の置き場所は2つ：`soundUrl`＝このリポジトリの `/sounds/*`（自然音。Web 版は同じ origin、Android と Windows は NEXT_PUBLIC_SOUNDS_BASE＝Web 版の GitHub Pages）／`musicUrl`＝プログラムの曲、別リポジトリ qianyueee/brainwave-sounds の GitHub Pages（`MUSIC_BASE`、NEXT_PUBLIC_MUSIC_BASE で上書き可。三端とも同じ URL、パスは区切りごとに URL エンコード）
│   ├── native/                 # Android アプリの Capacitor 側（**ここ以外で @capacitor/* と lib/native/ を静的 import しない**、ESLint が禁止。外からは IS_ANDROID_APP の中で動的 import()）：android-shell（バー色・戻る・ログインの戻り）/ app-chrome（バー色・画面常時点灯）/ now-playing（後台再生・ロック画面）/ downloads（「ダウンロード」へ保存）/ android-google-auth（Custom Tab＋appUrlOpen）/ brainlink（Bluetooth のバイトの管）＋ brainlink-web（ブラウザ開発用の替え玉）
│   ├── sync/                   # アカウント同期（下の「アカウント同期」）：brain-profile.ts / baseline-checks.ts＝1記録1行の API（keyset ページング・必ず user_id で絞る）／cloud-mark.ts＝記録に付ける宛先・保存済みの印（純関数）／outbox.ts＝送信箱（全体で1つ、AuthProvider が起動）／account-views.ts＝Web の読み直し（木も）／tree-events.ts＝Sync Tree の出来事の API（1件1行・追記のみ・ignoreDuplicates）／tree-runtime.ts＝木の常駐処理（リスニング積算＋送信のやり直し、AuthProvider が起動・/desktop では起動しない）／**record-merge.ts**＝端末をまたぐ小さな記録（振り返り・再生の記録・感コンディション・測定者・マイ星座）の合わせ方（純関数・型以外 import しない＝`pnpm check:records` が node で直接確かめる）／**records.ts**＝`user_records` の API（keyset・chunk upsert）／**record-sender.ts**＝その送信係と読み直し（共通の送信箱には乗せない、AuthProvider が起動・/desktop では起動しない）／**brain-analyses.ts**＝AI 分析の読み（`user_brain_analyses`、必ず user_id で絞る）と依頼（`functions.invoke("analyze-brain")`、失敗は AnalysisError の code）／per-user-storage.ts・migrate.ts・presets.ts・programs.ts・custom-audios.ts は従来どおり
│   ├── subject-groups.ts      # 測定者→測定データ 二段下拉的纯函数（Sync Report「測定の比較」）（subjectGroups / matchesSubject / resolveSubjectKey；ALL_SUBJECTS / NO_SUBJECT 哨兵值）
│   ├── ramp-scheduler.ts       # 频率渐变调度器
│   └── utils.ts                # formatTime, getCurrentPhaseInfo
├── store/
│   ├── useAppStore.ts          # Zustand 全局状态（脑波程序选择 / 播放 / 日志 / ビートの聴き方 `beatChannelMode`〔stereo|mono、persist〕）。`sessionLogs` は**この起動のあいだだけの流れ**（Sync Tree のリスニングを締める用）——残る再生の記録は usePlaybackHistoryStore
│   ├── useSynthStore.ts        # Zustand 合成器状态 + persist（仅 savedPresets 持久化）
│   ├── useUserRecordsStore.ts  # 端末をまたぐ小さな記録の端末側（persist key `user-records`、素の localStorage＝未ログインでも続く）。**スコープ**で分けて持つ：`anon`＝ログインしていない間に書いたもの／`<userId>`＝そのアカウントのもの（書くと送信待ち）。いまのスコープ＝useCloudSyncStore.account（オフライン起動でも自分の宛て）。画面は `useRecordView()`＝ログイン中はアカウント∪anon（種類ごとのきまり）、ログアウト中は anon だけ。結びつきが外れたアカウントのスコープは送信待ちだけ残して捨てる（共用の端末で次の人に見えない）。旧キー（sync-journal / self-rating〔v1 だけ〕/ zodiac-sign / mind-subjects）は anon へ移して消す（フラグ無し・何度走っても同じ）
│   ├── usePlaybackHistoryStore.ts # 再生の記録（1回1件 `playback:<UUID>`、ヒストリーのカレンダーと統計）。以前は useAppStore.sessionLogs（メモリだけ）で再読み込みのたびに消えていた。AudioProvider が addSessionLog の直後に recordPlayback。**アカウントの記録を useAppStore.sessionLogs に混ぜない**（聴いていない分まで Sync Tree が数える）
│   ├── useJournalStore.ts      # その日の振り返り（useUserRecordsStore の `journal:YYYY-MM-DD`＝暦日の ISO。端末の dayKeyOf の0始まり月はキーにしない。形は以前の zustand ストアと同じ `useJournalStore((s) => s.entries)`、旧 key `sync-journal` は初回に移す）。**1日1件**で書き直すと上書き——「その日どうだったか」の評価なので。時刻を持つ出来事の記録は day-records.ts 側の担当で、そちらは1日に何件でも並ぶ。文章も調子も空なら保存せず削除する（中身の無い印だけがカレンダーに残るのを防ぐ）
│   ├── useBaselineStore.ts     # 10秒ベースラインチェックの履歴 + persist（素の localStorage＝未ログインでも習慣が続く。最大60件〔未送信は消さない〕。demo/realtime を必ず区別し、ホームの3指標は latestRealCheck＝実測のみを読む）。ログイン中に取った実測はアカウントにも載る（`cloud` の印→outbox）。Web はアカウント分を `cloudChecks`（メモリ）に読み、**表示は必ず `useAllBaselineChecks()`**（端末∪アカウントを id で重ね、削除予約 `tombstones`〔永続〕と別端末で消された分を隠す）
│   ├── useCloudSyncStore.ts    # この端末が結びついているアカウント `account`（persist key `cloud-account`、**SIGNED_OUT でだけ消す**＝オフライン起動でトークン更新できない間も記録の宛先が決まる）＋送信箱の状態（phase / lastError）＋「ログインして保存」の予約
│   ├── useDesktopLoginStore.ts # デスクトップの Google ログインの進み具合（waiting / exchanging / error、不 persist）
│   ├── useSidebarStore.ts      # 桌面左栏开合（不 persist：每次加载都从收起开始）
│   ├── useHistorySelectionStore.ts # Sync History の選択（カレンダーの月と日）。不 persist——クライアント遷移の間だけ残し、読み込み直せば今月から
│   ├── useCompareSelectionStore.ts # Sync Report「測定の比較」の選択（測定者・選んだ測定 最大3件）。不 persist——クライアント遷移の間だけ残し、読み込み直せば最新から
│   ├── useDesktopBridgeStore.ts # デスクトップ測定アプリのローカル WS 状態ミラー（wsConnected / state 全量快照 / lastLog、**不 persist**——正は Python 側）。deviceOnline セレクタ＝「装置パイプライン稼働」
│   ├── useBrainAnalysisStore.ts # AI 分析（`userId\u0000uploadedAt` → 読み込み・分析中・失敗）。**persist しない**——正はアカウント、表示する測定の分だけその場で読む。ログアウトで捨てる
│   ├── useSyncTreeStore.ts     # Sync Tree の出来事（ログイン中のアカウントのぶん）。**persist しない**——木はログイン中だけの機能でデータはアカウントにだけ置く（AuthProvider がログインで読み込み・ログアウトで捨てる）。読み直しは手元∪サーバ（行は追記のみなので和集合が常に正しい）。水やり等は pending 付きで先に足し、**木専用の送信係**が1件ずつ送る（共通の送信箱は1件失敗で止まり phase も共用なので乗せない）。画面は `useSyncTreeView()`（view＝unavailable/loading/logged-out/error/ready）と `useTreeToday()`（日付が変わると自分で切り替わる）
│   ├── useBluetoothStore.ts    # Android アプリの BrainLink 接続の状態（phase：idle/connecting/pairing/connected/reconnecting/error・許可・アダプタ・一覧、**不 persist**）。最後に繋いだ機器だけ useBluetoothDeviceStore（persist key `bt-device`、mind-map の形は変えない）
│   ├── useSelfRatingStore.ts / useSubjectStore.ts # 感コンディション（`self_rating:latest`）・測定者（**名前で1件** `subject:<NFKC 名>`＝どの端末の「自分」も同じ1件、最初からある「自分」は EPOCH 時刻の種で本当の書き換え・削除に必ず負ける。「いま誰を測っているか」だけは端末ごと `mind-subject-active`）。どちらも useUserRecordsStore の上、形は以前と同じ
│   └── useZodiacStore.ts       # マイ星座（useUserRecordsStore の `setting:zodiac`。未登录也生效，ログイン中はどの端末でも同じ星座）
├── bridge/                     # PC 側プログラム群（Python）。①従来ブリッジ：BrainLink(SPP串口)→ThinkGear 解析→Supabase Realtime（main.py CLI / gui.py Tkinter / bridge_core.py / publisher.py / thinkgear.py / csv_logger.py / demo_source.py）②Windows アプリ（完全版、NeuroSync.exe＝NeuroSync.spec）：desktop_app.py（入口・pywebview）+ desktop_bridge.py（管线编排）+ local_server.py（WS 协议正本）+ static_server.py（画面の配信・/auth/callback）+ desktop_config.py + smoke_desktop.py（`--no-window --demo` の起動確認、CI が exe に対して走らせる）。詳細は下の「Windows アプリ与 PC 桥接」「Windows アプリ（完全版）」与 bridge/README.md
├── scripts/build-desktop.mjs   # `pnpm build:desktop`：basePath 空＋NEXT_PUBLIC_APP_PLATFORM=desktop＋音源の取り先（Web 版）＋**Web 版と同じ Supabase env**（CI で無ければ失敗）→ bridge/web/（剔除 sounds/ ~300MB）→ `data-app-platform="desktop"`・音源 URL・Supabase の焼き込みと /brainwave-app の残留を確認
├── scripts/build-android.mjs   # `pnpm build:android`：basePath 空＋NEXT_PUBLIC_APP_PLATFORM=android＋音源の取り先＋Web 版と同じ Supabase env（CI で無ければ失敗）→ android-web/（剔除 sounds/）＋ WebView 更新案内ページ → 残留・焼き込みを確認 → cap sync
├── scripts/check-thinkgear.mjs # `pnpm check:thinkgear`：lib/mind/thinkgear.ts と bridge/thinkgear.py の突き合わせ
├── scripts/check-records.mjs   # `pnpm check:records`：lib/sync/record-merge.ts の自己点検（005 のトリガを真似たメモリ内サーバで3台の収束まで）
├── scripts/check-analysis.mjs  # `pnpm check:analysis`：Edge Function analyze-brain の自己点検（fetch を替え玉にして認証・保存済みか・間隔・回数・DeepSeek・保存まで通す）
├── capacitor.config.ts         # Android アプリの設定（appId・origin は配布後に変えない。ピンチズーム有効・最低 WebView 111・SystemBars native）
├── android/                    # Capacitor の Android プロジェクト（Java、コミットする）。自前のプラグイン：AppChrome / NowPlaying（＋前面サービス）/ Downloads / BrainLink、WebView の補い：ExportRouteWebViewClient（/brain → brain.html）/ LocalizedChromeClient。配布・署名鍵・確認リストは android/README.md
├── supabase/migrations/        # 手で SQL Editor に流す（CLI 設定なし）。001 管理者・グループ／002 ユーザー同期（旧 user_brain_profile＝1ユーザー1 JSONB）／**003 account_sync＝1記録1行の user_brain_measurements・user_baseline_checks＋旧表から移行＋旧表を読み取り・削除専用に**／**004 sync_tree＝Sync Tree の出来事 user_tree_events（1件1行・追記のみ。キーの形で1日の上限を守る）**／**005 user_records＝端末をまたぐ小さな記録（振り返り・再生の記録・感コンディション・測定者・マイ星座）の汎用表（新しい方が勝つトリガ・墓標・本人の行だけ）**／**006 brain_analyses＝AI 分析 user_brain_analyses（1測定1行・測定を外部キーで参照して一緒に消える・書くのは関数だけ）＋1日の回数 user_ai_usage／claim_ai_analysis()（service_role だけ）**
├── supabase/functions/analyze-brain/ # AI 分析の Edge Function（Deno・依存なし＝fetch だけ、Dashboard のエディタに1ファイルで貼ってデプロイ。手順は同フォルダの README）。tsconfig と ESLint の対象外
├── scripts/check-program-lists.mjs # `pnpm check:programs`：docs/program-lists/*.xlsx と lib/catalog/program-list.ts（Astro は星座マスタ）の突き合わせ。原文が変わった（一覧の更新）・数値の写し間違い・片方にしか無い行で止まる。note／provisional のある行の食い違いは表示だけ
├── docs/program-lists/         # プログラム一覧の原本（Targetプログラム一覧・Energyプログラム一覧・Morning Tuning & Energizeプログラム・Astroプログラム一覧 の xlsx）。周波数の唯一の出どころ
├── public/sounds/              # 自然音素材（rain/ocean/forest/stream）
│   └── zodiac/ ・ programs/    # ⚠ もう読まない旧い置き場（曲は brainwave-sounds へ移った）。配布済みの旧い APK・exe がまだここを読むので残してある——全員が新しい版になったら消してよい（消しても git の履歴は軽くならない、軽くなるのは Pages だけ）
└── zodiac-music/               # 星座音乐素材说明（README；原始 190kbps 版本只存在于 `zodiac-music` 分支，不合并进 main）
```

### 菜单与页面命名（Sync 体系）

- 导航 5 项（`components/nav-tabs.ts`，BottomNav / SideNav 共用）：Home `/`、Sync Session `/session`、Sync Brain `/brain`、Sync Report `/report`、Sync History `/history`
- Sync Session 的节目一覧は `components/CatalogSection.tsx`：**検索がタブより優先**（169 件から探すとき、先にタブを当てさせるのは「どのタブにあるか知っている人」にしか通じない）。検索中はタブを隠し、カテゴリ見出し付きで平らに出す。Astro タブは12星座の段組みで、自星座の節目は常に出しつつモジュール版は畳む——初期描画12枚・開いても20枚ほどなので仮想リストは要らない。マイ星座の段だけ最初から開くのに `useZodiacStore`（useUserRecordsStore の persist）を初回描画で読んでよいのは、既定タブが「デフォルト」でこの成分がタブ操作まで描画されない＝必ず hydration の後だから
- Settings `/settings` 与播放页 `/player` 均不在导航中：設定从首页右上角齿轮进入，播放页从节目卡 / 心情选择进入
- 桌面左栏（SideNav）可收起，**默认收起**（`useSidebarStore`，故意不 persist——每次加载都从收起开始，SSR/首屏一致无 hydration mismatch，客户端路由期间保持）。收起时只留左上角 `fixed` 的悬浮圆角按钮（56px，`aria-label="メニューを開く"`），点击后外框宽度 0→15rem 动画展开把内容推向右侧（不是浮层覆盖）；内侧面板是 `absolute right-0 w-60` 固定宽度，所以看起来是从左边滑入。关闭走面板头部右侧的按钮或 Esc。收起期间面板挂 `inert`，不进 Tab 序与读屏。**240px / 15rem 这个数值在 SideNav（`md:w-60`）与 MiniPlayer（`md:left-60`）两处要一致**；AppMain 在收起时改用 `md:pl-20` 给悬浮按钮让出左侧沟槽，避免压住页面标题
- 节目卡入口统一走 `usePlayProgram`：点击＝**选择并进入 `/player`，不自动播放**（播放由用户在播放页按下再生钮；自动播放会在进入播放页前先冒出 MiniPlayer，属被否掉的方案）；正在播放（含一時停止）的节目再次点击只跳转、不重置（播放中保护，按 `playingProgramId` 真源判断）；**别的节目在响时点新卡＝停掉在响的（不记日志）再选中新节目**——播放页永远显示"刚点的那个"。全局 MiniPlayer 播放条见「播放入口与全局播放条」
- 职责划分：Sync Brain 只管**測定**（マインドマップ等）；Sync Report 汇总**分析＋比較**（脳特性チャート＋測定の比較）。測定导入（useImportSession）与ヒストリー的「レポートで見る」都跳 `/report`；首页脳特性チャート卡也链到 `/report`。首页 BrainConditionCard 分成两个具名区块：上半「脳コンディション」（測定由来的 3 指標＋出处标注，会在「直近脳波測定データ」/「10秒クイックチェック」之间按**更新的一方**自动切换）右上「詳細へ →」链 `/report`（读分析）、指標下方「今すぐ測定へ →」链 `/brain`（测新数据）；下半「今の『感コンディション』をチェック」是自己評価滑块，**軸は測定側と同じ3つ**（⚡スイッチ力〔ガチガチ⇄スムーズ〕／💡ひらめき度〔モヤモヤ⇄クリア〕／🌙休息度〔疲れ⇄リフレッシュ〕；両端の言葉が「どちら寄りか」・見出し行右端の％が「どれくらいか」を担う、値は 0-100）。締めのボタン「10秒 脳波測定をはじめる」＝主観を保存してから `useBaselineStore.requestCheck()` を立てて `/brain` へ遷移し、そこで計測ダイアログが自動で開く（フラグは非永続・一度きり）——読と書の导线分开という原則は維持したまま、主観と客観が同じ瞬間のペアで残る
- 脳コンディション3指標（Rate/Clarity/Reset）在首页与 Sync Report 双端显示，同一 store＋同一 `computeBrainConditionMetrics`，数值恒同步
- 脳波の記録（**Sync Report「測定の比較」**、以前は Sync History）为**測定者→測定データ 二段下拉**（`components/SelectDropdown.tsx`＋`lib/subject-groups.ts`）：先选人再选该人的某条记录，只展开选中的那一条（メモ/レポートで見る/削除；6指標は上の比較のカードが描く）。その下に「比較する測定データ」「3件目」の下拉を足して2〜3件を並べる（`components/MeasurementCompare.tsx`）。分组来自记录自身（`subject` 名），只有 1 人时隐藏測定者下拉；2 人以上追加「全員」；默认选中当前測定者（`useSubjectStore` 的 activeSubject），选择失效时自动回落到最新记录。推移グラフ只画所选測定者的记录（混人不成趋势）。※同形式の「過去の測定」が Sync Brain にもあったが、測定ページは「いま」だけを映す方針で撤去（`components/mind/SessionList.tsx` ごと削除。生セッションの削除・取り込み前のメモ編集はそこにしか無かった導線なので、必要になったら測定の比較へ移す）。Sync History はカレンダーで振り返る画面で、この下拉は置かない
- 測定の一覧・凡例の**名前は「取り込み時のメモ→測定者名→日時」の順**（`lib/brain-measurements.ts` の `measurementTitle` / `measurementSeriesLabel`）：日時だけでは同じ人の似た回を見分けられないので、本人の言葉を見出しに立て、日時は小さく下の行へ回す（消しはしない、順位を下げるだけ）。凡例は 12px・折返しありなので `measurementSeriesLabel` がメモを頭 12 文字で省略する
- Sync Session 顶部为 Water Mandala 英雄卡（`components/WaterMandalaHero.tsx`＋`WaterMandala.tsx`）：SVG 水纹曼陀罗，几何由频率决定（载波→同心环数、差频→花瓣数〔log 映射，9 种差频各不相同〕、差频越快涟漪越快），默认显示与首页同源的当日星座推荐（自星座载波×当日差频），播放按钮同样带播放中保护

### 星座音乐（音楽ベッド）

- **曲は全部、別リポジトリ [qianyueee/brainwave-sounds](https://github.com/qianyueee/brainwave-sounds) の GitHub Pages**（`https://qianyueee.github.io/brainwave-sounds/`、main の / を配信）。このリポジトリは Git LFS 無しでパックが既に 303MiB、Pages も 1GB が上限なので、曲の重さをここの履歴と Pages から切り離した。155 曲＝星座 96（`Astroプログラム/`）＋デフォルト 4（`デフォルトプログラム/`）＋Target 42（`Targetプログラム/`）＋Energy 13（`Energyプログラム/`）、計 約500MB。**ファイル名は納品時のまま**（日本語・空白・括弧入り）——`lib/sounds.ts` の `musicUrl` が区切りごとに URL エンコードする。Web 版とは origin が同じ（qianyueee.github.io）、Android・Windows からは ACAO:* で通るので、三端とも同じ URL から取る
- 規格は全曲そろえてある：**MP3 128kbps CBR・48kHz・ステレオ・カバー画像なし**（ラウドネスは星座曲で約 -14 LUFS）。単声道には落とさない——星座曲は左右の相関 0.35〜0.86 の本物のステレオで、モノラルにすると明らかに狭くなる
- 解決は `lib/zodiac-audio.ts` の `musicBedUrl(programId)` の1本（`zodiac-<key>` は自星座差频、`zodiac-<key>-b<beat>` は模块差频；デフォルト4は表、Target/Energy は `lib/catalog/music.ts`）。`hasMusicBed(programId)` 门控 Mixer 音乐滑块，标签对星座节目为「星座ミュージック」、其余为「ミュージック」。**曲を足す・差し替える**＝brainwave-sounds に置いて（差し替えは同じ名前で上書き）、新しい id ならその表に1行足す。名前を変えたら表も直す（`musicBedUrl` は存在を確かめないので、表と実物がずれると 404＝伴奏だけ鳴らない）。表を変えたら Android の APK・Windows の exe は作り直しが要る（表はバンドルに焼き込まれる）
- **曲の無い節目があってよい**——誘導ビートは `BinauralSession` が実時間合成するので、表に無い節目も最後まで通常どおり再生でき、欠けるのは伴奏だけ。カードには「ビートのみ」と出す（「準備中」とは書かない——鳴るのだから使える）。`musicBedUrl` が null を返すので Mixer の音楽スライダーも自動で消える。いまは 169 件すべてに曲がある
- **这些音频里没有任何诱导成分**（经三项检测：左右声道无频率差、包络无差频调制、无差频纯音）。它们是围绕载波频率做的音乐，文件名里的 `_40Hz` 只是标记所属节目。因此诱导仍由 `BinauralSession` 实时合成，音乐只作为**伴奏铺在节拍下面**循环播放（曲长 1〜8 分钟，平均 3 分，对 15 分钟节目）
- 音量独立于自然音：`useAppStore.musicVolume`（默认 0.6）→ `BinauralSession.playMusicBed / setMusicVolume`（内部第二个 `NaturePlayer` 实例，与自然音互不干扰，可同时开）；Mixer 在有音乐床垫的节目（カスタム以外の全部）显示音乐滑块
- **始まりはビートと曲が一緒に強くなる**（`lib/music-intro.ts`）：曲のある節目は `startSession` が `session.start(vol, { waitForMusic: true })`——ビートは無音で走り出し（周波数の時間軸はもう進む）、`playMusicBed` が曲を鳴らす時刻に、曲には `START_FADE_SEC`（4 秒）の立ち上げを、ビートには「曲の聞こえ方＝曲自身の頭の盛り上がり（録音に入っている）×その立ち上げ」をなぞる曲線を**同じ時刻から**掛ける。納品 155 曲の頭は約 3/4 が無音近くから 3.5〜5 秒で盛り上がり、1/4 は頭から本体の音量——前者はビートが録音をなぞり（最長 10 秒で必ず満量）、後者は立ち上げどおり 4 秒。曲線は**音量とは別の段**に掛ける（ビートは merger の後ろの `fadeGain`、曲は `NaturePlayer.playBuffer` の `fadeNode`）——音量のスライダーを立ち上げ中に動かしても曲線と衝突しない（同じ AudioParam に setValueCurveAtTime と他の自動化を重ねると例外）。曲が `MUSIC_WAIT_MS`（2.5 秒）までに鳴らなければビートだけ先に立ち上げ、曲は届いたところから 4 秒で入る。曲の読み込みに失敗したらビートはすぐ立ち上がる
- **曲は /player を開いた時点で取りに行き、デコードまで済ませる**（`preloadAudio`、`OfflineAudioContext`＝48kHz で。最初のタップより前は本物の AudioContext を作れないが、オフラインでデコードした AudioBuffer はそのまま鳴らせる）。3 分の曲のデコードだけで 1 秒以上かかるので、先に済ませないと再生ボタンから音が出るまで間が空く。読み込み中に再生を押せばその読み込みを待つ（二重に取らない）。デコード済みは直近 **2 本**だけ持つ（1 分あたり約 23MB、8 分の曲なら 180MB——聴いた曲を全部抱えるとスマホの WebView が落ちる）
- 缺失差频就近取用（只换伴奏，合成的诱导差频不变）：4Hz 未交付 → 2Hz（2/6 等距，取更深的）；獅子座自星座 15Hz → 14Hz；天秤座 8Hz → 7.83Hz
- 若日后补齐 4Hz，把文件以同样的命名（`…_TAG_HEALING (6Hz_4Hz_2Hz)_4Hz.mp3`）放进 brainwave-sounds 的 `Astroプログラム/`，在 `lib/zodiac-audio.ts` 的 `AVAILABLE_BEATS` 与 `ZODIAC_TAG_BY_BEAT` 各加上 4 即可

### 表示言語（日本語／英語）

- **既定は日本語**、設定 → アカウント欄の「表示言語 / Language」で英語へ（`components/LanguageSwitch.tsx`）。**端末ごと**に localStorage `app-locale` へ保存（アカウントには載せない——未ログインでも、日本語が読めない人がログインより先に変えられる必要がある）。Windows アプリ・Android アプリも同じ設定画面から。単体の測定画面 /desktop だけは設定画面が無いので見出し帯の `LanguageToggleButton` で切り替える（アプリの WebView の localStorage は Web とは別なので、端末・アプリごとに別々に保存される）
- **文言は辞書キーではなく書いた場所に日英を並べる**：`const t = useT(); t("水やり", "Watering")`。モジュールの定数は `LocalizedText`（`{ ja, en }`）で持って `t(obj)`。**他のファイルからも読まれるデータは型を変えずに兄弟フィールド**（`label`＋`labelEn`、`description`＋`descriptionEn`、`nameEn` …）を足す。日本語の出力は従来とバイト単位で同じに保つ
- **hydration の規則**：静的 HTML は日本語で焼かれる。描画中は必ず `useLocale()`/`useT()` で読む（zustand v5 の useStore はサーバースナップショットに初期状態＝日本語を使うので、hydration は日本語のまま通り、直後に保存済みの言語で描き直す）。**描画中に `getLocale()` を呼ぶと食い違う**——`getLocale()`/`translator(getLocale())` はイベント処理・effect・throw・store・lib の中だけ。canvas に文字を描くものは locale を effect の依存に入れる
- **訳してはいけないもの**（識別子・保存されるデータ）：相位名（Visualizer は `"導入"`、getAdjustedProgram は `"加速"` を名前で探す → 表示は `phaseLabel()`）、`subGenre`（段組みの鍵 → 表示は `programSubGenre()`）、CSV 見出しの別名（注意力・放松度…）、既定の測定者名「自分」（記録に写されて分類の鍵になる → 表示は `subjectDisplayName()` で "Me"）、再生ログに残る節目名（→ `programNameById()`）、人が付けた名前（カスタム節目・メモ・日誌・グループ名）、製品名（NeuroSync・Sync ○○・Rate/Clarity/Reset）
- **共有の訳し分け**：`programName / programDescription / programSubtitle`（英語では副題を出さない）/ `programSubGenre / programNameById / phaseLabel`（lib/programs.ts）、`zodiacName / zodiacDescription / tagLabel / beatEffect / dailyRecommendation(sky, sign, now, locale)`（lib/zodiac.ts、48 通の今日の一言の英語版つき）、`categoryLabel / categoryDescription`（lib/catalog）、`treeStageName`（lib/sync-tree.ts）、`rateMethodLabel(method, locale)`、`measurementLabel / measurementTitle / measurementSeriesLabel(m, locale)`、`subjectDisplayName`。Target の英語名は `titleEn`（素材の英題）、説明は日本語名の言い換え（`descriptionEn`）
- **英語は 1.5〜2 倍長い**：ボタン・チップ・タブ・ナビは最短の自然な語（下ナビは Home / Session / Brain / Report / History）。ホームの Sync Tree 状態バーの2行目は幅 360 でちょうど1行（英語も Water / Listen の動詞1語）
- **デスクトップの Python 側**：画面へ送るログは `{"type":"log","msg":…,"msgEn":…}`、`state.serial.detailEn` も付ける（`bridge/desktop_i18n.py` が bridge_core・publisher の既知の日本語を英語へ写す——従来ブリッジと共用の文言は変えない。知らない文言は日本語のまま）。起動失敗のダイアログ・Google ログインの戻りページ（既定のブラウザで開く＝画面の言語が分からない）は日英併記。ウィンドウ名は「NeuroSync」（どちらの言語でも同じ）
- **Android のネイティブ側**：画面の言語をネイティブは知らないので、画面の言葉は JS から渡す——再生中の通知のボタンとチャンネル名は `nowPlayingStart` が `playLabel / pauseLabel / channelName / channelDescription` を、保存の通知は `saveBlobToDownloads` が `savedMessage` を付ける（Java 側は届かなければ日本語）。ネイティブの失敗の言葉（日本語）は、英語の画面では lib/native/downloads.ts がコードと段階から英語へ替える。Bluetooth の案内は `useBluetoothStore.error` に `LocalizedText` で持ち、接続ダイアログが描画時に選ぶ。名乗らない機器の名前 `DEFAULT_DEVICE_NAME`（「脳波計」）は端末に残るので日本語のまま、英語の画面では Headset と出す。alert / confirm のボタンは端末の言語（LocalizedChromeClient）
- 新しい画面文言は**必ず日英の両方**で書く。`<html lang>` とタイトルは `LocaleSync` が合わせる

### 两个音频引擎

本项目有两个独立的音频引擎，**互斥播放**（启动一个自动停止另一个）：

#### 1. 脑波双耳节拍引擎 (`lib/audio-engine.ts` ＋ 音の組み立て `lib/beat-graph.ts`)
```
AudioContext（全局单例，getAudioContext() 管理）
├── 左耳の音：carrier（＋LFO）・carrier×2（−LFO）・倍音 3×（＋layers の carrier）→ 左バス ─┐  送り先4つのゲイン
├── 右耳の音：carrier+beat（＋LFO）・carrier×2+beat（−LFO）・倍音 3×（＋layers の carrier+beat）→ 右バス ─┤  stereo＝左→L・右→R
│      ※+beat の2本は相位で動く。LFO＝ビート×1/8 の1本                   │
│                                                                  │  mono  ＝(左+右)/2→L,R
│      ChannelMergerNode → volumeGain（ビート音量）→ fadeGain（始まりの立ち上げ）→ analyser → destination
├── AudioBufferSourceNode (自然音 loop) → GainNode → destination
└── AudioBufferSourceNode (音楽ベッド loop)
    → fadeNode（始まりの立ち上げ）→ GainNode（音量）→ destination
```
- **聴き方（`BeatChannelMode`）**：stereo＝バイノーラルビート（左右に別の音、ヘッドホンでないと効かない）／mono＝モノラルビート（2つの音を半分ずつ混ぜて両耳へ＝音そのものがうなる、スピーカーでも効く。半分ずつなのは山の高さを stereo と揃えるため）。切り替えは送り先のゲインを `setTargetAtTime(…, 0.03)` で動かすだけでオシレーターは作り直さない（再生中でも途切れない）。音楽ベッド・自然音はステレオのまま（曲は本物のステレオ）。書き出し（renderBinauralOffline）も同じ組み立てを通るので、聴いた音と書き出した音は同じ
- **layers**（`ProgramConfig.layers`）：一覧が「10Hz×40Hz」「5Hz・40Hz重なり」と2つのビートを重ねる節目だけ。2つ目は主のキャリアの1オクターブ下で一定に鳴らす純音の組（同じキャリアに重ねると片耳で2音がぶつかり、狙っていない第3のうなりが出る）。片耳の合計が 1 を超えないようバスを `1/(0.97+0.82×層数)` に下げる（0.97 は主の組の山、下の項）
- **基音⇄高八度の逆向きトレモロ**：主の組は基音（左 carrier／右 carrier+beat）と高八度（左 carrier×2／右 carrier×2+beat、重み 0.3＝自分の山で基音の約 -9dB）の2組。高八度も基音と同じビートだけ左右がずれる＝同じ速さのうなりが1オクターブ上にもう1つ（2倍のビートにはしない）。**2倍音は持たない**——左右同じ高さの 2×carrier を残すと右耳で carrier×2+beat とぶつかり、片耳だけのうなりが出る（高八度がその座を持つ。3倍音 0.06 は従来どおり左右同じ・一定）。1つの LFO を**基音には＋・高八度には−**で掛ける＝基音が山のとき高八度は谷、高八度が山のとき基音は谷（どちらも 100%⇔30%、若年層向け資料のアイソクロニックの推奨幅）。揺れは左右の耳で同じなので、左右の高さの差＝ビートは揺らさない。layers は揺らさない。LFO の速さは**いまのビート×1/8**（`TREMOLO_RATIO`）で、右の音と同じ相位の曲線で動かす（`scheduleRamps` の `valueOf`）＝ビートが上下すれば一緒に動き、位相もビートのちょうど 1/8 に揃ったまま（40Hz→5Hz・10Hz→1.25Hz・1.5Hz→0.19Hz、ビート 0Hz の節目では揺れない）。逆向きなので2組は同時に山にならず、正規化の山は「基音の山＋高八度の谷＋3倍音」＝0.82+0.3×0.3+0.06（`swingPeak`）

#### 2. 自定义合成器引擎 (`lib/synth-engine.ts`)
- 最多 8 层振荡器叠加，频率 20~10,000Hz
- 音色：Soft（正弦波）/ Bright（锯齿波 + 低通滤波器）
- 逐层 Tremolo（Sine / Decay 两种模式）
- 全局 Vibrato（LFO → osc.detune）
- 立体声模式：ChannelMergerNode 路由左右声道，各声道独立编辑
- MasterGain 按层数 `1/layerCount` 自动缩放防削波
- 参数平滑过渡统一用 `setTargetAtTime(val, now, 0.02)`

### React ↔ Audio 桥接

`components/AudioProvider.tsx` 通过 React Context 提供：
- 脑波：`startSession` / `stopSession({log?})` / `pauseSession` / `resumeSession` / `getSession`
- 合成器：`startSynth` / `stopSynth` / `getSynthSession` / `updateSynthLayers`
- 互斥播放逻辑也在此处理

内部持有 `BinauralSession` 和 `SynthSession` ref，每秒轮询 elapsed 更新 Zustand store。
使用 `useAudio()` hook 在任意子组件中访问。

### タイマーの「無制限」

- プレーヤーのタイマーは 5・10・20・30分・無制限（`components/Timer.tsx`。15 分は外した）。無制限は `timerDuration = UNLIMITED_DURATION`（**0**、`lib/session-length.ts`）——Infinity は persist の JSON で null になるので使わない。判定は必ず `isUnlimitedDuration()`（`timerDuration - elapsed` や `timerDuration / defaultDuration` をそのまま計算すると残り 0・伸び率 0 になる）。
- 鳴らし方は `sessionTimeline(program, duration)` の1本（BinauralSession と Visualizer が共用）：時間を決めたときは従来どおり相位を伸び縮み。無制限は節目の既定の長さで導入→同調まで進み、最後の**終わりの相位**（覚醒・収束・浮上で値が動くもの）を鳴らさず、同調の値を止めるまで保つ。
- 無制限には終わりのタイマーが無い（BinauralSession・カスタム節目とも）。elapsed は頭打ちにしない。プレーヤーとミニプレーヤーは「残り」の代わりに経過時間を出す。再生の記録・Sync Tree は止めた時点の秒数で従来どおり。

### 暂停/恢复（真・一時停止）

- 暂停 = `ctx.suspend()`：音频时钟冻结 → elapsed、频率 ramp、自然音、音乐床垫全部原地冻结；**绝不触碰振荡器**（OscillatorNode 停了不能重启）。恢复 = `ctx.resume()`。
- 会话结束是**墙钟 setTimeout**（不随 suspend 冻结）：暂停时必须 clear（`BinauralSession.pause()` / AudioProvider 的 `customEndTimerRef`），恢复时按 `duration - elapsed` 重排。
- "用户主动暂停"标志 `isUserPaused` 放在 `lib/audio-context.ts`——因为 `getAudioContext()` 每次调用都会自动 resume 挂起的 context，keep-alive 的 `visibilitychange` 也会。两处都要过这道闸，否则任何音频调用/回前台都会破坏暂停。所有 start 路径先清标志。
- 暂停时 keep-alive `<audio>` 流**必须一起暂停**（`setKeepAliveOutputPaused`）：suspend 后 MediaStream 不再产出采样，仍在播放的 `<audio>` 在部分移动端浏览器会循环残留缓冲发出"嘟嘟"杂音。MediaSession 元数据/handler 保持注册（锁屏控件仍在），锁屏状态由 `setMediaSessionPlaybackState("playing"|"paused"|"none")` 同步；play/pause handler 接 `resumeSession`/`pauseSession`（恢复在手势上下文内，`play()` 合法；纯合成器仍是停止语义）。`visibilitychange` 的 `<audio>` 重启同样要过 `isUserPaused` 闸。
- store 语义：`isPlaying` = 会话活跃（**含暂停**，既有消费者如 Timer 禁用/播放中保护依赖此义），`isPaused` 是其内訳。
- 日志：手动停止也记录（部分时长），自然结束记满时长；切换节目**不**记录被打断的会话（start 路径直接调 engine stop，不走 stopSession）。1回の記録は `useAppStore.addSessionLog`（この起動の流れ、Sync Tree 用）と `recordPlayback`（残る再生の記録、アカウント同期）の両方へ。id は UUID（端末をまたいで見分けるので `Date.now()` は使わない）。

### 播放入口与全局播放条

- `components/usePlayProgram.ts`：所有节目卡/CTA 的统一入口——**选择节目并跳转 `/player`，不启动音频**（再生由用户在播放页按钮触发，那里天然满足 iOS 手势要求）；正在播放同一节目（按 `playingProgramId` 真源判断）再点击只跳转、不重置进度/定时（播放中保护，一時停止中同样生效）；**别的节目在响时点新卡＝先停掉在响的**（不记日志，沿用切换语义，暂停态同样处理），播放页显示新选节目（空闲待播放）。5 个入口组件（ProgramCard/PublishedProgramCard/CustomProgramCard/ZodiacSyncCard/WaterMandalaHero）全部走这个 hook，不要再复制守卫逻辑。
- `components/MiniPlayer.tsx`：全局迷你播放条（移动端 `fixed bottom-16` 浮于底部导航上；桌面端为内容区底部通栏 `md:bottom-0`，左端跟随侧栏开合：展开时 `md:left-60`、收起时 `md:left-0`）。覆盖**一切在响的声音**：节目播放（binaural＋custom＋timeline，`playingProgramId != null`）点击回 `/player`、在 /player 隐藏；シンセ系（纯合成器＝isPlaying 不置位仅 isSynthPlaying、タイムラインプレビュー＝playingProgramId 为 null）点击回 `/synth`、在 /synth 隐藏。节目名走 `playingProgramId` 真源（custom id 经 savedPrograms/publishedPrograms 解析），シンセ系显示「カスタム合成/タイムライン プレビュー」；纯合成器暂停也走 `pauseSession`（suspend，无结束定时器需重排）。`components/AppMain.tsx` 在播放条可见时把内容底部 padding 提到 `pb-36`（桌面 `md:pb-32`）。
- 配信プログラム列表是内存态：`/session` 挂载时拉取，`/player` 在「custom id 解析不到」时也会自取一次（选中节目已持久化，刷新/直进播放页不能依赖先经过 session 页），拉取中标题与死胡同兜底显示「読み込み中…」。
- `/player` 无可解析节目时渲染「プログラムを選択」链接（去 `/session`），不再出现按了没反应的死播放键。

### 数据流

```
脑波程序：
用户选择心情/程序 → Zustand store → page.tsx 读取 selectedProgramId
  → AudioProvider.startSession() 创建 BinauralSession
  → ramp-scheduler 按时间轴调度 linearRampToValueAtTime
  → Mixer 组件实时调节 GainNode（beat/nature 分别控制）
  → 播放结束 → onEnd callback → addSessionLog

合成器：
用户编辑音层参数 → useSynthStore → synth/page.tsx
  → AudioProvider.startSynth() 创建 SynthSession
  → updateSynthLayers() 实时更新参数（不重建主振荡器）
  → savePreset() 持久化到 localStorage
```

### 关键设计决策
- AudioProvider 包裹在 layout.tsx 中，页面切换不中断播放
- 频率渐变用 `audioParam.linearRampToValueAtTime()`，不用 setInterval
- OscillatorNode 不可重用（stop 后必须重建），两个引擎都需处理节点生命周期
- programs.ts 中的所有参数（载波频率、差频、时间轴）严格对照设计文档
- timeScale = userDuration / defaultDuration，用于缩放所有 phase 时间点（無制限は 1＝既定の長さ、上の「タイマーの『無制限』」）
- `useAppStore` 启用 persist（普通 localStorage，key `app-playback`，未登录也生效）+ partialize：仅持久化 `selectedProgramId / timerDuration / beatVolume / musicVolume / natureVolume / natureSoundId / beatChannelMode`（默认音量：ビート 0.2・星座音乐 0.6；タイマー既定 20 分、`version: 1` の migrate が端末に残る旧い 15 分を 20 分へ）；sessionLogs 与运行态（isPlaying/elapsed/playingProgramId）仍只存内存（残る再生の記録は usePlaybackHistoryStore）。播放页整页挂 hydrated 守卫防 hydration mismatch
- `playingProgramId` = 实际在响的节目 id（音频真源），仅由 AudioProvider 的 start/stop 写入；显示端（/player 及其子组件、ExportDialog）一律用 `useDisplayProgramId()`（在响→真源，否则→选择），MiniPlayer 直接用真源——保证"听到的"和"看到的"永远一致
- `useSynthStore` 启用 persist + partialize，仅持久化 `savedPresets`
- `crypto.randomUUID` 在 HTTP 环境下不可用，需降级为 `Date.now().toString(36) + Math.random()`

### Windows アプリ与 PC 桥接（bridge/）

PC 側の实时脑波链路有两条，共用同一套串口读取＋ThinkGear 解析＋CSV 存档（Python）：

```
经典桥接:  BrainLink ──蓝牙SPP串口──> BrainLinkBridge.exe/main.py ──Supabase Realtime──> /brain（RealtimeSource）
Windows:   BrainLink ──蓝牙SPP串口──> NeuroSync.exe（desktop_app.py）──本地WS──> /brain（LocalSource，完全版の画面）
                                        └─（可选开关，默认关）──Supabase Realtime──> 別の端末の /brain 照常观看
```

（旧い NeuroSyncMeasure.exe は同じ管線で `/desktop`＝測定だけの単体画面を開いていた。）

- **wire contract 四方共通**（Android アプリは TS に移植したパーサ `lib/mind/thinkgear.ts` で自分で組み立てる）：`EegSample`（`lib/mind/types.ts`）＝ `bridge/publisher.py` 的
  broadcast payload ＝ 本地 WS `{"type":"sample","sample":{…}}` 的 sample，逐键相同，改任何
  一方必须三处同步。云端频道 `eeg:{归一化配对码}`、事件 `"sample"` 不变。
  `synthetic: true` ＝合成データ（`demo_source.py`／画面内 DummySource）：録音中に1秒でも
  混ざった測定・10秒チェックは source "demo" になり、アカウントへは送らない（CSV は固定列で無影響）。
- **本地 WS 协议正本在 `bridge/local_server.py` 模块注释**（web 侧类型在 `lib/mind/desktop-bridge.ts`）：
  单条 socket 承载样本+控制；命令 `scan/connect/disconnect/demo/cloud`，无逐命令 ack，
  一律回 `state` 全量快照（含 `authCallbackUrl`）。下行另有 `auth_callback`（Google ログインの戻り，
  直近1件保留 120 秒、之后新连上的客户端也会收到）。**只接受本机页面**（Origin 为
  127.0.0.1/localhost 任意端口，或无 Origin 的非浏览器程序）——浏览器允许任意网站连 ws://127.0.0.1。
- **`/auth/callback` 由 static_server 自己回答，不交给 Next 页面**：系统浏览器里一旦跑起
  supabase-js 就会自己持有会话、与桌面端抢刷新令牌。只把 code 经 WS 交给画面，回一页日文 HTML
  （no-store / no-referrer，查询串不记日志）。target=_blank・window.open 由 pywebview
  （`OPEN_EXTERNAL_LINKS_IN_BROWSER`，desktop_app 里显式置 True）交给系统浏览器。
- **端口**：HTTP=17860 **必须固定**（localStorage 按 origin〔含端口〕隔离，端口漂移＝
  本机记录与登录全部"消失"）；WS=17861 可漂（实端口经最初页面 URL `?ws=` 传入——画面は
  sessionStorage `desktop-ws-port` に控えて、画面遷移・読み込み直しの後も同じポートへ繋ぐ；缺省回落 17861）。
  HTTP 绑定失败＝已有实例在跑 → 弹窗退出（也避免抢串口）。Windows 的 SO_REUSEADDR 允许重叠 bind
  使用中的端口，所以 static_server 在 Windows 上关掉 `allow_reuse_address`（否则第二个实例不会失败）。
- **pywebview 必须 `private_mode=False` + `storage_path`**（默认隐私模式每次退出清空
  localStorage）。storage_path＝exe 同目录的 `profile/`——exe 改名（NeuroSyncMeasure→NeuroSync）后，
  新 exe 必须放在旧 exe 同一文件夹才能沿用本机记录。**WebView2 缺失时 pywebview 不报错、而是静默
  退回 MSHTML（IE）＝白屏**（`gui="edgechromium"` 也挡不住），所以 desktop_app 先查注册表的
  EdgeUpdate `pv`，没有就弹 Evergreen Runtime 下载指引再退出。
- **WebView2 起動オプション**は环境变量 `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`（setdefault＝开发时可覆盖）：
  它可能取代 pywebview 自己放进 CreationProperties 的 `--disable-features=ElasticOverscroll`，所以那一项也写进去；
  另外 autoplay 放开（10秒チェックのチャイム）、关掉后台节流（最小化・被遮挡时测定与播放的计时不停）、
  `HardwareMediaKeyHandling`（媒体键，无保证）。`create_window` 须 `text_select=True`・`zoomable=True`
  （pywebview 默认禁止选中文字与缩放，违反 UI 约束）；`ALLOW_DOWNLOADS=True`（导出时弹「名前を付けて保存」）。
- **static_server 的缓存与 MIME**：`/_next/static/`（文件名含内容哈希）＝`immutable`，只对 200；页面 `.html`
  与 RSC `.txt` ＝`no-cache`（exe 更新后旧页面指向已不存在的 chunk 会白屏）。主要扩展名的 MIME 自己定
  （Windows 的 mimetypes 读注册表，环境不同 .js/.css 可能变成 text/plain；RSC 的 `.txt` 静态导出的 Next
  认 text/plain）。
- 云端同送**默认关、不持久化开关**（只记配对码）：起動しただけで脳波が外に流れない。
  码是**手机侧**的码（/brain「接続する」显示），桌面端只做输入。
- `bridge_core.run_bridge()` 是 CLI/GUI 的一本道生命周期，桌面端不用它——复用其部件
  `_serial_reader` / `_demo_producer` ＋ `CsvLogger` ＋ `SupabasePublisher`，由
  `desktop_bridge.DesktopBridge` 动态编排（connect/disconnect/demo/cloud 可随时切）。
  `gui.py` 顶层 import tkinter，headless 不可 import——`list_serial_ports()` 在
  desktop_bridge 里有带描述的复制版。
- **websockets 版本由 realtime（supabase 依赖）钉死**：local_server 用双路径 import
  ＋单参 handler＋手写广播循环，新旧 API 通吃；不要另钉版本、不要用 `broadcast()`
  helper 或 `process_request`。
- **构建**：`next.config.ts` 的 basePath 读 `NEXT_PUBLIC_BASE_PATH`（`??` 保留显式空串；
  未设时按 NODE_ENV 回落 `/brainwave-app`＝Pages 部署不变）。`pnpm build:desktop` 出
  无前缀、`NEXT_PUBLIC_APP_PLATFORM=desktop` 的包到 `bridge/web/`（剔除 sounds/，音源从 Pages 取）；
  CI lane：`build-desktop.yml`（Windows アプリまわりの push＝exe まで作り、`NeuroSync.exe --no-window --demo`
  を bridge/smoke_desktop.py で確かめる〔ページの型・キャッシュ、WS の state と合成 sample、よその Origin の拒否〕／
  workflow_dispatch／`desktop-v*` tag＝Release に `NeuroSync.exe` を添付），与经典桥的
  `build-bridge.yml`（`bridge-v*`）并行独立。Next 静态导出对每个路由会同时产出
  `<route>.html` 与 `<route>/`（RSC payload 目录）——static_server 对无扩展名路径
  优先 `.html` 同名文件，正是为了这个双胞胎结构。
- 开发流：`python bridge/desktop_app.py --no-window [--demo]` ＋ `NEXT_PUBLIC_APP_PLATFORM=desktop pnpm dev` →
  `http://localhost:3000/`；打包同源验证走 `pnpm build:desktop` 后 `http://127.0.0.1:17860/?ws=17861`
  （ソース実行の desktop_app は `out/` を配る）。起動確認は `python bridge/smoke_desktop.py [--platform desktop]`。

### アカウント同期（三端：Web・Android・Windows）

```
取り込んだ測定（/brain の「取り込む」）─────── useBrainProfileStore ──→ user_brain_measurements
ログイン中に保存した10秒チェック／旧 /desktop の測定 ─cloud={owner} の印→ lib/sync/outbox.ts ─→ user_baseline_checks ／ user_brain_measurements
振り返り・再生の記録・感コンディション・測定者・マイ星座 ─ useUserRecordsStore → lib/sync/record-sender.ts ─→ user_records
Sync Tree の出来事 ─────────────────────── useSyncTreeStore の送信係 ──→ user_tree_events
                                                        ↓（どれも1記録1行）
各端末：ログイン時＋タブ／アプリに戻ったとき＋ホーム・レポート・ヒストリーを開いたとき読み直す（15秒間引き）
```

三端とも同じ Web のコード（静的書き出し）なので、同期の仕組みは1つ。端末に残すだけのもの：
生の測定セッション（`mind-map`、取り込むと測定としてアカウントへ）・音量などの再生の設定・いま誰を測っているか。

- **1記録1行**（`supabase/migrations/003_account_sync.sql`）。旧 `user_brain_profile`（1ユーザー
  1 JSONB を丸ごと上書き）は書き手が2つになると互いの追加を消すので使わない。003 で行へ移し、
  旧表は INSERT/UPDATE ポリシーを外した読み取り・削除専用の控え（「すべて削除」は控えも消す）。
  キーは `uploaded_at`＝`BrainProfile.uploadedAt`（text のまま・文字列完全一致で照合）。
- **印は記録そのものに付ける**（`lib/sync/cloud-mark.ts`）：`cloud` 無し＝宛先未定（未ログインで
  測った回・機能より前の回・/brain の回）／`{owner, savedRev}`＝そのアカウント宛て、`savedRev===rev`
  で保存済み（メモを書くと `rev+1` で送り直し）／`{localOnly}`＝「保存しない」。宛先は**測り終えた
  時点の `useCloudSyncStore.account`**（共用 PC で後から別の人がログインしても、前の人の記録は
  その人の宛てのまま）。未分配の記録はログイン後に AccountSaveBanner（ホーム・ヒストリー。旧 /desktop は
  CloudSaveBanner）で「保存する／保存しない」を尋ねる（黙って今のアカウントへ送らない）。載せるのは実測だけ（`isSessionUploadable` /
  `isCheckUploadable`：source realtime・読めた秒あり）。
- **送信箱**は全体で1つ（AuthProvider が ensure、StrictMode 二重でも1つ）。削除予約→チェック→
  測定の順、古い順・直列。失敗は 5s→15s→30s→60s→以後5分で再試行、`online`・ログイン・記録の
  変化で即再開。送るのは `useAuthStore.user` が居るとき（=トークンが有効）だけ。
- **Web の store**（useBrainProfileStore）：書き込みはモジュール内の Promise 鎖で直列・逐行、
  `measurements` は uploadedAt 昇順、読み直しは鎖の後ろに並び「読んでいる間に画面側が変わったら
  捨てる」版番号付き。**読み直しの入口**は AuthProvider（focus / visibilitychange）と
  `useRefreshAccountViewsOnMount()`（ホーム・レポート・ヒストリー）、どちらも 15 秒間引き。
- **旧 /desktop の AuthProvider は user の追跡だけ**（合成器・カスタム音源・脳特性の一覧・管理者権限・
  首登迁移・Sync Tree・user_records は読まない。判定は pathname の isDesktopRoute）。Windows アプリ（完全版）は
  `/` 以下の普通の画面なので Web と同じく全部読む。ログアウトは `scope:"local"`（既定の global だと
  別の端末でのログアウトがこの端末のログインまで切る）。
- **端末をまたぐ小さな記録**（`supabase/migrations/005_user_records.sql`、1件1行の汎用表 `user_records`）：
  - キーは種類が頭に付く：`journal:YYYY-MM-DD`（暦日の ISO。端末の dayKeyOf の0始まり月はキーにしない）／
    `playback:<UUID>`／`self_rating:latest`／`subject:<NFKC 名>`／`setting:zodiac`。CHECK で kind・id の形・
    data（object・16KB 以下）を守る。
  - **新しい方が勝つ**：比べるのは端末が書いた `updated_at`。BEFORE INSERT OR UPDATE トリガが未来の時刻を
    now()+5分に丸め、今の行より古い書き込みは捨てる（`RETURN NULL`）＝どの端末も普通に upsert するだけ。
    時計の遅れた端末は、書くときに手元の版（最後に見た版）の 1ms 後にずらす（nextStamp）。
  - **削除は墓標**（deleted=true・data 空の upsert、DELETE ポリシー無し）——離れていた端末にも届き、古い記録を
    持った端末が送り直しても復活しない。
  - 合わせ方は `lib/sync/record-merge.ts`（純関数、`pnpm check:records`）。読んだ一覧を重ねるとき、送信待ちの
    手元は**アカウントの方が新しいときだけ**置き換え、送信済みの手元は違っていればアカウントに揃える（丸められた
    時刻もこれで揃う）。種類ごとのきまり KIND_RULES：振り返り・再生の記録＝画面はアカウント∪端末、ログイン前の
    分は尋ねる（AccountSaveBanner）／感コンディション・マイ星座＝ログイン中はアカウントの値、アカウントに無ければ
    端末の値を黙って引き継ぐ（fillGaps、**アカウントを読み終えてから**でないと「無い」と取り違える）／測定者＝
    ∪で、無い名前は引き継ぐ。
  - 端末側は useUserRecordsStore（スコープ `anon`／`<userId>`）。共用の端末で別の人がログインしても前の人の記録は
    見えず、ログアウトしたアカウントの分は送信待ちだけ残して端末から捨てる。
  - 送信係 `lib/sync/record-sender.ts`：共通の送信箱には乗せない（1件の失敗で止めない・phase を共有しない、
    005 より先に Web が出ても測定の保存を巻き込まない）。まとめて upsert、失敗は 5s→15s→30s→60s→以後5分、
    書き換え・online・画面復帰・ログインで即やり直す。CHECK 等で弾かれたら1件ずつ送り直してその1件だけ諦める
    （端末には残る）。送っている間に別の人に切り替わって RLS で弾かれたら、前の人の分は送信待ちのまま残す。
    **auth-js はタブ／アプリに戻るたびに SIGNED_IN を出し直す**ので、同じ人の読み込みは 15 秒に1回に間引く
    （同時の読み込みは1本にまとめる）。読んでいる間に送れた記録があれば1回だけ読み直す（pushEpoch）。
- **Sync Tree は別立て**（`supabase/migrations/004_sync_tree.sql`）：端末には持たず `user_tree_events` にだけ
  置く（ログイン中だけの機能）。キーの形で1日の上限を守る——`water:YYYY-MM-DD`（1日1行）・
  `replant:YYYY-MM-DD`・`listen:YYYY-MM-DD:<乱数>`（端末ごとに聴いた分がどれも残るよう乱数入り、1日 +5 の
  上限は lib/sync-tree.ts が数える）。別の端末で同じ日に水やりしても `ON CONFLICT DO NOTHING` で1行。
  書き込みは INSERT のみ（UPDATE/DELETE ポリシー無し）、読むときは必ず user_id で絞る。送信は共通の送信箱
  ではなく useSyncTreeStore の送信係（失敗は 5s→…→5分で再試行、制約・権限の失敗はその1件を捨てる）。
  リスニングは lib/sync/tree-runtime.ts が useAppStore の elapsed を見て積算する——終わりのタイマーは最後の
  1秒ポーリングより先に鳴るので、5分の番組が 299 秒どまりにならないよう再生ログ（sessionLogs、停止より前・
  playingProgramId がまだその番組のうちに届く）の秒数で締める。
- **部署順**：①Supabase SQL Editor で 003 を実行 → ②すぐ Web をデプロイ（その間、古い Web は
  脳波測定を保存できずエラーになるだけ）→ ③「Build Desktop App」で exe を作り直す。Google
  ログインには Supabase の Redirect URLs に `http://127.0.0.1:17860/auth/callback` を足しておく
  （最近の GoTrue はループバック IP を許可済みだが保険）。Sync Tree は **004 を SQL Editor で流してから Web を
  デプロイ**（先に Web が出ても /tree が「読み込めませんでした」になるだけ。デスクトップ exe の作り直しは不要）。
  端末をまたぐ小さな記録は **005 を SQL Editor で流してから Web をデプロイ** → Android の APK と Windows の exe を
  作り直す（先に Web が出ても送信が失敗して端末に溜まり、退避つきで送り直すだけで、記録は失われない）。

### AI 分析（DeepSeek）

Sync Report の大脳特性の真下「AIによる分析」（components/BrainAiAnalysis）。表示中の測定を DeepSeek が読み解き、
総評・良いところ・気をつけたい点・測定中の変化・おすすめ を返す。結果はアカウントに1測定1件（三端で同じものが出る）。

```
BrainAiAnalysis ─buildAnalysisInput（数値だけ）─> functions.invoke("analyze-brain")
   ─> Edge Function：本人確認（/auth/v1/user）→ 形の検査 → 測定が保存済みか → 30秒の間隔 → 1日20回（claim_ai_analysis）
      → プロンプトを組んで DeepSeek（json_object）→ 形を整えて user_brain_analyses に upsert → 返す
```

- **API キーは関数の Secrets（DEEPSEEK_API_KEY）にだけ**。アプリは静的書き出しなので、画面側に置くと誰にでも見える。
- **関数が受け取るのは形を確かめた数値だけ、プロンプトは関数が組む**——文章を受け取ると「ログインすれば誰でも
  持ち主の DeepSeek を使える窓口」になる。メモ・測定者名はそもそも送らない。送る形（lib/brain-analysis.ts）と
  検査（index.ts の validateInput）は同じに保ち、変えたら両方の版を上げて `pnpm check:analysis`。
- **書くのは関数だけ**（service_role）。利用者は自分の分析を読む・消すだけ。測定を消すと分析も DB が消す（外部キー）。
- **関数は GitHub のマージでは変わらない**（変わるのは Web だけ）。`index.ts` を直したら Dashboard のエディタに**全文**を
  貼り直して Deploy し、Logs に `analyze-brain: serving`（ファイルの最後で出す）が出るのを確かめる。これが出ずに
  「booted の後、OPTIONS すら答えず 150 秒で 546」になったことがあり、原因は関数が最新・全文でなかったこと
  （貼り直して直った）。待ち受けは Supabase の文書どおりトップレベルで素の `Deno.serve(...)`（`typeof Deno` で
  囲むだけ＝node でも読める）、`pnpm check:analysis` が書き方を見張る。関数内の想定外の例外は CORS 付きの 500 で返す
  （CORS 無しの 5xx はブラウザが中身を隠し、画面は理由を言えない）。返事を読めなかったときの画面は、オフラインなら
  `network`、オンラインなら `unreachable`。
- **言語は画面の表示言語**。保存された分析の言語と画面が違えば「もう一度分析すると〜」と添える。
- **測定中の変化**は `BrainProfile.timeline`（lib/brain-profile.ts の computeTimeline：1秒ごとの行を最大10区間・
  1区間30秒以上に分け、読めた割合・注意/リラックスの平均・8種の割合）から。測り終えた時点（useMindStore の stop・
  EegUploader）で作り、記録の JSONB にそのまま載る（移行不要）。これより前の記録・60秒未満の測定には無く、
  その場合 AI は変化を語らない。1秒ごとの生データは残さない（AI に数千の数字を渡すと、かえって分析が荒く・遅く・高くなる）。
- **部署順**：①SQL Editor で 006 を実行 → ②Dashboard で関数 `analyze-brain` を作り（index.ts を貼る・Verify JWT はオン）、
  Secrets に DEEPSEEK_API_KEY（任意で DEEPSEEK_MODEL、既定 deepseek-chat）→ ③Web をデプロイ → ④APK・exe を作り直す。
  先に Web が出てもボタンが「準備中」と言うだけ。

### Android アプリ（Capacitor）

Web 版の静的書き出しを Capacitor 8 で APK に入れたもの（配布・署名鍵・端末の確認リストは
android/README.md）。**画面と操作は Web 版と同じコード**で、違いは Sync Brain が Bluetooth で
BrainLink に直結すること（PC ブリッジ・ペアリングコードは使わない）だけ。

```
BrainLink ─RFCOMM(SPP)─> BrainLinkPlugin（Java：バイトを約50msごとに受信時刻付きで渡すだけ）
   ─"data"─> lib/mind/bluetooth-link.ts ─ThinkGearParser（bridge/thinkgear.py の移植）─> EegSample
   ─> BluetoothSource（MindDataSource 第四）─> useMindStore.pushSample（不変）
```

- **分岐はビルド時の定数 `IS_ANDROID_APP`（lib/platform.ts）だけ**：`pnpm build:android` が
  NEXT_PUBLIC_APP_PLATFORM=android を焼き込み、静的 HTML も Android 版で描かれる（実行時に
  Capacitor を見て描き分けるとハイドレーションがずれる）。Web ビルドでは false で、Pages 版の
  挙動は変わらない。**`@capacitor/*` と `lib/native/` は `lib/native/` の外で静的 import しない**
  （ESLint の no-restricted-imports が止める）——外からは `if (IS_ANDROID_APP)` の中で `import()`。
- **⚠ Capacitor のプラグインは Proxy**：どんな名前のプロパティも「メソッド」に見えるので、
  **Promise をプラグインそのもので resolve しない／async 関数から返さない**（resolve が `then` を
  探して `plugin.then()` を呼び「not implemented」で落ちる）。`{ p }` のように包んで渡す
  （bluetooth-link.ts の load）。
- **配布後に変えないもの**：appId `io.github.qianyueee.neurosync`・署名鍵（同じ鍵でしか上書き
  更新できない）・`server.androidScheme/hostname`＝origin `https://localhost`（変えると端末内の
  localStorage/IndexedDB が見えなくなる。デスクトップの 17860 と同じ理由）。
- **ページの読み直し**：Capacitor の端末内サーバは拡張子の無いパスを一律 index.html で返すので、
  `ExportRouteWebViewClient` が `/brain` → `brain.html` に言い換える（bridge/static_server.py と
  同じ規則。trailingSlash を変えるならここも）。
- **Chrome が黙ってやっていることの補い**（どれも画面は変えない）：
  - 後台再生・ロック画面：`lib/keep-alive.ts` の navigator.mediaSession 呼び出しを、Android では
    同じ順で NowPlaying（前面サービス mediaPlayback＋MediaSession 通知）へも渡す。着信・他アプリで
    一時停止（一時的なら再開）、イヤホンが抜けたら一時停止。AudioProvider は無変更。
    **`startForeground` は起動ごとに1回だけ**、以後の描き直しは同じ ID への `notify`——一時停止・再開は
    後台で起きる（着信・イヤホン）ので、繰り返しの `startForeground` は Android 12+ で拒まれて落ちる
  - ダウンロード：`downloadBlob` が「ダウンロード」フォルダへ保存（DownloadsPlugin、1MB ずつ）。
    保存し終えてから resolve するので書き出しの「完了」も保存後
  - Google ログイン：Custom Tab＋PKCE＋独自スキームで戻す（lib/mind/desktop-google-auth.ts を
    デスクトップと共用。戻りは起動時から appUrlOpen で待つ、verifier は Android では localStorage）。
    **Supabase の Redirect URLs に `io.github.qianyueee.neurosync://auth/callback` が要る**
  - システムバー：`<meta name="theme-color">`（applyPalette が palette.navy に書き換える）を
    ネイティブへ渡して塗る。SystemBars は `native`（viewport-fit=cover が無いのでバーの間だけが
    ページ＝ブラウザと同じ。共有 CSS に safe-area は要らない）
  - 文字サイズ（fontScale に追従、Activity は作り直さない）・ピンチズーム（zoomEnabled）・
    alert/confirm のボタン文言（端末の言語）・戻るキー（履歴を戻る、最初の画面では背面へ）
- **音源は APK に入れない**：自然音は lib/sounds.ts の SOUNDS_BASE で Web 版（GitHub Pages、ACAO:*）から、プログラムの曲は MUSIC_BASE（brainwave-sounds の Pages）から取る。
- **Sync Brain の接続（bluetooth-link.ts）**：sourceKind の "realtime" は「実機の脳波（経路は問わない）」
  のまま（/desktop と同じ）なので、canReceiveData・取り込み・アカウント保存の判定は Web 版と同じ。
  接続はページを離れても保つ（ブリッジが送り続けるのと同じ）、意図せず切れたら Sync Brain を開いている
  間だけ5秒ごとに再接続、開いていて繋がっている間は画面を消さない。許可や「Bluetooth をオンに」は
  画面のボタンからしか出さない（自動接続は許可と Bluetooth が揃っているときだけ）。
- **開発**：`NEXT_PUBLIC_APP_PLATFORM=android pnpm dev` で Android 版の画面をブラウザで触れる
  （「接続する」は lib/native/brainlink-web.ts の替え玉＝合成の ThinkGear。そこからの測定は
  synthetic＝source "demo" で保存・送信されない。状態は localStorage "brainlink-mock"）。
- **CI**：`.github/workflows/build-android.yml`（Android まわりの push＝debug ビルドに加えて、release の
  経路〔lintVital・署名〕も使い捨ての鍵で通す〔配らない〕。`android-v*` タグ＝Secrets の鍵で署名した
  release APK を Release に添付）。

### Windows アプリ（完全版）

Web 版の静的書き出しを NeuroSync.exe（pywebview＝WebView2、PyInstaller の onefile）に入れたもの。
exe の中の Python が 127.0.0.1:17860 で画面を配り、同じ PC の BrainLink（COM ポート）を読んでローカル WS
（17861〜）で流す（上の「Windows アプリ与 PC 桥接」）。配布・更新の手順は bridge/README.md。

```
BrainLink ─SPP(COM)─> desktop_bridge（Python：ThinkGear 解析・CSV）─本地WS─> lib/mind/desktop-bridge.ts
   ─> LocalSource（MindDataSource 第三）─> useMindStore.pushSample（不変）   ※画面は `/` から全部、Web と同じ
```

- **画面と操作は Web 版と同じコード**。違いは Sync Brain の出どころ（LocalSource＋DesktopSourceDialog）と、
  Google ログインを既定のブラウザ＋ループバックで行うこと（lib/mind/desktop-google-auth.ts、旧 /desktop と同じ）
  だけ。測り終えたら Web・Android と同じく「取り込む」（旧い測定アプリの自動保存はしない——取り込まなかった
  測定を黙って送らない）。
- **分岐はビルド時の定数 `IS_DESKTOP_APP`（lib/platform.ts）だけ**：`pnpm build:desktop` が
  NEXT_PUBLIC_APP_PLATFORM=desktop を焼き込む（IS_ANDROID_APP と同じ理由）。Web ビルドでは false。
- **DesktopAppShell** がローカル WS をアプリ全体で保つ（参照カウントの1本）——接続ダイアログのポート一覧も、
  Google ログインの戻り先 `state.authCallbackUrl` と戻り `auth_callback` もこの WS なので、Sync Brain 以外の
  画面でも繋がっている必要がある。戻りを引き換えるのもここ1か所（旧 /desktop のページ側の購読は
  IS_DESKTOP_APP では止める＝二重に引き換えない）。
- **配布後に変えないもの**：HTTP 17860（origin）・exe と同じフォルダの `profile/`（WebView2 の保存先）。
  exe の名前を変えたので（NeuroSyncMeasure.exe → NeuroSync.exe）、新しい exe は古い exe と同じフォルダに置く。
  置き場所を変えても、アカウントにある記録はログインすれば戻る（端末にだけある記録が見えなくなる）。
- **旧い測定アプリからの引き継ぎ**：同じ profile なので端末の記録はそのまま見える。旧アプリが「測り終えたら自動で
  保存」の約束で溜めた宛先未定の測定だけは、完全版で初めて開いた時刻（desktopFullAppSince）より前の分に限って、
  ログイン後の AccountSaveBanner で一度だけ尋ねる。
- **音源は exe に入れない**：自然音は lib/sounds.ts の SOUNDS_BASE で Web 版（GitHub Pages、ACAO:*）から、プログラムの曲は MUSIC_BASE（brainwave-sounds の Pages）から取る。
- **既知の違い**：書き出しは「名前を付けて保存」が開く（Chrome はダウンロードバー）／キーボードのメディアキー・
  Windows のメディア操作は効かないことがある／ブラウザのショートカット（F5・Ctrl+F・Ctrl+プラスなど）は効かない
  （pywebview が WebView2 の AreBrowserAcceleratorKeysEnabled を切る）——拡大は Ctrl＋ホイールかピンチで。

## Notes & Prompts

### 必须遵守
- 所有浏览器 API 相关组件加 `"use client"`
- AudioContext 必须在用户 click/touch 事件中创建或 resume（浏览器自动播放策略）
- iOS Safari 需要额外的 touch 事件解锁音频
- 音频节点不用时必须 disconnect() 防止内存泄漏
- Zustand persist 在 SSR 时会 hydration mismatch，需用 skipHydration 处理
- 调整颤音参数时不重建主振荡器，仅销毁/重建 LFO 节点，避免爆音

### UI 约束
- 目标用户 50-60 岁：正文 16px（`text-base`）、触控区域 ≥ 48×48px。**接触域は文字サイズと独立**——文字を縮めても 48px の下限は動かさない（`min-h-12` / `min-h-[48px]` はそのまま）
- **ナビのラベルだけは本文の階段の外**：BottomNav / SideNav の読み仮名は `text-2xs`（10px）。5つ並ぶ短いカタカナ語はアイコンの読みであって読み下す文章ではなく、本文と同じ大きさだと常駐する帯なのに画面のどこよりも文字が詰まって見える（実際「ヒストリー」が右端で切れていた）。10px はカタカナが形を保てる下限——これ以下だと小書き（ッ／ョ）が並字と見分けられない。`text-2xs` の用途はこの2つだけ、本文には使わない
- **下ナビの帯は 56px（`h-14`）で、3か所と対**：`MiniPlayer` の `bottom-14`（帯の上に浮く位置）と `AppMain` の `pb-18`／ミニプレーヤー表示時 `pb-34`（最後までスクロールできる余白）。帯の高さを変えるならこの3つを一緒に動かす。中身はアイコン 20px・選択中の座布団 32px・ラベル 10px。**押せる範囲は帯の高さと独立**——`min-h-[48px]` で 48px を確保しているので、帯を低くしても指の当たりは変わらない
- **字号体系在 `globals.css` @theme 统一定义**：`text-2xs`=11px（仅导航）/ `text-xs`=12px / `text-sm`=14px / `text-base`=16px / `text-lg`=18px / `text-xl`=20px / `text-2xl`=22px / `text-3xl`=28px / `text-4xl`=32px / `text-5xl`=44px；`body` 也是 16px。曾经把每一级都比 Tailwind 默认整体上调一档（12→14 / 14→16 …），可读性有了，但相邻档永远只差 2px＝阶梯是平的，标题正文注记看着一样大。现在把那一档的上调**换成阶梯的斜率**：正文一带（12〜16px）收紧提高信息密度，标题与数值（18px 以上）拉开差距。行间按日文取得比默认宽（小档更宽、标题数值收紧）。写代码时按语义选类即可，不要用 `text-[10px]` 之类的任意值；Recharts 刻度是硬编码数字，保持 ≥12
- **改了字号就要回头看按字宽写死的固定宽度**：`w-*` 的文字栏是按「最长的词不折行」算出来的实寸，字缩小了却留着原来的框，多出来的宽度就白白从旁边的部件（滑块可动域等）扣掉（例：BrainConditionCard 两端标签 56/96px → 52/80px）
- 缩放**不可禁用**（viewport 不设 maximumScale/userScalable）；`user-select:none` 只作用于控件，正文可选择复制
- 字体：`next/font/google` 的 Noto Sans JP（构建期自托管，兼容静态导出），栈内排在系统日文字体之前
- **主题不是固定深色**：`lib/theme.ts` 按时段切 4 套调色板（00-06 midnight 深靛 / 06-12 day 淡桃 blush〔日の出：赤橙 #c42d18 の主色＋紅薔薇の accent〕/ 12-18 afternoon 薄荷 / 18-24 evening 淡紫，边界 60s 渐变），经 `--dyn-*` CSS 变量 + `applyPalette` 应用，图表监听 `THEME_CHANGE_EVENT` 重读。`#0a1628` 只存在于 MindArtCanvas 的画布底色
- **星座カードの空（`--sky-*`）はページの延長**：昼側3時間帯（day/afternoon/evening）は**同じ色相・同じ低彩度のまま明度だけ約 0.10 下げる**だけ（地の上に彩度の高い板を1枚浮かせない）。真夜中だけはページ自体が暗いので従来どおり深い紺。この地色に対し星座は **`ink` を白**にする——`ZodiacConstellation` は星の芯を opacity .95 で描くので濃い ink だと黒い点になり、図が本文の上の落書きに見える。白なら透かしとして効く（図が載る右半分で 2〜3:1、意図的に淡い）。読みやすさは装飾ではなく `strong`/`text` が担保し、昼側3つは**濃い文字**、真夜中だけ淡い文字。コントラストの拘束条件はグラデーションの**最も明るい stop**
- 颜色必须走 token：文字/背景用 `text-on-primary`/`text-on-accent`（CTA 上禁用 text-white）、状态色用 `text-success`/`text-warning`/`text-danger`（禁用 red/green/amber-400 原生类）——这 5 个键在每套调色板里按 ≥4.5:1 对比度调过（`ThemePalette` 的 onPrimary/onAccent/success/warning/danger）。SVG 属性吃不了 var()：图表用 `useDocumentScheme()`（light/dark，来自 `data-color-scheme`）选 `getBandColors(scheme)` / `compareSeriesColors(n, scheme)` 的实色组，或走 getComputedStyle（BrainRadarChart 模式）
- 星空卡（NIGHT_SKY）/ 水曼陀罗卡（DEEP_WATER）/ 全屏可视化是**刻意的固定深色艺术面**，其上的 text-white 保留
- **`breathe` の呼吸アニメは少数のカード向け**：`ProgramCard` の既定は `breathe`（`gentle-breathe` 3.5s 無限、拡大縮小）だが、`breathe-stagger` の遅延は**6枚目までしか定義が無い**。7枚目から先は全部が同じ拍で膨らみ、画面がざわつくうえ合成の負荷も枚数ぶん増える。数十枚並ぶ一覧では `breathe={false}` を渡す（`CatalogSection` はそうしている）
- 最大内容宽度 480px 居中
- 播放页动画用 CSS animation 或 requestAnimationFrame，避免 React 重渲染
- 载波频率 ≤ 1000Hz（适配中老年听觉）。一覧が 1000Hz を超える値を書いている節目（Energy 第8〜第12 の 1074〜1518Hz）は `playableCarrier` が1オクターブずつ下げて鳴らす（音名＝曲との響きは変えない。バイノーラルビートも 1000Hz 超では聞き取りにくい）

### 基础程序概要（详见 programs.ts）
| Program | ID | Carrier | Target Beat | Default Duration |
|---|---|---|---|---|
| リセット＆ディープ | reset-deep | 174Hz | 7.83Hz (Schumann) | 15min |
| クラリティ・フォーカス | clarity-focus | 432Hz | 40Hz (Gamma) | 20min |
| ナイトリカバリー | night-recovery | 136.1Hz | 1.5Hz (Delta) | 30min |
| モーニングチューニング | morning-tuning | 432Hz | 10Hz → 15Hz (α→Low β) | 10min |

`morning-tuning` 是第 4 个基础程序（素材文件夹「デフォルトプログラム」新增的 Morning Tuning & Energize）。周波数は一覧「Morning Tuning & Energizeプログラム.xlsx」どおり 432Hz × 10Hz（誘導波）で同調し、「音響テーマ」の 10.0 Hz ➔ 15.0 Hz どおり 15Hz へ持ち上げて終える（`lib/catalog/program-list.ts` の path）。四者里**唯一朝上走**的：结尾不回落到 10Hz——早晨要把人交给一天，不是让人躺回去。

### 目录体系（Sync Session 的 4 个分类）

`ProgramConfig` 上有一组**全部可选**的目录字段（`category` / `subGenre` / `titleEn` / `keywords` / `paramsProvisional`）。做成可选字段而不是旁挂一张 meta 表，是因为所有消费端本来就经 `getProgramById` 拿到 `ProgramConfig`——放在对象上，一次查表就够，也不可能两边不同步。

| 分类 | 来源 | 件数 | 备注 |
|---|---|---|---|
| デフォルト | `PROGRAMS`（lib/programs.ts） | 4 | 上表 |
| Target | `lib/catalog/target.ts` | 42 | 5 小分类，`subGenre` 是段标题 |
| Energy | `lib/catalog/energy.ts` | 13 | 第0〜第12 チャクラ |
| Astro | `ZODIAC_PROGRAMS` | 110 | 工厂里加一行 `category: "astro"`，数据不复制；`subGenre` = 星座名 |

**周波数はプログラム一覧（`docs/program-lists/*.xlsx`）どおり**。Target・Energy・Morning Tuning は `lib/catalog/program-list.ts` に1行ずつ写してあり（原文つき）、`pnpm check:programs` が xlsx と突き合わせる。Astro の 96 行は星座マスタ（`ZODIAC_SIGNS` × `MODULAR_BEATS`）がもともと同じ値を持つ（一覧に無い 4Hz・獅子座 15Hz・天秤座 8Hz の 14 節目は星座仕様の値のまま、曲は近いビートの曲を流用）。「脳波誘導波」欄の読み方：
- 「40.0 Hz」→ steady（10Hz の導入から滑らせて保つ）／「10Hz×40Hz」「5Hz・40Hz」→ layered（2つ目は layers）／デルタの幅「1.0〜2.0Hz」→ sweep（上から下へ、設計書の「段階的に下降」）／それ以外の幅「8.0Hz〜10.0Hz（ゾーン波形）」→ wave（幅を往復）／「10Hz→3Hz→15Hz」→ path（一覧の道筋どおりの折れ線）
- 誘導周波数（`targetBeatFreq`）は一覧が1つの数字ならそれ、道筋・幅のものは同調させる周波数（path は明示、sweep・wave は中間）。Sync Brain の共鳴率もこの値で見る
- 一覧どおりに鳴らさない行は `note` に理由を書く：40Hz Gamma Peak は説明どおり主キャリア 160Hz（432Hz は副キャリア＝曲）／Energy 第12 の Pure Void＝ビート 0Hz（うなりの無い静けさへ溶け込む）／Morning Tuning は「音響テーマ」の 10→15Hz。**暫定（`paramsProvisional`）は2件だけ**——Jet Lag（一覧の脳波誘導波が空欄）と Energy 第8（一覧の 4096Hz はビートとして鳴らせない）。どちらも一覧の確認待ちで、暫定ビートは `MODULAR_BEATS` の語彙から選ぶ（invariants が縛る）

**⚠ カタログ節目を足すときに黙って壊れる2点**：
1. `defaultDuration` は**最後の相位の `endTime` と厳密に一致**させること。`getAdjustedProgram`（lib/brain-profile.ts）は未知 id でも switch を素通りしたうえで `defaultDuration` を最後の相位から書き戻すので、ズレていると `ProgramCard` が全カードに嘘の「パーソナライズ済み」バッジを出す。`planTimeline()` が phases と duration を一緒に返すのはこのため。
2. 最初の相位名は必ず `導入`（`components/Visualizer.tsx` がそこだけ `targetBeatFreq` を表示する特判を持つ）。

另有星座节目体系（`ZODIAC_PROGRAMS`，模块合成型）：12 个固有节目（`zodiac-<sign>`，自星座载波×自星座差频）+ 各星座×9 种矩阵差频的模块版（`zodiac-<sign>-b<beat>`，共 110 个，工厂生成，统一 15min / 導入→遷移→同調→収束 四相位），经 `getProgramById` 兜底解析，全链路（播放/定时/导出/可视化）可用；首相位名必须保持 `導入`（Visualizer 特判）。
