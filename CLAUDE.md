# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

脳波チューニング・アプリ（Brainwave Tuning App）— 基于个人脑波数据的移动端 Web 应用，通过 Web Audio API 实时生成个性化双耳节拍（Binaural Beats）及自定义合成器音频。

**功能需求和音频参数的完整设计请参考项目根目录下的 `脳波チューニンク__アフ_リ設計.docx`，该文档为本项目的唯一需求来源。** 包括三大程序的频率配置、时间轴、UI 规格、发注仕様等均以该文档为准。

## Tech Stack

- Framework: Next.js 15 (App Router) + TypeScript (strict)
- Styling: Tailwind CSS
- Audio: Web Audio API（纯前端实时合成，不依赖后端）
- State: Zustand (`useAppStore` without persist; `useSynthStore` with persist for presets)
- Charts: Recharts
- Package Manager: pnpm
- PWA: next-pwa

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
│   ├── layout.tsx              # 全局布局 + 底部导航 + AudioContext 生命周期
│   ├── page.tsx                # 首页（脑部天气 / 心情选择 / 快速启动 / 合成器预设）
│   ├── player/page.tsx         # 播放页（可视化 / 混音 / 定时器）
│   ├── synth/page.tsx          # 合成器编辑页（多层振荡器 / 颤音 / 颤振 / 预设保存）
│   └── log/page.tsx            # 日志页（日历 / 脑龄图表 / 统计）
├── components/                 # UI 组件（AudioProvider, Mixer, Visualizer, Synth* 等）
├── lib/
│   ├── audio-engine.ts         # 【核心】BinauralSession class + AudioContext 单例 (getAudioContext)
│   ├── synth-engine.ts         # SynthSession class（多层振荡器合成 + 颤音 / 颤振）
│   ├── programs.ts             # 三大程序频率参数（从设计文档映射）
│   ├── ramp-scheduler.ts       # 频率渐变调度器
│   └── utils.ts                # formatTime, getCurrentPhaseInfo
├── store/
│   ├── useAppStore.ts          # Zustand 全局状态（脑波程序选择 / 播放 / 日志）
│   └── useSynthStore.ts        # Zustand 合成器状态 + persist（仅 savedPresets 持久化）
└── public/sounds/              # 自然音素材
```

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

### PWA
- Service Worker 对 /sounds/ 大文件用 network-first 策略，不做预缓存
