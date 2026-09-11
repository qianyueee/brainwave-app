export interface FrequencyPhase {
  name: string;
  /** Start time in seconds (relative to program default duration) */
  startTime: number;
  /** End time in seconds */
  endTime: number;
  /** Beat frequency at phase start (Hz) */
  startBeatFreq: number;
  /** Beat frequency at phase end (Hz) */
  endBeatFreq: number;
}

/**
 * Sync Session のタブ。既存の3節目と新規の Morning Tuning が "default"、
 * 星座節目（ZODIAC_PROGRAMS）が "astro"、あとは新しいカタログ2種。
 */
export type ProgramCategory = "default" | "target" | "energy" | "astro";

export interface ProgramConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  /** Carrier frequency for left ear (Hz) */
  carrierFreq: number;
  /** Default duration in seconds */
  defaultDuration: number;
  /** Target beat frequency displayed during intro phase (Hz) */
  targetBeatFreq: number;
  phases: FrequencyPhase[];

  // --- カタログ用（すべて任意。既存の消費側は読まないので後方互換） ---

  /** Sync Session のどのタブに並ぶか。省略時は "default" 扱い。 */
  category?: ProgramCategory;
  /** Target 内の小分類（仕事・勉強 など）。他カテゴリでは未使用。 */
  subGenre?: string;
  /** 英語原題。プレイヤーの副題と検索に使う。 */
  titleEn?: string;
  /**
   * 音楽ベッドの mp3 がまだ無い。誘導ビートは BinauralSession が実時間合成する
   * ので再生自体は通常どおりできる——伴奏が付かないだけ。
   */
  audioPending?: boolean;
  /** 周波数が一覧 xlsx 未取り込みの暫定値であることの印。 */
  paramsProvisional?: boolean;
  /**
   * 検索用の追加語。名前・説明・英題から導けない読みだけを足す
   * （漢字→かなは辞書が要るので機械では畳めない）。
   */
  keywords?: string;
}

/**
 * Reset & Deep — シューマン共鳴 7.83Hz
 * Carrier: 174Hz, Default: 15 min
 */
const resetAndDeep: ProgramConfig = {
  id: "reset-deep",
  category: "default",
  name: "リセット＆ディープ",
  description: "シューマン共鳴 7.83Hz でリセット",
  icon: "🌊",
  carrierFreq: 174,
  defaultDuration: 15 * 60,
  targetBeatFreq: 7.83,
  phases: [
    {
      name: "導入",
      startTime: 0,
      endTime: 3 * 60,
      startBeatFreq: 10.0,
      endBeatFreq: 10.0,
    },
    {
      name: "降下",
      startTime: 3 * 60,
      endTime: 7 * 60,
      startBeatFreq: 10.0,
      endBeatFreq: 7.83,
    },
    {
      name: "同調",
      startTime: 7 * 60,
      endTime: 13 * 60,
      startBeatFreq: 7.83,
      endBeatFreq: 7.83,
    },
    {
      name: "覚醒",
      startTime: 13 * 60,
      endTime: 15 * 60,
      startBeatFreq: 7.83,
      endBeatFreq: 14.0,
    },
  ],
};

/**
 * Clarity Focus — ガンマ波 40Hz
 * Carrier: 432Hz, Default: 20 min
 */
const clarityFocus: ProgramConfig = {
  id: "clarity-focus",
  category: "default",
  name: "クラリティ・フォーカス",
  description: "ガンマ波 40Hz で集中力アップ",
  icon: "⚡",
  carrierFreq: 432,
  defaultDuration: 20 * 60,
  targetBeatFreq: 40.0,
  phases: [
    {
      name: "導入",
      startTime: 0,
      endTime: 3 * 60,
      startBeatFreq: 10.0,
      endBeatFreq: 10.0,
    },
    {
      name: "加速",
      startTime: 3 * 60,
      endTime: 8 * 60,
      startBeatFreq: 10.0,
      endBeatFreq: 40.0,
    },
    {
      name: "ピーク",
      startTime: 8 * 60,
      endTime: 17 * 60,
      startBeatFreq: 40.0,
      endBeatFreq: 40.0,
    },
    {
      name: "収束",
      startTime: 17 * 60,
      endTime: 20 * 60,
      startBeatFreq: 40.0,
      endBeatFreq: 12.0,
    },
  ],
};

/**
 * Night Recovery — デルタ波 1.5Hz
 * Carrier: 136.1Hz, Default: 30 min
 */
const nightRecovery: ProgramConfig = {
  id: "night-recovery",
  category: "default",
  name: "ナイトリカバリー",
  description: "デルタ波で深い睡眠をサポート",
  icon: "🌙",
  carrierFreq: 136.1,
  defaultDuration: 30 * 60,
  targetBeatFreq: 1.5,
  phases: [
    {
      name: "導入",
      startTime: 0,
      endTime: 3 * 60,
      startBeatFreq: 10.0,
      endBeatFreq: 10.0,
    },
    {
      name: "降下",
      startTime: 3 * 60,
      endTime: 8 * 60,
      startBeatFreq: 10.0,
      endBeatFreq: 4.0,
    },
    {
      name: "深化",
      startTime: 8 * 60,
      endTime: 15 * 60,
      startBeatFreq: 4.0,
      endBeatFreq: 1.5,
    },
    {
      name: "デルタ維持",
      startTime: 15 * 60,
      endTime: 28 * 60,
      startBeatFreq: 1.5,
      endBeatFreq: 1.5,
    },
    {
      name: "浮上",
      startTime: 28 * 60,
      endTime: 30 * 60,
      startBeatFreq: 1.5,
      endBeatFreq: 3.0,
    },
  ],
};

