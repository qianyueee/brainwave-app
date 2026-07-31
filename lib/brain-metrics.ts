import type { BrainProfile } from "./brain-profile";

/**
 * セルフケア評価の3指標（プロダクト仕様 §3「セルフケア評価指標の算術
 * アルゴリズム」）。医療診断を避け、最新の測定データからポジティブな3軸
 * スコア（0-100pt）を出す。計算に必要なデータが無いときは null（未測定表示）。
 *
 * ① NeuroSync レート（切り替え力・若々しさ）
 *      0.6 × (100 − T_enter/T_max × 100) + 0.4 × (P_40Hz / P_base × 50)
 * ② Brain Clarity（脳の活性化度・ひらめき）
 *      Clamp[ ((P_β + 1.5·P_γ)/P_total − R_min) / (R_max − R_min) × 100 ]
 * ③ Brain Reset（脳のリフレッシュ度・休息率）
 *      100 × (1 − e^(−k · (P_δ + P_θ)/P_β))
 */
export interface BrainConditionMetric {
  key: "youth" | "clarity" | "reset";
  /** タイル見出し（「脳の〜」はセクション見出し側にあるので省く） */
  title: string;
  /** 短い補足（切り替え力 など） */
  subtitle: string;
  /** 正式名称（仕様書の表記） */
  fullName: string;
  /** 0-100。データ不足（未測定・レガシー記録）は null。 */
  score: number | null;
}

const clamp100 = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

/** ② の正規化レンジ: R = (β + 1.5γ) / 全帯域。安静時 ≈ 0.1、高活性 ≈ 0.4。 */
const CLARITY_R_MIN = 0.1;
const CLARITY_R_MAX = 0.4;

/** ③ の感度調整係数 k: (δ+θ)/β ≈ 2.5（標準的な安静）で約 63pt になる曲線。 */
const RESET_K = 0.4;

/**
 * ① の第2項 P_40Hz / P_base × 50 を 0-100 に丸める。生の FFT 振幅は 1/f で
 * 減衰するため、P_base は 40Hz 近傍（35〜45Hz、40Hz 自身を除く）の平均を
 * ベースラインとして使う。比 1（平坦）= 50pt、比 2 以上（明確な共鳴）= 100pt。
 */
export function resonance40Score(spectrum: number[] | undefined): number | null {
  if (!spectrum || spectrum.length < 40) return null;
  const p40 = spectrum[39]; // index 39 = 40Hz
  const neighbours: number[] = [];
  for (let i = 34; i <= Math.min(44, spectrum.length - 1); i++) {
    if (i !== 39) neighbours.push(spectrum[i]);
  }
  if (!neighbours.length) return null;
  const pBase = neighbours.reduce((s, v) => s + v, 0) / neighbours.length;
  if (pBase <= 0) return null;
  return clamp100((p40 / pBase) * 50);
}

export function computeBrainConditionMetrics(
  profile: BrainProfile | null
): BrainConditionMetric[] {
  const bands = profile?.bands;

  // ① NeuroSync レート: 第1項の (100 − T_enter/T_max×100) は既存の
  //    入定スピード指標（calmnessSpeed, 0-100）そのもの。40Hz 共鳴の項が
  //    計算できないとき（スペクトル無しのレガシー記録）は第1項のみで代用。
  let youth: number | null = null;
  if (profile) {
    const enterScore = profile.indicators.calmnessSpeed;
    const r40 = resonance40Score(profile.spectrum);
    youth = clamp100(r40 == null ? enterScore : enterScore * 0.6 + r40 * 0.4);
  }

  // ② Brain Clarity: bands は相対パワー（%・合計≈100）なので
  //    (P_β + 1.5 P_γ)/P_total = (β% + 1.5·γ%) / 100。
  let clarity: number | null = null;
  if (bands != null) {
    const beta = bands.lowBeta + bands.highBeta;
    const gamma = bands.lowGamma + bands.highGamma;
    const r = (beta + 1.5 * gamma) / 100;
    clarity = clamp100(((r - CLARITY_R_MIN) / (CLARITY_R_MAX - CLARITY_R_MIN)) * 100);
  }

  // ③ Brain Reset: β が実質ゼロの標本は比が発散するので下限を敷く
  //    （深い休息そのものなので飽和側 = 100pt 付近に落ちる）。
  let reset: number | null = null;
  if (bands != null) {
    const beta = Math.max(bands.lowBeta + bands.highBeta, 0.5);
    const ratio = (bands.delta + bands.theta) / beta;
    reset = clamp100(100 * (1 - Math.exp(-RESET_K * ratio)));
  }

  return [
    { key: "youth", title: "若々しさ", subtitle: "切り替え力", fullName: "脳の若々しさ（NeuroSync レート）", score: youth },
    { key: "clarity", title: "活性化度", subtitle: "ひらめき度", fullName: "脳の活性化度（Brain Clarity）", score: clarity },
    { key: "reset", title: "リフレッシュ度", subtitle: "休息度", fullName: "脳のリフレッシュ度（Brain Reset）", score: reset },
  ];
}
