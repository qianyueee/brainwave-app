import type { ProgramConfig, FrequencyPhase } from "./programs";
import { getProgramById } from "./programs";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BrainIndicators {
  focusIntensity: number;     // ① 集中強度 0-100
  focusSpeed: number;         // ② 集中スピード 0-100
  sustainedFocus: number;     // ③ 持続的集中 0-100
  relaxationDepth: number;    // ④ リラックス深度 0-100
  calmnessSpeed: number;      // ⑤ 入定スピード 0-100
  calmnessStability: number;  // ⑥ 平穏持続度 0-100
}

export interface BrainProfile {
  indicators: BrainIndicators;
  uploadedAt: string;   // ISO date
  sessionTag: string;   // from Tag column
}

/** Per-second EEG row from the uploaded file */
export interface EegRow {
  attention: number;
  relaxation: number;
  delta: number;
  theta: number;
  lowAlpha: number;
  highAlpha: number;
  lowBeta: number;
  highBeta: number;
  lowGamma: number;
  highGamma: number;
  tag?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * 6指標アルゴリズムの全パラメータ（校正用に一箇所へ集約）。
 * デフォルト値は実測4セッション（Jun/L/MS/M）の分布から暫定的に標定したもの。
 * provisional — より多くのサンプルが集まったら分布に合わせて再調整する。
 */
export const INDICATOR_CONFIG = {
  // ① 集中強度 / ② 集中スピード
  focus: { intensityTopPct: 10, threshold: 50, sustainSecs: 3, speedTau: 60 },
  // ③ 持続的集中
  sustain: { threshold: 40, longestRefSecs: 60, coverWeight: 0.5, longestWeight: 0.5 },
  // ④ リラックス深度
  relax: { levelTopPct: 10, bandRef: 0.7, levelWeight: 0.6, bandWeight: 0.4, excludeDelta: true },
  // ⑤ 入定スピード（settling）
  settle: { restThreshold: 60, sustainSecs: 3, speedTau: 60 },
  // ⑥ 平穏持続度
  stable: { cvGood: 0.1, cvCap: 0.4 },
};

// ─── Excel / CSV Parsing ─────────────────────────────────────────────────────

/**
 * Column header keyword matching.
 * BrainLink exports bilingual headers like "Attention/注意力", "Delta/δ波", etc.
 * We match by checking if the header contains the keyword (case-insensitive).
 */
const HEADER_KEYWORDS: { keyword: string; field: keyof EegRow }[] = [
  { keyword: "attention", field: "attention" },
  { keyword: "注意力", field: "attention" },
  { keyword: "relaxation", field: "relaxation" },
  { keyword: "放松度", field: "relaxation" },
  { keyword: "meditation", field: "relaxation" },
  { keyword: "low-alpha", field: "lowAlpha" },
  { keyword: "低α", field: "lowAlpha" },
  { keyword: "high-alpha", field: "highAlpha" },
  { keyword: "高α", field: "highAlpha" },
  { keyword: "low-beta", field: "lowBeta" },
  { keyword: "低β", field: "lowBeta" },
  { keyword: "high-beta", field: "highBeta" },
  { keyword: "高β", field: "highBeta" },
  { keyword: "low-gamma", field: "lowGamma" },
  { keyword: "低γ", field: "lowGamma" },
  { keyword: "mid-gamma", field: "highGamma" },
  { keyword: "高γ", field: "highGamma" },
  { keyword: "delta", field: "delta" },
  { keyword: "θ", field: "theta" },
  { keyword: "theta", field: "theta" },
  { keyword: "tag", field: "tag" },
  { keyword: "备注", field: "tag" },
];

function matchHeader(header: string): keyof EegRow | null {
  const lower = header.toLowerCase();
  for (const { keyword, field } of HEADER_KEYWORDS) {
    if (lower.includes(keyword.toLowerCase())) return field;
  }
  return null;
}

/** Split a comma-separated string into number array */
function splitCsvValues(val: unknown): number[] {
  if (typeof val === "number") return [val];
  if (typeof val !== "string") return [];
  return val.split(",").map((s) => Number(s.trim()) || 0);
}

/**
 * Parse an Excel or CSV file buffer into EegRow[].
 *
 * BrainLink exports have two possible formats:
 * 1. **Packed format**: Few rows, each cell contains comma-separated per-second values
 *    (e.g. "34,34,29,..." for 385 seconds of Attention data)
 * 2. **Row-per-second format**: One row per second, each cell is a single number
 *
 * Uses dynamic import of xlsx (SheetJS) to keep bundle size in check.
 */
export async function parseEegFile(file: File): Promise<{ rows: EegRow[]; tag: string }> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  if (jsonRows.length === 0) throw new Error("ファイルにデータがありません");

