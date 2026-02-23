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

export function getProgramById(id: string): ProgramConfig | undefined {
  return PROGRAMS.find((p) => p.id === id);
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
