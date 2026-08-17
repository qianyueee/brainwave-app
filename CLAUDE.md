# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NeuroSync（ニューロシンク）— 基于个人脑波数据的移动端 Web 应用，通过 Web Audio API 实时生成个性化双耳节拍（Binaural Beats）及自定义合成器音频。产品副标题：〜 音波×光波×脳波シンクロ誘導 ＆ 脳コンディション管理 〜

**功能需求和音频参数的完整设计请参考项目根目录下的 `脳波チューニンク__アフ_リ設計.docx`，该文档为本项目的唯一需求来源。** 包括三大程序的频率配置、时间轴、UI 规格、发注仕様等均以该文档为准。

## Tech Stack

- Framework: Next.js 16 (App Router, `output: "export"` 静态导出) + TypeScript (strict)
- Styling: Tailwind CSS
- Audio: Web Audio API（纯前端实时合成，不依赖后端）
- State: Zustand (`useAppStore` without persist; `useSynthStore` with persist for presets)
- Charts: Recharts
- Astronomy: astronomy-engine（太陽/月星座计算；仅在 `lib/zodiac.ts` 的 `getTodaySky` 内动态 import → 独立懒加载 chunk，禁止顶层静态 import）
- Package Manager: pnpm

## Development Commands

```bash
pnpm install          # 安装依赖
pnpm dev              # 启动开发服务器
pnpm build            # 构建生产版本
pnpm start            # 本地预览
pnpm tsc --noEmit     # 类型检查
pnpm lint             # Lint
```

## Architecture

### 目录结构

