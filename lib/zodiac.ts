/**
 * 12星座マスタ（Cosmic & Brain Sync）と太陽・月星座の計算。
 *
 * 周波数と文言はプロダクト仕様書「12星座別 ハイブリッド周波数プログラム
 * 仕様マスター」から逐語で写している。配列は黄道順なので、黄道経度から
 * 求めた星座 index（0 = 牡羊座）がそのまま添字になる。
 */

import type { Locale } from "./i18n";

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
  /** 主な期待効果（英語の画面） */
  descriptionEn: string;
}

export const ZODIAC_SIGNS: readonly ZodiacSign[] = [
  { key: "aries", nameJa: "牡羊座", glyph: "♈", carrierFreq: 285, targetBeatFreq: 40, programName: "285Hz × 40Hz Gamma Activation", description: "勇気・行動力の活性化、ひらめき・直感の可視化", descriptionEn: "Sparks courage and drive, and brings flashes of intuition into view" },
  { key: "taurus", nameJa: "牡牛座", glyph: "♉", carrierFreq: 432, targetBeatFreq: 7.83, programName: "432Hz × 7.83Hz Earth Grounding", description: "五感の充足、地球共鳴によるディープリラックス", descriptionEn: "Satisfies the five senses; deep relaxation in tune with the Earth" },
  { key: "gemini", nameJa: "双子座", glyph: "♊", carrierFreq: 528, targetBeatFreq: 12, programName: "528Hz × 12Hz Clear Mind Flow", description: "思考の柔軟性向上、変容、情報過多脳のリフレッシュ", descriptionEn: "More flexible thinking and change; refreshes a mind overloaded with information" },
  { key: "cancer", nameJa: "蟹座", glyph: "♋", carrierFreq: 417, targetBeatFreq: 6, programName: "417Hz × 6Hz Emotion & Inner Calm", description: "感情の解放、深い安心感と入定誘導", descriptionEn: "Releases emotions and guides you into deep calm and stillness" },
  { key: "leo", nameJa: "獅子座", glyph: "♌", carrierFreq: 639, targetBeatFreq: 15, programName: "639Hz × 15Hz Solar Confidence", description: "人間関係の調和、自信・モチベーションの向上", descriptionEn: "Harmony with others; lifts confidence and motivation" },
  { key: "virgo", nameJa: "乙女座", glyph: "♍", carrierFreq: 741, targetBeatFreq: 10, programName: "741Hz × 10Hz Pure Balance", description: "脳内デトックス、自律神経の精密調整", descriptionEn: "A mental detox that fine-tunes the autonomic nervous system" },
  { key: "libra", nameJa: "天秤座", glyph: "♎", carrierFreq: 852, targetBeatFreq: 8, programName: "852Hz × 8Hz Harmony Shift", description: "直感力の覚醒、左右脳バランスの整律", descriptionEn: "Awakens intuition and balances the left and right brain" },
  { key: "scorpio", nameJa: "蠍座", glyph: "♏", carrierFreq: 211.44, targetBeatFreq: 4, programName: "211Hz × 4Hz Deep Rebirth", description: "深層心理の変容、潜在意識レベルの疲労リセット", descriptionEn: "Transformation deep within; resets fatigue at the subconscious level" },
  { key: "sagittarius", nameJa: "射手座", glyph: "♐", carrierFreq: 396, targetBeatFreq: 20, programName: "396Hz × 20Hz Vision & Freedom", description: "恐怖やブロックからの解放、探求心・インスピレーション", descriptionEn: "Freedom from fears and blocks; curiosity and inspiration" },
  { key: "capricorn", nameJa: "山羊座", glyph: "♑", carrierFreq: 141.27, targetBeatFreq: 14, programName: "141Hz × 14Hz Calm Focus", description: "構造的思考、ゾーン状態をつくる静かな集中力", descriptionEn: "Structured thinking; the quiet focus that gets you into the zone" },
  { key: "aquarius", nameJa: "水瓶座", glyph: "♒", carrierFreq: 963, targetBeatFreq: 40, programName: "963Hz × 40Hz Breakthrough Gamma", description: "宇宙意識・独創性、アハ体験（ひらめき）の誘発", descriptionEn: "Cosmic awareness and originality; invites “aha” moments" },
  { key: "pisces", nameJa: "魚座", glyph: "♓", carrierFreq: 174, targetBeatFreq: 2, programName: "174Hz × 2Hz Ultimate Healing", description: "精神的統合・ノイズ遮断、極上の休眠・リカバリー", descriptionEn: "Inner integration and quiet from the noise; the deepest rest and recovery" },
];

