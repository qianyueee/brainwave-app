# Mindmap 实时显示 与 脳特性 导入 — 算法与数据全说明

本文档详细记录两条链路的**每一个显示元素**、它使用的**具体数据字段**和**算法公式**：

1. **Mindmap 实时测试显示**：测量运行时屏幕上看到的所有内容（`app/mind/page.tsx`）。
2. **导入到脳特性页**：一次测量如何搬进 `脳特性` 页，以及该页各图表的算法（`app/profile/page.tsx`、`app/log/page.tsx`）。

> **准确来源始终是代码**。本文所有公式、常量均标注 `文件:行号`，与代码逐条核对过。指标算法细节另见 `docs/6指标算法说明.md`（本文不重复其推导，只给接口）。

---

## 0. 端到端数据流

```
①数据源（1Hz 样本）
   demo: DummySource setInterval 1000ms   |  realtime: Supabase 桥接 broadcast "sample"
        │
        ▼
②useMindStore.pushSample(rawSample)          store/useMindStore.ts:145
   ├─ s = withGammaGain(rawSample, programGammaGain(isPlaying, elapsed))  ← 放程序时 γ 带最高 ×3，写入样本本身
   ├─ gammaBaseline(EMA) / gammaBoost         ← 用「原始」γ 算，只驱动 "γ波 上昇中" 徽章
   ├─ zoneBoost = combineZoneBoost(...)       ← γ牵引 + 程序牵引，决定所有「显示位置」
   └─ latestSample=s, history+=s(≤300), 录制中 recordingSamples+=s
        │
        ▼
③实时显示（每个都读 latestSample / zoneBoost）
   四象限マインドマップ · 状态文本 · 脳波バランス · 推移チャート · ブレインアート
        │  測定終了
        ▼
④stopRecording()                              store/useMindStore.ts:205
   当场算出并存入 session：
   indicators = computeIndicators(eegRowsFromSamples(recordingSamples))   6 指标 0-100
   bands      = computeBandPowers(...)                                    8 频段 %
   spectrum   = averageSpectra(...)                                       逐 Hz 平均谱
   + 展示用摘要 avgAttention/avgMeditation/avgGammaRatio/flowRatioPct
        │  importSession()
        ▼
⑤导入 脳特性 measurement                       components/mind/useImportSession.ts:42
   只搬 { indicators, bands, spectrum, note } + 派生 uploadedAt/sessionTag
   按 uploadedAt(=startedAt→ISO) upsert 去重；写入 useBrainProfileStore + 云同步
        │
        ▼
⑥脳特性页 / log 页展示
   雷达图(6指标) · 8频段饼图 · 频谱图 · 总合分 · 推移折线 · 多测量对比
```

**另一条独立入口**：`EegUploader` 上传 BrainLink 的 Excel/CSV → `parseEegFile` → 同样 `computeIndicators/computeBandPowers` → `addMeasurement`。它**不经 `useImportSession`**，无 spectrum/note、无按时间戳去重、与任何 mind session 无关联（详见 §5.4）。

---

## 1. 数据模型

### 1.1 `EegSample`（1Hz 原始样本，桥接与 demo 的线上契约）
`lib/mind/types.ts:8`

| 字段 | 含义 | 范围 |
|---|---|---|
| `attention` | 集中度（NeuroSky eSense 专有算法输出） | 0–100 |
| `meditation` | 放松度（eSense；= 指标算法里的 `relaxation`） | 0–100 |
| `delta,theta` | δ/θ 频段功率 | 无量纲大数 |
| `lowAlpha,highAlpha` | 低/高 α 频段功率 | 无量纲大数 |
| `lowBeta,highBeta` | 低/高 β 频段功率 | 无量纲大数 |
| `lowGamma,highGamma` | 低/中 γ 频段功率 | 无量纲大数 |
| `signal?` | POOR_SIGNAL：0=良好, 200=未贴合 | 0–200 |
| `battery?` | 电量 | 0–100 |
| `spectrum?` | 逐 Hz FFT 幅值（index i ⇒ (i+1)Hz，长度 `SPECTRUM_MAX_HZ=45`），**仅 realtime 有** | number[] |
| `ts` | epoch ms | — |

