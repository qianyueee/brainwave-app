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

/**
 * 測定データがあるのに 0pt が並ぶと故障に見える（実際にそういう報告が
 * あった）ので、算出できたスコアは 5pt を下限にする。0 相当の状態は
 * 「未測定 = —」だけに限定する。
 */
const floor5 = (v: number) => Math.max(5, clamp100(v));

/**
 * ② の正規化レンジ: R = (β + 1.5γ) / 全帯域。下限 0.05 は「深いリラックス
 * でも 0pt に張り付かない」ため、上限 0.50 は「満点が滅多に出ない」ため
 * （旧 0.35 では lowβ の多い日常データが軒並み 100pt に飽和した）。
 * β+1.5γ が全帯域の半分を占める例外的な高活性だけが 100 に届く。
 */
const CLARITY_R_MIN = 0.05;
const CLARITY_R_MAX = 0.5;

/**
 * ③ の感度調整係数 k: (δ+θ)/β ≈ 2.5（標準的な安静）で約 53pt、≈ 5 で 78pt。
 * 100pt には比 ≈ 18（δ+θ が 7 割超かつ β が数 % という深睡眠級）が必要 —
 * 旧 0.4 は深めのリラックスで簡単に 100 へ飽和していた。
 */
const RESET_K = 0.3;

/**
 * ① の 40Hz 共鳴スコア係数: 比 × 45（平坦 = 45pt、100pt には比 ≈ 2.2 の
 * 明確なピークが必要）。旧 ×50 は比 2 で満点になり甘すぎた。
 */
const RESONANCE_SCALE = 45;

/**
 * ① の第2項 40Hz 共鳴率を 0-100 に写像する。生の FFT 振幅は 1/f で減衰する
 * ため、P_base は 40Hz 近傍（35〜45Hz、40Hz 自身を除く）の平均をベースライン
 * として使う。比 1（平坦）= 45pt、100pt には比 ≈ 2.2 の明確なピークが必要。
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
  return clamp100((p40 / pBase) * RESONANCE_SCALE);
}

export function computeBrainConditionMetrics(
  profile: BrainProfile | null
): BrainConditionMetric[] {
  const bands = profile?.bands;

  // ① NeuroSync レート: 第1項の「切り替え力」は、リラックス方向（⑤入定
  //    スピード）と集中方向（②集中スピード）を 7:3 で合成する（良い方が
  //    主、弱い方が従）。入定点が検出されなかった測定（短時間・緊張状態・
  //    アップロード由来で頻発）は calmnessSpeed が 0 になるため、それ単独
  //    だと 0pt に張り付いていた — どちらの方向でも切り替えの素早さは
  //    「音への反応の素直さ」の証拠。max ではなく加重にするのは、片方だけ
  //    速くても満点にさせないため（100pt には両方向とも満点が必要）。
  //    40Hz 共鳴の項が計算できないとき（スペクトル無しのレガシー記録）は
  //    切り替え項のみで代用。
  let youth: number | null = null;
  if (profile) {
    const a = profile.indicators.calmnessSpeed;
    const b = profile.indicators.focusSpeed;
    const switching = Math.max(a, b) * 0.7 + Math.min(a, b) * 0.3;
    const r40 = resonance40Score(profile.spectrum);
    youth = floor5(r40 == null ? switching : switching * 0.6 + r40 * 0.4);
  }

  // ② Brain Clarity: bands は相対パワー（%・合計≈100）なので
  //    (P_β + 1.5 P_γ)/P_total = (β% + 1.5·γ%) / 100。
  let clarity: number | null = null;
  if (bands != null) {
    const beta = bands.lowBeta + bands.highBeta;
    const gamma = bands.lowGamma + bands.highGamma;
    const r = (beta + 1.5 * gamma) / 100;
    clarity = floor5(((r - CLARITY_R_MIN) / (CLARITY_R_MAX - CLARITY_R_MIN)) * 100);
  }

  // ③ Brain Reset: β が実質ゼロの標本は比が発散するので下限を敷く
  //    （深い休息そのものなので飽和側 = 100pt 付近に落ちる）。
  let reset: number | null = null;
  if (bands != null) {
    const beta = Math.max(bands.lowBeta + bands.highBeta, 0.5);
    const ratio = (bands.delta + bands.theta) / beta;
    reset = floor5(100 * (1 - Math.exp(-RESET_K * ratio)));
  }

  return [
    { key: "youth", title: "若々しさ", subtitle: "切り替え力", fullName: "脳の若々しさ（NeuroSync レート）", score: youth },
    { key: "clarity", title: "活性化度", subtitle: "ひらめき度", fullName: "脳の活性化度（Brain Clarity）", score: clarity },
    { key: "reset", title: "リフレッシュ度", subtitle: "休息度", fullName: "脳のリフレッシュ度（Brain Reset）", score: reset },
  ];
}