/** 英語名（Pisces など）— key の頭文字を大文字化したもの。 */
export function zodiacNameEn(key: ZodiacKey): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** 画面に出す星座名（牡羊座 / Aries）。 */
export function zodiacName(sign: ZodiacSign, locale: Locale): string {
  return locale === "en" ? zodiacNameEn(sign.key) : sign.nameJa;
}

/** 星座の主な期待効果。 */
export function zodiacDescription(sign: ZodiacSign, locale: Locale): string {
  return locale === "en" ? sign.descriptionEn : sign.description;
}

// ── モジュール合成型の毎日判定（仕様 §3〜§6） ──
//
// 出力音響プログラム = 12星座別ベースキャリア音波（固定）× デイリー天体
// 誘導ビート（可変）。キャリアは常にユーザー自身の星座の周波数（音色・
// 世界観は固定）、ビートだけがその日のタグとコンテキストで 2〜40Hz に変わる。
//
// エレメントは黄道順で 火→地→風→水 の循環（index % 4）。関係は
// 同属性 / 調和（火×風・地×水 = 同パリティ）/ 緊張（それ以外）。
// タグ優先順位は 深層回復 → 活性 → フロー → バランス（回復条件は月駆動）。
// 仕様の「極度疲労時」トリガーは脳コンディション指標との連携時に追加予定。

export type CosmicTag = "activation" | "flow" | "balance" | "healing";

const ELEMENT_JA = [
  { name: "火", verb: "高まる" },
  { name: "地", verb: "満ちる" },
  { name: "風", verb: "巡る" },
  { name: "水", verb: "深まる" },
] as const;

/** エレメントの英語名（ELEMENT_JA と同じ並び：火→地→風→水）。 */
const ELEMENT_EN = ["Fire", "Earth", "Air", "Water"] as const;

const elementOf = (signIndex: number) => signIndex % 4;

type ElementRelation = "same" | "harmony" | "tension";

function relationOf(a: number, b: number): ElementRelation {
  if (a === b) return "same";
  return a % 2 === b % 2 ? "harmony" : "tension";
}

export const TAG_LABEL: Record<CosmicTag, string> = {
  activation: "活性・覚醒",
  flow: "思考・フロー",
  balance: "整え・軸の安定",
  healing: "深層回復",
};

export const TAG_LABEL_EN: Record<CosmicTag, string> = {
  activation: "Energize & Awaken",
  flow: "Thinking & Flow",
  balance: "Rebalance & Center",
  healing: "Deep Recovery",
};

export function tagLabel(tag: CosmicTag, locale: Locale): string {
  return (locale === "en" ? TAG_LABEL_EN : TAG_LABEL)[tag];
}

/** ビート周波数ごとの表示名（既存12プログラムの命名体系を踏襲）と狙い。 */
export const BEAT_TITLE: Record<string, string> = {
  "40": "Gamma Activation",
  "20": "Vision & Freedom",
  "12": "Clear Mind Flow",
  "10": "Pure Balance",
  "14": "Calm Focus",
  "7.83": "Earth Grounding",
  "6": "Emotion & Inner Calm",
  "4": "Deep Rebirth",
  "2": "Ultimate Healing",
};

export const BEAT_EFFECT_EN: Record<string, string> = {
  "40": "Being in the zone, “aha” moments, intuition coming together",
  "20": "Switches on motivation and positive focus",
  "12": "Multitasking, sorting information, faster thinking",
  "10": "Relaxed focus and a steady nervous system",
  "14": "Resists distraction: a steady center and quiet focus",
  "7.83": "Grounding; resets your sense of the body",
  "6": "Emotional release, drowsiness, deep stillness",
  "4": "Cleanses fatigue from the subconscious",
  "2": "Full recovery at the unconscious level; ultra-deep rest",
};