```
brainwave-app/
├── app/
│   ├── layout.tsx              # 全局布局 + 双导航挂载 + AudioContext 生命周期
│   ├── page.tsx                # Home 首页（品牌行〔NeuroSync® のみ〕→ 「Home / 今日の星空・宇宙周波数で即座に調律」页面见出し → Sync Tree 风景卡〔左上ラベル・右上％・右下矢印だけ、整卡点击进 /tree〕→ 脳コンディションカード → 星座卡；右上角設定入口。桌面端左列＝Tree＋コンディション、右列＝星座卡）
│   ├── session/page.tsx        # Sync Session（顶部 Water Mandala 水マンダラ英雄卡〔当日星座频率+播放〕+ プログラム選択・再生：Sync Sound 3節目 / 所属グループへの配信プログラム。※音源制作・公開などの管理操作は置かない——管理面板「音源」タブへ移設済み）
│   ├── brain/page.tsx          # Sync Brain（脳波同期・測定：接続する＋測定者チップ → 測定を開始 → 出どころ1行 → マインドマップ/過去の測定；分析已移至 report）
│   ├── report/page.tsx         # Sync Report（大见出し直下のタブで2ページ切替：「脳特性チャート」＝分析＋3指標タイル ／「測定の比較」＝2〜3件の6指標＆スペクトル。既定は脳特性チャート）
│   ├── history/page.tsx        # Sync History（日历〔日付タップで当日の明細〕/ セッション統計 / 脳波の記録；レポートで見る→/report）
│   ├── settings/page.tsx       # Settings（账号 / 管理入口 / 应用信息；菜单外，从首页齿轮进入）
│   ├── tree/page.tsx           # Sync Tree 16段階ギャラリー／詳細（段階名・育てた木数はここだけ、進捗%はホーム树卡と両方；菜单外，从首页树卡进入）
│   ├── player/page.tsx         # Sync Sound 播放页（可视化 / 混音 / 定时器；菜单外，从节目卡进入）
│   ├── synth/page.tsx          # 合成器编辑页（仅管理员；多层振荡器 / 颤音 / 预设保存）
│   ├── admin/page.tsx          # 管理面板（仅管理员／4 タブ：ユーザー・グループ・音源〔AudioStudio：新規作成/タイムライン・カスタムプログラム・シンセプリセット・配信中の取り下げ〕・配信〔ProgramAssigner：グループ割当〕）
│   └── mind|profile|log|compare/ # 旧路由跳转桩（客户端 redirect → session/brain/history/report）
├── components/                 # UI 组件（AudioProvider, Mixer, Visualizer, Synth*, mind/* 等）
│   └── nav-tabs.ts             # 双导航（BottomNav / SideNav）唯一的标签配置来源（5 项）
├── lib/
│   ├── audio-engine.ts         # 【核心】BinauralSession class + AudioContext 单例 (getAudioContext)
│   ├── synth-engine.ts         # SynthSession class（多层振荡器合成 + 颤音 / 颤振）
│   ├── programs.ts             # 三大程序频率参数（从设计文档映射）+ ZODIAC_PROGRAMS（12星座节目，工厂生成，id 前缀 `zodiac-`，不并入 PROGRAMS）
│   ├── zodiac.ts               # 12星座マスタ + 太陽/月星座計算（getTodaySky，动态 import astronomy-engine）+ isNightNow（6/18时昼夜界）+ dailyRecommendation（モジュール合成：載波=自星座固定、差频按四标签×情境可变——活性=太阳40/月20Hz、フロー=太阳12/月10Hz、バランス=平日14/休日夜间7.83Hz、回復=傍晚6/深夜4/月在魚座2Hz；48条 §6 メッセージ模板；优先级 healing→activation→flow→balance，火×地/風×水归紧张）
│   ├── zodiac-constellations.ts # 12星座点线星图数据（0-100 归一化坐标，ZodiacConstellation 组件绘制，emoji 不再使用）
│   ├── zodiac-audio.ts         # 星座节目的音乐床垫映射（program id → public/sounds/zodiac/<key>-b<beat>.mp3；缺失差频就近取用）
│   ├── sync-tree.ts            # Sync Tree 16段階成長モデル（6.25%刻み、treeStageIndex / TREE_STAGES；成長ロジック未実装期は PLACEHOLDER_TREE 固定値）。绘画在 components/SyncTreeArt.tsx（SyncTreeFigure / SyncTreeStageTile，手描きの光の樹）；ホーム树卡背景为三态 --tree-* 变量（lib/theme.ts 的 TREE_SKY_SUNRISE/DAY/NIGHT：day=日の出の淡桃〜珊瑚、afternoon=白日、midnight+evening=星空。夜2つを1つに畳むのは星空が2時でも20時でも同じに読めるから、昼2つを分けるのは朝と真昼が別の時刻に見えるから。树本体配色不随主题变）
│   ├── brain-measurements.ts   # 测定记录纯函数辅助（compositeScore / scoreColor / measurementLabel）
│   ├── day-records.ts          # カレンダーの当日明細（buildDayRecords / recordedDayKeys / dayKeyOf）。再生ログ＋取り込んだ脳波測定＋10秒チェックの3出どころを時刻順に1本へ畳む純関数。UI から切り出してあるのは脳波測定がログイン必須ストア（per-user persist）でブラウザから仕込めないため——純関数なら3種すべて実コードで検証できる。描画は components/SimpleCalendar
│   ├── brain-metrics.ts        # 脳コンディション3指標（Rate/Clarity/Reset，副标题为日文说明，数据不足为 null）。**セッション由来**＝computeBrainConditionMetrics（入定速度×40Hz共鳴率）／**非セッション由来**＝computeBaselineConditionMetrics（下の baseline.ts が算出済みの値を変換するだけ）
│   ├── mind/baseline.ts        # 10秒ベースラインチェック（非セッション時の3指標）。ターゲット周波数が無い平常時は引き込み速度が測れないので別ロジックへ：パターン1 Berger効果（開眼5秒⇄閉眼5秒のα波立ち上がり速度＋メリハリ比）を既定、成立しなければパターン2 静止時可塑性（スペクトル・エントロピー×帯域間移動度）へフォールバック。Clarity=(40Hzγ+高α)/高β、Reset=(δ+θ)比×ゆらぎ。係数は BASELINE_CONFIG に集約（**暫定値**、実測が貯まったら再標定）。⚠ サンプルは1Hzなので T_α-rise の分解能は1秒
│   ├── subject-groups.ts      # 測定者→記録 二段下拉的纯函数（subjectGroups / matchesSubject / resolveSubjectKey；ALL_SUBJECTS / NO_SUBJECT 哨兵值）
│   ├── ramp-scheduler.ts       # 频率渐变调度器
│   └── utils.ts                # formatTime, getCurrentPhaseInfo
├── store/
│   ├── useAppStore.ts          # Zustand 全局状态（脑波程序选择 / 播放 / 日志）
│   ├── useSynthStore.ts        # Zustand 合成器状态 + persist（仅 savedPresets 持久化）
│   ├── useBaselineStore.ts     # 10秒ベースラインチェックの履歴 + persist（素の localStorage＝未ログインでも習慣が続く。最大60件。demo/realtime を必ず区別し、ホームの3指標は latestRealCheck＝実測のみを読む）
│   ├── useSidebarStore.ts      # 桌面左栏开合（不 persist：每次加载都从收起开始）
│   └── useZodiacStore.ts       # マイ星座偏好 + persist（普通 localStorage，未登录也生效）
├── public/sounds/              # 自然音素材
│   └── zodiac/                 # 96 首星座音乐（12星座×8差频，128kbps 立体声，已去封面图，共 284MB）
└── zodiac-music/               # 星座音乐素材说明（README；原始 190kbps 版本只存在于 `zodiac-music` 分支，不合并进 main）
```

