import { getProgramById, isCustomProgramId } from "@/lib/programs";
import { DEFAULT_TARGET_HZ, TARGET_HZ_MAX, TARGET_HZ_MIN, normalizeTargetHz } from "./resonance";

/**
 * 測定の誘導周波数（Rate の共鳴率をどの Hz で見るか）を、いま鳴っているセッション
 * から決める。手で入力する欄は無い——Sync Session で流している節目の誘導周波数
 * （ProgramConfig.targetBeatFreq＝一覧の「脳波誘導波」）がそのまま基準になり、
 * 何も流していなければ既定の 40Hz（DEFAULT_TARGET_HZ）。
 *
 * 一時停止中は「流していない」に数える——音が止まっている間の脳波を、その周波数への
 * 引き込みとして読んでも意味が無い。
 */
export type InductionTarget =
  /** セッションを流していない（一時停止中を含む）。既定の 40Hz で見る。 */
  | { source: "default"; hz: number; paused: boolean }
  /** 流しているセッションの誘導周波数で見る。 */
  | { source: "session"; hz: number; programId: string }
  /**
   * 流しているが、その周波数では見られない。既定の 40Hz で見る。
   * programHz：節目の誘導周波数（脳波計の範囲外・うなりの無い 0Hz）。null＝決まった
   * 誘導周波数の無い音（合成器のカスタム節目）。
   */
  | { source: "unmeasurable"; hz: number; programId: string; programHz: number | null };

export interface PlaybackSnapshot {
  isPlaying: boolean;
  isPaused: boolean;
  playingProgramId: string | null;
}

export function inductionTargetOf(p: PlaybackSnapshot): InductionTarget {
  if (!p.isPlaying || p.isPaused || !p.playingProgramId) {
    return { source: "default", hz: DEFAULT_TARGET_HZ, paused: p.isPlaying && p.isPaused };
  }
  const programId = p.playingProgramId;
  const program = isCustomProgramId(programId) ? undefined : getProgramById(programId);
  const programHz = program?.targetBeatFreq ?? null;
  // 0Hz（うなり無し）と、脳波計が読める 1〜45Hz の外は測れない。範囲内は 0.01Hz に
  // 揃える（normalizeTargetHz）——記録・AI 分析の検査と同じ桁。
  const hz =
    programHz != null && programHz >= TARGET_HZ_MIN && programHz <= TARGET_HZ_MAX
      ? normalizeTargetHz(programHz)
      : null;
  if (hz == null) {
    return { source: "unmeasurable", hz: DEFAULT_TARGET_HZ, programId, programHz };
  }
  return { source: "session", hz, programId };
}

/** 測定に記録する誘導周波数：セッションのものなら Hz、既定なら undefined（＝40Hz）。 */
export function recordedTargetHz(t: InductionTarget): number | undefined {
  return t.source === "session" ? t.hz : undefined;
}

/**
 * 録音中の1秒ごとの誘導周波数を数えた表（key は Hz の文字列、既定は "default"）
 * から、その測定の誘導周波数を決める：いちばん長く流れていたもの。同じ長さなら
 * セッションの方を採る（既定より手がかりになる）。
 */
export const DEFAULT_TARGET_KEY = "default";

export function targetKeyOf(t: InductionTarget): string {
  const hz = recordedTargetHz(t);
  return hz === undefined ? DEFAULT_TARGET_KEY : String(hz);
}

export function dominantTargetHz(seconds: Readonly<Record<string, number>>): number | undefined {
  let bestKey: string | null = null;
  let best = -1;
  for (const [key, n] of Object.entries(seconds)) {
    const wins = n > best || (n === best && bestKey === DEFAULT_TARGET_KEY);
    if (wins) {
      bestKey = key;
      best = n;
    }
  }
  if (bestKey === null || bestKey === DEFAULT_TARGET_KEY) return undefined;
  const hz = Number(bestKey);
  return Number.isFinite(hz) ? hz : undefined;
}