/** ビートの狙い（BEAT_EFFECT / BEAT_EFFECT_EN）。 */
export function beatEffect(beatKey: string, locale: Locale): string | undefined {
  return (locale === "en" ? BEAT_EFFECT_EN : BEAT_EFFECT)[beatKey];
}

export const BEAT_EFFECT: Record<string, string> = {
  "40": "ゾーン状態、アハ体験、直感統合",
  "20": "やる気スイッチ、前向きな集中",
  "12": "マルチタスク、情報整理、思考の速度向上",
  "10": "リラックス集中、自律神経の安定",
  "14": "雑音耐性、ブレない軸、静かな集中",
  "7.83": "グラウンディング、身体感覚のリセット",
  "6": "感情の解放、まどろみ、深い入定",
  "4": "潜在意識の疲労クレンジング",
  "2": "無意識領域の完全回復、超休眠",
};

/** 可変ビートの全候補（§5 マトリクス）。モジュール版プログラム生成にも使う。 */
export const MODULAR_BEATS = [40, 20, 12, 10, 14, 7.83, 6, 4, 2] as const;

/** 12星座×4タグの相性メッセージ・テンプレート（仕様 §6 逐語）。 */
const MESSAGES: Record<ZodiacKey, Record<CosmicTag, string>> = {
  aries: {
    activation: "火のエネルギーが最高潮です。直感と決断力が冴え渡り、一瞬でゾーンに入る準備が整っています。",
    flow: "心地よい風があなたの情熱を後押しします。アイデアを素早く形にできるクリアな思考状態です。",
    balance: "外の刺激で脳がオーバーヒート気味です。内側の情熱を静かに整え、軸を取り戻しましょう。",
    healing: "感情の波を鎮め、心身の奥深くに休息を与える日です。明日への原動力を静かにチャージしましょう。",
  },
  taurus: {
    activation: "地球の鼓動と深く同調する安定の日です。五感が研ぎ澄まされ、ブレない決断と落ち着きをもたらします。",
    flow: "豊かで穏やかな感情の波が心を包み込みます。安心感の中で心身の疲労が自然と解きほぐされていきます。",
    balance: "周囲のペースが速く感じられるかもしれません。ご自身の心地よいリズムを守り、軸をしっかり固めましょう。",
    healing: "身体の感覚を取り戻し、深いリセットを行うタイミングです。五感を心地よい音波に委ねて休ませましょう。",
  },
  gemini: {
    activation: "情報処理能力とひらめきが最高潮です。複雑なタスクも軽やかに整理し、新しい流れを作り出せます。",
    flow: "情熱的な活力と軽快な知性が合致しています。発想が次々と形になり、行動へ直結する素晴らしい状態です。",
    balance: "情報過多によって脳が散漫になりやすい日です。音波の力で一度思考を完全にリセットしましょう。",
    healing: "交信を止め、静けさの中に身を置くヒーリングの日です。思考のスイッチを切り、脳内を綺麗にクレンジングします。",
  },
  cancer: {
    activation: "内なる安心感が満ちて心身が活力で満たされます。直感を信じて身近な環境をポジティブに変えられる日です。",
    flow: "心の安心感と現実の行動が結びつきます。周囲を温かく包み込みながら着実に過ごせる一日です。",
    balance: "周囲の急な変化に心が揺れ動きやすい配置です。深いビートの音で意識を内側へと戻しましょう。",
    healing: "心の奥深くに優しい静けさが広がります。溜め込んだ感情をデトックスし、安心感で満たされるケアに最適な日です。",
  },
  leo: {
    activation: "太陽のような華やかなエネルギーに満ちています。自己確信を高め、最高のパフォーマンスを発揮できます。",
    flow: "周囲との心地よい共振が生まれる日です。自信に満ちた表現力と柔軟な知性が美しく調和します。",
    balance: "周囲のノイズから少し距離を置くタイミングです。静かな自己対話で誇りを取り戻しましょう。",
    healing: "張り詰めた緊張をゆるめ、温かい安心感で脳を満たします。自分自身を優しく労わる時間を過ごしてください。",
  },
  virgo: {
    activation: "分析力と整律力が冴え渡るクリーンな状態です。脳内の細かなノイズを完璧にデトックスできます。",
    flow: "思考と感情が穏やかに噛み合っています。自律神経のバランスが整い、細やかな配慮と集中が持続します。",
    balance: "考えすぎによる脳疲労が溜まりやすい日です。意識的に自律神経を休ませる時間を持ちましょう。",
    healing: "細部へのこだわりを一度手放し、脳をまっさらにリセットする日です。深い休眠で神経をケアします。",
  },
  libra: {
    activation: "左右の脳波バランスが美しく調和する日です。洗練された美意識と、公平で確かな直感力が覚醒します。",
    flow: "対人関係や表現力に心地よい追い風が吹いています。過度な緊張が抜け、自分らしい華やかさを出せます。",
    balance: "他者の感情や環境の不調和に影響を受けやすい配置です。心の境界線を静かに取り戻しましょう。",
    healing: "内外のバランスをリセットし、自分本来の調和を取り戻すセッションです。穏やかな音に包まれて休んでください。",
  },
  scorpio: {
    activation: "圧倒的な洞察力と集中力が芽生える日です。本質を見抜き、課題を力強く突破するパワーが湧きます。",
    flow: "内なる集中力と現実的な実行力が融合します。ブレない意志を持って目標へ突き進むことができます。",
    balance: "感情の波が強くなり、一人で抱え込みがちなタイミングです。重厚な低音で心を深く沈め、回復を図りましょう。",
    healing: "潜在意識の深い領域へアクセスできる再生の日です。根深い脳疲労やストレスを根本から焼き尽くし、生まれ変わります。",
  },
  sagittarius: {
    activation: "探求心と自由な視界がどこまでも広がります。メンタルブロックを突き破る強力なインスピレーションが湧きます。",
    flow: "軽やかな情報循環が思考を加速させます。未知のテーマに対する鋭い洞察力が発揮されるコンディションです。",
    balance: "思考が分散しやすい配置です。意識の焦点をひとつに絞り、グラウンディングを図りましょう。",
    healing: "走り続けて疲れた神経を解き放つ日です。静寂の中で意識を休ませ、心身のバランスを整えます。",
  },
  capricorn: {
    activation: "着実で強固な集中ゾーンに入りやすい日です。長期的な課題に対し、ブレずに成果を積み上げられます。",
    flow: "静かな情熱と現実的な思考が調和します。周囲との信頼関係を深めながら着実に進むことができます。",
    balance: "緊張状態が続き、体に力が入っている可能性があります。肩の力を抜き、深層の呼吸を意識しましょう。",
    healing: "肩に乗った重荷を下ろし、心の奥底まで深く休息させる時間です。確固たるエネルギーを再充電します。",
  },
  aquarius: {
    activation: "高次元の直感が高まっています。常識の枠を超えた独創的なアイデアやアハ体験が訪れます。",
    flow: "未来志向の情熱が湧き上がる日です。自身のアイデアを自信を持って周囲へ共有できます。",
    balance: "神経が過敏になりやすい日です。宇宙的な広い音響で脳波を落ち着かせ、思考の軸を整えましょう。",
    healing: "脳内の雑音をすべてカットし、潜在意識をクリアにする時間です。深い休息により独創的な感性を回復させます。",
  },
  pisces: {
    activation: "直感と豊かなイメージが溢れ出す日です。溢れる情熱をクリエイティブな表現やひらめきへ変換できます。",
    flow: "豊かなイメージや直感が、現実の安心感としてしっかりと根付きます。心身ともに満たされる時間を過ごせます。",
    balance: "外からの情報刺激が多く、精神的な疲労を感じやすい日です。すべてのスイッチを切り、無の境地へ入りましょう。",
    healing: "外界のノイズや境界線が優しく溶け去ります。深い休眠と精神統合をもたらす、極上のヒーリングコンディションです。",
  },
};

