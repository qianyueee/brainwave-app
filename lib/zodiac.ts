/**
 * 12星座マスタ（Cosmic & Brain Sync）と太陽・月星座の計算。
 *
 * 周波数と文言はプロダクト仕様書「12星座別 ハイブリッド周波数プログラム
 * 仕様マスター」から逐語で写している。配列は黄道順なので、黄道経度から
 * 求めた星座 index（0 = 牡羊座）がそのまま添字になる。
 */

export const ZODIAC_KEYS = [
  "aries",
  "taurus",
  "gemini",
  "cancer",
  "leo",
  "virgo",
  "libra",
  "scorpio",
  "sagittarius",
  "capricorn",
  "aquarius",
  "pisces",
] as const;

export type ZodiacKey = (typeof ZODIAC_KEYS)[number];

export interface ZodiacSign {
  key: ZodiacKey;
  /** 日本語名（牡羊座 など） */
  nameJa: string;
  /** ユニコード記号（lucide に星座グリフは無い） */
  glyph: string;
  /** キャリア周波数 Hz（ソルフェジオ／惑星周波数） */
  carrierFreq: number;
  /** ビート周波数 Hz（脳波誘導波） */
  targetBeatFreq: number;
  /** プログラム表示名（仕様書の表記のまま。211.44Hz 等は表示名側で丸められている） */
  programName: string;
  /** 主な期待効果 */
  description: string;
}

export const ZODIAC_SIGNS: readonly ZodiacSign[] = [
  { key: "aries", nameJa: "牡羊座", glyph: "♈", carrierFreq: 285, targetBeatFreq: 40, programName: "285Hz × 40Hz Gamma Activation", description: "勇気・行動力の活性化、ひらめき・直感の可視化" },
  { key: "taurus", nameJa: "牡牛座", glyph: "♉", carrierFreq: 432, targetBeatFreq: 7.83, programName: "432Hz × 7.83Hz Earth Grounding", description: "五感の充足、地球共鳴によるディープリラックス" },
  { key: "gemini", nameJa: "双子座", glyph: "♊", carrierFreq: 528, targetBeatFreq: 12, programName: "528Hz × 12Hz Clear Mind Flow", description: "思考の柔軟性向上、変容、情報過多脳のリフレッシュ" },
  { key: "cancer", nameJa: "蟹座", glyph: "♋", carrierFreq: 417, targetBeatFreq: 6, programName: "417Hz × 6Hz Emotion & Inner Calm", description: "感情の解放、深い安心感と入定誘導" },
  { key: "leo", nameJa: "獅子座", glyph: "♌", carrierFreq: 639, targetBeatFreq: 15, programName: "639Hz × 15Hz Solar Confidence", description: "人間関係の調和、自信・モチベーションの向上" },
  { key: "virgo", nameJa: "乙女座", glyph: "♍", carrierFreq: 741, targetBeatFreq: 10, programName: "741Hz × 10Hz Pure Balance", description: "脳内デトックス、自律神経の精密調整" },
  { key: "libra", nameJa: "天秤座", glyph: "♎", carrierFreq: 852, targetBeatFreq: 8, programName: "852Hz × 8Hz Harmony Shift", description: "直感力の覚醒、左右脳バランスの整律" },
  { key: "scorpio", nameJa: "蠍座", glyph: "♏", carrierFreq: 211.44, targetBeatFreq: 4, programName: "211Hz × 4Hz Deep Rebirth", description: "深層心理の変容、潜在意識レベルの疲労リセット" },
  { key: "sagittarius", nameJa: "射手座", glyph: "♐", carrierFreq: 396, targetBeatFreq: 20, programName: "396Hz × 20Hz Vision & Freedom", description: "恐怖やブロックからの解放、探求心・インスピレーション" },
  { key: "capricorn", nameJa: "山羊座", glyph: "♑", carrierFreq: 141.27, targetBeatFreq: 14, programName: "141Hz × 14Hz Calm Focus", description: "構造的思考、ゾーン状態をつくる静かな集中力" },
  { key: "aquarius", nameJa: "水瓶座", glyph: "♒", carrierFreq: 963, targetBeatFreq: 40, programName: "963Hz × 40Hz Breakthrough Gamma", description: "宇宙意識・独創性、アハ体験（ひらめき）の誘発" },
  { key: "pisces", nameJa: "魚座", glyph: "♓", carrierFreq: 174, targetBeatFreq: 2, programName: "174Hz × 2Hz Ultimate Healing", description: "精神的統合・ノイズ遮断、極上の休眠・リカバリー" },
];

/** 星座キー → 再生プログラム id（`custom-` プレフィックスと衝突しない）。 */
export function zodiacProgramId(key: ZodiacKey): string {
  return `zodiac-${key}`;
}

export function getZodiacSign(key: string): ZodiacSign | undefined {
  return ZODIAC_SIGNS.find((s) => s.key === key);
}

/** 黄道経度（度）→ 星座 index（0 = 牡羊座 … 11 = 魚座）。 */
export function signIndexFromLongitude(lonDeg: number): number {
  return Math.floor((((lonDeg % 360) + 360) % 360) / 30);
}

export interface TodaySky {
  sunIndex: number;
  moonIndex: number;
}

/**
 * 今この瞬間の太陽星座×月星座。トロピカル方式（真黄道 of-date の経度を
 * 30°で区切る）— 日本の星座占いと同じ区分。astronomy-engine は重いので
 * ここでだけ動的 import し、別チャンクとして遅延ロードさせる。
 */
export async function getTodaySky(date: Date = new Date()): Promise<TodaySky> {
  const { SunPosition, EclipticGeoMoon } = await import("astronomy-engine");
  return {
    sunIndex: signIndexFromLongitude(SunPosition(date).elon),
    moonIndex: signIndexFromLongitude(EclipticGeoMoon(date).lon),
  };
}
