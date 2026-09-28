import type { ProgramConfig } from "../programs";
import { createCatalogProgram, type CatalogEntry } from "./factory";

/**
 * Target — 悩み・目的から選ぶ 42 節目（素材フォルダ「Targetプログラム」）。
 * ファイル名の `_` より前が小分類、後ろが「English Title（日本語の言い換え）」。
 *
 * ⚠ 周波数は暫定値。一覧「Targetプログラム一覧.xlsx」を
 * `node scripts/import-program-xlsx.mjs` で取り込むと確定値に置き換わる。
 * 暫定値は「小分類ごとの既定値＋節目ごとの上書き」で決めてある：
 *   - 小分類の既定は下の SUB_GENRE_DEFAULTS。
 *   - 狙いが既定とずれるものだけ beat / carrier を各行で上書きする
 *     （例：仮眠はθの4Hz、40Hz と銘打つものはγの40Hz）。
 *   - ビートは MODULAR_BEATS（lib/zodiac.ts）の語彙からのみ選ぶ。
 * 尺は素材名に「/ 6分」と書かれているものだけ 6 分、ほかは 15 分。
 *
 * 出口のビート（outro）は既定 10Hz＝起こして終わるが、睡眠系だけは下げたまま
 * 終える——寝入りかけた人を最後にアルファへ引き上げては本末転倒。逆に
 * 「朝の倦怠感・覚醒」だけは睡眠系の棚にありながら上げて終わる。
 */

export const TARGET_SUB_GENRES = [
  "仕事・勉強",
  "睡眠・リズム",
  "緊張・精神",
  "身体・不調",
  "生活・環境",
] as const;

export type TargetSubGenre = (typeof TARGET_SUB_GENRES)[number];

/** 小分類の英語（英語の画面の段見出し）。 */
export const TARGET_SUB_GENRE_EN: Record<TargetSubGenre, string> = {
  "仕事・勉強": "Work & Study",
  "睡眠・リズム": "Sleep & Rhythm",
  "緊張・精神": "Stress & Mind",
  "身体・不調": "Body & Aches",
  "生活・環境": "Life Stages",
};

const SUB_GENRE_DEFAULTS: Record<
  TargetSubGenre,
  { carrier: number; beat: number; icon: string; outro?: number }
> = {
  "仕事・勉強": { carrier: 432, beat: 14, icon: "💼" },
  "睡眠・リズム": { carrier: 174, beat: 2, icon: "🌙", outro: 2 },
  "緊張・精神": { carrier: 396, beat: 7.83, icon: "🧘" },
  "身体・不調": { carrier: 417, beat: 10, icon: "💪" },
  "生活・環境": { carrier: 528, beat: 10, icon: "🏠" },
};

interface TargetEntry {
  id: string;
  name: string;
  titleEn: string;
  /** 小分類の既定ビートを上書きする場合だけ書く。 */
  beat?: number;
  /** 小分類の既定載波を上書きする場合だけ書く。 */
  carrier?: number;
  /** 素材名に尺の指定があるものだけ。既定 15 分。 */
  durationMin?: number;
  /** 小分類の既定の出口ビートを上書きする場合だけ書く。 */
  outro?: number;
  /**
   * 名前の漢字のよみ。検索の正規化はカタカナ→ひらがなまでしか畳めないので
   * （漢字→かなは辞書が要る）、「ふあん」で「不安・パニック即時鎮静」に
   * 当たるようにここへ手で書く。
   */
  kana?: string;
  /** 英語の画面の説明（名前は titleEn）。日本語名の言い換えを英語で。 */
  descriptionEn: string;
}

