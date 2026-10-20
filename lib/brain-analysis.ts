import type { BrainIndicators, BrainProfile, BrainTimeline } from "./brain-profile";
import { compositeScore } from "./brain-measurements";
import { computeBrainConditionMetrics } from "./brain-metrics";
import { DEFAULT_TARGET_HZ, resonanceRatioAt } from "./mind/resonance";
import { displayedSpectrum, type BandPowers } from "./mind/types";
import type { Locale } from "./i18n";

/**
 * AI（DeepSeek）による脳特性の分析——送るものと、返ってくるもの。2種類ある：
 *
 *   - 1件の分析（Sync Report の大脳特性の下）……BrainAnalysisInput → BrainAnalysis
 *   - 比較分析（Sync Report の「測定の比較」、2〜3件）……BrainComparisonInput →
 *     BrainComparison
 *
 * どちらも同じ Edge Function `analyze-brain` に渡す（本文の `kind` で見分ける）。
 *
 * ■ 送るのは数値だけ
 * 測定の記録からここで数値の束を作って渡す。プロンプトはサーバーが組む——
 * クライアントが文章を送れると、その関数が「誰でも DeepSeek を無料で使える窓口」
 * になるから。メモ・測定者名・sessionTag は**送らない**（本人の言葉と名前を
 * 第三者に渡さない、そして自由文がプロンプトに混ざらない）。比較分析で測定を
 * 名指すラベル（「10月1日 07:15の測定」）も、送った日時の数字からサーバーが組む。
 *
 * ■ 形は2か所で同じに保つ
 * サーバー側の検査（supabase/functions/analyze-brain/index.ts の validateInput /
 * validateCompareInput）はこの型をそのまま写したもの。項目を足す・範囲を変える
 * ときは両方を直し、ANALYSIS_INPUT_VERSION / COMPARISON_INPUT_VERSION を上げる。
 * `pnpm check:analysis` がサーバー側の検査を確かめる。
 */

/** 送る形の版。サーバーは知らない版を bad_input で断る。 */
export const ANALYSIS_INPUT_VERSION = 1;

/** 1件ぶんの数値（1件の分析と比較分析で同じ項目・同じ計算）。 */
export interface MeasurementNumbers {
  /** 測定の長さ（秒）。timeline がある記録だけ分かる。 */
  durationSec: number | null;
  /** 装着が読めていた割合（0-100）。不明は null。 */
  qualityPct: number | null;
  /** 誘導周波数（Hz）。セッション無しの測定は既定の 40Hz。 */
  targetHz: number;
  /** 誘導周波数が分かっている測定か——セッションを流しながら測った（以前の記録は
   *  手で入力した）。false＝既定の 40Hz で見ている。 */
  targetHzSet: boolean;
  indicators: BrainIndicators;
  /** 6指標の平均（画面の「総合」）。 */
  composite: number;
  /** 脳コンディション3指標（画面のタイルと同じ計算）。データ不足は null。 */
  condition: { rate: number | null; clarity: number | null; reset: number | null };
  /** 8種類の脳波の割合（%）。古い記録には無い。 */
  bands: BandPowers | null;
  features: {
    /** 8〜13Hz でいちばん高いビン（個人のα波ピーク周波数の目安）。 */
    alphaPeakHz: number | null;
    /** 誘導周波数のビンが ±5Hz の周りより何倍立っているか（1＝平坦）。 */
    targetResonance: number | null;
    /** θ ÷ β（低β＋高β）。 */
    thetaBetaRatio: number | null;
    /** (δ＋θ) ÷ (α＋β)。遅い波と速い波の釣り合い。 */
    slowFastRatio: number | null;
  };
}

