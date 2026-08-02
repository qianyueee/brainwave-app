import type { BrainProfile } from "./brain-profile";

/**
 * セルフケア評価の3指標（プロダクト仕様 §3）。医療診断を避け、最新の測定
 * データからポジティブな3軸スコアを出す。すべて 0-100、計算に必要なデータが
 * 無いときは null（未測定表示）。
 *
 * 1. NeuroSync レート（切り替え力・脳の適応同調度）
 *    入定速度（100pt）と 40Hz 共鳴率をベースに「音への脳の切り替え力・
 *    反応の素直さ」を評価。
 * 2. Brain Clarity（脳の明晰度・ひらめき・集中度）
 *    20Hz/40Hz（ガンマ・ベータ波）のピークをもとに「意識が冴え渡るフロー
 *    状態」を可視化。
 * 3. Brain Reset（脳のリフレッシュ度・ディープ休息率）
 *    δ波・θ波の占有率から「脳疲労のディープクレンジング率」を可視化。
 *
 * 計算式は初期設計版。後から入れた再調整（切り替え力の 7:3 加重、正規化
 * レンジ、指数カーブ等）はロールバック済みで、残しているのは「0pt が
 * 故障に見える」対策の2点だけ: 算出できたスコアの 5pt 下限と、入定点が
 * 検出されなかった測定での集中スピード代用。
 */
export interface BrainConditionMetric {
  key: "youth" | "clarity" | "reset";
  /** タイル見出し（英語の正式名） */
  title: string;
  /** カッコ内の日本語説明（切り替え力・脳の適応同調度 など） */
  subtitle: string;
  /** 正式名称（見出し＋カッコ説明の全文） */
  fullName: string;
  /** 0-100。データ不足（未測定・レガシー記録）は null。 */
  score: number | null;
}

const clamp100 = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

/** 測定データがあるのに 0pt が並ぶと故障に見えるため、算出値は 5pt を下限に。 */
const floor5 = (v: number) => Math.max(5, clamp100(v));

/**
 * 40Hz 共鳴率: per-Hz スペクトルの 40Hz ビンが近傍（35〜45Hz、40Hz 自身を
 * 除く）の平均からどれだけ突出しているかを 0-100 に写像する。生の FFT 振幅は
 * 1/f で減衰するので絶対値ではなく局所比を使う（比 1 = 平坦 ≒ 50 点弱、
 * 1.5 倍の明確なピークで 100 点、0.6 以下で 0 点）。
 */
export function resonance40Score(spectrum: number[] | undefined): number | null {
  if (!spectrum || spectrum.length < 40) return null;
  const bin40 = spectrum[39]; // index 39 = 40Hz
  const neighbours: number[] = [];
  for (let i = 34; i <= Math.min(44, spectrum.length - 1); i++) {
    if (i !== 39) neighbours.push(spectrum[i]);
  }
  if (!neighbours.length) return null;
  const mean = neighbours.reduce((s, v) => s + v, 0) / neighbours.length;
  if (mean <= 0) return null;
  const ratio = bin40 / mean;
  return clamp100(((ratio - 0.6) / 0.9) * 100);
}

export function computeBrainConditionMetrics(
  profile: BrainProfile | null
): BrainConditionMetric[] {
  const bands = profile?.bands;

  // ① 若々しさ: 入定速度（0-100）を軸に、40Hz 共鳴率があれば 4 割ブレンド。
  //    入定点が検出されなかった測定（短時間・緊張・アップロード由来）は
  //    calmnessSpeed が 0 になるので、その時だけ集中スピードで代用する。
  let youth: number | null = null;
  if (profile) {
    const calmness =
      profile.indicators.calmnessSpeed > 0
        ? profile.indicators.calmnessSpeed
        : profile.indicators.focusSpeed;
    const r40 = resonance40Score(profile.spectrum);
    youth = floor5(r40 == null ? calmness : calmness * 0.6 + r40 * 0.4);
  }

  // ② 活性化度: 高β（18-30Hz、20Hz ピーク帯）+ γ（30-45Hz、40Hz 帯）の
  //    占有率。覚醒的な帯域が合計 25% を占めれば満点となるスケール。
  const clarity =
    bands != null
      ? floor5((bands.highBeta + bands.lowGamma + bands.highGamma) * 4)
      : null;

  // ③ リフレッシュ度: δ+θ の占有率（すでに % なのでそのままスコアになる）。
  const reset = bands != null ? floor5(bands.delta + bands.theta) : null;

  return [
    { key: "youth", title: "NeuroSync レート", subtitle: "切り替え力・脳の適応同調度", fullName: "NeuroSync レート（切り替え力・脳の適応同調度）", score: youth },
    { key: "clarity", title: "Brain Clarity", subtitle: "脳の明晰度・ひらめき・集中度", fullName: "Brain Clarity（脳の明晰度・ひらめき・集中度）", score: clarity },
    { key: "reset", title: "Brain Reset", subtitle: "脳のリフレッシュ度・ディープ休息率", fullName: "Brain Reset（脳のリフレッシュ度・ディープ休息率）", score: reset },
  ];
}