  // Map headers using keyword matching
  const firstRow = jsonRows[0];
  const headerMap = new Map<string, keyof EegRow>();
  for (const rawKey of Object.keys(firstRow)) {
    const field = matchHeader(rawKey);
    if (field) headerMap.set(rawKey, field);
  }

  if (!headerMap.size) throw new Error("認識可能な列ヘッダーがありません");

  // Detect format: check if the Attention column value contains commas (packed format)
  const attentionKey = [...headerMap.entries()].find(([, f]) => f === "attention")?.[0];
  const firstAttVal = attentionKey ? firstRow[attentionKey] : undefined;
  const isPacked = typeof firstAttVal === "string" && firstAttVal.includes(",");

  let tag = "";
  const rows: EegRow[] = [];

  if (isPacked) {
    // ── Packed format: each cell is comma-separated values ──
    // Process each Excel row (may be multiple sessions/segments)
    for (const raw of jsonRows) {
      // Extract tag
      const tagKey = [...headerMap.entries()].find(([, f]) => f === "tag")?.[0];
      if (tagKey) {
        const tv = raw[tagKey];
        if (tv && typeof tv === "string" && tv.trim()) tag = tv.trim();
      }

      // Split all numeric columns into arrays
      const arrays = new Map<keyof EegRow, number[]>();
      let maxLen = 0;
      for (const [rawKey, field] of headerMap) {
        if (field === "tag") continue;
        const arr = splitCsvValues(raw[rawKey]);
        arrays.set(field, arr);
        maxLen = Math.max(maxLen, arr.length);
      }

      // Reconstruct per-second rows (keep interior gaps; trimming happens after)
      for (let i = 0; i < maxLen; i++) {
        const att = arrays.get("attention")?.[i] ?? 0;
        const rel = arrays.get("relaxation")?.[i] ?? 0;
        rows.push({
          attention: att,
          relaxation: rel,
          delta: arrays.get("delta")?.[i] ?? 0,
          theta: arrays.get("theta")?.[i] ?? 0,
          lowAlpha: arrays.get("lowAlpha")?.[i] ?? 0,
          highAlpha: arrays.get("highAlpha")?.[i] ?? 0,
          lowBeta: arrays.get("lowBeta")?.[i] ?? 0,
          highBeta: arrays.get("highBeta")?.[i] ?? 0,
          lowGamma: arrays.get("lowGamma")?.[i] ?? 0,
          highGamma: arrays.get("highGamma")?.[i] ?? 0,
        });
      }
    }
  } else {
    // ── Row-per-second format: each row is one data point ──
    for (const raw of jsonRows) {
      const row: Partial<EegRow> = {};
      for (const [rawKey, field] of headerMap) {
        const val = raw[rawKey];
        if (field === "tag") {
          if (val && typeof val === "string" && val.trim()) tag = val.trim();
        } else {
          row[field] = typeof val === "number" ? val : Number(val) || 0;
        }
      }

      rows.push({
        attention: row.attention ?? 0,
        relaxation: row.relaxation ?? 0,
        delta: row.delta ?? 0,
        theta: row.theta ?? 0,
        lowAlpha: row.lowAlpha ?? 0,
        highAlpha: row.highAlpha ?? 0,
        lowBeta: row.lowBeta ?? 0,
        highBeta: row.highBeta ?? 0,
        lowGamma: row.lowGamma ?? 0,
        highGamma: row.highGamma ?? 0,
      });
    }
  }

