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

/** 高专注 / 高放松阈值 */
const HIGH_THRESHOLD = 50;

/** 持続判定で許容する短期 dip の秒数 */
const ALLOWED_DIP = 3;

/** 速度判定で「到達」とみなすのに必要な連続秒数 */
const ENTRY_CONSECUTIVE = 10;

/** 速度スコアの基準秒数（この秒数で到達 → スコア 0） */
const SPEED_REFERENCE_SECONDS = 180;

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

/**
 * ① 専注強度 (Focus Intensity)
 * 全程平均値: mean(attention_series)
 */
function computeFocusIntensity(rows: EegRow[]): number {
  const sum = rows.reduce((s, r) => s + r.attention, 0);
  return clamp(Math.round(sum / rows.length), 0, 100);
}

/**
 * ② 持続的専注 (Sustained Focus)
 * 最長連続 attention >= 50 の秒数 / 総秒数 × 100
 * ≤ ALLOWED_DIP 秒の短期 dip は連続扱い（途切れない）
 */
function computeSustainedFocus(rows: EegRow[]): number {
  let maxRun = 0;
  let currentRun = 0;
  let dipCount = 0;
  for (const r of rows) {
    if (r.attention >= HIGH_THRESHOLD) {
      currentRun++;
      dipCount = 0;
    } else {
      dipCount++;
      if (dipCount <= ALLOWED_DIP) {
        currentRun++;
      } else {
        if (currentRun > maxRun) maxRun = currentRun;
        currentRun = 0;
        dipCount = 0;
      }
    }
  }
  if (currentRun > maxRun) maxRun = currentRun;
  return clamp(Math.round((maxRun / rows.length) * 100), 0, 100);
}

/**
 * ③ リラックス深度 (Relaxation Depth)
 * 全程平均値: mean(relaxation_series)
 */
function computeRelaxationDepth(rows: EegRow[]): number {
  const sum = rows.reduce((s, r) => s + r.relaxation, 0);
  return clamp(Math.round(sum / rows.length), 0, 100);
}

/**
 * ④ 平穏持続度 (Calm Sustained)
 * 最長連続 relaxation >= 50 の秒数 / 総秒数 × 100
 * ≤ ALLOWED_DIP 秒の短期 dip は連続扱い（途切れない）
 */
function computeCalmnessStability(rows: EegRow[]): number {
  let maxRun = 0;
  let currentRun = 0;
  let dipCount = 0;
  for (const r of rows) {
    if (r.relaxation >= HIGH_THRESHOLD) {
      currentRun++;
      dipCount = 0;
    } else {
      dipCount++;
      if (dipCount <= ALLOWED_DIP) {
        currentRun++;
      } else {
        if (currentRun > maxRun) maxRun = currentRun;
        currentRun = 0;
        dipCount = 0;
      }
    }
  }
  if (currentRun > maxRun) maxRun = currentRun;
  return clamp(Math.round((maxRun / rows.length) * 100), 0, 100);
}

/**
 * ⑤ 入定速度 (Calm Entry Speed)
 * 連続 ENTRY_CONSECUTIVE 秒以上 relaxation >= 50 を維持した最初の位置を「到達」とみなす。
 * (1 - 到達index / SPEED_REFERENCE_SECONDS) × 100。全程未達標の場合は 0。
 */
function computeCalmnessSpeed(rows: EegRow[]): number {
  const idx = findFirstStableIndex(rows.map((r) => r.relaxation));
  if (idx === -1) return 0;
  return clamp(Math.round((1 - idx / SPEED_REFERENCE_SECONDS) * 100), 0, 100);
}

/**
 * ⑥ 専注速度 (Focus Entry Speed)
 * 連続 ENTRY_CONSECUTIVE 秒以上 attention >= 50 を維持した最初の位置を「到達」とみなす。
 * (1 - 到達index / SPEED_REFERENCE_SECONDS) × 100。全程未達標の場合は 0。
 */
function computeFocusSpeed(rows: EegRow[]): number {
  const idx = findFirstStableIndex(rows.map((r) => r.attention));
  if (idx === -1) return 0;
  return clamp(Math.round((1 - idx / SPEED_REFERENCE_SECONDS) * 100), 0, 100);
}

/** 找到首次连续 ENTRY_CONSECUTIVE 秒 >= HIGH_THRESHOLD 的起始 index，未找到返回 -1 */
function findFirstStableIndex(values: number[]): number {
  let consecutive = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] >= HIGH_THRESHOLD) {
      consecutive++;
      if (consecutive >= ENTRY_CONSECUTIVE) return i - ENTRY_CONSECUTIVE + 1;
    } else {
      consecutive = 0;
    }
  }
  return -1;
}

/**
 * Sigmoid 赋分：将原始 0-100 映射到 ~18-91 区间。
 * 中间段（30-90）展开集中，两端压缩避免极端值。
 * 最低分 ≥ 14，最高分 ≤ 91。
 */
const SIGMOID_K = 0.06;
const SIGMOID_BASE = 14;
const SIGMOID_RANGE = 81; // 95 - 14
function rescale(raw: number): number {
  return Math.round(SIGMOID_BASE + SIGMOID_RANGE / (1 + Math.exp(-SIGMOID_K * (raw - 50))));
}

/** Compute all 6 indicators from raw EEG rows */
export function computeIndicators(rows: EegRow[]): BrainIndicators {
  return {
    focusIntensity: rescale(computeFocusIntensity(rows)),
    focusSpeed: rescale(computeFocusSpeed(rows)),
    sustainedFocus: rescale(computeSustainedFocus(rows)),
    relaxationDepth: rescale(computeRelaxationDepth(rows)),
    calmnessSpeed: rescale(computeCalmnessSpeed(rows)),
    calmnessStability: rescale(computeCalmnessStability(rows)),
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
    description: "注意力の全程平均値。集中力の全体的なレベルを示す。",
  },
  {
    key: "sustainedFocus",
    label: "持続的専注",
    shortLabel: "集中持続",
    description: "最長連続高専注片段が総時間に占める割合。集中がどれだけ途切れずに続いたか。",
  },
  {
    key: "relaxationDepth",
    label: "リラックス深度",
    shortLabel: "弛緩深度",
    description: "放松度の全程平均値。リラックスの全体的な深さを示す。",
  },
  {
    key: "calmnessStability",
    label: "平穏持続度",
    shortLabel: "平穏持続",
    description: "最長連続高放松片段が総時間に占める割合。リラックスがどれだけ安定して持続したか。",
  },
  {
    key: "calmnessSpeed",
    label: "入定スピード",
    shortLabel: "入定速度",
    description: "初めて高放松状態に達するまでの速さ。早いほど高得点。",
  },
  {
    key: "focusSpeed",
    label: "専注スピード",
    shortLabel: "専注速度",
    description: "初めて高専注状態に達するまでの速さ。早いほど高得点。",
  },
];