/** MESSAGES の英語版（英語の画面の「今日の一言」）。 */
const MESSAGES_EN: Record<ZodiacKey, Record<CosmicTag, string>> = {
  aries: {
    activation: "Fire energy is at its peak. Your intuition and decisiveness are sharp, and you're ready to slip into the zone in an instant.",
    flow: "A pleasant breeze is fanning your passion. Your mind is clear enough to turn ideas into reality quickly.",
    balance: "Outside stimulation is overheating your brain a little. Quietly settle the passion inside and find your center again.",
    healing: "Today is for calming the waves of emotion and letting rest reach deep into body and mind. Quietly recharge your drive for tomorrow.",
  },
  taurus: {
    activation: "A steady day, deeply in tune with the Earth's heartbeat. Your senses are sharpened, bringing calm and unwavering decisions.",
    flow: "A rich, gentle wave of feeling wraps around your heart. In that sense of safety, tiredness in body and mind naturally unwinds.",
    balance: "The world around you may feel fast today. Keep to your own comfortable rhythm and stay firmly centered.",
    healing: "It's time to reconnect with your body and do a deep reset. Let your senses rest in soothing sound.",
  },
  gemini: {
    activation: "Your ability to process information and your flashes of insight are at their peak. You can sort out even complex tasks with ease and start a fresh flow.",
    flow: "Passionate energy and a nimble mind are working together. Ideas take shape one after another and lead straight to action.",
    balance: "Too much information can scatter your mind today. Use the power of sound to fully reset your thoughts.",
    healing: "A healing day for pausing all the messages and resting in quiet. Switch off your thoughts and give your mind a clean sweep.",
  },
  cancer: {
    activation: "A sense of inner safety fills you, and body and mind brim with energy. Trust your intuition: today you can change your surroundings for the better.",
    flow: "Inner reassurance connects with real action. A day to move forward steadily while warmly supporting those around you.",
    balance: "Sudden changes around you may unsettle your heart today. Use deep beats to bring your attention back inside.",
    healing: "A gentle stillness spreads deep in your heart. An ideal day to release pent-up feelings and fill yourself with a sense of safety.",
  },
  leo: {
    activation: "You're full of bright, sunny energy. Your self-belief grows and you can perform at your very best.",
    flow: "A day of pleasant resonance with those around you. Confident self-expression and a flexible mind blend beautifully.",
    balance: "It's time to step back a little from the noise around you. Regain your pride through a quiet talk with yourself.",
    healing: "Ease the built-up tension and fill your mind with warm reassurance. Take time to be kind to yourself.",
  },
  virgo: {
    activation: "Your powers of analysis and organization are crisp and clear. You can completely clear out the small noise in your mind.",
    flow: "Thoughts and feelings are working together gently. Your nervous system is in balance, so your care for detail and your focus last.",
    balance: "Overthinking can tire your brain today. Make time on purpose to let your nervous system rest.",
    healing: "A day to let go of the details for a while and reset your mind to a clean slate. Care for your nerves with deep rest.",
  },
  libra: {
    activation: "A day when your left and right brainwaves are in beautiful harmony. A refined sense of beauty and fair, reliable intuition awaken.",
    flow: "A pleasant tailwind supports your relationships and self-expression. Extra tension falls away, and your own brightness shines through.",
    balance: "Other people's feelings and the discord around you may affect you easily today. Quietly restore your inner boundaries.",
    healing: "A session to reset the balance between inside and out and recover your natural harmony. Rest, wrapped in gentle sound.",
  },
  scorpio: {
    activation: "A day of remarkable insight and focus. You'll see to the heart of things and find the power to break through challenges.",
    flow: "Inner focus and practical follow-through come together. With steady resolve, you can push straight toward your goals.",
    balance: "Emotions run strong, and you may tend to keep things to yourself. Let deep, rich low tones settle your heart and help you recover.",
    healing: "A day of renewal when you can reach deep into the subconscious. Burn away deep-rooted mental fatigue and stress, and start afresh.",
  },
  sagittarius: {
    activation: "Your curiosity and sense of freedom stretch out without limit. Powerful inspiration arrives to break through mental blocks.",
    flow: "A light, easy flow of information speeds up your thinking. You're in good shape for sharp insight into new subjects.",
    balance: "Your thoughts may scatter easily today. Narrow your focus to one thing and ground yourself.",
    healing: "A day to free nerves worn out from constant running. Rest your mind in stillness and rebalance body and mind.",
  },
  capricorn: {
    activation: "A day when it's easy to enter a solid, steady zone of focus. You can build results on long-term goals without wavering.",
    flow: "Quiet passion and practical thinking are in harmony. You can move ahead steadily while deepening trust with those around you.",
    balance: "Tension may have kept your body tight for a while. Drop your shoulders and breathe deeply.",
    healing: "Time to put down the weight on your shoulders and rest deeply, right to your core. Recharge your steady energy.",
  },
  aquarius: {
    activation: "Your higher intuition is rising. Original ideas and “aha” moments beyond the usual limits will come to you.",
    flow: "A day when future-minded passion wells up. You can share your ideas with others confidently.",
    balance: "Your nerves may be on edge today. Let vast, spacious sound calm your brainwaves and re-center your thinking.",
    healing: "Time to cut out all the noise in your mind and clear the subconscious. Deep rest restores your creative sensitivity.",
  },
  pisces: {
    activation: "A day overflowing with intuition and rich imagery. You can turn that flood of passion into creative expression and inspiration.",
    flow: "Rich images and intuition take firm root as a real sense of security. A time to feel fulfilled in body and mind.",
    balance: "There's a lot of outside stimulation, and you may feel mentally tired today. Switch everything off and sink into stillness.",
    healing: "Outside noise and boundaries gently melt away. A supreme healing state that brings deep rest and inner harmony.",
  },
};

