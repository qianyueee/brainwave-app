import type { ProgramConfig, FrequencyPhase } from "./programs";
import { getProgramById } from "./programs";
import type { BandPowers } from "./mind/types";

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
  bands?: BandPowers;   // session-average relative power of the 8 raw bands (optional for legacy records)
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
 * Parse an Excel or CSV file (BrainLink export) into EegRow[].
 *
 * Supports three layouts, auto-detected:
 * 1. **Transposed (new)**: column A = field name, column B = value. Metric
 *    values are comma-separated per-second strings (one field per row).
 * 2. **Wide packed (old)**: field names across row 1; each data cell is a
 *    comma-separated per-second string.
 * 3. **Wide per-second (old)**: field names across row 1; one row per second.
 *
 * Uses dynamic import of xlsx (SheetJS) to keep bundle size in check.
 */
export async function parseEegFile(file: File): Promise<{ rows: EegRow[]; tag: string }> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  // Read as a raw grid so we can handle both wide and transposed layouts.
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });

  if (!aoa.length) throw new Error("ファイルにデータがありません");

  const asStr = (v: unknown): string => (v == null ? "" : String(v));

  // Detect orientation: do field names run down column A (transposed) or
  // across row 1 (wide)?
  const header0 = Array.isArray(aoa[0]) ? aoa[0] : [];
  let wideMatches = 0;
  for (const c of header0) if (matchHeader(asStr(c))) wideMatches++;
  let transposedMatches = 0;
  for (const r of aoa) if (Array.isArray(r) && matchHeader(asStr(r[0]))) transposedMatches++;

  // Per-field, per-second value arrays.
  const columns = new Map<keyof EegRow, number[]>();
  let tag = "";

  if (transposedMatches > wideMatches) {
    // ── Transposed (new): col A = field name, col B = value ──
    for (const r of aoa) {
      if (!Array.isArray(r)) continue;
      const field = matchHeader(asStr(r[0]));
      if (!field) continue;
      if (field === "tag") {
        const tv = asStr(r[1]).trim();
        if (tv) tag = tv;
        continue;
      }
      columns.set(field, splitCsvValues(r[1]));
    }
  } else {
    // ── Wide (old): field names across row 1 ──
    const colField = header0.map((c) => matchHeader(asStr(c)));
    const attCol = colField.findIndex((f) => f === "attention");
    const firstAtt = attCol >= 0 && Array.isArray(aoa[1]) ? asStr(aoa[1][attCol]) : "";
    const isPacked = firstAtt.includes(",");

    for (let r = 1; r < aoa.length; r++) {
      const row = aoa[r];
      if (!Array.isArray(row)) continue;
      for (let c = 0; c < colField.length; c++) {
        const field = colField[c];
        if (!field) continue;
        if (field === "tag") {
          const tv = asStr(row[c]).trim();
          if (tv) tag = tv;
          continue;
        }
        const arr = columns.get(field) ?? [];
        if (isPacked) {
          arr.push(...splitCsvValues(row[c]));
        } else {
          arr.push(typeof row[c] === "number" ? (row[c] as number) : Number(asStr(row[c])) || 0);
        }
        columns.set(field, arr);
      }
    }
  }

  if (columns.size === 0) throw new Error("認識可能な列ヘッダーがありません");

  // Reconstruct per-second rows (keep interior gaps; trimming happens after).
  let maxLen = 0;
  for (const arr of columns.values()) maxLen = Math.max(maxLen, arr.length);
  const at = (field: keyof EegRow, i: number): number => columns.get(field)?.[i] ?? 0;

  const rows: EegRow[] = [];
  for (let i = 0; i < maxLen; i++) {
    rows.push({
      attention: at("attention", i),
      relaxation: at("relaxation", i),
      delta: at("delta", i),
      theta: at("theta", i),
      lowAlpha: at("lowAlpha", i),
      highAlpha: at("highAlpha", i),
      lowBeta: at("lowBeta", i),
      highBeta: at("highBeta", i),
      lowGamma: at("lowGamma", i),
      highGamma: at("highGamma", i),
    });
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

/**
 * Map live mind-map samples to EegRow[] for computeIndicators. Mind-map samples
 * are ~1 Hz (index ≈ seconds, like an uploaded file) and use `meditation` for
 * what the indicators call `relaxation`. Typed structurally to avoid coupling
 * brain-profile to the mind-map module.
 */
export function eegRowsFromSamples(
  samples: {
    attention: number;
    meditation: number;
    delta: number;
    theta: number;
    lowAlpha: number;
    highAlpha: number;
    lowBeta: number;
    highBeta: number;
    lowGamma: number;
    highGamma: number;
  }[]
): EegRow[] {
  return samples.map((s) => ({
    attention: s.attention,
    relaxation: s.meditation,
    delta: s.delta,
    theta: s.theta,
    lowAlpha: s.lowAlpha,
    highAlpha: s.highAlpha,
    lowBeta: s.lowBeta,
    highBeta: s.highBeta,
    lowGamma: s.lowGamma,
    highGamma: s.highGamma,
  }));
}

/**
 * Trim leading/trailing poor-signal rows (attention ≤ 0 && relaxation ≤ 0) while
 * keeping interior gaps, so the timing indicators (②⑤), which read the array
 * index as elapsed seconds, aren't shifted by contact-stabilization seconds at
 * the start. parseEegFile already does this for uploads; live recordings begin
 * the instant the user taps 測定開始 (before good electrode contact), so the
 * same trim must run for both paths to keep scores consistent.
 */
function trimPoorSignalEdges(rows: EegRow[]): EegRow[] {
  let lo = 0;
  let hi = rows.length - 1;
  while (lo <= hi && rows[lo].attention <= 0 && rows[lo].relaxation <= 0) lo++;
  while (hi >= lo && rows[hi].attention <= 0 && rows[hi].relaxation <= 0) hi--;
  return rows.slice(lo, hi + 1);
}

/**
 * Session-average relative power (%) of the 8 raw bands, summed across all rows
 * so the result is the overall band balance. Returns all zeros for empty input.
 */
export function computeBandPowers(rows: EegRow[]): BandPowers {
  const sums = {
    delta: 0,
    theta: 0,
    lowAlpha: 0,
    highAlpha: 0,
    lowBeta: 0,
    highBeta: 0,
    lowGamma: 0,
    highGamma: 0,
  };
  for (const r of rows) {
    sums.delta += r.delta;
    sums.theta += r.theta;
    sums.lowAlpha += r.lowAlpha;
    sums.highAlpha += r.highAlpha;
    sums.lowBeta += r.lowBeta;
    sums.highBeta += r.highBeta;
    sums.lowGamma += r.lowGamma;
    sums.highGamma += r.highGamma;
  }
  const total =
    sums.delta +
    sums.theta +
    sums.lowAlpha +
    sums.highAlpha +
    sums.lowBeta +
    sums.highBeta +
    sums.lowGamma +
    sums.highGamma;
  if (total <= 0) return { ...sums };
  const pct = (v: number) => (v / total) * 100;
  return {
    delta: pct(sums.delta),
    theta: pct(sums.theta),
    lowAlpha: pct(sums.lowAlpha),
    highAlpha: pct(sums.highAlpha),
    lowBeta: pct(sums.lowBeta),
    highBeta: pct(sums.highBeta),
    lowGamma: pct(sums.lowGamma),
    highGamma: pct(sums.highGamma),
  };
}

/** Compute all 6 indicators from raw EEG rows (0-100, no post-hoc rescaling) */
export function computeIndicators(input: EegRow[]): BrainIndicators {
  const rows = trimPoorSignalEdges(input);
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
}

// Order matches the radar/hexagon vertex order; names follow the "6指標説明"
// design document. Per-indicator explanations live in INDICATOR_GROUPS below.
export const INDICATOR_META: IndicatorMeta[] = [
  { key: "focusIntensity", label: "集中の強さ", shortLabel: "集中の強さ" },
  { key: "sustainedFocus", label: "集中の持続度", shortLabel: "集中の持続度" },
  { key: "focusSpeed", label: "集中の速度", shortLabel: "集中の速度" },
  { key: "relaxationDepth", label: "リラックスの深さ", shortLabel: "リラックスの深さ" },
  { key: "calmnessStability", label: "平静の持続度", shortLabel: "平静の持続度" },
  { key: "calmnessSpeed", label: "入定の速度", shortLabel: "入定の速度" },
];

// ─── Indicator Explanation Groups (脳特性 help popup) ─────────────────────────
// Two categories per the "6指標説明" design document: cognitive / attention
// (①②③, the brain "on" state) and emotional / self-regulation (④⑤⑥, the
// brain "off" state). Numbering follows the document, not the radar order.

export interface IndicatorGroupItem {
  key: keyof BrainIndicators;
  /** Numbered name shown in the popup, e.g. "① 集中の強さ（選択的注意力）". */
  label: string;
  description: string;
}

export interface IndicatorGroup {
  title: string;
  intro: string;
  items: IndicatorGroupItem[];
  /** 【評価のポイント】note shown under the group. */
  evaluationPoint: string;
}

export const INDICATOR_GROUPS: IndicatorGroup[] = [
  {
    title: "1. 認知・注意力の評価（①②③）：脳の「処理能力と制御力」",
    intro:
      "これらは主にベータ波（Beta波）やSMR（感覚運動リズム）などの脳波の活動と関連し、脳の「オン」の状態におけるパフォーマンスを評価します。",
    items: [
      {
        key: "focusIntensity",
        label: "① 集中の強さ（選択的注意力）",
        description:
          "目標に向けた脳のエネルギーの強さを示します。ここが高いと、雑音や妨害をシャットアウトする「ノイズキャンセリング機能」が優れており、情報処理の精度が高いと評価されます。",
      },
      {
        key: "focusSpeed",
        label: "② 集中の速度（交替性注意力）",
        description:
          "脳の「柔軟性（フレキシビリティ）」を評価します。異なるタスク間をスムーズに移行できるかは、脳のワーキングメモリや処理速度の若々しさを示す指標となります。",
      },
      {
        key: "sustainedFocus",
        label: "③ 集中の持続度（持続的注意力）",
        description:
          "脳の「持久力」を評価します。長時間にわたり安定した脳波を維持できるかは、根気強さや学習能力に直結します。加齢に伴い最も低下しやすい指標の一つでもあります。",
      },
    ],
    evaluationPoint:
      "【評価のポイント】①〜③のスコアのバランスを見ます。「①と②が高く③が低い」場合は瞬発力やマルチタスクは得意だが飽きっぽいタイプ、「③が高く②が低い」場合は地道な作業は得意だが、急な変化への対応にエネルギーを使うタイプ、といった特性が浮かび上がります。",
  },
  {
    title: "2. 情緒・自己調整の評価（④⑤⑥）：脳の「回復力と安定性」",
    intro:
      "これらは主にアルファ波（Alpha波）やシータ波（Theta波）の活動と関連し、脳の「オフ」の状態における自律神経の調整力やストレス耐性を評価します。",
    items: [
      {
        key: "relaxationDepth",
        label: "④ リラックスの深さ",
        description:
          "脳と身体の「回復力」を評価します。深いリラックス状態（アルファ波の増加など）にどれだけ到達できるかは、睡眠の質や疲労回復能力の高さを示します。",
      },
      {
        key: "calmnessSpeed",
        label: "⑤ 入定の速度",
        description:
          "自律神経の「切り替えの良さ」を評価します。緊張状態（交感神経優位）からリラックス状態（副交感神経優位）へいかに早くスイッチを切り替えられるかは、不眠や不安の解消能力に関わります。",
      },
      {
        key: "calmnessStability",
        label: "⑥ 平静の持続度",
        description:
          "ストレスに対する「レジリエンス（回復弾性）」を評価します。外的なストレスがかかっても脳の平静さを保てるかは、メンタルヘルスの安定性や感情制御の成熟度を表します。",
      },
    ],
    evaluationPoint:
      "【評価のポイント】現代社会ではストレスが多いため、④〜⑥の「オフの能力」が脳の健康寿命を左右します。ここが低いと、脳が常にオーバーヒート気味（慢性疲労・不眠・イライラ）であると評価されます。",
  },
];