/**
 * Morning Tuning & Energize — アルファからベータへ、朝の立ち上げ
 * Carrier: 432Hz, Default: 10 min
 *
 * 4節目めとして追加。他の3つが「下げる／深める」方向なのに対し、これだけが
 * 朝いちばんに上げる向き——だから終わりを 10Hz へ戻さず、そのまま 20Hz まで
 * 送り出して終わる（覚めたまま一日へ渡すのが狙い）。
 *
 * ⚠ 尺と相位の切りどころは暫定（paramsProvisional）。一覧 xlsx
 * 「Morning Tuning & Energizeプログラム.xlsx」取り込みで確定させる。
 */
const morningTuning: ProgramConfig = {
  id: "morning-tuning",
  category: "default",
  name: "モーニングチューニング",
  titleEn: "Morning Tuning & Energize",
  description: "アルファ→ベータ 432Hz で朝の覚醒",
  icon: "🌅",
  carrierFreq: 432,
  defaultDuration: 10 * 60,
  targetBeatFreq: 14.0,
  paramsProvisional: true,
  audioPending: true,
  phases: [
    {
      name: "導入",
      startTime: 0,
      endTime: 2 * 60,
      startBeatFreq: 10.0,
      endBeatFreq: 10.0,
    },
    {
      name: "覚醒",
      startTime: 2 * 60,
      endTime: 5 * 60,
      startBeatFreq: 10.0,
      endBeatFreq: 14.0,
    },
    {
      name: "定着",
      startTime: 5 * 60,
      endTime: 8.5 * 60,
      startBeatFreq: 14.0,
      endBeatFreq: 14.0,
    },
    {
      name: "送り出し",
      startTime: 8.5 * 60,
      endTime: 10 * 60,
      startBeatFreq: 14.0,
      endBeatFreq: 20.0,
    },
  ],
};

export const PROGRAMS: ProgramConfig[] = [
  resetAndDeep,
  clarityFocus,
  nightRecovery,
  morningTuning,
];

// --- Zodiac Programs (Cosmic & Brain Sync, modular synthesis) ---

import {
  ZODIAC_SIGNS,
  zodiacProgramId,
  modularProgramId,
  MODULAR_BEATS,
  BEAT_TITLE,
  BEAT_EFFECT,
  type ZodiacSign,
} from "./zodiac";

/**
 * One uniform timeline for every zodiac program: settle in at 10Hz alpha,
 * glide to the target beat, hold, then return toward baseline — the same
 * end-on-a-wake-ramp shape as the built-ins, so a 2Hz delta program doesn't
 * drop the listener cold. The first phase must be named 導入 (the Visualizer
 * shows targetBeatFreq during it); the other names are free — zodiac ids never
 * enter getAdjustedProgram's per-program switch.
 */
function zodiacPhases(t: number) {
  return [
    { name: "導入", startTime: 0, endTime: 2 * 60, startBeatFreq: 10, endBeatFreq: 10 },
    { name: "遷移", startTime: 2 * 60, endTime: 6 * 60, startBeatFreq: 10, endBeatFreq: t },
    { name: "同調", startTime: 6 * 60, endTime: 13 * 60, startBeatFreq: t, endBeatFreq: t },
    { name: "収束", startTime: 13 * 60, endTime: 15 * 60, startBeatFreq: t, endBeatFreq: 10 },
  ];
}

/** The sign's own fixed program (carrier × its default beat, spec §5 master). */
function createZodiacProgram(sign: ZodiacSign): ProgramConfig {
  return {
    id: zodiacProgramId(sign.key),
    category: "astro",
    subGenre: sign.nameJa,
    keywords: `${sign.nameJa} ${sign.key}`,
    name: sign.programName,
    description: sign.description,
    icon: sign.glyph,
    carrierFreq: sign.carrierFreq,
    defaultDuration: 15 * 60,
    targetBeatFreq: sign.targetBeatFreq,
    phases: zodiacPhases(sign.targetBeatFreq),
  };
}

/**
 * Modular variant: the sign's fixed carrier (音色・世界観) × a daily guided
 * beat from the §5 matrix. Named like the master programs — e.g.
 * 528Hz × 40Hz Gamma Activation — with the beat's aim as the description.
 */
function createModularProgram(sign: ZodiacSign, beat: number): ProgramConfig {
  const beatKey = String(beat);
  return {
    id: modularProgramId(sign.key, beat),
    category: "astro",
    subGenre: sign.nameJa,
    keywords: `${sign.nameJa} ${sign.key}`,
    name: `${Math.round(sign.carrierFreq)}Hz × ${beatKey}Hz ${BEAT_TITLE[beatKey]}`,
    description: BEAT_EFFECT[beatKey],
    icon: sign.glyph,
    carrierFreq: sign.carrierFreq,
    defaultDuration: 15 * 60,
    targetBeatFreq: beat,
    phases: zodiacPhases(beat),
  };
}