export interface BrainAnalysisInput extends MeasurementNumbers {
  v: typeof ANALYSIS_INPUT_VERSION;
  /** 分析を結びつける測定のキー（BrainProfile.uploadedAt）。プロンプトには入らない。 */
  uploadedAt: string;
  locale: Locale;
  /** 測定した時刻（端末の現地時間、0-23）。朝・夜の測定かで読み方が変わる。 */
  hourOfDay: number;
  /** 1〜50Hz の周波数スペクトル。最大値を 100 とした相対値（生の振幅は機器ごとに桁が違う）。 */
  spectrum: number[] | null;
  /** 測定中の変化（lib/brain-profile.ts の computeTimeline）。無い記録は null。 */
  timeline: BrainTimeline | null;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;
const pct = (v: number) => Math.max(0, Math.min(100, v));

/**
 * 区間の値を 0-100 に収める。アップロードしたファイルの列は機器の書き出しそのまま
 * なので、まれに範囲を外れた値が混ざる——1つでも外れるとサーバーの検査が丸ごと
 * 断るので、送る前に揃える。
 */
function safeTimeline(t: BrainTimeline | undefined): BrainTimeline | null {
  if (!t?.segments.length) return null;
  return {
    segmentSec: Math.max(1, Math.round(t.segmentSec)),
    segments: t.segments.slice(0, 10).map((s) => ({
      usablePct: pct(s.usablePct),
      attention: s.attention == null ? null : pct(s.attention),
      relaxation: s.relaxation == null ? null : pct(s.relaxation),
      bands: s.bands
        ? (Object.fromEntries(Object.entries(s.bands).map(([k, v]) => [k, pct(v)])) as BandPowers)
        : null,
    })),
  };
}

/** 8〜13Hz の最大ビン。スペクトルが 13Hz に届かない・全部 0 なら null。 */
function alphaPeakHz(spectrum: number[] | undefined): number | null {
  if (!spectrum || spectrum.length < 13) return null;
  let best = -1;
  let bestHz: number | null = null;
  for (let hz = 8; hz <= 13; hz++) {
    const v = spectrum[hz - 1];
    if (Number.isFinite(v) && v > best) {
      best = v;
      bestHz = hz;
    }
  }
  return best > 0 ? bestHz : null;
}

/**
 * 比の特徴量（サーバーの範囲は 0〜1000）。分母がごく小さいと桁外れの値や Infinity に
 * なり、1つでも外れるとサーバーの検査が丸ごと断るので、送る前に収める。
 */
function capRatio(v: number | null): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.min(1000, round2(v));
}

function ratio(num: number, den: number): number | null {
  return den > 0 ? capRatio(num / den) : null;
}

/** 1件ぶんの数値。画面のタイル・脳波バランスと同じ関数を通す（AI が読む数字と画面の数字が食い違わない）。 */
function measurementNumbers(m: BrainProfile): MeasurementNumbers {
  const [rate, clarity, reset] = computeBrainConditionMetrics(m).map((c) => c.score);
  const targetHz = m.targetHz ?? DEFAULT_TARGET_HZ;
  const b = m.bands;
  return {
    durationSec: m.timeline
      ? m.timeline.segmentSec * m.timeline.segments.length
      : null,
    qualityPct: m.qualityPct ?? null,
    targetHz,
    targetHzSet: m.targetHz != null,
    indicators: m.indicators,
    composite: compositeScore(m.indicators),
    condition: { rate, clarity, reset },
    bands: b
      ? (Object.fromEntries(Object.entries(b).map(([k, v]) => [k, round1(v)])) as BandPowers)
      : null,
    features: {
      alphaPeakHz: alphaPeakHz(m.spectrum),
      targetResonance: capRatio(resonanceRatioAt(m.spectrum, targetHz)),
      thetaBetaRatio: b ? ratio(b.theta, b.lowBeta + b.highBeta) : null,
      slowFastRatio: b
        ? ratio(b.delta + b.theta, b.lowAlpha + b.highAlpha + b.lowBeta + b.highBeta)
        : null,
    },
  };
}

/**
 * 記録 → 送る数値の束。表示中の測定をそのまま渡せばよい（画面のタイル・
 * スペクトルと同じ関数を通すので、AI が読む数字と画面の数字は食い違わない）。
 */
export function buildAnalysisInput(m: BrainProfile, locale: Locale): BrainAnalysisInput {
  const shown = m.spectrum?.length ? displayedSpectrum(m.spectrum) : null;
  const peak = shown ? Math.max(...shown.filter(Number.isFinite)) : 0;

  return {
    v: ANALYSIS_INPUT_VERSION,
    uploadedAt: m.uploadedAt,
    locale,
    hourOfDay: new Date(m.uploadedAt).getHours(),
    ...measurementNumbers(m),
    spectrum:
      shown && peak > 0 ? shown.map((v) => (Number.isFinite(v) ? round1((v / peak) * 100) : 0)) : null,
    timeline: safeTimeline(m.timeline),
  };
}