### 菜单与页面命名（Sync 体系）

- 导航 5 项（`components/nav-tabs.ts`，BottomNav / SideNav 共用）：Home `/`、Sync Session `/session`、Sync Brain `/brain`、Sync Report `/report`、Sync History `/history`
- Settings `/settings` 与播放页 `/player` 均不在导航中：設定从首页右上角齿轮进入，播放页从节目卡 / 心情选择进入
- 桌面左栏（SideNav）可收起，**默认收起**（`useSidebarStore`，故意不 persist——每次加载都从收起开始，SSR/首屏一致无 hydration mismatch，客户端路由期间保持）。收起时只留左上角 `fixed` 的悬浮圆角按钮（56px，`aria-label="メニューを開く"`），点击后外框宽度 0→15rem 动画展开把内容推向右侧（不是浮层覆盖）；内侧面板是 `absolute right-0 w-60` 固定宽度，所以看起来是从左边滑入。关闭走面板头部右侧的按钮或 Esc。收起期间面板挂 `inert`，不进 Tab 序与读屏。**240px / 15rem 这个数值在 SideNav（`md:w-60`）与 MiniPlayer（`md:left-60`）两处要一致**；AppMain 在收起时改用 `md:pl-20` 给悬浮按钮让出左侧沟槽，避免压住页面标题
- 节目卡入口统一走 `usePlayProgram`：点击＝**选择并进入 `/player`，不自动播放**（播放由用户在播放页按下再生钮；自动播放会在进入播放页前先冒出 MiniPlayer，属被否掉的方案）；正在播放（含一時停止）的节目再次点击只跳转、不重置（播放中保护，按 `playingProgramId` 真源判断）；**别的节目在响时点新卡＝停掉在响的（不记日志）再选中新节目**——播放页永远显示"刚点的那个"。全局 MiniPlayer 播放条见「播放入口与全局播放条」
- 职责划分：Sync Brain 只管**測定**（マインドマップ等）；Sync Report 汇总**分析＋比較**（脳特性チャート＋測定の比較）。測定导入（useImportSession）与ヒストリー的「レポートで見る」都跳 `/report`；首页脳特性チャート卡也链到 `/report`。首页 BrainConditionCard 分成两个具名区块：上半「脳コンディション」（測定由来的 3 指標＋出处标注，会在「直近脳波測定データ」/「10秒クイックチェック」之间按**更新的一方**自动切换）右上「詳細へ →」链 `/report`（读分析）、指標下方「今すぐ測定へ →」链 `/brain`（测新数据）；下半「今の『感コンディション』をチェック」是自己評価滑块，**軸は測定側と同じ3つ**（⚡スイッチ力〔ガチガチ⇄スムーズ〕／💡ひらめき度〔モヤモヤ⇄クリア〕／🌙休息度〔疲れ⇄リフレッシュ〕；数値は出さず両端の言葉で答える、内部は 0-100）。締めのボタン「10秒 脳波測定をはじめる」＝主観を保存してから `useBaselineStore.requestCheck()` を立てて `/brain` へ遷移し、そこで計測ダイアログが自動で開く（フラグは非永続・一度きり）——読と書の导线分开という原則は維持したまま、主観と客観が同じ瞬間のペアで残る
- 脳コンディション3指標（Rate/Clarity/Reset）在首页与 Sync Report 双端显示，同一 store＋同一 `computeBrainConditionMetrics`，数值恒同步
- 過去の測定（Sync Brain）与脳波の記録（Sync History）统一为**測定者→測定データ 二段下拉**（`components/SelectDropdown.tsx`＋`lib/subject-groups.ts`）：先选人再选该人的某条记录，只展开选中的那一条（脳特性/推移/メモ/レポートで見る/削除）。分组来自记录自身（session 用 `subjectId`、measurement 用 `subject` 名），只有 1 人时隐藏測定者下拉；2 人以上追加「全員」；默认选中当前測定者（`useSubjectStore` 的 activeSubject），选择失效时自动回落到最新记录。Sync History 的推移グラフ只画所选測定者的记录（混人不成趋势）
- Sync Session 顶部为 Water Mandala 英雄卡（`components/WaterMandalaHero.tsx`＋`WaterMandala.tsx`）：SVG 水纹曼陀罗，几何由频率决定（载波→同心环数、差频→花瓣数〔log 映射，9 种差频各不相同〕、差频越快涟漪越快），默认显示与首页同源的当日星座推荐（自星座载波×当日差频），播放按钮同样带播放中保护

