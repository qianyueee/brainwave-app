import { getProgramById, isCustomProgramId } from "@/lib/programs";
import { DEFAULT_TARGET_HZ, TARGET_HZ_MAX, TARGET_HZ_MIN, normalizeTargetHz } from "./resonance";
import type { PlaybackSecond } from "./measurement-playback";

/**
 * 測定の誘導周波数（Rate の共鳴率をどの Hz で見るか）を、プレーヤーに入っている
 * セッションから決める。手で入力する欄は無い——Sync Session で流している節目の
 * 誘導周波数（ProgramConfig.targetBeatFreq＝一覧の「脳波誘導波」）がそのまま基準に
 * なり、何も流していなければ既定の 40Hz（DEFAULT_TARGET_HZ）。
 *
 * **一時停止中もその節目の周波数のまま**（下にミニプレーヤーが出ている間＝節目が
 * プレーヤーに残っている間）。止めた・最後まで流れた（ミニプレーヤーが消えた）ら既定。
 * 以前は一時停止を「流していない」に数えていたが、一時停止して測るのも「その節目の
 * 回」として残したい、というプロダクト判断で改めた（2026-11）。
 */
export type InductionTarget =
  /** プレーヤーに節目が入っていない（止めた・流し終えた・流していない）。既定の 40Hz で見る。 */
  | { source: "default"; hz: number }
  /** プレーヤーに入っている節目の誘導周波数で見る（paused＝一時停止中）。 */
  | { source: "session"; hz: number; programId: string; paused: boolean }
  /**
   * 節目は入っているが、その周波数では見られない。既定の 40Hz で見る。
   * programHz：節目の誘導周波数（脳波計の範囲外・うなりの無い 0Hz）。null＝決まった
   * 誘導周波数の無い音（合成器のカスタム節目）。
   */
  | {
      source: "unmeasurable";
      hz: number;
      programId: string;
      programHz: number | null;
      paused: boolean;
    };

export interface PlaybackSnapshot {
  isPlaying: boolean;
  isPaused: boolean;
  playingProgramId: string | null;
}

/**
 * プレーヤーに入っている節目の id（再生中・一時停止中）。無ければ null。
 * ミニプレーヤーが節目のバーを出す条件（isPlaying＝一時停止中を含む・
 * playingProgramId あり）と同じ——合成器だけ・タイムラインのプレビューは節目ではない。
 */
export function loadedProgramId(p: PlaybackSnapshot): string | null {
  return p.isPlaying && p.playingProgramId ? p.playingProgramId : null;
}

/** 1秒ぶんのプレーヤーの状態（測定の記録に残す内訳。lib/mind/measurement-playback.ts）。 */
export function playbackSecondOf(p: PlaybackSnapshot): PlaybackSecond {
  const programId = loadedProgramId(p);
  return { programId, paused: programId !== null && p.isPaused };
}

export function inductionTargetOf(p: PlaybackSnapshot): InductionTarget {
  const programId = loadedProgramId(p);
  if (!programId) return { source: "default", hz: DEFAULT_TARGET_HZ };
  const paused = p.isPaused;
  const program = isCustomProgramId(programId) ? undefined : getProgramById(programId);
  const programHz = program?.targetBeatFreq ?? null;
  // 0Hz（うなり無し）と、脳波計が読める 1〜45Hz の外は測れない。範囲内は 0.01Hz に
  // 揃える（normalizeTargetHz）——記録・AI 分析の検査と同じ桁。
  const hz =
    programHz != null && programHz >= TARGET_HZ_MIN && programHz <= TARGET_HZ_MAX
      ? normalizeTargetHz(programHz)
      : null;
  if (hz == null) {
    return { source: "unmeasurable", hz: DEFAULT_TARGET_HZ, programId, programHz, paused };
  }
  return { source: "session", hz, programId, paused };
}

/** 測定に記録する誘導周波数：セッションのものなら Hz、既定なら undefined（＝40Hz）。 */
export function recordedTargetHz(t: InductionTarget): number | undefined {
  return t.source === "session" ? t.hz : undefined;
}

/**
 * 録音中の1秒ごとの誘導周波数を数えた表（key は Hz の文字列、既定は "default"）
 * から、その測定の誘導周波数を決める：いちばん長かったもの（一時停止中の秒も
 * その節目の周波数に数える）。同じ長さならセッションの方を採る（既定より手がかりになる）。
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