> ⚠️ 要点：`attention/meditation` 是 eSense 黑盒输出（0-100），两者**天然反相关**；频段功率是**无量纲大数**，因此凡涉及频段的计算**一律先归一化为比例**（`lib/mind/types.ts:154-165`, `301-316`）。

### 1.2 `MindSessionSummary`（一次测量的存档）
`store/useMindStore.ts:24`

`id, startedAt, endedAt, durationSec, avgAttention, avgMeditation, avgGammaRatio, flowRatioPct, source, indicators?, bands?, spectrum?, note?`
持久化到 localStorage（persist，`partialize` 只留 `sessions/sourceKind/pairingCode`，`useMindStore.ts:269`）。原始 `recordingSamples` **只在内存**，从不持久化。

### 1.3 `BrainProfile`（脳特性 measurement，导入的落点）
`lib/brain-profile.ts:16`

`indicators, bands?, spectrum?, note?, uploadedAt, sessionTag`
持久化 + 云同步（`useBrainProfileStore`，`partialize` 留 `profile/measurements`，`useBrainProfileStore.ts:130`）。

### 1.4 `EegRow`（指标计算的统一输入）
`lib/brain-profile.ts:26`。上传文件与 mind 样本都归一到这个结构，唯一区别是 mind 的 `meditation` → `relaxation`（`eegRowsFromSamples`, `lib/brain-profile.ts:403`）。数组下标 ≈ 秒（1Hz）。

---

## 2. 数据来源（1Hz 样本如何产生）

### 2.1 Demo 模拟源 `DummySource`
`lib/mind/dummy-source.ts`

- **节奏**：`start()` 立即 `tick()` 一次，再 `setInterval(tick, 1000)`（`:53-54`）。
- **attention/meditation 走 OU 式随机游走**（`:78-79`）：
  ```
  att = clamp(att + (attT - att)*0.08 + gauss()*2.5, 0, 100)     med 同理
  ```
  隐藏目标 `(attT,medT)` 每 8–15 秒跳到四象限中心之一 `[75,75]/[75,25]/[25,25]/[25,75]` 附近（`nextRetarget = now + 8000 + random*7000`, `:65-72`），使点遍历四象限。
- **频段功率**与状态相关，量级用 `base=60000`（TGAM 级别，`:82-97`）：θ 在低集中时增大、α 随 med、β 随 att。
- **γ 爆发**：`lowGamma = base*(inBurst?1.6:0.18)*jitter()`，爆发窗 5–10 秒、间隔 25–45 秒（`:73-76, 92-93`），用于演示辉点发光。
- **spectrum**：`synthSpectrum` 合成 1/f 衰减 + α(10Hz)/β(18Hz)/γ(40Hz)凸起（`:114-126`）。

### 2.2 Realtime 桥接源 `RealtimeSource`
`lib/mind/realtime-source.ts`

- 订阅 Supabase Realtime 频道 `eeg:{归一化配对码}`（`:45-46`），监听 broadcast 事件 `"sample"`。
- 只有通过 `isValidSample(payload)` 的负载才 `onSample`（`:49-54`）；桥接以 1Hz publish。
- **桥接在线判定** `bridgeOnline`：presence 里存在 `role:"bridge"`，**或**最近一次样本在 `SAMPLE_FRESH_MS=6000` ms 内（`:11, 84-87`）。心跳 2 秒一次。

### 2.3 上传文件源 `parseEegFile`（对照，非 mindmap）
`lib/brain-profile.ts:123`。自动识别三种表格布局（转置/宽表打包/宽表逐秒），按双语表头关键词匹配列（`HEADER_KEYWORDS`, `:71`），裁掉首尾坏信号行后返回 `EegRow[] + tag`（`:214-222`）。

---

## 3. 采集期的三个核心变换（决定所有显示与导入数据）

全部发生在 `pushSample`（`store/useMindStore.ts:145`），常量定义在 `lib/mind/types.ts`。