export interface DailyRecommendation {
  /** null = 天体未計算（フォールバック中） */
  tag: CosmicTag | null;
  tagLabel: string | null;
  /** 再生すべきプログラム id（キャリア=自星座 × 当日ビート のモジュール版） */
  programId: string;
  /** その日の誘導ビート Hz。天体未計算時は自星座の既定ビート。 */
  beatFreq: number;
  /** おすすめカードに出す「なぜ」の一行。天体未計算時は null。 */
  reason: string | null;
  /** 今日のメッセージ（仕様 §6 のテンプレート） */
  advice: string;
}

/**
 * その日の天体配置 × ユーザーの星座 × 時刻コンテキスト → タグ・誘導ビート・
 * モジュール版プログラム（§5 マトリクス）。キャリアは常に自星座なので、
 * どの星座を選んでも音色は変わり、ビートだけが天体と時間帯で日替わりする。
 * 文言（tagLabel・reason・advice）は locale の言語で返す。選ぶ節目は言語に
 * よらず同じ。
 */
export function dailyRecommendation(
  sky: TodaySky | null,
  sign: ZodiacSign,
  now: Date = new Date(),
  locale: Locale = "ja"
): DailyRecommendation {
  const userIndex = ZODIAC_KEYS.indexOf(sign.key);
  const en = locale === "en";

  if (!sky) {
    return {
      tag: null,
      tagLabel: null,
      programId: zodiacProgramId(sign.key),
      beatFreq: sign.targetBeatFreq,
      reason: null,
      advice: en
        ? `${zodiacNameEn(sign.key)}: sounds that bring your brainwaves into tune with the stars suit you well.`
        : `${sign.nameJa}のあなたには星と脳波を共鳴させるサウンドが適します。`,
    };
  }

  const userEl = elementOf(userIndex);
  const sunEl = elementOf(sky.sunIndex);
  const moonEl = elementOf(sky.moonIndex);
  const hour = now.getHours();
  const isNight = hour < 6 || hour >= 18;
  const isLateNight = hour >= 22 || hour < 6;
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;

  let tag: CosmicTag;
  let beat: number;
  let reason: string;

  if (moonEl === 3) {
    // 深層回復 — 月が水のエレメントに滞在（コンテキストでビートが変わる）
    tag = "healing";
    if (sky.moonIndex === 11) {
      beat = 2; // 月が魚座 → デルタ波・超休眠
      reason = en
        ? "The Moon is in Pisces: a day of deep recovery that reaches the unconscious"
        : "月が魚座に滞在する、無意識領域まで届く超回復日のため";
    } else if (isLateNight) {
      beat = 4; // 深夜 → ローシータ
      reason = en
        ? "Late at night with the Moon in a Water sign: a good time to cleanse the subconscious"
        : "月が「水」のエレメントに滞在する深夜、潜在意識のクレンジングに";
    } else {
      beat = 6; // 夕方〜夜（および日中の既定）→ シータ
      reason = en
        ? "The Moon is in a Water sign: a good time to let your feelings loosen"
        : "月が「水」のエレメントに滞在し、感情をほどくのに良い時間のため";
    }
  } else if (relationOf(userEl, sunEl) === "same" || relationOf(userEl, moonEl) === "same") {
    tag = "activation";
    const sunTrigger = relationOf(userEl, sunEl) === "same";
    beat = sunTrigger ? 40 : 20; // 太陽起因=ガンマ / 月起因=ハイベータ
    reason = en
      ? sunTrigger
        ? `Today's Sun shares your ${ELEMENT_EN[userEl]} element (conscious energy)`
        : `Today's Moon shares your ${ELEMENT_EN[userEl]} element (inner motivation)`
      : sunTrigger
        ? `今日の太陽があなたと同じ「${ELEMENT_JA[userEl].name}」の属性にあるため（意識的活力）`
        : `今日の月があなたと同じ「${ELEMENT_JA[userEl].name}」の属性にあるため（内面的モチベーション）`;
  } else if (
    relationOf(userEl, sunEl) === "harmony" ||
    relationOf(userEl, moonEl) === "harmony"
  ) {
    tag = "flow";
    const sunTrigger = relationOf(userEl, sunEl) === "harmony";
    beat = sunTrigger ? 12 : 10; // 太陽起因=ハイアルファ / 月起因=ミッドアルファ
    const elIndex = sunTrigger ? sunEl : moonEl;
    const el = ELEMENT_JA[elIndex].name;
    reason = en
      ? sunTrigger
        ? `Today's Sun is in ${ELEMENT_EN[elIndex]}, an element in harmony with yours (faster thinking)`
        : `Today's Moon is in ${ELEMENT_EN[elIndex]}, an element in harmony with yours (emotional calm)`
      : sunTrigger
        ? `今日の太陽があなたと調和する「${el}」のエレメントにあるため（思考加速）`
        : `今日の月があなたと調和する「${el}」のエレメントにあるため（感情安定）`;
  } else {
    tag = "balance";
    if (isWeekend || isNight) {
      beat = 7.83; // 休日・夜間 → シューマン共振
      reason = en
        ? "A tense alignment. On days off and at night, ground yourself and reset your body"
        : "緊張関係の星回り。休日・夜間はグラウンディングで身体感覚をリセット";
    } else {
      beat = 14; // 平日の仕事モード → SMR
      reason = en
        ? "A tense alignment. For weekday work, a quiet focus that holds up against distraction"
        : "緊張関係の星回り。平日の仕事モードには雑音に負けない静かな集中を";
    }
  }

  return {
    tag,
    tagLabel: tagLabel(tag, locale),
    programId: modularProgramId(sign.key, beat),
    beatFreq: beat,
    reason,
    advice: (en ? MESSAGES_EN : MESSAGES)[sign.key][tag],
  };
}

/** 星座キー → 固有プログラム id（自星座キャリア×自星座ビートの既定版）。 */
export function zodiacProgramId(key: ZodiacKey): string {
  return `zodiac-${key}`;
}

/**
 * モジュール版プログラム id: 自星座キャリア × 指定ビート。ビートが自星座の
 * 既定ビートと一致する場合は既定版 id に落とす（重複プログラムを作らない）。
 */
export function modularProgramId(key: ZodiacKey, beatFreq: number): string {
  const sign = ZODIAC_SIGNS.find((s) => s.key === key);
  if (sign && sign.targetBeatFreq === beatFreq) return zodiacProgramId(key);
  return `zodiac-${key}-b${beatFreq}`;
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