/**
 * 12 own programs + each sign × the 9 matrix beats (variants matching the
 * sign's own beat collapse into the own program, so ids stay unique).
 * Kept out of PROGRAMS so the Sync Session list stays at the 3 built-ins.
 */
export const ZODIAC_PROGRAMS: ProgramConfig[] = [
  ...ZODIAC_SIGNS.map(createZodiacProgram),
  ...ZODIAC_SIGNS.flatMap((sign) =>
    MODULAR_BEATS.filter((beat) => beat !== sign.targetBeatFreq).map((beat) =>
      createModularProgram(sign, beat)
    )
  ),
];

// --- Catalog (Target / Energy) & cross-category lookup ---

import { CATALOG_PROGRAMS } from "./catalog";
import { CATEGORY_LABEL } from "./catalog/categories";
import { assertCatalog } from "./catalog/invariants";
import { buildSearchText, matchesQuery } from "./catalog/search";

/** 全カテゴリの節目。デフォルト4 ＋ 星座118 ＋ カタログ55。 */
export const ALL_PROGRAMS: ProgramConfig[] = [
  ...PROGRAMS,
  ...ZODIAC_PROGRAMS,
  ...CATALOG_PROGRAMS,
];

/**
 * id → 節目の一発引き。以前は3配列の線形探索だったが、カタログが入って
 * 総数が 170 を超えた——ProgramCard は1枚ごとに getAdjustedProgram 経由で
 * ここを叩くので、検索欄を1文字打つたびに数万回の比較になっていた。
 * 先に見つかったほうを残すので、PROGRAMS → ZODIAC → CATALOG の優先順は従来どおり。
 */
const PROGRAM_BY_ID: ReadonlyMap<string, ProgramConfig> = (() => {
  const map = new Map<string, ProgramConfig>();
  for (const p of ALL_PROGRAMS) {
    if (!map.has(p.id)) map.set(p.id, p);
  }
  return map;
})();

if (process.env.NODE_ENV !== "production") {
  assertCatalog(ALL_PROGRAMS);
}

export function getProgramById(id: string): ProgramConfig | undefined {
  return PROGRAM_BY_ID.get(id);
}

/** category 未指定の節目（既存の内蔵3つ）は "default" 扱い。 */
export function programCategory(p: ProgramConfig): ProgramCategory {
  return p.category ?? "default";
}

export function programsByCategory(category: ProgramCategory): ProgramConfig[] {
  return ALL_PROGRAMS.filter((p) => programCategory(p) === category);
}

/**
 * 検索の当たり先。節目の文字列はどれも既にバンドルに載っているので、
 * 正規化済みの写しを節目オブジェクトに持たせる（＝全ページで読み込まれる
 * 共有チャンクを太らせる）のではなく、初回の検索時に組んで覚えておく。
 * 170件ぶんでも1ミリ秒に満たず、しかもページ読み込みごとに一度きり。
 */
const searchTextCache = new Map<string, string>();

function searchTextOf(p: ProgramConfig): string {
  const cached = searchTextCache.get(p.id);
  if (cached !== undefined) return cached;
  const built = buildSearchText([
    p.name,
    p.titleEn,
    p.description,
    CATEGORY_LABEL[programCategory(p)],
    p.subGenre,
    p.keywords,
    `${p.carrierFreq}Hz`,
    `${p.targetBeatFreq}Hz`,
  ]);
  searchTextCache.set(p.id, built);
  return built;
}

/** 全カテゴリ横断の検索。空クエリは空配列（呼び出し側はタブ表示へ戻る）。 */
export function searchPrograms(query: string): ProgramConfig[] {
  if (!query.trim()) return [];
  return ALL_PROGRAMS.filter((p) => matchesQuery(searchTextOf(p), query));
}

// --- Custom Programs (synth-based) ---

import type { SynthPreset } from "./synth-engine";

export interface CustomProgram {
  id: string;              // prefixed "custom-" + generateId()
  name: string;
  description: string;
  icon: string;
  defaultDuration: number; // 15 * 60
  preset: SynthPreset;
  createdAt: string;
}

export function isCustomProgramId(id: string): boolean {
  return id.startsWith("custom-");
}

/** True when the custom program is a time-axis timeline (sequence of segments). */
export function isTimelineProgram(p: CustomProgram): boolean {
  const segments = p.preset.timeline?.segments;
  return Array.isArray(segments) && segments.length > 0;
}

/** Total playback length: sum of segment durations for a timeline, else defaultDuration. */
export function timelineTotalDuration(p: CustomProgram): number {
  const segments = p.preset.timeline?.segments;
  if (Array.isArray(segments) && segments.length > 0) {
    return segments.reduce((sum, s) => sum + Math.max(1, s.durationSec), 0);
  }
  return p.defaultDuration;
}