### 3.1 程序 γ 带增益 `withGammaGain`（**修改样本本身**）
`types.ts:260-279`, `store:153-154`
```
gain = programGammaGain(isPlaying, elapsed) = isPlaying ? 2 * min(1, elapsed/90) : 0
s.lowGamma  *= (1 + gain)        // 放程序时最高 ×3
s.highGamma *= (1 + gain)        // 90 秒线性 ramp；attention/meditation 不变
```
放大后的 `s` 才是存入 `latestSample / history / recordingSamples` 的样本。**因此实时脳波バランス、录制、以及导入脳特性的 bands 都带着这个被放大的 γ**——这是刻意设计（让 40Hz 夹带效果一致可见）。

### 3.2 γ 基线（EMA）与 γboost（**只驱动徽章，用原始 γ**）
`types.ts:176-195`, `store:160-165`
```
ratio    = gammaRatio(rawSample)                        // 原始样本，非放大后
baseline = baseline<=0 ? ratio : baseline + (ratio-baseline)*0.011   // EMA, 1Hz 下 ≈90s 时间常数
gammaBoost = clamp(0, (ratio/baseline - 1) * 0.5, 0.6)  // 乘法比，抗个体差/接触差
```
录制开始 `startRecording` 把 `gammaBaseline` 重置为 0（`store:194-203`），以捕捉安静态→40Hz 过程中的 γ 上升。`gammaBoost > 0.12` 时状态文本显示「γ波 上昇中」徽章。

### 3.3 ゾーン牵引 `zoneBoost`（**决定所有显示位置**）
`lib/mind/types.ts`, `store:167-171`
```
program     = isPlaying ? 0.25 * min(1, elapsed/90) : 0                // PROGRAM_BOOST_MAX=0.25，90s ramp
gammaScale  = isPlaying ? 0 + 0.5*min(1, elapsed/90) : 0               // IDLE_SCALE=0 → PLAY_SCALE=0.5
zoneBoost   = min(0.6, gammaBoost*gammaScale + program)                // 上限 ZONE_BOOST_MAX=0.6
```
配合 `boostedPosition(att, med, boost)`（`types.ts:197`）把点朝右上「ゾーン角(100,100)」拉：
```
attention_eff  = att + boost*(100 - att)
meditation_eff = med + boost*(100 - med)
```
**待机时 program=0、γ 牵引=0，所以 zoneBoost 恒为 0**——辉点显示原始位置、ゾーン率不被牵引。牵引完全留给播放时：满档合计约 **0.25–0.55**（program 基线 0.25 + γ 贡献 ≤0.3），30 秒时仅 0.08–0.18 平滑渐入。

> 参数（`lib/mind/types.ts`）：`GAMMA_BOOST_IDLE_SCALE=0`、`GAMMA_BOOST_PLAY_SCALE=0.5`、`PROGRAM_BOOST_MAX=0.25`、`ZONE_BOOST_MAX=0.6`、`GAMMA_BOOST_MAX=0.6`（gammaBoost 上限）。**历史值**（更强的旧牵引）：IDLE=0.25 / PLAY=1.0 / PROGRAM=0.4 / ZONE_MAX=0.85。

**三者的区别（关键）**：
| 变换 | 改的是 | 影响 |
|---|---|---|
| `withGammaGain` | **样本值**（γ 带） | 脳波バランス、录制、**导入脳特性的 bands** |
| `gammaBoost` | 仅显示派生量 | 「γ波 上昇中」徽章（用原始 γ，诚实信号） |
| `zoneBoost` | 仅显示位置 | 辉点/艺术/象限判定/`flowRatioPct` |

---

## 4. Mindmap 实时显示（`app/mind/page.tsx`）

页面每秒把 `latestSample / zoneBoost / gammaBoost / history / isRecording` 从 store 读出分发给各组件。**脳波バランス始终显示瞬时值**（非会话平均，`page.tsx:31`）。

### 4.1 四象限マインドマップ `MindMapCanvas`
`components/mind/MindMapCanvas.tsx`

