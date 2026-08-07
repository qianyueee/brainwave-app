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
│   ├── page.tsx                # Home 首页（脳コンディション3指標 / 脳特性チャート卡 / Today's Cosmic Sync 星座卡〔星图+下拉选择+今日文案+推荐〕/ 右上角設定入口）
│   ├── session/page.tsx        # Sync Session（顶部 Water Mandala 水マンダラ英雄卡〔当日星座频率+播放〕+ プログラム選択・再生：Sync Sound 3節目 / 配信 / カスタム・合成器入口）
│   ├── brain/page.tsx          # Sync Brain（脳波同期・測定：マインドマップ/測定/過去の測定；分析已移至 report）
│   ├── report/page.tsx         # Sync Report（脳特性チャート分析＋3指標タイル＋測定の比較〔2〜3件の6指標＆スペクトル〕合并页）
│   ├── history/page.tsx        # Sync History（日历 / セッション統計 / 脳波の記録；レポートで見る→/report）
│   ├── settings/page.tsx       # Settings（账号 / 管理入口 / 应用信息；菜单外，从首页齿轮进入）
│   ├── player/page.tsx         # Sync Sound 播放页（可视化 / 混音 / 定时器；菜单外，从节目卡进入）
│   ├── synth/page.tsx          # 合成器编辑页（仅管理员；多层振荡器 / 颤音 / 预设保存）
│   ├── admin/page.tsx          # 管理面板（仅管理员）
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
│   ├── brain-measurements.ts   # 测定记录纯函数辅助（compositeScore / scoreColor / measurementLabel）
│   ├── brain-metrics.ts        # 脳コンディション3指標（Rate/Clarity/Reset，副标题为日文说明，由最新測定计算，数据不足为 null）
│   ├── subject-groups.ts      # 測定者→記録 二段下拉的纯函数（subjectGroups / matchesSubject / resolveSubjectKey；ALL_SUBJECTS / NO_SUBJECT 哨兵值）
│   ├── ramp-scheduler.ts       # 频率渐变调度器
│   └── utils.ts                # formatTime, getCurrentPhaseInfo
├── store/
│   ├── useAppStore.ts          # Zustand 全局状态（脑波程序选择 / 播放 / 日志）
│   ├── useSynthStore.ts        # Zustand 合成器状态 + persist（仅 savedPresets 持久化）
│   └── useZodiacStore.ts       # マイ星座偏好 + persist（普通 localStorage，未登录也生效）
├── public/sounds/              # 自然音素材
│   └── zodiac/                 # 96 首星座音乐（12星座×8差频，128kbps 立体声，已去封面图，共 284MB）
└── zodiac-music/               # 星座音乐素材说明（README；原始 190kbps 版本只存在于 `zodiac-music` 分支，不合并进 main）
```

### 菜单与页面命名（Sync 体系）

- 导航 5 项（`components/nav-tabs.ts`，BottomNav / SideNav 共用）：Home `/`、Sync Session `/session`、Sync Brain `/brain`、Sync Report `/report`、Sync History `/history`
- Settings `/settings` 与播放页 `/player` 均不在导航中：設定从首页右上角齿轮进入，播放页从节目卡 / 心情选择进入
- 节目卡入口带播放中保护：正在播放的节目再次点击只跳转、不重置 `selectedProgramId` / `timerDuration`
- 职责划分：Sync Brain 只管**測定**（マインドマップ等）；Sync Report 汇总**分析＋比較**（脳特性チャート＋測定の比較）。測定导入（useImportSession）与ヒストリー的「レポートで見る」都跳 `/report`；首页脳特性チャート卡也链到 `/report`，3指標タイル仍链到 `/brain`（測定入口）
- 脳コンディション3指標（Rate/Clarity/Reset）在首页与 Sync Report 双端显示，同一 store＋同一 `computeBrainConditionMetrics`，数值恒同步
- 過去の測定（Sync Brain）与脳波の記録（Sync History）统一为**測定者→測定データ 二段下拉**（`components/SelectDropdown.tsx`＋`lib/subject-groups.ts`）：先选人再选该人的某条记录，只展开选中的那一条（脳特性/推移/メモ/レポートで見る/削除）。分组来自记录自身（session 用 `subjectId`、measurement 用 `subject` 名），只有 1 人时隐藏測定者下拉；2 人以上追加「全員」；默认选中当前測定者（`useSubjectStore` 的 activeSubject），选择失效时自动回落到最新记录。Sync History 的推移グラフ只画所选測定者的记录（混人不成趋势）
- Sync Session 顶部为 Water Mandala 英雄卡（`components/WaterMandalaHero.tsx`＋`WaterMandala.tsx`）：SVG 水纹曼陀罗，几何由频率决定（载波→同心环数、差频→花瓣数〔log 映射，9 种差频各不相同〕、差频越快涟漪越快），默认显示与首页同源的当日星座推荐（自星座载波×当日差频），播放按钮同样带播放中保护

### 星座音乐（音楽ベッド）

- 96 首（12星座 × 8差频）放在 `public/sounds/zodiac/<key>-b<beat>.mp3`，由 `lib/zodiac-audio.ts` 的 `zodiacMusicUrl(programId)` 解析（`zodiac-<key>` 走自星座差频，`zodiac-<key>-b<beat>` 走模块差频）
- **这些音频里没有任何诱导成分**（经三项检测：左右声道无频率差、包络无差频调制、无差频纯音）。它们是围绕载波频率做的音乐，文件名里的 `_40Hz` 只是标记所属节目。因此诱导仍由 `BinauralSession` 实时合成，音乐只作为**伴奏铺在节拍下面**循环播放（曲长 1〜8 分钟，平均 3 分，对 15 分钟节目）
- 音量独立于自然音：`useAppStore.musicVolume`（默认 0.6）→ `BinauralSession.playMusicBed / setMusicVolume`（内部第二个 `NaturePlayer` 实例，与自然音互不干扰，可同时开）；Mixer 仅在星座节目时显示「星座ミュージック」滑块
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
- 脑波：`startSession` / `stopSession` / `getSession`
- 合成器：`startSynth` / `stopSynth` / `getSynthSession` / `updateSynthLayers`
- 互斥播放逻辑也在此处理

内部持有 `BinauralSession` 和 `SynthSession` ref，每秒轮询 elapsed 更新 Zustand store。
使用 `useAudio()` hook 在任意子组件中访问。

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
- `useAppStore` 未启用 persist，sessionLogs 仅存于内存
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
- 背景色 #0a1628、最大内容宽度 480px 居中
- 播放页动画用 CSS animation 或 requestAnimationFrame，避免 React 重渲染
- 载波频率 ≤ 1000Hz（适配中老年听觉）

### 三大程序概要（详见 programs.ts）
| Program | ID | Carrier | Target Beat | Default Duration |
|---|---|---|---|---|
| リセット＆ディープ | reset-deep | 174Hz | 7.83Hz (Schumann) | 15min |
| クラリティ・フォーカス | clarity-focus | 432Hz | 40Hz (Gamma) | 20min |
| ナイトリカバリー | night-recovery | 136.1Hz | 1.5Hz (Delta) | 30min |

另有星座节目体系（`ZODIAC_PROGRAMS`，模块合成型）：12 个固有节目（`zodiac-<sign>`，自星座载波×自星座差频）+ 各星座×9 种矩阵差频的模块版（`zodiac-<sign>-b<beat>`，共 110 个，工厂生成，统一 15min / 導入→遷移→同調→収束 四相位），经 `getProgramById` 兜底解析，全链路（播放/定时/导出/可视化）可用；首相位名必须保持 `導入`（Visualizer 特判）。
