import { getZodiacSign, type ZodiacKey } from "./zodiac";
import { musicUrl } from "./sounds";
import { CATALOG_MUSIC } from "./catalog/music";

/**
 * プログラムの音楽ベッド（星座 96 曲＋デフォルト 4 曲＋Target 42 曲＋Energy 13 曲）。
 *
 * 曲はどれも別リポジトリ qianyueee/brainwave-sounds の GitHub Pages にあり
 * （lib/sounds.ts の musicUrl）、ファイル名は納品されたときのまま。
 *
 * 星座向けに納品された 96 曲（12星座 × 8ビート）は「載波の周波数を土台にした
 * 音楽」で、バイノーラルビート自体は入っていない（左右チャンネルに周波数差が
 * 無く、等時性の振幅変調もビート周波数の純音も検出されなかった）。ファイル名の
 * `_40Hz` などは、どのプログラム用の曲かを示すラベル。デフォルトの曲は
 * Suno 生成（ran_haku）。
 *
 * したがって誘導音は今まで通り BinauralSession が実時間合成し、この音楽は
 * その下に敷く伴奏として重ねる。曲は尺がまちまちなので（セッションは 15〜30
 * 分）ループ再生する。
 */

/** デフォルト 4 プログラムの曲。 */
const DEFAULT_PROGRAM_MUSIC: Record<string, string> = {
  "reset-deep": "デフォルトプログラム/リセット＆ディープ.mp3",
  "clarity-focus": "デフォルトプログラム/クラリティ＆フォーカス.mp3",
  "night-recovery": "デフォルトプログラム/ナイトリカバリー.mp3",
  "morning-tuning": "デフォルトプログラム/Morning Tuning & Energize（アルファ〜ベータ波 _ 432Hz 朝の覚醒）.mp3",
};

/**
 * 星座の曲のファイル名の頭（`<星座> (<載波>Hz)`）。納品時の表記のままなので、
 * 括弧の内側の空白の有無が星座ごとに違う——揃えると 404 になる。
 */
const ZODIAC_FILE_PREFIX: Record<ZodiacKey, string> = {
  aries: "牡羊座 (285Hz)",
  taurus: "牡牛座 (432Hz)",
  gemini: "双子座 (528Hz)",
  cancer: "蟹座 (417Hz)",
  leo: "獅子座 (639Hz)",
  virgo: "乙女座 (741Hz)",
  libra: "天秤座 (852Hz)",
  scorpio: "蠍座 (211.44Hz)",
  sagittarius: "射手座 ( 396Hz)",
  capricorn: "山羊座 ( 141.27Hz)",
  aquarius: "水瓶座 ( 963Hz)",
  pisces: "魚座 (174Hz)",
};

/** ビート → ファイル名の中ほどのタグ（2 ビートずつ同じタグの組になっている）。 */
const ZODIAC_TAG_BY_BEAT: Record<number, string> = {
  40: "TAG_ACTIVATION (40Hz_20Hz)",
  20: "TAG_ACTIVATION (40Hz_20Hz)",
  14: "TAG_BALANCE (14Hz_7.83Hz)",
  7.83: "TAG_BALANCE (14Hz_7.83Hz)",
  12: "TAG_FLOW_MIND (12Hz_10Hz)",
  10: "TAG_FLOW_MIND (12Hz_10Hz)",
  6: "TAG_HEALING (6Hz_4Hz_2Hz)",
  2: "TAG_HEALING (6Hz_4Hz_2Hz)",
};

/** 実際に音源があるビート。納品はモジュール9種のうち 4Hz を除く8種。 */
const AVAILABLE_BEATS = [2, 6, 7.83, 10, 12, 14, 20, 40];

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

/** 星座 × ビート → brainwave-sounds 内のパス。 */
function zodiacMusicPath(key: ZodiacKey, beat: number): string {
  // ファイル名のビート表記は 7.83 はそのまま、40 は "40"（String と同じ）。
  return `Astroプログラム/${ZODIAC_FILE_PREFIX[key]}_${ZODIAC_TAG_BY_BEAT[beat]}_${beat}Hz.mp3`;
}

/**
 * プログラム id → 音楽ファイルの URL。音楽ベッドを持たないもの（カスタム等）
 * は null。
 */
export function musicBedUrl(programId: string): string | null {
  const fixed = DEFAULT_PROGRAM_MUSIC[programId] ?? CATALOG_MUSIC[programId];
  if (fixed) return musicUrl(fixed);

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

  return musicUrl(zodiacMusicPath(sign.key, beat));
}

/** 音楽ベッドを持つプログラムかどうか（Mixer のスライダー表示に使う）。 */
export function hasMusicBed(programId: string): boolean {
  return musicBedUrl(programId) !== null;
}
