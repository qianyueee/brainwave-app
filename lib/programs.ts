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
}

/**
 * Reset & Deep — シューマン共鳴 7.83Hz
 * Carrier: 174Hz, Default: 15 min
 */
const resetAndDeep: ProgramConfig = {
  id: "reset-deep",
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

export const PROGRAMS: ProgramConfig[] = [resetAndDeep, clarityFocus, nightRecovery];

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

export function getProgramById(id: string): ProgramConfig | undefined {
  return PROGRAMS.find((p) => p.id === id) ?? ZODIAC_PROGRAMS.find((p) => p.id === id);
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
