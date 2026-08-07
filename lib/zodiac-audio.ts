import { getZodiacSign } from "./zodiac";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * 星座プログラムの音楽ベッド。
 *
 * 納品された 96 曲（12星座 × 8ビート）は「載波の周波数を土台にした音楽」で、
 * バイノーラルビート自体は入っていない（左右チャンネルに周波数差が無く、
 * 等時性の振幅変調もビート周波数の純音も検出されなかった）。ファイル名の
 * `_40Hz` などは、どのプログラム用の曲かを示すラベル。
 *
 * したがって誘導音は今まで通り BinauralSession が実時間合成し、この音楽は
 * その下に敷く伴奏として重ねる。曲は 1〜8 分と尺がまちまちなので（平均 3 分、
 * セッションは 15 分）ループ再生する。
 */

/** 実際に音源があるビート。納品はモジュール9種のうち 4Hz を除く8種。 */
const AVAILABLE_BEATS = [2, 6, 7.83, 10, 12, 14, 20, 40];

/** ファイル名に使うビート表記（7.83 はそのまま、40 は "40"）。 */
function beatKey(beat: number): string {
  return String(beat);
}

/**
 * 音源が無いビートは一番近いものを流用する。曲だけの代用で、合成される誘導
 * ビートは指定どおりのまま。該当するのは
 *   - 4Hz（深夜の月×水・蠍座の自星座ビート）: 未納品。2Hz と 6Hz が等距離で、
 *     配列順により深い方の 2Hz を採る（どちらも同じ HEALING タグの曲）。
 *   - 15Hz（獅子座の自星座ビート）→ 14Hz、8Hz（天秤座）→ 7.83Hz。
 *     こちらは天体計算に失敗して自星座プログラムへ回ったときだけ通る経路。
 */
function nearestAvailableBeat(beat: number): number {
  let best = AVAILABLE_BEATS[0];
  for (const b of AVAILABLE_BEATS) {
    if (Math.abs(b - beat) < Math.abs(best - beat)) best = b;
  }
  return best;
}

/**
 * プログラム id → 音楽ファイルの URL。星座プログラム以外（内蔵3種・カスタム）
 * は音楽を持たないので null。
 */
export function zodiacMusicUrl(programId: string): string | null {
  if (!programId.startsWith("zodiac-")) return null;

  const rest = programId.slice("zodiac-".length);
  // `zodiac-<key>` は自星座ビート、`zodiac-<key>-b<beat>` はモジュール版。
  const sep = rest.indexOf("-b");
  const key = sep === -1 ? rest : rest.slice(0, sep);
  const sign = getZodiacSign(key);
  if (!sign) return null;

  const rawBeat = sep === -1 ? sign.targetBeatFreq : Number(rest.slice(sep + 2));
  if (!Number.isFinite(rawBeat)) return null;

  const beat = AVAILABLE_BEATS.includes(rawBeat)
    ? rawBeat
    : nearestAvailableBeat(rawBeat);

  return `${BASE_PATH}/sounds/zodiac/${sign.key}-b${beatKey(beat)}.mp3`;
}

/** 音楽ベッドを持つプログラムかどうか（Mixer のスライダー表示に使う）。 */
export function hasZodiacMusic(programId: string): boolean {
  return zodiacMusicUrl(programId) !== null;
}
