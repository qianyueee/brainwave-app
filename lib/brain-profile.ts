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

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function movingAverage(arr: number[], windowSize: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(arr.length, i + Math.ceil(windowSize / 2));
    let sum = 0;
    for (let j = start; j < end; j++) sum += arr[j];
    result.push(sum / (end - start));
  }
  return result;
}

function variance(arr: number[]): number {
  if (arr.length === 0) return 0;
  const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
  return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
}

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

      // Reconstruct per-second rows
      for (let i = 0; i < maxLen; i++) {
        const att = arrays.get("attention")?.[i] ?? 0;
        const rel = arrays.get("relaxation")?.[i] ?? 0;
        if (att === 0 && rel === 0) continue;

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

      if ((row.attention ?? 0) === 0 && (row.relaxation ?? 0) === 0) continue;

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

  if (rows.length === 0) throw new Error("有効なデータ行がありません");

  return { rows, tag: tag || file.name.replace(/\.\w+$/, "") };
}

// ─── 6 Indicator Algorithms ──────────────────────────────────────────────────
// Based on: ６つの指標計算方法.docx

function totalBandPower(r: EegRow): number {
  return r.delta + r.theta + r.lowAlpha + r.highAlpha + r.lowBeta + r.highBeta + r.lowGamma + r.highGamma;
}

/** Standard deviation */
function stdDev(arr: number[]): number {
  return Math.sqrt(variance(arr));
}

/**
 * Find all continuous runs where values >= threshold (allow dips).
 * Returns array of run lengths in seconds.
 */
function findRuns(values: number[], threshold: number, allowedDips: number): number[] {
  const runs: number[] = [];
  let currentRun = 0;
  let dipsLeft = allowedDips;

  for (const v of values) {
    if (v >= threshold) {
      currentRun++;
      dipsLeft = allowedDips;
    } else if (dipsLeft > 0) {
      currentRun++;
      dipsLeft--;
    } else {
      if (currentRun > 0) runs.push(currentRun);
      currentRun = 0;
      dipsLeft = allowedDips;
    }
  }
  if (currentRun > 0) runs.push(currentRun);
  return runs;
}

/**
 * ① Focus Intensity (集中強度)
 *
 * Doc: Attention 値の上位5%の平均値。
 * 「どれだけ深い集中に到達できるか」という最大出力を示す。
 */
function computeFocusIntensity(rows: EegRow[]): number {
  const attValues = rows.map((r) => r.attention).sort((a, b) => b - a);
  const top5Count = Math.max(1, Math.ceil(attValues.length * 0.05));
  const top5Avg = attValues.slice(0, top5Count).reduce((s, v) => s + v, 0) / top5Count;
  // Cap at 95: even exceptional data shouldn't trivially reach 100
  return clamp(top5Avg * 0.95, 0, 95);
}

/**
 * ② Focus Speed (集中スピード)
 *
 * Doc: 測定開始（または集中が途切れた後）から、Attention が 50（閾値）を
 * 突破するまでの秒数の逆数をスコア化する。
 * 「50秒以内と非常に短かったため、高スコア」→ 50s ≈ 高得点。
 *
 * Uses 5-second moving average to filter single-second noise spikes.
 * Measures from measurement start (index 0) as the primary metric,
 * with subsequent break→breakthrough transitions as secondary.
 */
function computeFocusSpeed(rows: EegRow[]): number {
  const smoothed = movingAverage(rows.map((r) => r.attention), 5);
  const threshold = 50;
  const riseTimes: number[] = [];

  let breakStart = 0; // start from measurement beginning
  let inBreak = true;

  for (let i = 0; i < smoothed.length; i++) {
    if (inBreak) {
      if (smoothed[i] >= threshold) {
        riseTimes.push(i - breakStart);
        inBreak = false;
      }
    } else {
      // Above threshold — detect significant drop (5+ seconds below)
      if (smoothed[i] < threshold) {
        let belowLen = 0;
        for (let j = i; j < smoothed.length && smoothed[j] < threshold; j++) belowLen++;
        if (belowLen >= 5) {
          breakStart = i;
          inBreak = true;
        }
      }
    }
  }

  if (riseTimes.length === 0) return 10;

  // Use the median rise time for robustness
  const sorted = [...riseTimes].sort((a, b) => a - b);
  const medianRise = sorted[Math.floor(sorted.length / 2)];

  // Scoring curve: 5s → ~92, 10s → ~83, 50s → ~50, 120s → 0
  // Asymptotic formula prevents reaching 100 easily
  return clamp(95 * Math.exp(-medianRise / 70), 5, 95);
}

