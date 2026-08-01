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

/** 英語名（Pisces など）— key の頭文字を大文字化したもの。 */
export function zodiacNameEn(key: ZodiacKey): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

// ── 毎日の推奨タグ判定（仕様「バックエンドでの自動判定ロジック」） ──
//
// エレメントは黄道順で 火→地→風→水 の循環（index % 4）:
//   火 = 牡羊・獅子・射手 / 地 = 牡牛・乙女・山羊 /
//   風 = 双子・天秤・水瓶 / 水 = 蟹・蠍・魚
//
// 関係: 同エレメント = 同属性 / 火×風・地×水 = 調和（同パリティ）/
// 火×水・風×地 = 緊張。仕様に明記のない 火×地・風×水 も古典的な相性
// どおり緊張側に分類する（= パリティが異なる組み合わせ）。
//
// タグの優先順位は 深層ヒーリング → 活性 → フロー → バランス。
// ヒーリング条件は月駆動（月が当日のコンディションを司る）なので最優先、
// かつ水エレメントのユーザーは常にヒーリング＝自星座の回復音源に落ちる。

export type CosmicTag = "activation" | "flow" | "balance" | "healing";

const ELEMENT_JA = [
  { name: "火", verb: "高まる" },
  { name: "地", verb: "満ちる" },
  { name: "風", verb: "巡る" },
  { name: "水", verb: "深まる" },
] as const;

const elementOf = (signIndex: number) => signIndex % 4;

type ElementRelation = "same" | "harmony" | "tension";

function relationOf(a: number, b: number): ElementRelation {
  if (a === b) return "same";
  return a % 2 === b % 2 ? "harmony" : "tension";
}

export const TAG_LABEL: Record<CosmicTag, string> = {
  activation: "活性・覚醒",
  flow: "思考・フロー",
  balance: "軸の安定",
  healing: "深層ヒーリング",
};

const TAG_PHRASE: Record<CosmicTag, string> = {
  activation: "意識を目覚めさせる活性・覚醒のサウンド",
  flow: "思考を整えるフロー・サウンド",
  balance: "軸を安定させるグラウンディング・サウンド",
  healing: "深く癒す回復のヒーリング・サウンド",
};

/** タグ → 対応周波数の音源プール（40/20/15、12/10/8、7.83/14、6/4/2 Hz）。 */
const TAG_POOL: Record<CosmicTag, ZodiacKey[]> = {
  activation: ["aries", "sagittarius", "leo", "aquarius"],
  flow: ["gemini", "virgo", "libra"],
  balance: ["taurus", "capricorn"],
  healing: ["cancer", "scorpio", "pisces"],
};

export interface DailyRecommendation {
  /** null = 天体未計算（フォールバック中） */
  tag: CosmicTag | null;
  tagLabel: string | null;
  /** 再生すべきプログラムの星座キー（自星座とは限らない） */
  programSignKey: ZodiacKey;
  /** おすすめカードに出す「なぜ」の一行。天体未計算時は null。 */
  reason: string | null;
  /** 今日のメッセージ全文 */
  advice: string;
}

/**
 * その日の天体配置 × ユーザーの星座 → 推奨タグとプログラム。プール内の
 * 選択は「自星座がプールにあればそれ、無ければユーザー星座ごとに位相を
 * ずらした日替わりローテーション」。太陽・月の星座を優先する案は、月が
 * 水にいる日に12星座中9星座が同じ音源に落ちて切替の変化が消えたため
 * 廃止した — この方式なら同じ日でも隣の星座は別の音源に当たる。
 */
export function dailyRecommendation(
  sky: TodaySky | null,
  sign: ZodiacSign
): DailyRecommendation {
  const userIndex = ZODIAC_KEYS.indexOf(sign.key);

  if (!sky) {
    return {
      tag: null,
      tagLabel: null,
      programSignKey: sign.key,
      reason: null,
      advice: `${sign.nameJa}のあなたには星と脳波を共鳴させるサウンドが適します。`,
    };
  }

  const userEl = elementOf(userIndex);
  const sunEl = elementOf(sky.sunIndex);
  const moonEl = elementOf(sky.moonIndex);

  let tag: CosmicTag;
  let reason: string;
  if (moonEl === 3 || userEl === 3) {
    tag = "healing";
    reason =
      moonEl === 3
        ? "今日は月が「水」のエレメントに滞在しているため"
        : "水のエレメントのあなたに合わせて";
  } else if (relationOf(userEl, sunEl) === "same" || relationOf(userEl, moonEl) === "same") {
    tag = "activation";
    const body = relationOf(userEl, sunEl) === "same" ? "太陽" : "月";
    reason = `今日の${body}があなたと同じ「${ELEMENT_JA[userEl].name}」のエレメントにあるため`;
  } else if (
    relationOf(userEl, sunEl) === "harmony" ||
    relationOf(userEl, moonEl) === "harmony"
  ) {
    tag = "flow";
    const sunHarmony = relationOf(userEl, sunEl) === "harmony";
    const body = sunHarmony ? "太陽" : "月";
    const el = ELEMENT_JA[sunHarmony ? sunEl : moonEl].name;
    reason = `今日の${body}があなたと調和する「${el}」のエレメントにあるため`;
  } else {
    tag = "balance";
    reason = "今日の星回りはあなたと緊張関係。軸を整えるのに良い日のため";
  }

  const pool = TAG_POOL[tag];
  const programSignKey = pool.includes(sign.key)
    ? sign.key
    : pool[(userIndex + sky.sunIndex + sky.moonIndex) % pool.length];

  const el = ELEMENT_JA[sunEl];
  const advice = `今日は${el.name}のエネルギーが${el.verb}日。${sign.nameJa}のあなたには${TAG_PHRASE[tag]}が適します。`;

  return { tag, tagLabel: TAG_LABEL[tag], programSignKey, reason, advice };
}

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
 * アプリ共通の昼夜区分（lib/theme.ts の時間帯と同じ境界）：
 * 6:00–17:59 は昼 → 太陽星座、18:00–5:59 は夜 → 月星座をヒーロー表示する。
 */
export function isNightNow(date: Date = new Date()): boolean {
  const h = date.getHours();
  return h < 6 || h >= 18;
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