  // Trim leading/trailing poor-signal samples but keep interior gaps so the
  // per-second timeline stays intact (timing-based indicators ②⑤ rely on it).
  let lo = 0;
  let hi = rows.length - 1;
  while (lo <= hi && rows[lo].attention <= 0 && rows[lo].relaxation <= 0) lo++;
  while (hi >= lo && rows[hi].attention <= 0 && rows[hi].relaxation <= 0) hi--;
  const trimmed = rows.slice(lo, hi + 1);

  if (trimmed.length === 0) throw new Error("有効なデータ行がありません");

  return { rows: trimmed, tag: tag || file.name.replace(/\.\w+$/, "") };
}

// ─── Statistics helpers ──────────────────────────────────────────────────────

function mean(values: number[]): number {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}

/** Average of the top N% of values (robust "peak capability" without single-sample noise) */
function topPercentAvg(values: number[], percent: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => b - a);
  const count = Math.max(1, Math.ceil((sorted.length * percent) / 100));
  return mean(sorted.slice(0, count));
}

/** Population standard deviation */
function stdDev(values: number[]): number {
  if (!values.length) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Coefficient of variation = stddev / mean (0 when mean is 0) */
function coefficientOfVariation(values: number[]): number {
  const m = mean(values);
  return m === 0 ? 0 : stdDev(values) / m;
}

/** Lengths (in seconds) of each run where value stays ≥ threshold */
function runsAbove(values: number[], threshold: number): number[] {
  const runs: number[] = [];
  let cur = 0;
  for (const v of values) {
    if (v >= threshold) {
      cur++;
    } else {
      if (cur > 0) runs.push(cur);
      cur = 0;
    }
  }
  if (cur > 0) runs.push(cur);
  return runs;
}

/** Index where value first stays ≥ threshold for `sustainSecs` consecutive samples (else null) */
function firstSustainedCrossing(
  values: number[],
  threshold: number,
  sustainSecs: number
): number | null {
  let run = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] >= threshold) {
      run++;
      if (run >= sustainSecs) return i - sustainSecs + 1;
    } else {
      run = 0;
    }
  }
  return null;
}

// ─── EEG-specific helpers ─────────────────────────────────────────────────────

/** A sample is usable when the device reported a non-zero eSense value (poor-signal seconds are 0) */
function isValidSample(r: EegRow): boolean {
  return r.attention > 0 || r.relaxation > 0;
}

const alphaPower = (r: EegRow): number => r.lowAlpha + r.highAlpha;
const betaPower = (r: EegRow): number => r.lowBeta + r.highBeta;

/**
 * (低α + 高α + θ) が全帯域パワーに占める相対比率。
 * NeuroSky の生バンドパワーは無次元の巨大値なので、必ず比率に正規化する。
 * Delta は瞬き/ノイズ/眠気で過大になりやすいため既定では分母から除外（覚醒リラックスを見る）。
 */
function relaxBandRatio(r: EegRow, excludeDelta: boolean): number {
  let denom =
    r.lowAlpha + r.highAlpha + r.theta + r.lowBeta + r.highBeta + r.lowGamma + r.highGamma;
  if (!excludeDelta) denom += r.delta;
  if (denom <= 0) return 0;
  return (r.lowAlpha + r.highAlpha + r.theta) / denom;
}

/** 時間→スコアの逆数マッピング: 速いほど高得点（0秒で100、tau秒で50） */
function speedScore(seconds: number, tau: number): number {
  return clamp(Math.round((100 * tau) / (tau + seconds)), 0, 100);
}

/** ⑤⑥共通: リラックス≥閾値 かつ α≥β が持続し始めた秒（入定点）。なければ null */
function findSettlingIndex(rows: EegRow[]): number | null {
  const { restThreshold, sustainSecs } = INDICATOR_CONFIG.settle;
  let run = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.relaxation >= restThreshold && alphaPower(r) >= betaPower(r)) {
      run++;
      if (run >= sustainSecs) return i - sustainSecs + 1;
    } else {
      run = 0;
    }
  }
  return null;
}

// ─── 6 Indicator Algorithms ──────────────────────────────────────────────────
// timing系（②⑤）は秒位を保つため全行を時間軸（添字≈秒）として使う。
// 値統計系（①③④⑥）は poor-signal の秒を除外する。