/**
 * ③ Sustained Focus (持続的集中)
 *
 * Doc: Attention が 40以上の値を連続して維持した時間の
 * 標準偏差と平均持続時間から算出する。
 * 集中が「点」ではなく「線」としてどれだけ長く続いたか。
 */
function computeSustainedFocus(rows: EegRow[]): number {
  const attValues = rows.map((r) => r.attention);
  const runs = findRuns(attValues, 40, 3);

  if (runs.length === 0) return 0;

  const meanRun = runs.reduce((s, v) => s + v, 0) / runs.length;
  const sd = stdDev(runs);

  // Coefficient of variation: lower = more stable sustained focus
  const cv = meanRun > 0 ? sd / meanRun : 1;

  // Mean run score: longer average runs → higher score
  // Normalize: 60s average run = 100 score
  const meanScore = clamp((meanRun / 60) * 100, 0, 100);

  // Stability bonus: low CV (consistent run lengths) → higher score
  // CV of 0 = perfect consistency (100), CV >= 1.5 = very unstable (0)
  const stabilityScore = clamp((1.5 - cv) / 1.5 * 100, 0, 100);

  return clamp(0.6 * meanScore + 0.4 * stabilityScore, 0, 95);
}

/**
 * ④ Relaxation Depth (リラックス深度)
 *
 * Doc: Relaxation 値の最大値、および Low-Alpha波と Theta波の
 * 合算パワー比率を用いて計算する。
 * Delta波が過剰に出ていない「覚醒リラックス」状態を評価。
 */
function computeRelaxationDepth(rows: EegRow[]): number {
  const relaxMax = Math.max(...rows.map((r) => r.relaxation));

  // Low-Alpha + Theta power ratio (覚醒リラックス indicator)
  // Exclude rows where Delta is dominant (sleep, not relaxation)
  const awakRelaxRows = rows.filter((r) => {
    const total = totalBandPower(r);
    return total > 0 && (r.delta / total) < 0.5;
  });

  let alphaThetaScore = 50; // default if no valid rows
  if (awakRelaxRows.length > 0) {
    const ratios = awakRelaxRows.map((r) => {
      const total = totalBandPower(r);
      return total > 0 ? (r.lowAlpha + r.theta) / total : 0;
    });
    const avgRatio = ratios.reduce((s, v) => s + v, 0) / ratios.length;
    // Normalize: ratio of 0.05 → 0, ratio of 0.40 → 100
    alphaThetaScore = clamp((avgRatio - 0.05) / 0.35 * 100, 0, 100);
  }

  // Relaxation max: already 0-100, cap at 95
  return clamp((0.6 * relaxMax + 0.4 * alphaThetaScore) * 0.95, 0, 95);
}

/**
 * ⑤ Calmness Speed (入定スピード)
 *
 * Doc: 活性状態（Beta波優位）から、Relaxation値が急上昇し
 * Alpha波が逆転するまでの勾配（傾き）を算出する。
 * 「さあ休もう」と思った時に、どれだけ早く脳をオフモードに切り替えられるか。
 */
