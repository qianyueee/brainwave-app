# 自定义合成器功能总结

## 概述

在脑波调谐应用中新增了"自定义合成器"功能。用户可以叠加多个振荡器音层，自由调节频率、音量、音色、颤音等参数，构建个性化音频并保存为预设。合成器与脑波程序互斥播放。

---

## 功能清单

### 1. 多层振荡器合成
- 最多 8 个音层叠加
- 频率范围：20 ~ 10,000 Hz，精度 0.01Hz
- 音量范围：0 ~ 100%
- 音色切换：Soft（正弦波）/ Bright（锯齿波 + 低通滤波器）
- 滑块 + 数字输入两种调节方式
- 播放中实时调节参数，音频平滑过渡

### 2. 逐层颤音（Tremolo）
- 每个音层独立的颤音开关
- 两种模式：
  - **Sine**：正弦波幅度调制（LFO）
  - **Decay**：指数衰减式幅度调制
- 频率（Rate）：0.01 ~ 20.00 Hz，精度 0.01
- 深度（Depth）：0 ~ 100%，精度 1%
- 调参时不重建主振荡器，避免爆音

### 3. 全局颤振（Vibrato）
- 作用于总线，影响所有音层
- 通过 LFO → GainNode → osc.detune（音分）实现音高调制
- 频率（Rate）：0.01 ~ 20.00 Hz，精度 0.01
- 深度（Depth）：0 ~ 100%（100% = ±100 音分）
- UI 位于播放按钮下方

### 4. 倍音模式（Harmonic Mode）
- 与 Free 模式并列的编辑模式
- 输入基频（最低 1 Hz），自动生成 1~9 次倍音
- 各倍音频率 = 基频 × n
- 音量按指数衰减：0.8^(n-1)
- 生成后各参数仍可独立调节

### 5. 立体声模式（Stereo Mode）
- 非独立模式，而是叠加在 Free / Harmonic 之上的开关
- 开启后分离左右声道，各自独立编辑（最多各 8 层）
- 切换逻辑：
  - 单声道 → 立体声：复制当前音层到两个声道
  - 立体声 → 单声道：取左声道音层
- 引擎通过 `ChannelMergerNode` 路由左右声道
- 全局 Vibrato 统一作用于两个声道

### 6. 预设系统
- 命名保存当前配置（音层、颤音、颤振、模式、立体声状态）
- 预设持久化到 localStorage
- 首页显示已保存的预设卡片，点击加载并跳转到编辑页
- 预设编码模式字段：`free` / `harmonic` / `free-stereo` / `harmonic-stereo`

### 7. 互斥播放
- 启动合成器自动停止脑波程序
- 启动脑波程序自动停止合成器

---

## 文件结构

### 新增文件（6 个）

| 文件 | 说明 |
|------|------|
| `lib/synth-engine.ts` | 合成器音频引擎（SynthSession 类） |
| `store/useSynthStore.ts` | Zustand 状态管理（编辑器状态 + 预设持久化） |
| `app/synth/page.tsx` | 合成器编辑页面 |
| `components/SynthLayerCard.tsx` | 单个音层编辑卡片 |
| `components/SynthPlaybackButton.tsx` | 播放/停止按钮 |
| `components/SynthVibratoPanel.tsx` | 全局颤振控制面板 |
| `components/SynthPresetCard.tsx` | 首页预设卡片 |

### 修改文件（2 个）

| 文件 | 修改内容 |
|------|----------|
| `components/AudioProvider.tsx` | 新增 synth 相关方法，实现互斥播放 |
| `app/page.tsx` | 首页新增"カスタム"区域 + 预设卡片列表 |

---

## 音频信号链

### 单声道模式
```
OscillatorNode → [BiquadFilterNode] → TremoloGainNode → LayerGainNode → MasterGainNode → destination
                                                                              ↑
VibratoLFO → VibratoGainNode → osc.detune（所有振荡器）
```

### 立体声模式
```
左声道音层 → [filter] → tremoloGain → layerGain → LeftGainNode  → ChannelMergerNode(0) ─┐
                                                                                          ├→ destination
右声道音层 → [filter] → tremoloGain → layerGain → RightGainNode → ChannelMergerNode(1) ─┘

VibratoLFO → VibratoGainNode → osc.detune（所有振荡器）
```

### 颤音信号链
- **Sine 模式**：`LFO(OscillatorNode) → LFOGainNode → tremoloGain.gain`
- **Decay 模式**：`setInterval` 周期性触发 `setTargetAtTime` 指数衰减

---

## 关键技术决策

1. **OscillatorNode 不可复用**：stop() 后必须重建，切换音色时需销毁并重建节点
2. **参数平滑过渡**：统一使用 `setTargetAtTime(val, now, 0.02)` 避免音频突变
3. **颤音参数调节不重建主振荡器**：仅销毁/重建 LFO 节点，通过 `tremoloGain` 平滑过渡到 1 后再应用新调制
4. **crypto.randomUUID 兼容**：HTTP 环境下降级为 `Date.now().toString(36) + Math.random()`
5. **Zustand persist + partialize**：仅持久化 `savedPresets`，编辑器状态不持久化
6. **MasterGain 自动缩放**：按层数 `1/layerCount` 缩放防止削波

---

## 已修复的问题

| 问题 | 原因 | 修复方式 |
|------|------|----------|
| 移动端 `crypto.randomUUID is not a function` | HTTP 环境不支持 | 添加 `generateId()` 降级方案 |
| 调整颤音参数时爆音 | 重建整个振荡器节点导致音频中断 | 分离颤音节点管理，不触碰主振荡器 |
| 颤音开关白点方向反转 | CSS translate 值不正确 | 修正为 `translate-x-5` / `translate-x-0` |
| `generateId()` 无限递归 | replace_all 误替换函数内部的 `crypto.randomUUID()` | 修正函数体内的调用 |
| 构建时栈溢出 | 上述无限递归在 SSR 中触发 | 同上 |