| 项 | 数据/算法 | 位置 |
|---|---|---|
| 象限布局 | 左上=過緊張ストレス, 右上=ゾーン(flow), 左下=疲労, 右下=深い瞑想。X右=リラックス, Y上=集中 | `:44-55` |
| 辉点位置 | `eff = boostedPosition(att, med, zoneBoost)` → `targetX = eff.meditation/100`, `targetY = 1 - eff.attention/100` | `:130-137` |
| 平滑 | 帧率无关插值 `k = 1 - exp(-dt*4)`（≈0.07/帧@60fps），`x += (targetX-x)*k` | `:338-341` |
| 辉点大小/光晕 | 与**相对 γ** 成比例：`radius = 8 + (gammaNow/100)*14`，`shadowBlur = 16 + gammaNow*0.6`（gammaNow 来自放大后样本） | `:433-434` |
| 象限判定 | `getQuadrant(eff.att, eff.med)`，50/50 为界 | `:135` |
| 轨迹模式 | idle=`rolling`(短拖尾≤200点/20s); 录制=`accumulating`(每100ms留点画进永久层, 上限 43200点); 结束=`frozen`(冻结) | `:24-27, 142-151, 348-368` |
| 象限停留占比 | 录制时每 100ms 把点按 `quadrantAt` 归类累加 `countsRef`，标签下显示 `round(counts[q]/total*100)%`，最大占比加粗 | `:315-322, 359` |

### 4.2 状态文本 `MindStatusText`
`components/mind/MindStatusText.tsx`

- `sample==null` → 「データを待っています…」；`signal>50` → 「ヘッドセットの装着を確認してください」（`:19-34`）。
- **感情名**：`nearestEmotion(eff.att, eff.med)`——在 Russell 环状模型 16 锚点里取欧氏距离最小者（x=meditation, y=attention），如 熱狂{85,90}/リラックス{75,40}/無気力{40,20}（`lib/mind/emotions.ts:16-55`）。用的是 `boostedPosition` 后的位置。
- **ゾーンラベル**：`QUADRANT_INFO[getQuadrant(eff)].label`（`types.ts:70`）。
- **「γ波 上昇中」徽章**：仅当 `gammaBoost > 0.12`（`:40`）。
- **电量**：`sample.battery`。

### 4.3 脳波バランス `BandEqualizer / BandBars`
`components/mind/BandBars.tsx`

- 数据：`rawBandPowers(latestSample)` = 8 个原始频段各自 `band/totalPower*100`（`types.ts:301-316`）。**瞬时值，非平均**。
- 条高：`Math.min(100, Math.round(powers[key]))`，700ms 缓动（`:15-24`）。γ 两条用 accent 色，其余 primary（`:23`）。

### 4.4 推移チャート `MindTrendChart`
`components/mind/MindTrendChart.tsx`

- 数据：`history`（store 最近 `HISTORY_MAX=300` 样本 ≈ 直近 5 分，`useMindStore.ts:48,185`）。
- 双折线用**原始** `attention`(暖 `#fb923c`) / `meditation`(冷 `#38bdf8`)，**不做 zoneBoost 修正**（`:47-54`）。Y 轴锁 0-100，X 轴 mm:ss。少于 2 点显示「データを集めています…」。

### 4.5 ブレインアート `MindArtCanvas`
`components/mind/MindArtCanvas.tsx`（曼陀罗几何可视化，att/med 用 `boostedPosition` 后值 `gN=gammaRatio`）

| 维度 | 映射 | 位置 |
|---|---|---|
| 集中 attN | 分割数 `segments = round(lerp(6,18,attN))`（决定复杂度、旋转） | `:197` |
| リラックス medN | 色相 `baseHue = lerp(16,200,medN)`（暖红→冷青）、角圆润度 roundness | `:204` |
| 双高 zone=att·med | 拉向金色 `hue = lerp(baseHue,45,zone*0.7)`，运动更缓 | `:205` |
| 相对 γ gN | 中心辉光脉动强度/亮度 | `:255,275-276` |
| 跳变 | 相邻样本 `jump>22`（雑念・ビクッ）触发火花粒子 `burst += min(28, round(jump))` | `:82-86` |

### 4.6 測定録音按钮 + 测定完成对话框 `MindRecorder`
`components/mind/MindRecorder.tsx`