// ─── 比較分析（Sync Report「測定の比較」） ───────────────────────────────────

/** 比較分析の送る形の版（1件の分析とは別に数える）。 */
export const COMPARISON_INPUT_VERSION = 1;
/** 比べられる測定の数（画面の「測定の比較」と同じ 2〜3件）。 */
export const COMPARISON_MIN = 2;
export const COMPARISON_MAX = 3;

/** 比べる1件。数値は1件の分析と同じ（スペクトル・測定中の変化は送らない——比べるのは画面に並ぶ指標と割合）。 */
export interface BrainComparisonMeasurement extends MeasurementNumbers {
  /** 測定のキー（BrainProfile.uploadedAt）。プロンプトには入らない。 */
  uploadedAt: string;
  /**
   * 測定した日時（端末の現地時間）。サーバーがこの数字から「10月1日 07:15の測定」の
   * ようなラベルを組み、AI はそれで測定を名指す。
   */
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** いちばん古い測定から数えて何日目か（端末の暦日、0 始まり）。 */
  dayIndex: number;
  /**
   * 測定者の別（初めて出た人から 0, 1, 2）。名前は送らない——「全員」から選ぶと
   * 別の人どうしを比べられるので、AI が人の違いを「変化」と読まないために。
   */
  person: number;
}

export interface BrainComparisonInput {
  v: typeof COMPARISON_INPUT_VERSION;
  kind: "compare";
  locale: Locale;
  /** 古い順（キーの並び順）。 */
  measurements: BrainComparisonMeasurement[];
}

/** キーの文字の並び（toISOString の書式なので、これが時刻順）。サーバーの検査と同じ比べ方。 */
const byKey = (a: BrainProfile, b: BrainProfile) =>
  a.uploadedAt < b.uploadedAt ? -1 : a.uploadedAt > b.uploadedAt ? 1 : 0;

/**
 * 比べる測定のキーを古い順に。保存された比較分析（user_brain_comparisons の
 * uploaded_a / b / c）と同じ並びなので、読み込みもこれで引く。
 */
export function comparisonKeys(ms: readonly BrainProfile[]): string[] {
  return [...ms].sort(byKey).map((m) => m.uploadedAt);
}

/** 端末の暦日の通し番号（夏時間で1日が23・25時間でも、丸めれば1日は1）。 */
function localDayNumber(d: Date): number {
  return Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000);
}

/** 選んだ測定（2〜3件、順不同）→ 送る数値の束。 */
export function buildComparisonInput(ms: readonly BrainProfile[], locale: Locale): BrainComparisonInput {
  const sorted = [...ms].sort(byKey);
  const firstDay = localDayNumber(new Date(sorted[0].uploadedAt));
  const people: string[] = [];
  return {
    v: COMPARISON_INPUT_VERSION,
    kind: "compare",
    locale,
    measurements: sorted.map((m) => {
      const at = new Date(m.uploadedAt);
      // アップロードの記録・測定者より前の記録（subject 無し）は「名前の無い人」1人として数える。
      const who = m.subject ?? "";
      if (!people.includes(who)) people.push(who);
      return {
        uploadedAt: m.uploadedAt,
        month: at.getMonth() + 1,
        day: at.getDate(),
        hour: at.getHours(),
        minute: at.getMinutes(),
        dayIndex: localDayNumber(at) - firstDay,
        person: people.indexOf(who),
        ...measurementNumbers(m),
      };
    }),
  };
}

// ─── 返ってくるもの ─────────────────────────────────────────────────────────

/** AI の文章。サーバーが形を確かめ、長さを切り詰めてから保存する。 */
export interface BrainAnalysisContent {
  /** 総評（2〜3文）。 */
  summary: string;
  /** 良いところ（0〜3）。 */
  strengths: string[];
  /** 気をつけたい点（0〜3）。 */
  cautions: string[];
  /** 測定中の変化。timeline の無い記録では null。 */
  course: string | null;
  /** おすすめの過ごし方（1〜3）。 */
  suggestions: string[];
}

/** 保存されている分析（user_brain_analyses の1行）。 */
export interface BrainAnalysis {
  uploadedAt: string;
  /** 分析を書いた言語。画面の言語と違えば「もう一度分析」を勧める。 */
  locale: Locale;
  model: string;
  /** 作成日時（ISO）。 */
  createdAt: string;
  content: BrainAnalysisContent;
}