/** ① 集中強度: Attention 上位N%平均（最大到達レベル＝集中の深さ） */
function computeFocusIntensity(rows: EegRow[]): number {
  const att = rows.filter(isValidSample).map((r) => r.attention);
  if (!att.length) return 0;
  return clamp(Math.round(topPercentAvg(att, INDICATOR_CONFIG.focus.intensityTopPct)), 0, 100);
}

/** ② 集中スピード: Attention が初めて閾値を継続突破するまでの秒数 → 速いほど高得点 */
function computeFocusSpeed(rows: EegRow[]): number {
  const { threshold, sustainSecs, speedTau } = INDICATOR_CONFIG.focus;
  const t = firstSustainedCrossing(
    rows.map((r) => r.attention),
    threshold,
    sustainSecs
  );
  return t === null ? 0 : speedScore(t, speedTau);
}

/** ③ 持続的集中: ≥閾値の連続片段のカバー率と最長持続を合成（点ではなく線で続いたか） */
function computeSustainedFocus(rows: EegRow[]): number {
  const { threshold, longestRefSecs, coverWeight, longestWeight } = INDICATOR_CONFIG.sustain;
  if (!rows.length) return 0;
  const att = rows.map((r) => r.attention);
  const runs = runsAbove(att, threshold);
  const coverage = (runs.reduce((s, r) => s + r, 0) / att.length) * 100;
  const longest = runs.length ? Math.max(...runs) : 0;
  const longestScore = Math.min(100, (longest / longestRefSecs) * 100);
  return clamp(Math.round(coverWeight * coverage + longestWeight * longestScore), 0, 100);
}

/** ④ リラックス深度: Relaxation上位N%平均 と (低α+高α+θ)/非δ帯域比率 を合成 */
function computeRelaxationDepth(rows: EegRow[]): number {
  const { levelTopPct, bandRef, levelWeight, bandWeight, excludeDelta } = INDICATOR_CONFIG.relax;
  const valid = rows.filter(isValidSample);
  if (!valid.length) return 0;
  const level = topPercentAvg(
    valid.map((r) => r.relaxation),
    levelTopPct
  );
  const ratios = valid.map((r) => relaxBandRatio(r, excludeDelta)).filter((x) => x > 0);
  const bandScore = Math.min(100, (mean(ratios) / bandRef) * 100);
  return clamp(Math.round(levelWeight * level + bandWeight * bandScore), 0, 100);
}

/** ⑤ 入定スピード: 活性状態からリラックス≥閾値 かつ α≥β に切り替わるまでの秒数 → 速いほど高得点 */
function computeCalmnessSpeed(rows: EegRow[]): number {
  const t = findSettlingIndex(rows);
  return t === null ? 0 : speedScore(t, INDICATOR_CONFIG.settle.speedTau);
}

/** ⑥ 平穏持続度: 入定後の Relaxation の変動係数(CV) → 乱れず安定しているほど高得点 */
function computeCalmnessStability(rows: EegRow[]): number {
  const { cvGood, cvCap } = INDICATOR_CONFIG.stable;
  const settle = findSettlingIndex(rows);
  const phase = (settle === null ? rows : rows.slice(settle)).filter(isValidSample);
  const rel = phase.map((r) => r.relaxation);
  if (rel.length < 2) return 0;
  const cv = coefficientOfVariation(rel);
  // 二点線形マッピング: CV≤cvGood→100, CV≥cvCap→0
  return clamp(Math.round(((cvCap - cv) / (cvCap - cvGood)) * 100), 0, 100);
}

/** Compute all 6 indicators from raw EEG rows (0-100, no post-hoc rescaling) */
export function computeIndicators(rows: EegRow[]): BrainIndicators {
  return {
    focusIntensity: computeFocusIntensity(rows),
    focusSpeed: computeFocusSpeed(rows),
    sustainedFocus: computeSustainedFocus(rows),
    relaxationDepth: computeRelaxationDepth(rows),
    calmnessSpeed: computeCalmnessSpeed(rows),
    calmnessStability: computeCalmnessStability(rows),
  };
}

// ─── Program Adjustment ──────────────────────────────────────────────────────

function deepCloneProgram(p: ProgramConfig): ProgramConfig {
  return {
    ...p,
    phases: p.phases.map((ph) => ({ ...ph })),
  };
}

