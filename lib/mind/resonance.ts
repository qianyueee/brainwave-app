/**
 * ある周波数に脳波がどれだけ「乗っている」かを、per-Hz スペクトルの
 * **局所突出比**で測る。
 *
 * 生の FFT 振幅は 1/f で落ちるので、絶対値では低い周波数がいつでも勝ってしまう。
 * 見たいのは「その周波数だけが周りより立っているか」なので、目標周波数の値を
 * その近傍（±5Hz、ただし目標の±1Hz は山そのものなので除く）の平均で割る。
 * 比 1.0 = 周りと同じ＝突出なし、1.5 = 明確なピーク。
 *
 * 40Hz 固定だった計算（lib/brain-metrics.ts の resonance40Score）と、10秒
 * チェックの誘導周波数（0.1Hz 刻みで任意）が同じ式を共有するためにここへ
 * 切り出した。数値の意味が2箇所でずれると、同じ「共鳴」という言葉で違うものを
 * 指すことになる。
 */

/** 近傍としてならす幅（Hz）。 */
export const RESONANCE_NEIGHBOURHOOD_HZ = 5;
/** 山そのものとして近傍から除く幅（Hz）。 */
export const RESONANCE_EXCLUDE_HZ = 1;

/**
 * スペクトル（index i ⇒ (i+1) Hz）を任意の周波数で読む。ビンは 1Hz 刻みなので、
 * 0.1Hz 刻みの指定は前後のビンを線形補間する——7.8Hz と 8.0Hz を同じ値に
 * 丸めてしまうと、入力欄の小数第1位が意味を持たなくなる。
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
