/**
 * ある周波数に脳波がどれだけ「乗っている」かを、per-Hz スペクトルの
 * **局所突出比**で測る。
 *
 * 生の FFT 振幅は 1/f で落ちるので、絶対値では低い周波数がいつでも勝ってしまう。
 * 見たいのは「その周波数だけが周りより立っているか」なので、目標周波数の値を
 * その近傍（±5Hz、ただし目標の±1Hz は山そのものなので除く）の平均で割る。
 * 比 1.0 = 周りと同じ＝突出なし、1.5 = 明確なピーク。
 *
 * 基準の周波数は既定で 40Hz。測定のときに誘導周波数を入力してあれば、その Hz
 * が基準になる（0.01Hz 刻みで任意）。式は共通なので、40Hz でも 7.83Hz でも
 * 「共鳴」という言葉が同じものを指す。
 */

import { SPECTRUM_MAX_HZ } from "./types";

// ─── 誘導周波数（測定のときに入力する、いま鳴らしている音が狙う Hz） ─────────

/**
 * 入力レンジ。下限は 1Hz（スペクトルの最初のビン）、上限はスペクトルが届く
 * 45Hz——ここより外を指定させても、乗れたかどうかを読む材料が無い。
 */
export const TARGET_HZ_MIN = 1;
export const TARGET_HZ_MAX = SPECTRUM_MAX_HZ;
/** 入力の刻み。0.01Hz（7.83Hz のような差周波数を丸めずに書けるように）。 */
export const TARGET_HZ_STEP = 0.01;
/**
 * 未入力のときの基準。三大プログラムの中心である 40Hz（ガンマ）＝これまで
 * 固定で使っていた値なので、入力しなければ従来どおりの判定になる。
 */
export const DEFAULT_TARGET_HZ = 40;

/**
 * 0.01Hz 刻みへ丸めてレンジ内に収める。数値でなければ null（＝未入力、既定の
 * 40Hz で判定する）。範囲外は弾かずに端へ寄せる——打った値が黙って無視される
 * より、丸められた値が見えるほうがいい。
 */
export function normalizeTargetHz(v: number | null | undefined): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  const snapped = Math.round(v * 100) / 100;
  return Math.min(TARGET_HZ_MAX, Math.max(TARGET_HZ_MIN, snapped));
}

/** 表示は常に小数第2位まで（40 → "40.00"）。入力の刻みと桁を揃える。 */
export function formatTargetHz(hz: number): string {
  return hz.toFixed(2);
}

// ─── 局所突出比 ──────────────────────────────────────────────────────────────

/** 近傍としてならす幅（Hz）。 */
export const RESONANCE_NEIGHBOURHOOD_HZ = 5;
/** 山そのものとして近傍から除く幅（Hz）。 */
export const RESONANCE_EXCLUDE_HZ = 1;

/**
 * スペクトル（index i ⇒ (i+1) Hz）を任意の周波数で読む。ビンは 1Hz 刻みなので、
 * 0.01Hz 刻みの指定は前後のビンを線形補間する——7.83Hz と 8.00Hz を同じ値に
 * 丸めてしまうと、入力欄の小数部が意味を持たなくなる。
 */
export function spectrumValueAt(spectrum: number[], hz: number): number | null {
  if (!spectrum.length || hz < 1 || hz > spectrum.length) return null;
  const pos = hz - 1;
  const lo = Math.floor(pos);
  const hi = Math.min(Math.ceil(pos), spectrum.length - 1);
  const a = spectrum[lo];
  const b = spectrum[hi];
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a + (b - a) * (pos - lo);
}

/**
 * 目標周波数の局所突出比。スペクトルが無い／目標が範囲外／近傍が空のときは
 * null（＝測れない、0 ではない）。
 */
export function resonanceRatioAt(
  spectrum: number[] | undefined,
  hz: number
): number | null {
  if (!spectrum?.length) return null;
  const peak = spectrumValueAt(spectrum, hz);
  if (peak == null) return null;

  const neighbours: number[] = [];
  for (let i = 0; i < spectrum.length; i++) {
    const d = Math.abs(i + 1 - hz);
    if (d >= RESONANCE_EXCLUDE_HZ && d <= RESONANCE_NEIGHBOURHOOD_HZ) {
      neighbours.push(spectrum[i]);
    }
  }
  if (!neighbours.length) return null;
  const mean = neighbours.reduce((s, v) => s + v, 0) / neighbours.length;
  if (mean <= 0) return null;
  return peak / mean;
}