- 按钮文案：录制中「測定を終了（MM:SS）」，其中 `MM:SS = formatTime(recordingSamples.length)`——**按样本数当秒算**，不是壁钟（1Hz 下基本等于实测秒，丢样本会偏差）（`:74-76`）。
- disabled 条件 `!isRecording && !canReceive`：`canReceive = status==='connected' && (sourceKind==='demo' || bridgeOnline)`。**录制中即使桥接掉线也能按「終了」**（`:29,62`）。
- 停止后若 `summary.indicators && summary.bands` 才弹对话框（`:38`），显示 `stopRecording()` 当场确定的摘要：`測定時間/集中 avgAttention/リラックス avgMeditation/ゾーン率 flowRatioPct%`（`:107-110`），并问是否导入脳特性。

---

## 5. 测量结束聚合 与 导入脳特性

### 5.1 `stopRecording()` 聚合
`store/useMindStore.ts:205-253`

无样本返回 null。否则对 `recordingSamples`（**已被 γ 增益修改过的**样本）计算：

| 字段 | 公式 | 用途 |
|---|---|---|
| `avgAttention` | `round(Σattention / n)` | 仅列表/对话框展示 |
| `avgMeditation` | `round(Σmeditation / n)` | 仅展示 |
| `avgGammaRatio` | `round(ΣgammaRatio(s)/n *10)/10` | 仅展示 |
| `flowRatioPct` | 录制期每样本 `eff=boostedPosition(att,med,zoneBoost)`，落 flow 计数 `recordingFlowCount`；`round(flowCount/n*100)`（`:175-181,239`） | 仅展示（不放音乐时 zoneBoost=0，即原始位置；放音乐时含牵引） |
| `indicators` | `computeIndicators(eegRowsFromSamples(recordingSamples))` | **导入脳特性** |
| `bands` | `computeBandPowers(rows)` | **导入脳特性** |
| `spectrum` | `averageSpectra(recordingSamples.map(s=>s.spectrum))` | **导入脳特性**（仅 realtime 有） |

### 5.2 导入 `importSession`
`components/mind/useImportSession.ts:42`

两个入口共用：① 测定完成对话框「取り込む」；② `SessionList` 过去の測定 里点整行。流程：

1. 旧 session（无 `indicators/bands`）→ 直接 `router.push('/profile')`，不写 measurement（`:46-49`）。
2. 未登录 → `setPendingId` + 打开登录框；已登录但 `cloudUserId` 未 hydrate → `setPendingId` 等待（否则 `loadFromCloud` 会覆盖新写入）。两个门控由 `useEffect(:90-95)` 在 login+cloud 就绪后自动 resume。
3. 写入（`:63-74`）：
   ```
   uploadedAt = new Date(s.startedAt).toISOString()
   await deleteMeasurement(uploadedAt)                     // 按时间戳 upsert 去重：重复导入=刷新
   await addMeasurement({
     indicators: s.indicators,
     bands:      s.bands,
     spectrum:   s.spectrum,
     note:       s.note,
     uploadedAt,
     sessionTag: sessionLabel(s),                          // "7月20日 14:30" 形式，:9-16
   })
   ```

> **只有 4 个真实字段跨越到 measurement**（`indicators/bands/spectrum/note`）+ 派生 `uploadedAt/sessionTag`。`avgAttention/avgMeditation/avgGammaRatio/flowRatioPct/durationSec/source/id/endedAt` **全部丢弃**，只活在 mind 侧列表。**指标/频段无二次变换**，原样透传。

### 5.3 `addMeasurement` 与云同步
`store/useBrainProfileStore.ts:41-55`

数组尾部追加 `[...prev, profile]`，`profile = latest(next)`，`viewingUploadedAt=null`。已登录则把**整份 measurements 数组作为单行 JSONB** `upsertBrainMeasurements(uid, next)` 覆盖写 Supabase（一 user 一行）。失败回滚本地并抛错（被 importSession 捕获成 error 状态）。`addMeasurement` **本身不去重**，去重靠 §5.2 的先删后加。

### 5.4 上传路径差异（`EegUploader`，对照）
`components/EegUploader.tsx:14-33`