function extendPhase(phases: FrequencyPhase[], phaseName: string, extraSeconds: number): void {
  const idx = phases.findIndex((p) => p.name === phaseName);
  if (idx < 0) return;

  phases[idx].endTime += extraSeconds;

  // Shift all subsequent phases
  for (let i = idx + 1; i < phases.length; i++) {
    phases[i].startTime += extraSeconds;
    phases[i].endTime += extraSeconds;
  }
}

/**
 * Returns a modified ProgramConfig adjusted for the user's brain profile.
 * Total extension is capped at +50% of original defaultDuration.
 */
export function getAdjustedProgram(
  programId: string,
  indicators: BrainIndicators | null
): ProgramConfig | undefined {
  const base = getProgramById(programId);
  if (!base) return undefined;
  if (!indicators) return base;

  const program = deepCloneProgram(base);
  const maxExtension = base.defaultDuration * 0.5;
  let totalExtension = 0;

  function addExtension(phaseName: string, seconds: number): void {
    const capped = Math.min(seconds, maxExtension - totalExtension);
    if (capped <= 0) return;
    extendPhase(program.phases, phaseName, capped);
    totalExtension += capped;
  }

  switch (programId) {
    case "clarity-focus": {
      if (indicators.focusIntensity < 50) {
        // Lower 加速 startBeatFreq
        const accel = program.phases.find((p) => p.name === "加速");
        if (accel) accel.startBeatFreq = 8;
        addExtension("ピーク", 3 * 60);
      }
      if (indicators.focusSpeed < 50) {
        addExtension("加速", 3 * 60);
      }
      if (indicators.sustainedFocus < 50) {
        addExtension("ピーク", 2 * 60);
      }
      break;
    }
    case "reset-deep": {
      if (indicators.relaxationDepth < 50) {
        program.carrierFreq = Math.max(160, program.carrierFreq - 14);
        addExtension("同調", 2 * 60);
      }
      if (indicators.calmnessSpeed < 50) {
        addExtension("降下", 3 * 60);
      }
      break;
    }
    case "night-recovery": {
      if (indicators.calmnessStability < 50) {
        addExtension("デルタ維持", 5 * 60);
      }
      if (indicators.calmnessSpeed < 50) {
        addExtension("降下", 2 * 60);
      }
      break;
    }
  }

  // Update defaultDuration to match extended phases
  if (program.phases.length > 0) {
    program.defaultDuration = program.phases[program.phases.length - 1].endTime;
  }

  return program;
}

// ─── Indicator Metadata (for UI) ─────────────────────────────────────────────

export interface IndicatorMeta {
  key: keyof BrainIndicators;
  label: string;
  shortLabel: string;
  description: string;
}

export const INDICATOR_META: IndicatorMeta[] = [
  {
    key: "focusIntensity",
    label: "専注強度",
    shortLabel: "専注強度",
    description: "注意力スコアの上位10%平均。集中の最大到達レベル（どれだけ深く集中できたか）を示す。",
  },
  {
    key: "sustainedFocus",
    label: "持続的専注",
    shortLabel: "集中持続",
    description: "注意力40以上が連続した区間のカバー率と最長持続から算出。集中が途切れず「線」として続いた度合い。",
  },
  {
    key: "relaxationDepth",
    label: "リラックス深度",
    shortLabel: "弛緩深度",
    description: "放松度の上位10%平均と、(低α+高α+θ)/非δ波 の帯域比率を合成。覚醒したまま深く休めたかを示す。",
  },
  {
    key: "calmnessStability",
    label: "平穏持続度",
    shortLabel: "平穏持続",
    description: "入定後の放松度の変動係数(CV)から算出。値が乱れず安定を保てたほど高得点。",
  },
  {
    key: "calmnessSpeed",
    label: "入定スピード",
    shortLabel: "入定速度",
    description: "放松度が60以上かつα波がβ波を上回るまでの速さ。早く脳をオフに切り替えられたほど高得点。",
  },
  {
    key: "focusSpeed",
    label: "専注スピード",
    shortLabel: "専注速度",
    description: "注意力が初めて50を継続突破するまでの速さ。早く集中に入れたほど高得点。",
  },
];