### 星座音乐（音楽ベッド）

- 96 首（12星座 × 8差频）放在 `public/sounds/zodiac/<key>-b<beat>.mp3`，由 `lib/zodiac-audio.ts` 的 `musicBedUrl(programId)` 解析（`zodiac-<key>` 走自星座差频，`zodiac-<key>-b<beat>` 走模块差频）；**三大基础程序也各有专属曲**（Suno 生成）放在 `public/sounds/programs/<节目id>.mp3`，同一 resolver 优先命中。`hasMusicBed(programId)` 门控 Mixer 音乐滑块，标签对星座节目为「星座ミュージック」、对基础程序为「ミュージック」
- **这些音频里没有任何诱导成分**（经三项检测：左右声道无频率差、包络无差频调制、无差频纯音）。它们是围绕载波频率做的音乐，文件名里的 `_40Hz` 只是标记所属节目。因此诱导仍由 `BinauralSession` 实时合成，音乐只作为**伴奏铺在节拍下面**循环播放（曲长 1〜8 分钟，平均 3 分，对 15 分钟节目）
- 音量独立于自然音：`useAppStore.musicVolume`（默认 0.6）→ `BinauralSession.playMusicBed / setMusicVolume`（内部第二个 `NaturePlayer` 实例，与自然音互不干扰，可同时开）；Mixer 在有音乐床垫的节目（星座＋三大基础）显示音乐滑块
- 缺失差频就近取用（只换伴奏，合成的诱导差频不变）：4Hz 未交付 → 2Hz（2/6 等距，取更深的）；獅子座自星座 15Hz → 14Hz；天秤座 8Hz → 7.83Hz
- 若日后补齐 4Hz，把文件放进 `public/sounds/zodiac/` 并在 `AVAILABLE_BEATS` 加上 4 即可，其余逻辑无需改动