```
{rows, tag} = await parseEegFile(file)
addMeasurement({ indicators: computeIndicators(rows), bands: computeBandPowers(rows),
                 uploadedAt: new Date().toISOString(), sessionTag: tag })
```
- `uploadedAt` = **当前上传时刻**（非 session 开始时间）。
- **无 spectrum、无 note**。
- **不先 deleteMeasurement**，故同一文件重复上传会各得不同 uploadedAt 从而**叠加多条**（与 mind 路径去重行为不一致）。
- 与任何 mind session 无时间戳关联（note-sync 对它是 no-op）。

### 5.5 备忘录双向同步 `note-sync`
`lib/mind/note-sync.ts`

两条记录靠时间戳关联：`measurement.uploadedAt === new Date(session.startedAt).toISOString()`。
- `syncNoteFromSession`：写 session 的 `setSessionNote`，再镜像到 measurement（仅当该 uploadedAt 存在，`:16-23,32-38`）。
- `syncNoteFromMeasurement`：写 measurement 的 `setMeasurementNote`，再镜像回 session（仅当 startedAt 匹配，`:25-29,41-47`）。
- 各自只改自己的 state → 不成环；对方不存在即 no-op（未导入的 session，或上传型 measurement）。空白 note trim 后存 `undefined`。

---

## 6. 脳特性页展示 与 算法（`app/profile/page.tsx`）

页面选择显示哪条：`displayed = viewingUploadedAt 命中的历史记录 ?? profile(最新)`（`page.tsx:33-36`）。

### 6.1 大脳特性レーダー（6 指标）`BrainRadarChart`
`components/BrainRadarChart.tsx`

- 数据：`displayed.indicators`（6 个 0-100 值）。
- 顶点顺序（顺时针，从顶点）由 `INDICATOR_META` 决定（`brain-profile.ts:610-617`）：
  `集中の強さ → 集中の持続度 → 平静の持続度 → リラックスの深さ → 入定の速度 → 集中の速度`
- `showScores=true` 时每个顶点标签下直接标 0-100 分，配色 `scoreColor`（`:30-32`）：`≥70 绿 #22c55e / ≥40 橙 #f97316 / else 红 #ef4444`。
- ⚠️ **半径域注意**：`<PolarRadiusAxis domain={[0,100]}>` 只在 `!isSmall && !showScores` 分支挂载（`:125-132`）。profile(`size=large showScores`)和 log(`size=small showScores`)两处都 `showScores=true`，所以**实际用 recharts 按数据最大值自动推导的半径域**，不同测量的雷达面积不保证按固定 0-100 缩放、不能直接横向比面积。

**6 指标算法**（全部 0-100 整数，无事后缩放；`computeIndicators` 先 `trimPoorSignalEdges`，`brain-profile.ts:496-506`）：

| 指标 | 公式 | 源 |
|---|---|---|
| ① 集中強度 focusIntensity | `clamp(round(topPercentAvg(有效秒 attention, 前10%)),0,100)` | `:336-340` |
| ② 集中スピード focusSpeed | `t = firstSustainedCrossing(attention, 阈值50, 连续3秒)`; `t==null?0:speedScore(t,τ=60)` | `:343-351` |
| ③ 持続的集中 sustainedFocus | `runs=runsAbove(attention,40)`; `coverage=Σruns/n*100`; `longestScore=min(100,最长/60*100)`; `clamp(round(0.5*coverage+0.5*longestScore),0,100)` | `:354-363` |
| ④ リラックス深度 relaxationDepth | `level=topPercentAvg(有效秒 relaxation,前10%)`; `bandScore=min(100, mean(relaxBandRatio_非δ)/0.7*100)`; `clamp(round(0.6*level+0.4*bandScore),0,100)` | `:366-377` |
| ⑤ 入定スピード calmnessSpeed | `t=findSettlingIndex(rows)`; `t==null?0:speedScore(t,τ=60)` | `:380-383` |
| ⑥ 平穏持続度 calmnessStability | 入定点后有效秒 relaxation 的 `cv`; `clamp(round((0.4-cv)/(0.4-0.1)*100),0,100)`（≥2点） | `:386-395` |