/** 比較分析の文章。サーバーが形を確かめ、長さを切り詰めてから保存する。 */
export interface BrainComparisonContent {
  /** 総評（2〜3文）。 */
  summary: string;
  /** 主な違い（0〜4）。 */
  differences: string[];
  /** 良くなった点（別の人どうしなら、それぞれの良いところ）（0〜3）。 */
  strengths: string[];
  /** 気をつけたい点（0〜3）。 */
  cautions: string[];
  /** おすすめの過ごし方（0〜3）。 */
  suggestions: string[];
}

/** 保存されている比較分析（user_brain_comparisons の1行）。 */
export interface BrainComparison {
  /** 比べた測定のキー（古い順、comparisonKeys と同じ並び）。 */
  keys: string[];
  /** 分析を書いた言語。画面の言語と違えば「もう一度分析」を勧める。 */
  locale: Locale;
  model: string;
  /** 作成日時（ISO）。 */
  createdAt: string;
  content: BrainComparisonContent;
}

/**
 * 失敗の種類（Edge Function の error と、返事を読めなかった場合の2つ）。
 * network＝端末がオフライン、unreachable＝オンラインなのに窓口が答えなかった
 * （関数が待ち受けていない・実行環境の打ち切りなど。CORS 無しの応答はブラウザが
 * 中身を見せないので、ここまでしか分けられない）。
 */
export type AnalysisErrorCode =
  | "unauthorized"
  | "bad_input"
  | "not_saved"
  | "rate_limited"
  | "upstream"
  | "not_configured"
  | "network"
  | "unreachable";

const ERROR_CODES: AnalysisErrorCode[] = [
  "unauthorized",
  "bad_input",
  "not_saved",
  "rate_limited",
  "upstream",
  "not_configured",
  "network",
  "unreachable",
];

export function toAnalysisErrorCode(v: unknown): AnalysisErrorCode {
  return ERROR_CODES.includes(v as AnalysisErrorCode) ? (v as AnalysisErrorCode) : "upstream";
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];

/**
 * DB の行（snake_case）→ BrainAnalysis。形の崩れた行は null（画面は「まだ分析して
 * いない」と同じに扱う——壊れた文章を出すより、もう一度分析してもらうほうがよい）。
 */
export function normalizeAnalysis(row: unknown): BrainAnalysis | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  const c = r.content as Record<string, unknown> | null;
  if (typeof r.uploaded_at !== "string" || typeof c !== "object" || c === null) return null;
  if (typeof c.summary !== "string" || c.summary.trim() === "") return null;
  return {
    uploadedAt: r.uploaded_at,
    locale: r.locale === "en" ? "en" : "ja",
    model: typeof r.model === "string" ? r.model : "",
    createdAt: typeof r.created_at === "string" ? r.created_at : "",
    content: {
      summary: c.summary,
      strengths: strings(c.strengths),
      cautions: strings(c.cautions),
      course: typeof c.course === "string" && c.course.trim() !== "" ? c.course : null,
      suggestions: strings(c.suggestions),
    },
  };
}

/** DB の行（snake_case）→ BrainComparison。形の崩れた行は null（normalizeAnalysis と同じ扱い）。 */
export function normalizeComparison(row: unknown): BrainComparison | null {
  if (typeof row !== "object" || row === null) return null;
  const r = row as Record<string, unknown>;
  const c = r.content as Record<string, unknown> | null;
  if (typeof r.uploaded_a !== "string" || typeof r.uploaded_b !== "string") return null;
  if (typeof c !== "object" || c === null) return null;
  if (typeof c.summary !== "string" || c.summary.trim() === "") return null;
  return {
    keys: [r.uploaded_a, r.uploaded_b, ...(typeof r.uploaded_c === "string" ? [r.uploaded_c] : [])],
    locale: r.locale === "en" ? "en" : "ja",
    model: typeof r.model === "string" ? r.model : "",
    createdAt: typeof r.created_at === "string" ? r.created_at : "",
    content: {
      summary: c.summary,
      differences: strings(c.differences),
      strengths: strings(c.strengths),
      cautions: strings(c.cautions),
      suggestions: strings(c.suggestions),
    },
  };
}