### 两个音频引擎

本项目有两个独立的音频引擎，**互斥播放**（启动一个自动停止另一个）：

#### 1. 脑波双耳节拍引擎 (`lib/audio-engine.ts`)
```
AudioContext（全局单例，getAudioContext() 管理）
├── OscillatorNode (左声道 carrier freq)
│   → GainNode → ChannelMergerNode(input 0) ─┐
├── OscillatorNode (右声道 carrier + beatFreq) │
│   → GainNode → ChannelMergerNode(input 1) ─┤→ destination
└── AudioBufferSourceNode (自然音 loop)        │
    → GainNode ─────────────────────────────→ destination
```

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

### 暂停/恢复（真・一時停止）

- 暂停 = `ctx.suspend()`：音频时钟冻结 → elapsed、频率 ramp、自然音、音乐床垫全部原地冻结；**绝不触碰振荡器**（OscillatorNode 停了不能重启）。恢复 = `ctx.resume()`。
- 会话结束是**墙钟 setTimeout**（不随 suspend 冻结）：暂停时必须 clear（`BinauralSession.pause()` / AudioProvider 的 `customEndTimerRef`），恢复时按 `duration - elapsed` 重排。
- "用户主动暂停"标志 `isUserPaused` 放在 `lib/audio-context.ts`——因为 `getAudioContext()` 每次调用都会自动 resume 挂起的 context，keep-alive 的 `visibilitychange` 也会。两处都要过这道闸，否则任何音频调用/回前台都会破坏暂停。所有 start 路径先清标志。
- 暂停时 keep-alive `<audio>` 流**必须一起暂停**（`setKeepAliveOutputPaused`）：suspend 后 MediaStream 不再产出采样，仍在播放的 `<audio>` 在部分移动端浏览器会循环残留缓冲发出"嘟嘟"杂音。MediaSession 元数据/handler 保持注册（锁屏控件仍在），锁屏状态由 `setMediaSessionPlaybackState("playing"|"paused"|"none")` 同步；play/pause handler 接 `resumeSession`/`pauseSession`（恢复在手势上下文内，`play()` 合法；纯合成器仍是停止语义）。`visibilitychange` 的 `<audio>` 重启同样要过 `isUserPaused` 闸。
- store 语义：`isPlaying` = 会话活跃（**含暂停**，既有消费者如 Timer 禁用/播放中保护依赖此义），`isPaused` 是其内訳。
- 日志：手动停止也记录（部分时长），自然结束记满时长；切换节目**不**记录被打断的会话（start 路径直接调 engine stop，不走 stopSession）。

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
- timeScale = userDuration / defaultDuration，用于缩放所有 phase 时间点
- `useAppStore` 启用 persist（普通 localStorage，key `app-playback`，未登录也生效）+ partialize：仅持久化 `selectedProgramId / timerDuration / beatVolume / musicVolume / natureVolume / natureSoundId`（默认音量：ビート 0.2・星座音乐 0.6）；sessionLogs 与运行态（isPlaying/elapsed/playingProgramId）仍只存内存。播放页整页挂 hydrated 守卫防 hydration mismatch
- `playingProgramId` = 实际在响的节目 id（音频真源），仅由 AudioProvider 的 start/stop 写入；显示端（/player 及其子组件、ExportDialog）一律用 `useDisplayProgramId()`（在响→真源，否则→选择），MiniPlayer 直接用真源——保证"听到的"和"看到的"永远一致
- `useSynthStore` 启用 persist + partialize，仅持久化 `savedPresets`
- `crypto.randomUUID` 在 HTTP 环境下不可用，需降级为 `Date.now().toString(36) + Math.random()`