**辅助函数**：
- `topPercentAvg(v,p)` = 降序取前 `max(1, ceil(n·p/100))` 个求平均（稳健峰值，`:232-237`）。
- `speedScore(sec,τ)` = `clamp(round(100·τ/(τ+sec)),0,100)`，0秒→100、τ秒→50（`:311-313`）。
- `firstSustainedCrossing(v,thr,k)` = 首次连续 k 秒 ≥thr 的起始下标 `i-k+1`（`:270-285`）。
- `findSettlingIndex(rows)` = 首次连续 3 秒 `relaxation≥60 且 α≥β` 的起始下标（入定点），α=低α+高α, β=低β+高β（`:316-329`）。
- `relaxBandRatio(r,excludeDelta)` = `(低α+高α+θ)/全频段`，`excludeDelta=true` 时分母不含 δ（`:302-308`）。
- `coefficientOfVariation` = 总体标准差(除以 n)/均值，均值0取0（`:240-251`）。
- `isValidSample(r)` = `attention>0 || relaxation>0`（`:290-292`）。**①④⑥ 用它过滤坏信号秒；②③⑤ 用全行**（②⑤靠下标≈秒需保留；③按设计把坏信号秒当作低于阈值拉低覆盖率）。

`INDICATOR_CONFIG` 全参数（`brain-profile.ts:51-62`，暂定标定值，基于实测 4 组 Jun/L/MS/M）：
| 组 | 参数 | 值 |
|---|---|---|
| ①② focus | intensityTopPct/threshold/sustainSecs/speedTau | 10 / 50 / 3 / 60 |
| ③ sustain | threshold/longestRefSecs/coverWeight/longestWeight | 40 / 60 / 0.5 / 0.5 |
| ④ relax | levelTopPct/bandRef/levelWeight/bandWeight/excludeDelta | 10 / 0.7 / 0.6 / 0.4 / true |
| ⑤ settle | restThreshold/sustainSecs/speedTau | 60 / 3 / 60 |
| ⑥ stable | cvGood/cvCap | 0.1 / 0.4 |

### 6.2 8種類の脳波バランス饼图 `BrainBandPie`
`components/BrainBandPie.tsx`, 数据 `displayed.bands`

- `computeBandPowers(rows)`（`brain-profile.ts:451-493`）：8 个原始频段跨**所有行**各自累加 `sums[band]`，`total=Σsums`，每段 `pct = sums/total*100`（total≤0 返回全 0）。即整段的会话平均带平衡。
- δ 在 12 点方向顺时针，图例 `value.toFixed(1)%`，颜色 `BAND_COLORS`（`types.ts:118`）。旧记录无 bands 时显示提示文案而非图（`profile/page.tsx:134-144`）。

### 6.3 周波数スペクトル面积图 `BrainSpectrumChart`
`components/BrainSpectrumChart.tsx`, 数据 `displayed.spectrum`

- `averageSpectra(recordingSamples.map(s=>s.spectrum))`（`types.ts:34-47`）：录制期各秒逐 Hz FFT 谱（1..45Hz）做元素级平均，长度须一致，无可用谱返回 undefined。
- 原始 spectrum 由 Python 桥接从 512Hz 波形算 FFT，前端不计算。x=频率(spectrum[i]↔(i+1)Hz)、y=相对振幅；背景按 `BAND_HZ_RANGE` 8 频段着色，与饼图同色。**仅 realtime 测量有此图**（上传文件无 spectrum，`profile/page.tsx:148`）。

### 6.4 指標の説明弹窗 `IndicatorHelp`
`components/IndicatorHelp.tsx`。纯文案，来自 `INDICATOR_GROUPS`（`brain-profile.ts:639-694`）：把 6 指标分「認知・注意力①②③(脑的オン)」「情緒・自己調整④⑤⑥(脑的オフ)」两组，各有 intro/逐项说明/評価のポイント。说明里的 ①〜⑥ 编号与雷达顶点顺序**无关**。

### 6.5 顶部横幅 + 说明 + 空状态
- 从 log 点「脳特性で見る」看历史时顶部出现蓝框横幅 + 「最新に戻る」；雷达下方永远显示「セッション: {sessionTag} ・ 測定日: {date}」（`profile/page.tsx:75-114`）。
- 空状态引导上传（`:180-194`）；有数据时提供再上传 `EegUploader` 与「すべての記録を削除」`clearProfile`（`:162-175`）。