function computeCalmnessSpeed(rows: EegRow[]): number {
  // Find transition: Beta-dominant → Alpha-dominant while Relaxation rises
  const relaxValues = rows.map((r) => r.relaxation);
  const smoothedRelax = movingAverage(relaxValues, 5);

  const gradients: number[] = [];

  // Scan for rising edges in Relaxation with concurrent Alpha emergence
  for (let i = 0; i < rows.length - 10; i++) {
    const total = totalBandPower(rows[i]);
    if (total === 0) continue;

    const betaPower = rows[i].lowBeta + rows[i].highBeta;
    const isBetaDominant = betaPower / total > 0.15;

    if (!isBetaDominant) continue;
    if (smoothedRelax[i] >= 50) continue; // already relaxed, skip

    // Look for relaxation rise within next 60s window
    for (let j = i + 5; j < Math.min(i + 60, rows.length); j++) {
      if (smoothedRelax[j] >= 60) {
        const dt = j - i;
        const dRelax = smoothedRelax[j] - smoothedRelax[i];
        gradients.push(dRelax / dt);
        break;
      }
    }
  }

  if (gradients.length === 0) {
    // Fallback: simple time-to-relaxation measure
    const threshold = 60;
    for (let i = 0; i < smoothedRelax.length; i++) {
      if (smoothedRelax[i] >= threshold) {
        return clamp(95 * Math.exp(-i / 80), 5, 95);
      }
    }
    return 10;
  }

  // Use 75th percentile gradient (robust against outliers while rewarding good transitions)
  const sortedG = [...gradients].sort((a, b) => a - b);
  const p75Gradient = sortedG[Math.floor(sortedG.length * 0.75)];

  // Scoring curve: gradient of 3 pt/s → ~87, 1.5 → ~65, 0.5 → ~30
  // Asymptotic: harder to reach 100
  return clamp(95 * (1 - Math.exp(-p75Gradient / 2)), 5, 95);
}

/**
 * ⑥ Stability of Calmness (平穏持続度)
 *
 * Doc: Relaxation 値の変動係数（分散）の小ささを算出する。
 * リラックス状態に入った後、外部のノイズや雑念によって数値が乱れず、
 * 一定の安定感を保てた時間を確認する。
 */
function computeCalmnessStability(rows: EegRow[]): number {
  const relaxValues = rows.map((r) => r.relaxation);

  // Focus on periods where relaxation is meaningfully active (>= 40)
  const activeRelax = relaxValues.filter((v) => v >= 40);

  if (activeRelax.length < 5) return 10;

  const mean = activeRelax.reduce((s, v) => s + v, 0) / activeRelax.length;
  const sd = stdDev(activeRelax);

  // Coefficient of variation: lower = more stable
  const cv = mean > 0 ? sd / mean : 1;

  // CV of 0 = perfectly stable (~95), CV of 0.5+ = very unstable (0)
  return clamp((0.5 - cv) / 0.5 * 95, 0, 95);
}

/** Compute all 6 indicators from raw EEG rows */
export function computeIndicators(rows: EegRow[]): BrainIndicators {
  return {
    focusIntensity: Math.round(computeFocusIntensity(rows)),
    focusSpeed: Math.round(computeFocusSpeed(rows)),
    sustainedFocus: Math.round(computeSustainedFocus(rows)),
    relaxationDepth: Math.round(computeRelaxationDepth(rows)),
    calmnessSpeed: Math.round(computeCalmnessSpeed(rows)),
    calmnessStability: Math.round(computeCalmnessStability(rows)),
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
    label: "集中強度",
    shortLabel: "集中強度",
    description: "どれだけ深い集中に到達できるかの最大出力。Attention上位5%の平均値。",
  },
  {
    key: "sustainedFocus",
    label: "持続的集中",
    shortLabel: "集中持続",
    description: "集中が「点」ではなく「線」としてどれだけ長く続いたか。平均持続時間と安定性から評価。",
  },
  {
    key: "calmnessStability",
    label: "平穏持続度",
    shortLabel: "平穏持続",
    description: "リラックス中の変動係数の小ささ。雑念やノイズに乱されない安定感。",
  },
  {
    key: "relaxationDepth",
    label: "リラックス深度",
    shortLabel: "弛緩深度",
    description: "脳がどれだけ深い休息状態に入れたか。Relaxation最大値とAlpha・Theta波の比率で算出。",
  },
  {
    key: "calmnessSpeed",
    label: "入定スピード",
    shortLabel: "入定速度",
    description: "Beta波優位からAlpha波へ逆転するまでの勾配。脳をオフモードに切り替える速さ。",
  },
  {
    key: "focusSpeed",
    label: "集中スピード",
    shortLabel: "集中速度",
    description: "脳のエンジンがかかる速さ。Attentionが閾値を突破するまでの時間の逆数。",
  },
];