## Notes & Prompts

### 必须遵守
- 所有浏览器 API 相关组件加 `"use client"`
- AudioContext 必须在用户 click/touch 事件中创建或 resume（浏览器自动播放策略）
- iOS Safari 需要额外的 touch 事件解锁音频
- 音频节点不用时必须 disconnect() 防止内存泄漏
- Zustand persist 在 SSR 时会 hydration mismatch，需用 skipHydration 处理
- 调整颤音参数时不重建主振荡器，仅销毁/重建 LFO 节点，避免爆音

### UI 约束
- 目标用户 50-60 岁：最小字号 16px、正文 18px、触控区域 ≥ 48×48px
- **字号体系已在 `globals.css` @theme 整体重映射**：`text-xs`=14px / `text-sm`=16px / `text-base`=18px / `text-lg`=20px / `text-xl`=22px（2xl+ 不变）。写代码时按语义选类即可，不要用 `text-[10px]` 之类的任意值；Recharts 刻度是硬编码数字，保持 ≥12
- 缩放**不可禁用**（viewport 不设 maximumScale/userScalable）；`user-select:none` 只作用于控件，正文可选择复制
- 字体：`next/font/google` 的 Noto Sans JP（构建期自托管，兼容静态导出），栈内排在系统日文字体之前
- **主题不是固定深色**：`lib/theme.ts` 按时段切 4 套调色板（00-06 midnight 深靛 / 06-12 day 淡桃 blush〔日の出：鮮やかな橘紅 #c8330a の主色＋紅薔薇の accent〕/ 12-18 afternoon 薄荷 / 18-24 evening 淡紫，边界 60s 渐变），经 `--dyn-*` CSS 变量 + `applyPalette` 应用，图表监听 `THEME_CHANGE_EVENT` 重读。`#0a1628` 只存在于 MindArtCanvas 的画布底色
- 颜色必须走 token：文字/背景用 `text-on-primary`/`text-on-accent`（CTA 上禁用 text-white）、状态色用 `text-success`/`text-warning`/`text-danger`（禁用 red/green/amber-400 原生类）——这 5 个键在每套调色板里按 ≥4.5:1 对比度调过（`ThemePalette` 的 onPrimary/onAccent/success/warning/danger）。SVG 属性吃不了 var()：图表用 `useDocumentScheme()`（light/dark，来自 `data-color-scheme`）选 `getBandColors(scheme)` / `compareSeriesColors(n, scheme)` 的实色组，或走 getComputedStyle（BrainRadarChart 模式）
- 星空卡（NIGHT_SKY）/ 水曼陀罗卡（DEEP_WATER）/ 全屏可视化是**刻意的固定深色艺术面**，其上的 text-white 保留
- 最大内容宽度 480px 居中
- 播放页动画用 CSS animation 或 requestAnimationFrame，避免 React 重渲染
- 载波频率 ≤ 1000Hz（适配中老年听觉）

### 三大程序概要（详见 programs.ts）
| Program | ID | Carrier | Target Beat | Default Duration |
|---|---|---|---|---|
| リセット＆ディープ | reset-deep | 174Hz | 7.83Hz (Schumann) | 15min |
| クラリティ・フォーカス | clarity-focus | 432Hz | 40Hz (Gamma) | 20min |
| ナイトリカバリー | night-recovery | 136.1Hz | 1.5Hz (Delta) | 30min |

另有星座节目体系（`ZODIAC_PROGRAMS`，模块合成型）：12 个固有节目（`zodiac-<sign>`，自星座载波×自星座差频）+ 各星座×9 种矩阵差频的模块版（`zodiac-<sign>-b<beat>`，共 110 个，工厂生成，统一 15min / 導入→遷移→同調→収束 四相位），经 `getProgramById` 兜底解析，全链路（播放/定时/导出/可视化）可用；首相位名必须保持 `導入`（Visualizer 特判）。