---

## 7. log 页对比展示（`app/log/page.tsx`）

数据源同一份 `useBrainProfileStore.measurements`（oldest→newest）。

| 展示 | 数据/算法 | 源 |
|---|---|---|
| 記録カード「総合」分 | `compositeScore(m.indicators)` = 6 指标算术平均四舍五入（`lib/brain-measurements.ts:30-34`），配色同 scoreColor | `log:57` |
| 展开小レーダー | `m.indicators`，`size=small showScores` 的 `BrainRadarChart` | `log:111` |
| 推移グラフ折线 `BrainTrendChart` | 按测量次序画折线；顶部切 7 项：`总合`取 compositeScore，其余取 `m.indicators[key]`；Y 轴 0-100 | `BrainTrendChart.tsx:32-34,65-71` |
| 6指標レーダー重ね `BrainRadarCompare` | 勾选 2-3 条（**需有 spectrum**）的 `m.indicators` 叠加；线色 `compareSeriesColors` | `BrainRadarCompare.tsx:46-93`, `log:253-257` |
| 周波数スペクトル重ね `BrainSpectrumCompare` | 同 picked 的 `m.spectrum` 叠加；线色与雷达**同一** `compareSeriesColors` 保证对应 | `log:294-298` |
| 对比取色 | `compareSeriesColors(count)`：2条=青`#06b6d4`·玫红`#f43f5e`；3条=青`#06b6d4`·琥珀`#f59e0b`·玫红`#f43f5e` | `lib/compare-colors.ts:8-12` |

> 注意 log 页还有「セッション数 / 合計（分）」两个统计卡，来自 `useAppStore.sessionLogs`（**播放会话日志，内存态未 persist**），与脑波测量数据**无关**，别混淆（`log:241-244,323-332`）。

---

## 8. 已知不一致（需留意，非本次改动）

1. **不存在「脑龄图表」**：`CLAUDE.md` 架构描述里写的 log 页「脳齢图表(brain age chart)」在代码中**完全没有实现**（全仓库 grep `脳年齢/brainAge/regression` 零命中）。实际 log 页只有折线趋势图 + 会话统计。该段 `CLAUDE.md` 为过时文档。

2. **`docs/6指标算法说明.md` 第 2 节分组有误**：其称「数值统计类 ①③④⑥ 用 `isValidSample` 排除坏信号秒」，但代码里 ③ `computeSustainedFocus`（`brain-profile.ts:357`）**不做** `isValidSample` 过滤，直接用裁剪后全行（坏信号秒被当作低于阈值，从而拉低覆盖率）。正确分组应为 **①④⑥ 用 isValidSample、②③⑤ 用全行**（该文档第 4 节 ③ 的备注反而是对的）。其余常量与公式与代码一致。

3. **导入数据非纯原始生理值（仅放程序时）**：放程序测量时 `withGammaGain` 把 γ 带放大（最高 ×3）后的样本才被存储和用于 `computeBandPowers/computeIndicators`，故导入脳特性的 bands 与真实原始 γ 不同；④指标的 `relaxBandRatio` 分母含 γ 会略降 bandScore（①②③⑤⑥ 基于 attention/relaxation 或 α/β 不受影响）。**不放程序时 γ 增益=0，导入数据是头环原样输出。** 若要脳特性完全不受程序影响，应在不放程序时测量。
   注意区分两个独立机制：**γ 增益**（`withGammaGain`，改样本、影响导入）与 **ゾーン牵引**（`zoneBoost`，只改显示位置和 `flowRatioPct`，不进导入）。当前牵引已调为：**不放音乐=0，放音乐时更弱**（见 §3.3）；γ 增益仍在放音乐时 ×3，若也想弱化需另调 `PROGRAM_GAMMA_GAIN_MAX`。

4. **两条入口去重不对称**：mind 路径先 `deleteMeasurement(uploadedAt)` 再 add = 按时间戳 upsert；`EegUploader` 不去重且 `uploadedAt=Date.now()`，同一文件重复上传会叠加多条。

---

*本文件与代码同步维护。修改任一算法/常量时请一并更新此处对应行号与公式。*