const BY_SUB_GENRE: Record<TargetSubGenre, readonly TargetEntry[]> = {
  "仕事・勉強": [
    { id: "target-gamma-peak-focus",        name: "明晰集中・ひらめき統合",   titleEn: "40Hz Gamma Peak & Focus", beat: 40 , kana: "めいせきしゅうちゅう ひらめき とうごう がんま", descriptionEn: "Clear focus and flashes of insight" },
    { id: "target-afternoon-power-nap",     name: "高速仮眠（15分・20分）",   titleEn: "Afternoon Power Nap",     beat: 4, outro: 14 , kana: "こうそくかみん ひるね", descriptionEn: "A quick power nap (15 or 20 min)" },
    { id: "target-brain-fog-clarity",       name: "ブレインフォグ・頭のモヤモヤ", titleEn: "Brain Fog & Mental Clarity" , kana: "あたま もやもや のう", descriptionEn: "Lift brain fog and a cloudy head" },
    { id: "target-clarity-focus-work",      name: "ガンマ波40Hz 集中ワーク",  titleEn: "Clarity & Focus",         beat: 40 , kana: "がんまは しゅうちゅう", descriptionEn: "Focused work with 40Hz gamma waves" },
    { id: "target-creative-flow",           name: "ひらめき・直感統合",       titleEn: "Creative Flow",           beat: 10, durationMin: 6 , kana: "ひらめき ちょっかん とうごう", descriptionEn: "Inspiration and intuition working together" },
    { id: "target-esports-reflex-booster",  name: "反応速度・ゲーミング",     titleEn: "Esports & Reflex Booster", beat: 20 , kana: "はんのうそくど", descriptionEn: "Faster reactions for gaming" },
    { id: "target-flow-state-deep-work",    name: "ゾーン体験・フロー状態",   titleEn: "Flow State & Deep Work",  beat: 10 , kana: "たいけん じょうたい", descriptionEn: "Get into the zone: a flow state" },
    { id: "target-high-speed-learning",     name: "超集中・学習モード",       titleEn: "High-Speed Learning" , kana: "ちょうしゅうちゅう がくしゅう", descriptionEn: "Deep focus for learning" },
  ],
  "睡眠・リズム": [
    { id: "target-deep-golden-sleep",       name: "シニア向け深層睡眠",       titleEn: "Deep Golden Sleep" , kana: "むけ しんそうすいみん ねむり", descriptionEn: "Deep sleep for older adults" },
    { id: "target-deep-sleep-journey",      name: "入眠ガイド",               titleEn: "Deep Sleep Journey",      durationMin: 6 , kana: "にゅうみん ねむり", descriptionEn: "A gentle guide into sleep" },
    { id: "target-jet-lag-shift-reset",     name: "時差ぼけ・夜勤シフト調整", titleEn: "Jet Lag & Shift Worker Reset" , kana: "じさ やきん ちょうせい", descriptionEn: "Adjust to jet lag and night shifts" },
    { id: "target-midnight-awakening-care", name: "中途覚醒・夜中の再入眠",   titleEn: "Midnight Awakening Care" , kana: "ちゅうとかくせい よなか さいにゅうみん", descriptionEn: "Fall back asleep after waking at night" },
    { id: "target-morning-grogginess-boot", name: "朝の強い倦怠感・覚醒",     titleEn: "Morning Grogginess & Boot", beat: 14, carrier: 432, outro: 20 , kana: "あさ つよい けんたいかん かくせい", descriptionEn: "Shake off heavy morning grogginess" },
    { id: "target-night-recovery-sleep",    name: "熟睡・深層リカバリー",     titleEn: "Night Recovery & Deep Sleep" , kana: "じゅくすい しんそう ねむり", descriptionEn: "Sound sleep and deep recovery" },
  ],
  "緊張・精神": [
    { id: "target-anti-anxiety-panic",      name: "不安・パニック即時鎮静",   titleEn: "Anti-Anxiety & Panic Reset", beat: 6 , kana: "ふあん そくじちんせい", descriptionEn: "Calm anxiety and panic quickly" },
    { id: "target-autonomic-balance-vagus", name: "自律神経・迷走神経調整",   titleEn: "Autonomic Balance & Vagus" , kana: "じりつしんけい めいそうしんけい ちょうせい", descriptionEn: "Balance the autonomic and vagus nerves" },
    { id: "target-brain-cleansing",         name: "脳疲労リセット",           titleEn: "Brain Cleansing",         durationMin: 6 , kana: "のうひろう", descriptionEn: "Reset a tired brain" },
    { id: "target-deep-rem-dream-reset",    name: "浅い夢・悪夢の低減",       titleEn: "DeepREM & Dream Memory Reset", beat: 4, outro: 4 , kana: "あさいゆめ あくむ ていげん", descriptionEn: "Fewer restless dreams and nightmares" },
    { id: "target-emotional-eating",        name: "ストレス食い・過剰な欲求の抑制", titleEn: "Emotional Eating & Craving Control" , kana: "ぐい かじょう よっきゅう よくせい", descriptionEn: "Curb stress eating and cravings" },
    { id: "target-exam-interview-panic",    name: "本番前のあがり症ケア",     titleEn: "Exam & Interview Anti-Panic", beat: 6 , kana: "ほんばんまえ あがりしょう しけん めんせつ", descriptionEn: "Ease nerves before the big moment" },
    { id: "target-executive-burnout",       name: "責任感・重圧・決断疲労",   titleEn: "Executive Burnout Recovery", beat: 6 , kana: "せきにんかん じゅうあつ けつだんひろう", descriptionEn: "Relief from pressure and decision fatigue" },
    { id: "target-mental-quietness",        name: "思考オフ・静寂",           titleEn: "Mental Quietness",        beat: 4, durationMin: 6 , kana: "しこう せいじゃく", descriptionEn: "Switch off your thoughts; stillness" },
    { id: "target-post-work-decompression", name: "退勤後・オンオフ即時切り替え", titleEn: "Post-Work Decompression", beat: 10 , kana: "たいきんご そくじ きりかえ", descriptionEn: "Switch off quickly after work" },
    { id: "target-seasonal-weather",        name: "低気圧不調・寒暖差・季節性の落ち込み", titleEn: "Seasonal Affective & Weather Sensitivity" , kana: "ていきあつふちょう かんだんさ きせつせい おちこみ", descriptionEn: "Weather, temperature swings and seasonal lows" },
    { id: "target-shallow-breathing",       name: "浅い呼吸・胸の窮屈さ",     titleEn: "Shallow Breathing & Rib Cage Open" , kana: "あさいこきゅう むね きゅうくつ", descriptionEn: "Shallow breathing and a tight chest" },
    { id: "target-sns-fatigue-detox",       name: "SNS疲れ・ドパミンリセット", titleEn: "SNS Fatigue & Dopamine Detox", beat: 6 , kana: "つかれ", descriptionEn: "Social media fatigue; a dopamine reset" },
    { id: "target-tinnitus-auditory",       name: "耳鳴り・聴覚の過敏ケア",   titleEn: "Tinnitus & Auditory Unwind" , kana: "みみなり ちょうかく かびん", descriptionEn: "Care for ringing ears and sensitive hearing" },
    { id: "target-vagus-nerve-release",     name: "自律神経調律",             titleEn: "Vagus Nerve Release",     durationMin: 6 , kana: "じりつしんけい ちょうりつ", descriptionEn: "Tune your autonomic nervous system" },
  ],
  "身体・不調": [
    { id: "target-hangover-liver",          name: "二日酔い・頭重感のケア",   titleEn: "Alcohol Hangover & Liver Recovery", beat: 6 , kana: "ふつかよい ずじゅうかん", descriptionEn: "Care for a hangover and a heavy head" },
    { id: "target-chronic-fatigue",         name: "慢性疲労・エネルギー枯渇", titleEn: "Chronic Fatigue & Battery Charge", beat: 6 , kana: "まんせいひろう こかつ", descriptionEn: "Chronic fatigue and running on empty" },
    { id: "target-circulation-swelling",    name: "むくみ・体液循環の改善",   titleEn: "Circulation & Swelling Relief" , kana: "たいえきじゅんかん かいぜん", descriptionEn: "Ease swelling; better fluid circulation" },
    { id: "target-cold-extremities",        name: "冷え性・血行促進",         titleEn: "Cold Extremities & Circulation" , kana: "ひえしょう けっこうそくしん", descriptionEn: "Cold hands and feet; better circulation" },
    { id: "target-eye-strain-cooling",      name: "眼精疲労・脳のオーバーヒート", titleEn: "Eye Strain & Brain Cooling" , kana: "がんせいひろう のう め", descriptionEn: "Tired eyes and an overheated brain" },
    { id: "target-head-pain-tension",       name: "頭痛・肩こり緩和",         titleEn: "Head Pain & Tension Relief", beat: 7.83 , kana: "ずつう かたこり かんわ", descriptionEn: "Ease headaches and stiff shoulders" },
    { id: "target-jaw-facial-tension",      name: "食いしばり・表情筋弛緩",   titleEn: "Jaw Clenching & Facial Tension", beat: 7.83 , kana: "くいしばり ひょうじょうきん しかん", descriptionEn: "Relax a clenched jaw and facial muscles" },
    { id: "target-joint-mobility",          name: "膝・関節・歩行ケア",       titleEn: "Joint & Mobility Comfort" , kana: "ひざ かんせつ ほこう", descriptionEn: "Care for knees, joints and walking" },
    { id: "target-lactic-acid-workout",     name: "筋肉痛・運動後リカバリー", titleEn: "Lactic Acid & Post-Workout", beat: 6 , kana: "きんにくつう うんどうご", descriptionEn: "Sore muscles; recovery after exercise" },
    { id: "target-pelvic-lumbar-unwind",    name: "腰痛・骨盤周りの緊張緩和", titleEn: "Pelvic & Lumbar Unwind",  beat: 7.83 , kana: "ようつう こつばんまわり きんちょうかんわ", descriptionEn: "Ease lower back pain and pelvic tension" },
  ],
  "生活・環境": [
    { id: "target-brain-agility-memory",    name: "認知ケア・40Hz認知トレ",   titleEn: "Brain Agility & Memory Active", beat: 40 , kana: "にんち", descriptionEn: "Cognitive care with 40Hz brain training" },
    { id: "target-menopause-autonomic",     name: "更年期・ホルモンケア",     titleEn: "Menopause & Autonomic Balance", beat: 7.83 , kana: "こうねんき", descriptionEn: "Menopause and hormone care" },
    { id: "target-postpartum-short-nap",    name: "産後ママ・パパの超急速リカバリー", titleEn: "Postpartum Short Nap", beat: 4, outro: 10 , kana: "さんご ちょうきゅうそく", descriptionEn: "Rapid recovery for new parents" },
    { id: "target-pre-mama-calm-bonding",   name: "プレママ・マタニティ",     titleEn: "Pre-Mama Calm & Bonding", beat: 7.83 , kana: "にんしん", descriptionEn: "Calm and bonding for expectant mothers" },
  ],
};

function toCatalogEntry(subGenre: TargetSubGenre, e: TargetEntry): CatalogEntry {
  const d = SUB_GENRE_DEFAULTS[subGenre];
  return {
    id: e.id,
    name: e.name,
    titleEn: e.titleEn,
    // カードの下段は「周波数・長さ」なので、説明は英語原題をそのまま出す。
    // 英語の画面は名前が英語原題になるので、説明は日本語名の言い換えにする。
    description: e.titleEn,
    descriptionEn: e.descriptionEn,
    icon: d.icon,
    carrierFreq: e.carrier ?? d.carrier,
    targetBeatFreq: e.beat ?? d.beat,
    durationMin: e.durationMin,
    outro: e.outro ?? d.outro,
    category: "target",
    subGenre,
    subGenreEn: TARGET_SUB_GENRE_EN[subGenre],
    keywords: e.kana,
  };
}

export const TARGET_PROGRAMS: ProgramConfig[] = TARGET_SUB_GENRES.flatMap((sub) =>
  BY_SUB_GENRE[sub].map((e) => createCatalogProgram(toCatalogEntry(sub, e)))
);
